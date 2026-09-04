import assert from "node:assert/strict";
import test from "node:test";

import { createPushSubscriptionRecord } from "./pushNotificationService.js";
import {
  MAX_SCHEDULED_REMINDERS_PER_DEVICE,
  SCHEDULED_REMINDER_PUSH_TTL_SECONDS,
  buildNotificationAlertPayload,
  buildScheduledReminderPayload,
  claimScheduledReminderDelivery,
  getAiCreditResetAlertOccurrence,
  getDueGoalAlertOccurrences,
  getDueScheduledReminderOccurrences,
  getPlannerIncompleteAlertOccurrence,
  getStaleLearningTopicAlertOccurrences,
  runScheduledReminderPushSweep as runScheduledReminderPushSweepProduction,
} from "./scheduledReminderPushService.js";

const DEVICE_ONE = "00000000-0000-4000-8000-000000000001";
const DEVICE_TWO = "00000000-0000-4000-8000-000000000002";
const CLAIM_ONE = "10000000-0000-4000-8000-000000000001";
const CLAIM_TWO = "10000000-0000-4000-8000-000000000002";
const DUE_NOW = new Date("2026-07-16T12:30:00.000Z");

function runScheduledReminderPushSweep(options) {
  return runScheduledReminderPushSweepProduction({
    ...options,
    withProfileWriteFence: options?.withProfileWriteFence
      || (async (_db, _req, write) => write()),
  });
}

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

function goal(overrides = {}) {
  return {
    id: "goal-one",
    title: "Complete operating systems revision",
    notes: "Finish the process scheduling unit.",
    targetDate: "2026-07-16",
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
  learningNotebooks = [],
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
            findOne: async ({ _id }) => users.find((user) => user._id === _id) || null,
            updateOne: userUpdate || (async () => ({ modifiedCount: 1 })),
          };
        }
        if (name === "workspaces") return { findOne: async () => workspace };
        if (name === "learningNotebooks") {
          return { find: () => ({ toArray: async () => learningNotebooks }) };
        }
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

test("creates a goal alert only after an unfinished goal reaches its target date", () => {
  const occurrences = getDueGoalAlertOccurrences([
    {
      id: "goal-one",
      title: "Finish the calculus unit",
      targetDate: "2026-07-16",
      completed: false,
    },
    {
      id: "goal-done",
      title: "Completed goal",
      targetDate: "2026-07-16",
      completed: true,
    },
    {
      id: "goal-future",
      title: "Future goal",
      targetDate: "2026-07-17",
      completed: false,
    },
  ], { now: DUE_NOW, timezoneOffset: -330 });

  assert.equal(occurrences.length, 1);
  assert.equal(occurrences[0].alertType, "goal-due");
  const payload = JSON.parse(buildNotificationAlertPayload(occurrences[0]));
  assert.equal(payload.kind, "goal-due");
  assert.equal(payload.url, "/dashboard#goals-reminders");
  assert.match(payload.body, /calculus unit/u);
});

test("creates one planner alert for a partially incomplete current-day schedule", () => {
  const workspace = {
    scheduleStartDate: "2026-07-16T00:00:00.000Z",
    schedule: [{
      day: 1,
      tasks: [
        { id: "task-one", task: "Revise graphs" },
        { id: "task-two", task: "Practice derivatives" },
      ],
    }],
    completed: ["Revise graphs"],
  };
  const occurrence = getPlannerIncompleteAlertOccurrence(workspace, {
    now: DUE_NOW,
    timezoneOffset: -330,
  });

  assert.ok(occurrence);
  assert.equal(occurrence.alertType, "planner-incomplete");
  assert.equal(occurrence.metadata.pendingCount, 1);
  const payload = JSON.parse(buildNotificationAlertPayload(occurrence));
  assert.equal(payload.kind, "planner-incomplete");
  assert.equal(payload.url, "/planner/schedule");
  assert.match(payload.body, /1 task is still incomplete/u);

  assert.equal(getPlannerIncompleteAlertOccurrence({
    ...workspace,
    completed: ["Revise graphs", "Practice derivatives"],
  }, { now: DUE_NOW, timezoneOffset: -330 }), null);
  assert.equal(getPlannerIncompleteAlertOccurrence(workspace, {
    now: new Date("2026-07-16T12:29:00.000Z"),
    timezoneOffset: -330,
  }), null);
});

