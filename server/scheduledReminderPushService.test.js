import assert from "node:assert/strict";
import test from "node:test";

import { createPushSubscriptionRecord } from "./pushNotificationService.js";
import {
  MAX_SCHEDULED_REMINDERS_PER_DEVICE,
  SCHEDULED_REMINDER_PUSH_TTL_SECONDS,
  buildScheduledReminderPayload,
  claimScheduledReminderDelivery,
  getDueScheduledReminderOccurrences,
  runScheduledReminderPushSweep,
} from "./scheduledReminderPushService.js";

const DEVICE_ONE = "00000000-0000-4000-8000-000000000001";
const DEVICE_TWO = "00000000-0000-4000-8000-000000000002";
const CLAIM_ONE = "10000000-0000-4000-8000-000000000001";
const CLAIM_TWO = "10000000-0000-4000-8000-000000000002";
const DUE_NOW = new Date("2026-07-16T12:30:00.000Z");

function validSubscription(index = 1) {
  return {
    endpoint: `https://fcm.googleapis.com/wp/scheduled-${index}`,
    expirationTime: null,
    keys: {
      p256dh: Buffer.concat([Buffer.from([4]), Buffer.alloc(64, index)]).toString("base64url"),
      auth: Buffer.alloc(16, index + 10).toString("base64url"),
    },
  };
}

function subscriptionRecord(deviceId, index) {
  return createPushSubscriptionRecord({
    deviceId,
    subscription: validSubscription(index),
    timezoneOffset: -330,
    now: DUE_NOW,
  });
}

function reminder(overrides = {}) {
  return {
    id: "reminder-one",
    title: "Review operating systems",
    notes: "Complete the process scheduling flashcards.",
    date: "2026-07-16",
    time: "18:00",
    priority: "high",
    completed: false,
    ...overrides,
  };
}

class FakeDeliveryCollection {
  constructor() {
    this.documents = new Map();
  }

  async insertOne(document) {
    if (this.documents.has(document._id)) throw Object.assign(new Error("duplicate"), { code: 11000 });
    this.documents.set(document._id, structuredClone(document));
    return { insertedId: document._id };
  }

  async updateOne(filter, update) {
    const document = this.documents.get(filter._id);
    if (!document) return { modifiedCount: 0 };
    if (filter.claimId && document.claimId !== filter.claimId) return { modifiedCount: 0 };
    if (filter.sentAt?.$exists === false && document.sentAt !== undefined) return { modifiedCount: 0 };
    if (filter.claimedAt?.$lte && !(document.claimedAt <= filter.claimedAt.$lte)) return { modifiedCount: 0 };
    Object.assign(document, update.$set || {});
    for (const key of Object.keys(update.$unset || {})) delete document[key];
    return { modifiedCount: 1 };
  }

  async deleteOne(filter) {
    const document = this.documents.get(filter._id);
    if (!document || (filter.claimId && document.claimId !== filter.claimId)) return { deletedCount: 0 };
    if (filter.sentAt?.$exists === false && document.sentAt !== undefined) return { deletedCount: 0 };
    this.documents.delete(filter._id);
    return { deletedCount: 1 };
  }
}

class FakeHistoryCollection {
  constructor({ failWrites = false } = {}) {
    this.documents = new Map();
    this.failWrites = failWrites;
  }

  async updateOne(filter, update) {
    if (this.failWrites) throw new Error("history unavailable");
    const key = `${filter.userId}:${filter.eventKey}`;
    if (this.documents.has(key)) {
      return { matchedCount: 1, modifiedCount: 0, upsertedCount: 0, upsertedId: null };
    }
    const document = { _id: key, ...update.$setOnInsert };
    this.documents.set(key, document);
    return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1, upsertedId: key };
  }

  find({ userId }) {
    let documents = [...this.documents.values()].filter((document) => document.userId === userId);
    const cursor = {
      sort: () => cursor,
      skip: (count) => {
        documents = documents.slice(count);
        return cursor;
      },
      project: () => cursor,
      toArray: async () => documents,
    };
    return cursor;
  }

  async deleteMany() {
    return { deletedCount: 0 };
  }
}

