import assert from "node:assert/strict";
import test from "node:test";
import {
  addAppUsageSeconds,
  buildAppUsageSummary,
  ensureAppUsageSource,
  getAppUsageDayKey,
  getAppUsageStorageKey,
  getLegacyAppUsageStorageKey,
  getLocalUsageDayKey,
  mergeSyncedAppUsageRecord,
  normalizeAppUsageRecord,
  readAppUsageRecord,
  resolveAppUsageIdentity,
  saveAppUsageLimit,
} from "./appUsage.js";

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

test("creates a stable account usage key without storing the email in the key", () => {
  const first = resolveAppUsageIdentity({ email: "Student@Example.com" });
  const second = resolveAppUsageIdentity({ email: "student@example.com" });

  assert.equal(first, second);
  assert.match(first, /^account-[a-z0-9]+$/u);
  assert.doesNotMatch(getAppUsageStorageKey(first), /student|example/u);
});

test("persists visible active seconds by local day and keeps an optional daily limit", () => {
  const storage = createStorage();
  const identity = "account-test";
  const firstDay = new Date(2026, 7, 19, 10, 0, 0);
  const today = new Date(2026, 7, 20, 10, 0, 0);

  saveAppUsageLimit(identity, 120, { now: firstDay, storage });
  addAppUsageSeconds(identity, 3600, { now: firstDay, storage });
  addAppUsageSeconds(identity, 3000, { now: today, storage });
  addAppUsageSeconds(identity, 4200, { now: today, storage });

  const record = readAppUsageRecord(identity, storage);
  assert.equal(record.days[getLocalUsageDayKey(firstDay)], 3600);
  assert.equal(record.days[getLocalUsageDayKey(today)], 7200);
  assert.equal(record.sourceDays[getLocalUsageDayKey(firstDay)], 3600);
  assert.equal(record.sourceDays[getLocalUsageDayKey(today)], 7200);
  assert.equal(record.dailyLimitMinutes, 120);
  assert.equal(record.limitNotifiedDay, getLocalUsageDayKey(today));

  const summary = buildAppUsageSummary(record, { dayCount: 7, now: today });
  assert.equal(summary.totalSeconds, 10_800);
  assert.equal(summary.today.seconds, 7200);
  assert.equal(summary.activeDays, 2);
  assert.equal(summary.limitUsedPercent, 100);
  assert.equal(summary.limitProgressPercent, 100);
  assert.equal(summary.daily.length, 7);
});

test("normalizes malformed or excessive stored usage without breaking the page", () => {
  const normalized = normalizeAppUsageRecord({
    dailyLimitMinutes: 99_999,
    days: {
      "not-a-day": 500,
      "2026-08-20": 999_999,
      "2026-08-19": -4,
    },
  });

  assert.equal(normalized.dailyLimitMinutes, 1440);
  assert.deepEqual(normalized.days, {
    "2026-08-19": 0,
    "2026-08-20": 86_400,
  });
});

test("migrates one device's v1 history into a stable cumulative source", () => {
  const storage = createStorage();
  const identity = "account-migration";
  storage.setItem(getLegacyAppUsageStorageKey(identity), JSON.stringify({
    version: 1,
    days: {
      "2026-08-26": 600,
      "2026-08-27": 900,
    },
  }));

  const first = ensureAppUsageSource(identity, storage);
  const second = ensureAppUsageSource(identity, storage);

  assert.match(first.sourceId, /^usage-[a-z0-9-]{12,120}$/u);
  assert.equal(second.sourceId, first.sourceId);
  assert.deepEqual(first.sourceDays, first.days);
  assert.deepEqual(first.acknowledgedSourceDays, {});
  assert.notEqual(getLegacyAppUsageStorageKey(identity), getAppUsageStorageKey(identity));
});

test("ignores stale legacy-tab writes after the v2 sync record exists", () => {
  const storage = createStorage();
  const identity = "account-stale-tab";
  storage.setItem(getLegacyAppUsageStorageKey(identity), JSON.stringify({
    version: 1,
    days: { "2026-08-27": 600 },
  }));
  const migrated = ensureAppUsageSource(identity, storage);
  storage.setItem(getLegacyAppUsageStorageKey(identity), JSON.stringify({
    version: 1,
    days: { "2026-08-27": 9_999 },
  }));

  const current = readAppUsageRecord(identity, storage);
  assert.equal(current.sourceId, migrated.sourceId);
  assert.equal(current.days["2026-08-27"], 600);
  assert.equal(current.sourceDays["2026-08-27"], 600);
});

test("merges account totals without losing or double-counting in-flight local seconds", () => {
  const storage = createStorage();
  const identity = "account-merge";
  const dayKey = "2026-08-27";
  const source = ensureAppUsageSource(identity, storage);
  storage.setItem(getAppUsageStorageKey(identity), JSON.stringify({
    ...source,
    days: { [dayKey]: 120 },
    sourceDays: { [dayKey]: 120 },
    acknowledgedSourceDays: { [dayKey]: 100 },
  }));

  const merged = mergeSyncedAppUsageRecord(identity, {
    usage: {
      version: 2,
      days: { [dayKey]: 500 },
      usageTimeZone: "Asia/Kolkata",
      updatedAt: "2026-08-27T12:00:00.000Z",
    },
    acknowledgedDays: { [dayKey]: 110 },
  }, { storage });

  assert.equal(merged.days[dayKey], 510);
  assert.equal(merged.sourceDays[dayKey], 120);
  assert.equal(merged.acknowledgedSourceDays[dayKey], 110);
  assert.equal(merged.usageTimeZone, "Asia/Kolkata");

  const replayed = mergeSyncedAppUsageRecord(identity, {
    usage: {
      version: 2,
      days: { [dayKey]: 490 },
      usageTimeZone: "Asia/Kolkata",
      updatedAt: "2026-08-27T11:59:00.000Z",
    },
    acknowledgedDays: { [dayKey]: 100 },
  }, { storage });
  assert.equal(replayed.days[dayKey], 510);
  assert.equal(replayed.acknowledgedSourceDays[dayKey], 110);
});

test("uses one canonical timezone for daily buckets on every device", () => {
  const instant = new Date("2026-08-27T20:00:00.000Z");
  assert.equal(getAppUsageDayKey(instant, "Asia/Kolkata"), "2026-08-28");
  assert.equal(getAppUsageDayKey(instant, "America/Los_Angeles"), "2026-08-27");
});

test("rekeys in-flight local counters when the server establishes the account timezone", () => {
  const storage = createStorage();
  const identity = "account-timezone-migration";
  const localDay = "2026-08-28";
  const accountDay = "2026-08-27";
  const source = ensureAppUsageSource(identity, storage);
  storage.setItem(getAppUsageStorageKey(identity), JSON.stringify({
    ...source,
    usageTimeZone: "Pacific/Kiritimati",
    days: { [localDay]: 150 },
    sourceDays: { [localDay]: 150 },
    acknowledgedSourceDays: {},
  }));

  const merged = mergeSyncedAppUsageRecord(identity, {
    usage: {
      version: 2,
      days: { [accountDay]: 500 },
      usageTimeZone: "America/New_York",
      updatedAt: "2026-08-27T12:00:00.000Z",
    },
    acknowledgedDays: { [accountDay]: 120 },
  }, { storage });

  assert.deepEqual(merged.sourceDays, { [accountDay]: 150 });
  assert.deepEqual(merged.acknowledgedSourceDays, { [accountDay]: 120 });
  assert.equal(merged.days[accountDay], 530);
  assert.equal(merged.days[localDay], undefined);
  assert.equal(merged.usageTimeZone, "America/New_York");
});