test("uses an explicit planner date for an appended current-day schedule bucket", () => {
  const occurrence = getPlannerIncompleteAlertOccurrence({
    scheduleStartDate: "2026-06-01",
    schedule: [{
      day: 18,
      date: "2026-07-16",
      tasks: [{ id: "memory-review", task: "Review limit laws" }],
    }],
    completed: [],
  }, {
    now: DUE_NOW,
    timezoneOffset: -330,
  });

  assert.ok(occurrence);
  assert.equal(occurrence.metadata.plannerDay, 18);
  assert.equal(occurrence.metadata.pendingCount, 1);
});

test("creates a one-time learning alert when a notebook topic remains unstarted for three days", () => {
  const occurrences = getStaleLearningTopicAlertOccurrences([{
    _id: "notebook-one",
    title: "Calculus foundations",
    subjectName: "Mathematics",
    createdAt: new Date("2026-07-13T12:30:00.000Z"),
    chapters: [{
      id: "chapter-one",
      title: "Limits",
      topics: [
        { id: "topic-started", title: "Limit laws" },
        { id: "topic-waiting", title: "Continuity" },
      ],
    }],
    learningState: {
      nodes: {
        "topic-started": {
          nodeId: "topic-started",
          nodeType: "topic",
          title: "Limit laws",
          status: "learning",
          startedAt: "2026-07-14T10:00:00.000Z",
        },
      },
    },
  }], { now: DUE_NOW });

  assert.equal(occurrences.length, 1);
  assert.equal(occurrences[0].metadata.topicTitle, "Continuity");
  const payload = JSON.parse(buildNotificationAlertPayload(occurrences[0]));
  assert.equal(payload.kind, "learning-topic-unstarted");
  assert.equal(payload.url, "/learn");
  assert.match(payload.body, /has not been started after three days/u);

  assert.deepEqual(getStaleLearningTopicAlertOccurrences([{
    _id: "new-notebook",
    createdAt: new Date("2026-07-15T12:30:00.000Z"),
    chapters: [{ id: "c", topics: [{ id: "t", title: "Too new" }] }],
  }], { now: DUE_NOW }), []);
  assert.deepEqual(getStaleLearningTopicAlertOccurrences([{
    _id: "old-notebook",
    createdAt: new Date("2026-07-08T12:30:00.000Z"),
    chapters: [{ id: "c", topics: [{ id: "t", title: "Past the alert window" }] }],
  }], { now: DUE_NOW }), []);
});

test("creates a credit reset alert only while all monthly credits are restored", () => {
  const now = new Date("2026-08-01T00:07:00.000Z");
  const quota = {
    limit: 100,
    used: 0,
    reserved: 0,
    remaining: 100,
    periodStart: "2026-08-01T00:00:00.000Z",
  };
  const occurrence = getAiCreditResetAlertOccurrence(quota, { now });
  assert.ok(occurrence);
  const payload = JSON.parse(buildNotificationAlertPayload(occurrence));
  assert.equal(payload.kind, "ai-credit-reset");
  assert.equal(payload.url, "/about");
  assert.match(payload.body, /back to 100% \(100 credits available\)/u);
  assert.equal(getAiCreditResetAlertOccurrence({ ...quota, remaining: 99, used: 1 }, { now }), null);
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
    academicProfileId: "legacy:user-one:profile-a",
    deviceId: DEVICE_ONE,
    occurrence,
    now: DUE_NOW,
    claimIdFactory: () => CLAIM_ONE,
  });
  const duplicate = await claimScheduledReminderDelivery({
    collection,
    userId: "user-one",
    academicProfileId: "legacy:user-one:profile-a",
    deviceId: DEVICE_ONE,
    occurrence,
    now: new Date(DUE_NOW.getTime() + 60_000),
    claimIdFactory: () => CLAIM_TWO,
  });
  const reclaimed = await claimScheduledReminderDelivery({
    collection,
    userId: "user-one",
    academicProfileId: "legacy:user-one:profile-a",
    deviceId: DEVICE_ONE,
    occurrence,
    now: new Date(DUE_NOW.getTime() + 6 * 60_000),
    claimIdFactory: () => CLAIM_TWO,
  });

  assert.equal(first.claimed, true);
  assert.equal(duplicate.claimed, false);
  assert.equal(reclaimed.claimed, true);
});