function createSweepDb({
  users,
  workspace,
  deliveries = new FakeDeliveryCollection(),
  history = new FakeHistoryCollection(),
  userUpdate,
}) {
  return {
    deliveries,
    history,
    db: {
      collection(name) {
        if (name === "users") {
          return {
            find: () => ({ toArray: async () => users }),
            updateOne: userUpdate || (async () => ({ modifiedCount: 1 })),
          };
        }
        if (name === "workspaces") return { findOne: async () => workspace };
        if (name === "scheduledReminderDeliveries") return deliveries;
        if (name === "notificationHistory") return history;
        throw new Error(`Unexpected collection: ${name}`);
      },
    },
  };
}

test("selects due reminder occurrences using the device timezone, snooze time, and lookback", () => {
  const occurrences = getDueScheduledReminderOccurrences([
    reminder(),
    reminder({ id: "future", time: "18:01" }),
    reminder({ id: "completed", completed: true }),
    reminder({ id: "snoozed-future", time: "17:00", snoozedUntil: "2026-07-16T12:31:00.000Z" }),
    reminder({ id: "snoozed-now", time: "17:00", snoozedUntil: DUE_NOW.toISOString() }),
    reminder({ id: "invalid-date", date: "2026-02-31" }),
    reminder({ id: "too-old", date: "2026-07-14", time: "18:00" }),
  ], { now: DUE_NOW, timezoneOffset: -330 });

  assert.deepEqual(occurrences.map(({ reminder: item }) => item.id), ["reminder-one", "snoozed-now"]);
  assert.notEqual(occurrences[0].occurrenceKey, occurrences[1].occurrenceKey);
  assert.equal(occurrences.every(({ occurrenceKey }) => /^[a-f0-9]{64}$/.test(occurrenceKey)), true);
});

test("builds a bounded reminder-specific payload and safe app route", () => {
  const occurrence = getDueScheduledReminderOccurrences([reminder()], {
    now: DUE_NOW,
    timezoneOffset: -330,
  })[0];
  const payload = JSON.parse(buildScheduledReminderPayload(occurrence));

  assert.equal(payload.title, "PrepMatrix Reminder");
  assert.match(payload.body, /Review operating systems/);
  assert.equal(payload.url, "/dashboard?reminder=reminder-one");
  assert.equal(payload.kind, "scheduled-reminder");
  assert.match(payload.tag, /^prepmatrix-reminder-[a-f0-9]{40}$/);
});

test("claims a new occurrence once and can reclaim only after the claim becomes stale", async () => {
  const collection = new FakeDeliveryCollection();
  const occurrence = getDueScheduledReminderOccurrences([reminder()], {
    now: DUE_NOW,
    timezoneOffset: -330,
  })[0];
  const first = await claimScheduledReminderDelivery({
    collection,
    userId: "user-one",
    deviceId: DEVICE_ONE,
    occurrence,
    now: DUE_NOW,
    claimIdFactory: () => CLAIM_ONE,
  });
  const duplicate = await claimScheduledReminderDelivery({
    collection,
    userId: "user-one",
    deviceId: DEVICE_ONE,
    occurrence,
    now: new Date(DUE_NOW.getTime() + 60_000),
    claimIdFactory: () => CLAIM_TWO,
  });
  const reclaimed = await claimScheduledReminderDelivery({
    collection,
    userId: "user-one",
    deviceId: DEVICE_ONE,
    occurrence,
    now: new Date(DUE_NOW.getTime() + 6 * 60_000),
    claimIdFactory: () => CLAIM_TWO,
  });

  assert.equal(first.claimed, true);
  assert.equal(duplicate.claimed, false);
  assert.equal(reclaimed.claimed, true);
});

