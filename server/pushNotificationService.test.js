import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_PUSH_SUBSCRIPTIONS_PER_USER,
  PUSH_DELIVERY_TIMEOUT_MS,
  REMINDER_CLAIM_TTL_MS,
  PushSubscriptionValidationError,
  buildExpiredSubscriptionRemovalOperation,
  buildPushSubscriptionRemovalOperation,
  buildPushSubscriptionSyncPipeline,
  buildReminderClaimClearOperation,
  buildReminderClaimOperation,
  buildReminderSuccessOperation,
  createPushSubscriptionRecord,
  createSubscriptionVersion,
  isNotificationMutationRequestAllowed,
  mergePushSubscriptionRecords,
  migrateLegacyPushSubscription,
  normalizePushSubscription,
  normalizeSubscriptionBinding,
  parseAdditionalPushHosts,
  preparePushSubscriptionSync,
  runDailyReminderSweep,
  schedulerSecretMatches,
} from "./pushNotificationService.js";

const DEVICE_ONE = "00000000-0000-4000-8000-000000000001";
const DEVICE_TWO = "00000000-0000-4000-8000-000000000002";
const DEVICE_THREE = "00000000-0000-4000-8000-000000000003";
const CLAIM_ONE = "10000000-0000-4000-8000-000000000001";
const CLAIM_TWO = "10000000-0000-4000-8000-000000000002";
const FIXED_NOW = new Date("2026-07-16T12:30:00.000Z");

function validSubscription(index = 1, overrides = {}) {
  const p256dh = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, index)]).toString("base64url");
  const auth = Buffer.alloc(16, index + 10).toString("base64url");
  return {
    endpoint: `https://fcm.googleapis.com/wp/device-${index}`,
    expirationTime: null,
    keys: { p256dh, auth },
    ignored: "not persisted",
    ...overrides,
  };
}

function subscriptionRecord(deviceId, index, extras = {}) {
  return {
    ...createPushSubscriptionRecord({
      deviceId,
      subscription: validSubscription(index),
      timezoneOffset: -330,
      now: FIXED_NOW,
    }),
    ...extras,
  };
}

function studyWorkspace() {
  return {
    scheduleStartDate: "2026-07-16T00:00:00.000Z",
    schedule: [{ day: 1, tasks: [{ task: "Revise graphs" }] }],
    completed: [],
  };
}

function sweepDb(users, updateOne) {
  return {
    collection(name) {
      if (name === "users") {
        return {
          find: () => ({ toArray: async () => users }),
          updateOne,
        };
      }
      return { findOne: async () => studyWorkspace() };
    },
  };
}

test("normalizes trusted subscriptions and derives deterministic versions", () => {
  const normalized = normalizePushSubscription(validSubscription(1));
  assert.deepEqual(Object.keys(normalized).sort(), ["endpoint", "expirationTime", "keys"]);
  assert.equal(normalized.ignored, undefined);
  assert.match(createSubscriptionVersion(normalized), /^[a-f0-9]{64}$/);
  assert.equal(createSubscriptionVersion(normalized), createSubscriptionVersion(normalized));

  assert.throws(
    () => normalizePushSubscription(validSubscription(1, { endpoint: "https://example.com/push" })),
    PushSubscriptionValidationError,
  );
  assert.throws(
    () => normalizePushSubscription(validSubscription(1, { endpoint: "http://fcm.googleapis.com/push" })),
    PushSubscriptionValidationError,
  );
  assert.throws(
    () => normalizePushSubscription(validSubscription(1, { keys: { p256dh: "bad", auth: "bad" } })),
    PushSubscriptionValidationError,
  );
});

test("strictly parses additional browser push host patterns", () => {
  assert.deepEqual(
    parseAdditionalPushHosts("push.example.edu, *.PUSH.example.com"),
    ["push.example.edu", "*.push.example.com"],
  );
  assert.deepEqual(
    parseAdditionalPushHosts("https://push.example,host/path,host:443,*.,localhost,.example.com,example..com,-bad.com,bad-.com"),
    [],
  );
  assert.equal(parseAdditionalPushHosts(Array(25).fill("push.example.com").join(",")).length, 20);
});

