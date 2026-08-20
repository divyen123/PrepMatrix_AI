import assert from "node:assert/strict";
import test from "node:test";
import {
  addAppUsageSeconds,
  buildAppUsageSummary,
  getAppUsageStorageKey,
  getLocalUsageDayKey,
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