test("sends each goal occurrence once per browser device", async () => {
  const workspace = { goalReminderData: { goals: [goal()], reminders: [reminder()] } };
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

  assert.equal(first.sent, 2);
  assert.equal(duplicate.sent, 0);
  assert.equal(historyAfterFirst, 1);
  assert.equal(setup.history.documents.size, 1);
  assert.equal([...setup.history.documents.values()].every((document) => !("deviceId" in document)), true);
  assert.equal([...setup.history.documents.values()].every((document) => document.kind === "goal-due"), true);
  assert.equal(sends.length, 2);
  assert.equal(new Set(sends.map(([subscription]) => subscription.endpoint)).size, 2);
  assert.equal(sends.every(([, , deliveryOptions]) => deliveryOptions.timeout === 15_000), true);
  assert.equal(sends.every(([, , deliveryOptions]) => deliveryOptions.TTL === SCHEDULED_REMINDER_PUSH_TTL_SECONDS), true);
});

test("sends only actionable planner, goal, learning, and credit alerts", async () => {
  const now = new Date("2026-08-01T12:37:00.000Z");
  const workspace = {
    scheduleStartDate: "2026-08-01T00:00:00.000Z",
    schedule: [{ day: 1, tasks: [{ task: "Finish vectors" }] }],
    completed: [],
    goalReminderData: {
      goals: [{
        id: "goal-vectors",
        title: "Complete vectors unit",
        targetDate: "2026-08-01",
        completed: false,
      }],
      reminders: [reminder({
        id: "reminder-vectors",
        title: "Review vector formulas",
        date: "2026-08-01",
        time: "18:00",
      })],
    },
  };
  const setup = createSweepDb({
    users: [{ _id: "user-all-alerts", pushSubscriptions: [subscriptionRecord(DEVICE_ONE, 1)] }],
    workspace,
    learningNotebooks: [{
      _id: "notebook-vectors",
      title: "Vectors notebook",
      subjectName: "Mathematics",
      createdAt: new Date("2026-07-29T12:37:00.000Z"),
      chapters: [{ id: "chapter-vectors", topics: [{ id: "topic-vectors", title: "Vector addition" }] }],
    }],
  });
  const sends = [];
  let claimIndex = 1;
  const options = {
    db: setup.db,
    ensureVapidConfigured: async () => {},
    sendNotification: async (...args) => sends.push(args),
    getAiQuotaStatus: async () => ({
      limit: 100,
      used: 0,
      reserved: 0,
      remaining: 100,
      periodStart: "2026-08-01T00:00:00.000Z",
    }),
    now,
    claimIdFactory: () => `30000000-0000-4000-8000-${String(claimIndex++).padStart(12, "0")}`,
    logger: { warn() {}, error() {} },
  };

  const first = await runScheduledReminderPushSweep(options);
  const repeated = await runScheduledReminderPushSweep(options);
  const kinds = sends.map(([, payload]) => JSON.parse(payload).kind);

  assert.equal(first.sent, 4);
  assert.equal(repeated.sent, 0);
  assert.deepEqual(new Set(kinds), new Set([
    "planner-incomplete",
    "goal-due",
    "learning-topic-unstarted",
    "ai-credit-reset",
  ]));
  assert.equal(setup.history.documents.size, 4);
  assert.equal(kinds.includes("scheduled-reminder"), false);
});

test("legacy manual and study-target reminders remain stored but are never delivered", async () => {
  const workspace = {
    schedule: [],
    goalReminderData: {
      reminders: [
        reminder(),
        reminder({
          id: "study-target-daily-2026-07-16",
          title: "Daily study target - 4h",
        }),
      ],
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
  assert.equal(withSchedule.sent, 0);
  assert.equal(sends.length, 0);
  assert.equal(workspace.goalReminderData.reminders.length, 2);
});

test("clears transient claims for retry and removes an expired current subscription", async () => {
  const updates = [];
  const transientSetup = createSweepDb({
    users: [{ _id: "user-retry", pushSubscriptions: [subscriptionRecord(DEVICE_ONE, 1)] }],
    workspace: { goalReminderData: { goals: [goal()] } },
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
    workspace: { goalReminderData: { goals: [goal()] } },
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
    workspace: { goalReminderData: { goals: [goal()] } },
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

test("bounds actionable alert bursts and defers the remainder to later sweeps", async () => {
  const goals = Array.from({ length: MAX_SCHEDULED_REMINDERS_PER_DEVICE + 2 }, (_, index) => goal({
    id: `goal-${index}`,
    title: `Goal ${index}`,
  }));
  const setup = createSweepDb({
    users: [{ _id: "user-bounded", pushSubscriptions: [subscriptionRecord(DEVICE_ONE, 1)] }],
    workspace: { goalReminderData: { goals } },
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