test("supports server device IDs and validates identifier or observed-subscription bindings", () => {
  const generated = preparePushSubscriptionSync({
    subscription: validSubscription(2),
    timezoneOffset: -330,
    now: FIXED_NOW,
    deviceIdFactory: () => DEVICE_TWO,
  });
  assert.equal(generated.record.deviceId, DEVICE_TWO);
  assert.equal(generated.subscriptionVersion, generated.record.subscriptionVersion);

  const identifiers = normalizeSubscriptionBinding({
    deviceId: DEVICE_TWO,
    subscriptionVersion: generated.subscriptionVersion,
  });
  assert.deepEqual(identifiers, { deviceId: DEVICE_TWO, subscriptionVersion: generated.subscriptionVersion });

  const observed = normalizeSubscriptionBinding({
    ...identifiers,
    subscription: validSubscription(2),
  });
  assert.equal(observed.subscription.endpoint, validSubscription(2).endpoint);
  assert.throws(
    () => normalizeSubscriptionBinding({ ...identifiers, subscription: validSubscription(3) }),
    PushSubscriptionValidationError,
  );
});

test("resync preserves daily state, removes duplicates, and caps device records", () => {
  const oldClaim = { id: CLAIM_ONE, date: "2026-07-16", claimedAt: FIXED_NOW };
  const original = subscriptionRecord(DEVICE_ONE, 1, {
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    lastReminderSentDate: "2026-07-15",
    dispatchClaim: oldClaim,
  });
  const replacement = subscriptionRecord(DEVICE_ONE, 9);
  const duplicateEndpoint = { ...replacement, deviceId: DEVICE_TWO };
  const extraRecords = Array.from({ length: 10 }, (_, index) => subscriptionRecord(
    `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    index + 20,
  ));

  const merged = mergePushSubscriptionRecords(
    [original, duplicateEndpoint, ...extraRecords],
    replacement,
  );
  assert.equal(merged.length, MAX_PUSH_SUBSCRIPTIONS_PER_USER);
  assert.equal(merged[0].deviceId, DEVICE_ONE);
  assert.equal(merged[0].subscriptionVersion, replacement.subscriptionVersion);
  assert.equal(merged[0].lastReminderSentDate, "2026-07-15");
  assert.deepEqual(merged[0].dispatchClaim, oldClaim);
  assert.equal(merged[0].createdAt.toISOString(), "2026-07-01T00:00:00.000Z");
  assert.equal(merged.some((record) => record.deviceId === DEVICE_TWO), false);

  const pipeline = buildPushSubscriptionSyncPipeline(replacement);
  const serialized = JSON.stringify(pipeline);
  assert.match(serialized, /\$\$existing/);
  assert.match(serialized, /\$slice/);
  assert.equal(serialized.includes("lastReminderSentDate\":\"\""), false);
  assert.equal(serialized.includes("dispatchClaim\":\"\""), false);
});

test("builds exact versioned removal and reminder CAS operations", () => {
  const record = subscriptionRecord(DEVICE_ONE, 1);
  const removal = buildPushSubscriptionRemovalOperation({
    userId: "user-1",
    deviceId: DEVICE_ONE,
    subscriptionVersion: record.subscriptionVersion,
  });
  assert.deepEqual(removal.update.$pull.pushSubscriptions, {
    deviceId: DEVICE_ONE,
    subscriptionVersion: record.subscriptionVersion,
  });

  const claim = buildReminderClaimOperation({
    userId: "user-1",
    deviceId: DEVICE_ONE,
    subscriptionVersion: record.subscriptionVersion,
    date: "2026-07-16",
    claimId: CLAIM_ONE,
    now: FIXED_NOW,
  });
  assert.equal(claim.filter.pushSubscriptions.$elemMatch.deviceId, DEVICE_ONE);
  assert.equal(claim.filter.pushSubscriptions.$elemMatch.subscriptionVersion, record.subscriptionVersion);
  assert.equal(
    claim.filter.pushSubscriptions.$elemMatch.$or[2]["dispatchClaim.claimedAt"].$lte.getTime(),
    FIXED_NOW.getTime() - REMINDER_CLAIM_TTL_MS,
  );

  const success = buildReminderSuccessOperation({
    userId: "user-1",
    deviceId: DEVICE_ONE,
    claimId: CLAIM_ONE,
    date: "2026-07-16",
  });
  assert.equal(success.filter.pushSubscriptions.$elemMatch.subscriptionVersion, undefined);
  assert.equal(success.filter.pushSubscriptions.$elemMatch["dispatchClaim.id"], CLAIM_ONE);

  const expired = buildExpiredSubscriptionRemovalOperation({
    userId: "user-1",
    deviceId: DEVICE_ONE,
    subscriptionVersion: record.subscriptionVersion,
    claimId: CLAIM_ONE,
  });
  assert.equal(expired.filter.pushSubscriptions.$elemMatch.subscriptionVersion, record.subscriptionVersion);
  assert.equal(expired.filter.pushSubscriptions.$elemMatch["dispatchClaim.id"], CLAIM_ONE);

  const clear = buildReminderClaimClearOperation({ userId: "user-1", deviceId: DEVICE_ONE, claimId: CLAIM_ONE });
  assert.equal(clear.filter.pushSubscriptions.$elemMatch.subscriptionVersion, undefined);
  assert.equal(clear.filter.pushSubscriptions.$elemMatch["dispatchClaim.id"], CLAIM_ONE);
});

test("notification mutation guard requires JSON and a bearer token or trusted origin", () => {
  const base = {
    contentType: "application/json; charset=utf-8",
    allowedOrigins: ["https://prep-matrix-ai.vercel.app"],
    isProduction: true,
  };
  assert.equal(isNotificationMutationRequestAllowed({ ...base, authorization: "Bearer token", origin: "https://evil.example" }), true);
  assert.equal(isNotificationMutationRequestAllowed({ ...base, origin: "https://prep-matrix-ai.vercel.app" }), true);
  assert.equal(isNotificationMutationRequestAllowed({ ...base, origin: "https://evil.example" }), false);
  assert.equal(isNotificationMutationRequestAllowed({ ...base, origin: "" }), false);
  assert.equal(isNotificationMutationRequestAllowed({ ...base, contentType: "text/plain", authorization: "Bearer token" }), false);
  assert.equal(isNotificationMutationRequestAllowed({ ...base, isProduction: false, origin: "" }), true);
});

test("legacy scalar migration atomically preserves daily state", async () => {
  const updates = [];
  const user = {
    _id: "legacy-user",
    pushSubscription: validSubscription(4),
    timezoneOffset: -330,
    lastReminderSentDate: "2026-07-15",
    reminderDispatchClaim: { date: "2026-07-16", claimedAt: FIXED_NOW },
  };
  const ids = [DEVICE_THREE, CLAIM_TWO];
  const result = await migrateLegacyPushSubscription({
    usersCollection: {
      updateOne: async (filter, update) => {
        updates.push({ filter, update });
        return { modifiedCount: 1 };
      },
    },
    user,
    now: FIXED_NOW,
    deviceIdFactory: () => ids.shift(),
  });

  assert.equal(result.migrated, true);
  assert.equal(result.records[0].deviceId, DEVICE_THREE);
  assert.equal(result.records[0].lastReminderSentDate, "2026-07-15");
  assert.equal(result.records[0].dispatchClaim.id, CLAIM_TWO);
  assert.deepEqual(updates[0].update.at(-1).$unset, [
    "pushSubscription",
    "timezoneOffset",
    "lastReminderSentDate",
    "reminderDispatchClaim",
  ]);
  assert.match(JSON.stringify(updates[0].update[0]), /lastReminderSentDate/);
});

test("daily sweep sends independently to every current device with a bounded timeout", async () => {
  const records = [subscriptionRecord(DEVICE_ONE, 1), subscriptionRecord(DEVICE_TWO, 2)];
  const updates = [];
  const sends = [];
  const claimIds = [CLAIM_ONE, CLAIM_TWO];
  const db = sweepDb(
    [{ _id: "user-1", pushSubscriptions: records }],
    async (filter, update) => {
      updates.push({ filter, update });
      return { modifiedCount: 1 };
    },
  );
  const summary = await runDailyReminderSweep({
    db,
    ensureVapidConfigured: async () => {},
    sendNotification: async (...args) => sends.push(args),
    now: FIXED_NOW,
    claimIdFactory: () => claimIds.shift(),
    logger: { warn() {}, error() {} },
  });

  assert.equal(summary.devicesExamined, 2);
  assert.equal(summary.sent, 2);
  assert.equal(sends.length, 2);
  assert.deepEqual(new Set(sends.map(([subscription]) => subscription.endpoint)), new Set(records.map((record) => record.endpoint)));
  assert.equal(sends.every(([, , options]) => options.timeout === PUSH_DELIVERY_TIMEOUT_MS), true);
  assert.equal(PUSH_DELIVERY_TIMEOUT_MS < REMINDER_CLAIM_TTL_MS, true);
  assert.equal(updates.filter(({ update }) => update.$set?.["pushSubscriptions.$.dispatchClaim"]).length, 2);
  assert.equal(updates.filter(({ update }) => update.$set?.["pushSubscriptions.$.lastReminderSentDate"]).length, 2);
});

test("expired delivery cannot remove a same-device replacement and only clears the observed claim", async () => {
  const record = subscriptionRecord(DEVICE_ONE, 1);
  const updates = [];
  const db = sweepDb(
    [{ _id: "user-2", pushSubscriptions: [record] }],
    async (filter, update) => {
      updates.push({ filter, update });
      if (update.$pull) return { modifiedCount: 0 };
      return { modifiedCount: 1 };
    },
  );
  const summary = await runDailyReminderSweep({
    db,
    ensureVapidConfigured: async () => {},
    sendNotification: async () => { throw Object.assign(new Error("gone"), { statusCode: 410 }); },
    now: FIXED_NOW,
    claimIdFactory: () => CLAIM_ONE,
    logger: { warn() {}, error() {} },
  });

  const pull = updates.find(({ update }) => update.$pull);
  const clear = updates.at(-1);
  assert.equal(summary.expired, 1);
  assert.equal(summary.raced, 1);
  assert.equal(pull.filter.pushSubscriptions.$elemMatch.subscriptionVersion, record.subscriptionVersion);
  assert.equal(pull.filter.pushSubscriptions.$elemMatch["dispatchClaim.id"], CLAIM_ONE);
  assert.equal(clear.filter.pushSubscriptions.$elemMatch.subscriptionVersion, undefined);
  assert.equal(clear.filter.pushSubscriptions.$elemMatch["dispatchClaim.id"], CLAIM_ONE);
});

test("transient delivery timeout keeps the device and clears only its matching claim", async () => {
  const record = subscriptionRecord(DEVICE_ONE, 1);
  const updates = [];
  let observedOptions;
  const db = sweepDb(
    [{ _id: "user-3", pushSubscriptions: [record] }],
    async (filter, update) => {
      updates.push({ filter, update });
      return { modifiedCount: 1 };
    },
  );
  const summary = await runDailyReminderSweep({
    db,
    ensureVapidConfigured: async () => {},
    sendNotification: async (_subscription, _payload, options) => {
      observedOptions = options;
      throw Object.assign(new Error("timed out"), { code: "ETIMEDOUT" });
    },
    now: FIXED_NOW,
    claimIdFactory: () => CLAIM_ONE,
    logger: { warn() {}, error() {} },
  });

  assert.equal(observedOptions.timeout, 15_000);
  assert.equal(summary.failed, 1);
  assert.equal(updates.some(({ update }) => Boolean(update.$pull)), false);
  assert.equal(updates.at(-1).filter.pushSubscriptions.$elemMatch.deviceId, DEVICE_ONE);
  assert.equal(updates.at(-1).filter.pushSubscriptions.$elemMatch["dispatchClaim.id"], CLAIM_ONE);
});

test("scheduler secret comparison rejects missing and short secrets", () => {
  const secret = "a-secure-reminder-secret-with-32-chars";
  assert.equal(schedulerSecretMatches(`Bearer ${secret}`, secret), true);
  assert.equal(schedulerSecretMatches("Bearer wrong", secret), false);
  assert.equal(schedulerSecretMatches(`Bearer ${secret}`, "short"), false);
});