test("sends each occurrence once per browser device and sends again after snooze", async () => {
  const workspace = { goalReminderData: { reminders: [reminder()] } };
  const setup = createSweepDb({
    users: [{
      _id: "user-multi-device",
      pushSubscriptions: [subscriptionRecord(DEVICE_ONE, 1), subscriptionRecord(DEVICE_TWO, 2)],
    }],
    workspace,
  });
  const sends = [];
  let nextClaim = 1;
  const options = {
    db: setup.db,
    ensureVapidConfigured: async () => {},
    sendNotification: async (...args) => sends.push(args),
    now: DUE_NOW,
    claimIdFactory: () => `10000000-0000-4000-8000-${String(nextClaim++).padStart(12, "0")}`,
    logger: { warn() {}, error() {} },
  };

  const first = await runScheduledReminderPushSweep(options);
  const historyAfterFirst = setup.history.documents.size;
  const duplicate = await runScheduledReminderPushSweep(options);
  workspace.goalReminderData.reminders[0].snoozedUntil = "2026-07-16T12:45:00.000Z";
  const snoozed = await runScheduledReminderPushSweep({
    ...options,
    now: new Date("2026-07-16T12:45:00.000Z"),
  });

  assert.equal(first.sent, 2);
  assert.equal(duplicate.sent, 0);
  assert.equal(snoozed.sent, 2);
  assert.equal(historyAfterFirst, 1);
  assert.equal(setup.history.documents.size, 2);
  assert.equal([...setup.history.documents.values()].every((document) => !("deviceId" in document)), true);
  assert.equal([...setup.history.documents.values()].every((document) => document.kind === "scheduled-reminder"), true);
  assert.equal(sends.length, 4);
  assert.equal(new Set(sends.slice(0, 2).map(([subscription]) => subscription.endpoint)).size, 2);
  assert.equal(sends.every(([, , deliveryOptions]) => deliveryOptions.timeout === 15_000), true);
  assert.equal(sends.every(([, , deliveryOptions]) => deliveryOptions.TTL === SCHEDULED_REMINDER_PUSH_TTL_SECONDS), true);
});

test("daily study-target push waits until a planner schedule exists", async () => {
  const workspace = {
    schedule: [],
    goalReminderData: {
      reminders: [reminder({
        id: "study-target-daily-2026-07-16",
        title: "Daily study target - 4h",
      })],
    },
  };
  const setup = createSweepDb({
    users: [{ _id: "user-target-reminder", pushSubscriptions: [subscriptionRecord(DEVICE_ONE, 1)] }],
    workspace,
  });
  const sends = [];
  const options = {
    db: setup.db,
    ensureVapidConfigured: async () => {},
    sendNotification: async (...args) => sends.push(args),
    now: DUE_NOW,
    claimIdFactory: () => CLAIM_ONE,
    logger: { warn() {}, error() {} },
  };

  const withoutSchedule = await runScheduledReminderPushSweep(options);
  workspace.schedule = [{ day: 1, tasks: [{ task: "Revise graphs" }] }];
  const withSchedule = await runScheduledReminderPushSweep(options);

  assert.equal(withoutSchedule.sent, 0);
  assert.equal(withSchedule.sent, 1);
  assert.equal(sends.length, 1);
});

