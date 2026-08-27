import assert from "node:assert/strict";
import test from "node:test";
import {
  addAppUsageSeconds,
  ensureAppUsageSource,
  getAppUsageStorageKey,
  readAppUsageRecord,
} from "./appUsage.js";
import { syncAppUsageRecord } from "./appUsageSync.js";

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

test("syncs only the current source and keeps seconds recorded during the request pending", async () => {
  const storage = createStorage();
  const identity = "account-sync";
  const initial = ensureAppUsageSource(identity, storage);
  storage.setItem(getAppUsageStorageKey(identity), JSON.stringify({
    ...initial,
    usageTimeZone: "Asia/Kolkata",
  }));
  addAppUsageSeconds(identity, 120, {
    now: new Date("2026-08-27T10:00:00.000Z"),
    storage,
  });
  const before = readAppUsageRecord(identity, storage);
  const [dayKey] = Object.keys(before.sourceDays);
  let requestBody;
  let requestOptions;

  const merged = await syncAppUsageRecord(identity, {
    storage,
    keepalive: true,
    request: async (body, options) => {
      requestBody = body;
      requestOptions = options;
      addAppUsageSeconds(identity, 30, {
        now: new Date("2026-08-27T10:00:30.000Z"),
        storage,
      });
      return {
        usage: {
          version: 2,
          days: { [dayKey]: 500 },
          usageTimeZone: "Asia/Kolkata",
          updatedAt: "2026-08-27T10:00:31.000Z",
        },
        acknowledgedDays: { [dayKey]: 120 },
      };
    },
  });

  assert.equal(requestBody.sourceId, before.sourceId);
  assert.deepEqual(requestBody.days, { [dayKey]: 120 });
  assert.equal(requestBody.localTimeZone, "Asia/Kolkata");
  assert.equal(requestOptions.academicProfileId, null);
  assert.equal(requestOptions.keepalive, true);
  assert.equal(merged.sourceDays[dayKey], 150);
  assert.equal(merged.acknowledgedSourceDays[dayKey], 120);
  assert.equal(merged.days[dayKey], 530);
});
