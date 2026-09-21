import assert from "node:assert/strict";
import test from "node:test";

import {
  RETIRED_NOTIFICATION_HISTORY_COLLECTION,
  removeRetiredNotificationHistory,
} from "./retiredDataCleanup.js";

test("drops the retired notification history collection", async () => {
  const calls = [];
  const removed = await removeRetiredNotificationHistory({
    async dropCollection(name) {
      calls.push(name);
      return true;
    },
  });

  assert.equal(removed, true);
  assert.deepEqual(calls, [RETIRED_NOTIFICATION_HISTORY_COLLECTION]);
});

test("accepts MongoDB's no-op result when the retired collection is absent", async () => {
  const removed = await removeRetiredNotificationHistory({
    async dropCollection() {
      return false;
    },
  });

  assert.equal(removed, false);
});

test("propagates database cleanup failures", async () => {
  const failure = new Error("database cleanup failed");

  await assert.rejects(
    removeRetiredNotificationHistory({
      async dropCollection() {
        throw failure;
      },
    }),
    (error) => error === failure,
  );
});

test("requires a MongoDB database", async () => {
  await assert.rejects(
    removeRetiredNotificationHistory(null),
    /MongoDB database is required/u,
  );
});