test("clears transient claims for retry and removes an expired current subscription", async () => {
  const updates = [];
  const transientSetup = createSweepDb({
    users: [{ _id: "user-retry", pushSubscriptions: [subscriptionRecord(DEVICE_ONE, 1)] }],
    workspace: { goalReminderData: { reminders: [reminder()] } },
  });
  let attempt = 0;
  const transientOptions = {
    db: transientSetup.db,
    ensureVapidConfigured: async () => {},
    sendNotification: async () => {
      attempt += 1;
      if (attempt === 1) throw Object.assign(new Error("timeout"), { code: "ETIMEDOUT" });
    },
    now: DUE_NOW,
    claimIdFactory: () => CLAIM_ONE,
    logger: { warn() {}, error() {} },
  };
  const failed = await runScheduledReminderPushSweep(transientOptions);
  const retried = await runScheduledReminderPushSweep(transientOptions);

  const expiredSetup = createSweepDb({
    users: [{ _id: "user-expired", pushSubscriptions: [subscriptionRecord(DEVICE_TWO, 2)] }],
    workspace: { goalReminderData: { reminders: [reminder()] } },
    userUpdate: async (filter, update) => {
      updates.push({ filter, update });
      return { modifiedCount: 1 };
    },
  });
  const expired = await runScheduledReminderPushSweep({
    db: expiredSetup.db,
    ensureVapidConfigured: async () => {},
    sendNotification: async () => { throw Object.assign(new Error("gone"), { statusCode: 410 }); },
    now: DUE_NOW,
    claimIdFactory: () => CLAIM_TWO,
    logger: { warn() {}, error() {} },
  });

  assert.equal(failed.failed, 1);
  assert.equal(transientSetup.deliveries.documents.size, 1);
  assert.equal(retried.sent, 1);
  assert.equal(expired.expired, 1);
  assert.equal(updates[0].update.$pull.pushSubscriptions.deviceId, DEVICE_TWO);
});

test("history write failures cannot cause a scheduled push to be delivered again", async () => {
  const setup = createSweepDb({
    users: [{ _id: "user-history-failure", pushSubscriptions: [subscriptionRecord(DEVICE_ONE, 1)] }],
    workspace: { goalReminderData: { reminders: [reminder()] } },
    history: new FakeHistoryCollection({ failWrites: true }),
  });
  const sends = [];
  const options = {
    db: setup.db,
    ensureVapidConfigured: async () => {},
    sendNotification: async (...args) => sends.push(args),
    now: DUE_NOW,
    claimIdFactory: () => CLAIM_ONE,
    logger: { warn() {}, error() {} },
  };

  const first = await runScheduledReminderPushSweep(options);
  const repeated = await runScheduledReminderPushSweep(options);

  assert.equal(first.sent, 1);
  assert.equal(first.failed, 0);
  assert.equal(repeated.sent, 0);
  assert.equal(sends.length, 1);
});

test("bounds notification bursts and defers the remainder to later sweeps", async () => {
  const reminders = Array.from({ length: MAX_SCHEDULED_REMINDERS_PER_DEVICE + 2 }, (_, index) => reminder({
    id: `reminder-${index}`,
    title: `Reminder ${index}`,
    time: `17:${String(index).padStart(2, "0")}`,
  }));
  const setup = createSweepDb({
    users: [{ _id: "user-bounded", pushSubscriptions: [subscriptionRecord(DEVICE_ONE, 1)] }],
    workspace: { goalReminderData: { reminders } },
  });
  let claimIndex = 1;
  const summary = await runScheduledReminderPushSweep({
    db: setup.db,
    ensureVapidConfigured: async () => {},
    sendNotification: async () => {},
    now: DUE_NOW,
    claimIdFactory: () => `10000000-0000-4000-8000-${String(claimIndex++).padStart(12, "0")}`,
    logger: { warn() {}, error() {} },
  });

  const followUp = await runScheduledReminderPushSweep({
    db: setup.db,
    ensureVapidConfigured: async () => {},
    sendNotification: async () => {},
    now: DUE_NOW,
    claimIdFactory: () => `20000000-0000-4000-8000-${String(claimIndex++).padStart(12, "0")}`,
    logger: { warn() {}, error() {} },
  });
  assert.equal(summary.sent, MAX_SCHEDULED_REMINDERS_PER_DEVICE);
  assert.equal(summary.deferred, 2);
  assert.equal(followUp.sent, 2);
});
