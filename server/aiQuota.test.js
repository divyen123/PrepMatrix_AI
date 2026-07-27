import assert from "node:assert/strict";
import test from "node:test";
import { ObjectId } from "mongodb";
import {
  AI_QUOTA_FEATURES,
  AI_QUOTA_LOCKS_COLLECTION,
  AI_USAGE_EVENTS_COLLECTION,
  AiQuotaError,
  createAiQuotaService,
  getAiQuotaConfig,
} from "./aiQuota.js";

function clone(value) {
  if (value instanceof Date) return new Date(value.getTime());
  if (value instanceof ObjectId) return new ObjectId(value.toHexString());
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, clone(entry)]));
  }
  return value;
}

function equal(left, right) {
  if (left instanceof Date || right instanceof Date) {
    return left instanceof Date
      && right instanceof Date
      && left.getTime() === right.getTime();
  }
  if (left instanceof ObjectId || right instanceof ObjectId) {
    return left instanceof ObjectId
      && right instanceof ObjectId
      && left.toHexString() === right.toHexString();
  }
  return left === right;
}

function matches(document, filter = {}) {
  return Object.entries(filter).every(([key, expected]) => {
    const actual = document[key];
    if (expected && typeof expected === "object" && !(expected instanceof Date) && !(expected instanceof ObjectId)) {
      if (Object.hasOwn(expected, "$lte")) {
        return actual instanceof Date && actual.getTime() <= expected.$lte.getTime();
      }
      if (Object.hasOwn(expected, "$gt")) {
        return actual instanceof Date && actual.getTime() > expected.$gt.getTime();
      }
      if (Object.hasOwn(expected, "$exists")) {
        return expected.$exists ? Object.hasOwn(document, key) : !Object.hasOwn(document, key);
      }
    }
    return equal(actual, expected);
  });
}

function applyUpdate(document, update) {
  if (update.$set) {
    for (const [key, value] of Object.entries(update.$set)) document[key] = clone(value);
  }
  if (update.$setOnInsert) {
    for (const [key, value] of Object.entries(update.$setOnInsert)) {
      if (!Object.hasOwn(document, key)) document[key] = clone(value);
    }
  }
  if (update.$unset) {
    for (const key of Object.keys(update.$unset)) delete document[key];
  }
}

function createFakeDb({
  beforeInsertOne,
  beforeDeleteOne,
} = {}) {
  const stores = new Map();

  function storeFor(name) {
    if (!stores.has(name)) stores.set(name, []);
    return stores.get(name);
  }

  function collection(name) {
    const store = storeFor(name);
    return {
      find(filter) {
        return {
          async toArray() {
            return store.filter((document) => matches(document, filter)).map(clone);
          },
        };
      },
      async findOne(filter) {
        const found = store.find((document) => matches(document, filter));
        return found ? clone(found) : null;
      },
      async insertOne(input) {
        await beforeInsertOne?.({ name, input: clone(input) });
        const document = clone(input);
        if (document._id === undefined) document._id = new ObjectId();
        const duplicateId = store.some((entry) => equal(entry._id, document._id));
        const duplicateRequest = name === AI_USAGE_EVENTS_COLLECTION
          && store.some((entry) => (
            equal(entry.userId, document.userId)
            && entry.requestId === document.requestId
          ));
        if (duplicateId || duplicateRequest) {
          const error = new Error("duplicate key");
          error.code = 11000;
          throw error;
        }
        store.push(document);
        return { acknowledged: true, insertedId: clone(document._id) };
      },
      async updateOne(filter, update, options = {}) {
        const document = store.find((entry) => matches(entry, filter));
        if (document) {
          applyUpdate(document, update);
          return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
        }
        if (!options.upsert) {
          return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
        }
        const inserted = {};
        for (const [key, value] of Object.entries(filter)) {
          if (!key.startsWith("$") && !(value && typeof value === "object" && !Array.isArray(value))) {
            inserted[key] = clone(value);
          }
        }
        applyUpdate(inserted, update);
        if (inserted._id === undefined) inserted._id = new ObjectId();
        await this.insertOne(inserted);
        return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1, upsertedId: clone(inserted._id) };
      },
      async deleteOne(filter) {
        await beforeDeleteOne?.({ name, filter: clone(filter) });
        const index = store.findIndex((entry) => matches(entry, filter));
        if (index < 0) return { deletedCount: 0 };
        store.splice(index, 1);
        return { deletedCount: 1 };
      },
    };
  }

  return {
    collection,
    documents(name) {
      return storeFor(name).map(clone);
    },
  };
}

function createHarness({
  initialTime = "2026-07-15T12:00:00.000Z",
  config = {},
  db = createFakeDb(),
} = {}) {
  let clock = new Date(initialTime);
  const service = createAiQuotaService({
    getDb: async () => db,
    now: () => new Date(clock),
    config: {
      limit: 100,
      costs: AI_QUOTA_FEATURES,
      lockWaitMs: 500,
      lockRetryMs: 1,
      ...config,
    },
  });
  return {
    db,
    service,
    setTime(value) {
      clock = new Date(value);
    },
    advance(milliseconds) {
      clock = new Date(clock.getTime() + milliseconds);
    },
  };
}

const IDS = Object.freeze({
  chat1: "00000000-0000-4000-8000-000000000001",
  chat2: "00000000-0000-4000-8000-000000000002",
  chat3: "00000000-0000-4000-8000-000000000003",
  quiz1: "00000000-0000-4000-8000-000000000011",
  quiz2: "00000000-0000-4000-8000-000000000012",
});

async function expectQuotaError(promise, code, status) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof AiQuotaError);
    assert.equal(error.code, code);
    assert.equal(error.status, status);
    return true;
  });
}

test("loads documented defaults and accepts server-side environment overrides", () => {
  const defaults = getAiQuotaConfig({});
  assert.equal(defaults.limit, 100);
  assert.deepEqual(defaults.costs, AI_QUOTA_FEATURES);

  const configured = getAiQuotaConfig({
    AI_MONTHLY_CREDIT_LIMIT: "250",
    AI_CREDIT_COST_CHAT: "2",
    AI_CREDIT_COST_SECURE_EXAM: "20",
  });
  assert.equal(configured.limit, 250);
  assert.equal(configured.costs.chat, 2);
  assert.equal(configured.costs.secure_exam, 20);
  assert.equal(configured.costs.quiz, 3);
});

test("reports a fresh UTC-month allowance and weighted committed usage", async () => {
  const { service } = createHarness();
  assert.deepEqual(await service.getStatus("student-a"), {
    limit: 100,
    used: 0,
    reserved: 0,
    remaining: 100,
    periodStart: "2026-07-01T00:00:00.000Z",
    resetAt: "2026-08-01T00:00:00.000Z",
    costs: { ...AI_QUOTA_FEATURES },
  });

  const reservation = await service.reserve({
    userId: "student-a",
    feature: "quiz",
    requestId: IDS.quiz1,
  });
  assert.equal(reservation.state, "reserved");
  assert.equal(reservation.cost, 3);
  assert.equal(reservation.quota.reserved, 3);
  assert.equal(reservation.quota.remaining, 97);

  const committed = await service.commit({
    eventId: reservation.eventId,
    reservationToken: reservation.reservationToken,
    replayPayload: { questions: [{ question: "Test?" }] },
  });
  assert.equal(committed.quota.used, 3);
  assert.equal(committed.quota.reserved, 0);
  assert.equal(committed.quota.remaining, 97);
});

test("isolates students and resets accounting exactly at the UTC month boundary", async () => {
  const harness = createHarness({ initialTime: "2026-07-31T23:59:59.999Z" });
  const reserved = await harness.service.reserve({
    userId: "student-a",
    feature: "career_analysis",
    requestId: IDS.chat1,
  });
  await harness.service.commit({
    eventId: reserved.eventId,
    reservationToken: reserved.reservationToken,
    replayPayload: { summary: "Ready" },
  });

  assert.equal((await harness.service.getStatus("student-a")).used, 5);
  assert.equal((await harness.service.getStatus("student-b")).remaining, 100);

  harness.setTime("2026-08-01T00:00:00.000Z");
  const nextMonth = await harness.service.getStatus("student-a");
  assert.equal(nextMonth.used, 0);
  assert.equal(nextMonth.remaining, 100);
  assert.equal(nextMonth.periodStart, "2026-08-01T00:00:00.000Z");
  assert.equal(nextMonth.resetAt, "2026-09-01T00:00:00.000Z");
});

test("serializes concurrent requests so the final credits cannot be overspent", async () => {
  const { service } = createHarness({ config: { limit: 3 } });
  const results = await Promise.allSettled([
    service.reserve({ userId: "student-a", feature: "quiz", requestId: IDS.quiz1 }),
    service.reserve({ userId: "student-a", feature: "quiz", requestId: IDS.quiz2 }),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const rejection = results.find((result) => result.status === "rejected");
  assert.ok(rejection.reason instanceof AiQuotaError);
  assert.equal(rejection.reason.code, "AI_USER_QUOTA_EXHAUSTED");
  assert.equal(rejection.reason.status, 429);

  const quota = await service.getStatus("student-a");
  assert.equal(quota.used, 0);
  assert.equal(quota.reserved, 3);
  assert.equal(quota.remaining, 0);
});

test("renews the lock lease while a slow reservation write is in flight", async () => {
  let delayFirstUsageInsert = true;
  const db = createFakeDb({
    async beforeInsertOne({ name }) {
      if (name !== AI_USAGE_EVENTS_COLLECTION || !delayFirstUsageInsert) return;
      delayFirstUsageInsert = false;
      await new Promise((resolve) => setTimeout(resolve, 120));
    },
  });
  const service = createAiQuotaService({
    getDb: async () => db,
    config: {
      limit: 1,
      costs: AI_QUOTA_FEATURES,
      lockTtlMs: 45,
      lockWaitMs: 500,
      lockRetryMs: 2,
    },
  });

  const firstPromise = service.reserve({
    userId: "student-a",
    feature: "chat",
    requestId: IDS.chat1,
  });
  await new Promise((resolve) => setTimeout(resolve, 70));
  const secondPromise = service.reserve({
    userId: "student-a",
    feature: "chat",
    requestId: IDS.chat2,
  });
  const [first, second] = await Promise.allSettled([firstPromise, secondPromise]);

  assert.equal(first.status, "fulfilled");
  assert.equal(second.status, "rejected");
  assert.ok(second.reason instanceof AiQuotaError);
  assert.equal(second.reason.code, "AI_USER_QUOTA_EXHAUSTED");
  const status = await service.getStatus("student-a");
  assert.equal(status.reserved, 1);
  assert.equal(status.remaining, 0);
});

test("does not mask a durable reservation when best-effort lock release fails", async () => {
  let failedRelease = false;
  const db = createFakeDb({
    async beforeDeleteOne({ name }) {
      if (name !== AI_QUOTA_LOCKS_COLLECTION || failedRelease) return;
      failedRelease = true;
      throw new Error("lock cleanup unavailable");
    },
  });
  const { service } = createHarness({ db });

  const reservation = await service.reserve({
    userId: "student-a",
    feature: "chat",
    requestId: IDS.chat1,
  });

  assert.equal(failedRelease, true);
  assert.equal(reservation.state, "reserved");
  assert.equal(reservation.quota.reserved, 1);
  assert.equal(db.documents(AI_USAGE_EVENTS_COLLECTION).length, 1);
});

test("refunds failed work and permits a later reservation with the same key", async () => {
  const { service } = createHarness();
  const first = await service.reserve({
    userId: "student-a",
    feature: "chat",
    requestId: IDS.chat1,
  });
  const refunded = await service.refund({
    eventId: first.eventId,
    reservationToken: first.reservationToken,
    outcome: "provider_timeout",
  });
  assert.equal(refunded.refunded, true);
  assert.equal(refunded.quota.used, 0);
  assert.equal(refunded.quota.reserved, 0);
  assert.equal(refunded.quota.remaining, 100);

  const repeatedRefund = await service.refund({
    eventId: first.eventId,
    reservationToken: first.reservationToken,
    outcome: "provider_timeout",
  });
  assert.equal(repeatedRefund.refunded, false);
  assert.equal(repeatedRefund.status, "refunded");

  const retried = await service.reserve({
    userId: "student-a",
    feature: "chat",
    requestId: IDS.chat1,
  });
  assert.equal(retried.state, "reserved");
  assert.equal(retried.eventId, first.eventId);
  assert.notEqual(retried.reservationToken, first.reservationToken);
  assert.equal(retried.quota.remaining, 99);
});

test("does not count expired reservations and recovers an expired per-user lock", async () => {
  const harness = createHarness();
  const reservation = await harness.service.reserve({
    userId: "student-a",
    feature: "learning_notebook",
    requestId: IDS.chat1,
  });
  assert.equal(reservation.quota.remaining, 88);

  harness.advance(30 * 60 * 1000);
  const atExpiry = await harness.service.getStatus("student-a");
  assert.equal(atExpiry.reserved, 0);
  assert.equal(atExpiry.remaining, 100);
  const [expiredEvent] = harness.db.documents(AI_USAGE_EVENTS_COLLECTION);
  assert.equal(expiredEvent.status, "refunded");
  assert.equal(expiredEvent.outcome, "reservation_expired");

  await harness.db.collection(AI_QUOTA_LOCKS_COLLECTION).insertOne({
    _id: "ai-quota:student-b",
    token: "abandoned",
    expiresAt: new Date("2026-07-15T11:59:00.000Z"),
  });
  const afterStaleLock = await harness.service.reserve({
    userId: "student-b",
    feature: "chat",
    requestId: IDS.chat2,
  });
  assert.equal(afterStaleLock.state, "reserved");
  assert.equal(afterStaleLock.quota.remaining, 99);
});

test("fences a stale worker after an expired reservation is replaced", async () => {
  const harness = createHarness({ config: { reservationTtlMs: 100 } });
  const first = await harness.service.reserve({
    userId: "student-a",
    feature: "chat",
    requestId: IDS.chat1,
  });

  harness.advance(100);
  const replacement = await harness.service.reserve({
    userId: "student-a",
    feature: "chat",
    requestId: IDS.chat1,
  });
  assert.equal(replacement.eventId, first.eventId);
  assert.notEqual(replacement.reservationToken, first.reservationToken);

  await expectQuotaError(
    harness.service.commit({
      eventId: first.eventId,
      reservationToken: first.reservationToken,
      replayPayload: { answer: "stale" },
    }),
    "AI_QUOTA_RESERVATION_STALE",
    409,
  );
  await expectQuotaError(
    harness.service.refund({
      eventId: first.eventId,
      reservationToken: first.reservationToken,
      outcome: "stale_worker_failed",
    }),
    "AI_QUOTA_RESERVATION_STALE",
    409,
  );

  const active = await harness.service.getStatus("student-a");
  assert.equal(active.reserved, 1);
  assert.equal(active.remaining, 99);
  await harness.service.commit({
    eventId: replacement.eventId,
    reservationToken: replacement.reservationToken,
    replayPayload: { answer: "replacement" },
  });
  const replay = await harness.service.reserve({
    userId: "student-a",
    feature: "chat",
    requestId: IDS.chat1,
  });
  assert.deepEqual(replay.replayPayload, { answer: "replacement" });
});

test("looks up idempotency state without reserving credits", async () => {
  const { db, service } = createHarness();
  const missing = await service.lookup({
    userId: "student-a",
    feature: "chat",
    requestId: IDS.chat1,
  });
  assert.equal(missing.state, "none");
  assert.equal(missing.cost, 1);
  assert.equal(missing.quota.remaining, 100);
  assert.equal(db.documents(AI_USAGE_EVENTS_COLLECTION).length, 0);

  const reservation = await service.reserve({
    userId: "student-a",
    feature: "chat",
    requestId: IDS.chat1,
  });
  await expectQuotaError(
    service.lookup({
      userId: "student-a",
      feature: "chat",
      requestId: IDS.chat1,
    }),
    "AI_REQUEST_IN_PROGRESS",
    409,
  );
  const active = await service.getStatus("student-a");
  assert.equal(active.reserved, 1);
  assert.equal(active.remaining, 99);

  await service.commit({
    eventId: reservation.eventId,
    reservationToken: reservation.reservationToken,
    replayPayload: { answer: "cached" },
    resultRef: { type: "chat_session", id: "session-1" },
  });
  const replay = await service.lookup({
    userId: "student-a",
    feature: "chat",
    requestId: IDS.chat1,
  });
  assert.deepEqual(replay, {
    state: "replay",
    eventId: reservation.eventId,
    cost: 1,
    quota: {
      limit: 100,
      used: 1,
      reserved: 0,
      remaining: 99,
      periodStart: "2026-07-01T00:00:00.000Z",
      resetAt: "2026-08-01T00:00:00.000Z",
      costs: { ...AI_QUOTA_FEATURES },
    },
    replayPayload: { answer: "cached" },
    resultRef: { type: "chat_session", id: "session-1" },
  });
  assert.equal(db.documents(AI_USAGE_EVENTS_COLLECTION).length, 1);
});

test("lookup refunds an expired reservation without creating a replacement", async () => {
  const harness = createHarness({ config: { reservationTtlMs: 100 } });
  const reservation = await harness.service.reserve({
    userId: "student-a",
    feature: "chat",
    requestId: IDS.chat1,
  });
  harness.advance(100);

  const result = await harness.service.lookup({
    userId: "student-a",
    feature: "chat",
    requestId: IDS.chat1,
  });
  assert.equal(result.state, "none");
  assert.equal(result.cost, 1);
  assert.equal(result.quota.reserved, 0);
  assert.equal(result.quota.remaining, 100);
  const events = harness.db.documents(AI_USAGE_EVENTS_COLLECTION);
  assert.equal(events.length, 1);
  assert.equal(String(events[0]._id), reservation.eventId);
  assert.equal(events[0].status, "refunded");
  assert.equal(events[0].outcome, "reservation_expired");
});

test("rejects an active duplicate and replays a committed duplicate without charging twice", async () => {
  const { service } = createHarness();
  const reservation = await service.reserve({
    userId: "student-a",
    feature: "chat",
    requestId: IDS.chat1,
  });

  await expectQuotaError(
    service.reserve({ userId: "student-a", feature: "chat", requestId: IDS.chat1 }),
    "AI_REQUEST_IN_PROGRESS",
    409,
  );

  await service.commit({
    eventId: reservation.eventId,
    reservationToken: reservation.reservationToken,
    replayPayload: { answer: "A cached response" },
    resultRef: { type: "chat_session", id: "123" },
  });
  const replay = await service.reserve({
    userId: "student-a",
    feature: "chat",
    requestId: IDS.chat1,
  });
  assert.deepEqual(replay, {
    state: "replay",
    eventId: reservation.eventId,
    cost: 1,
    quota: {
      limit: 100,
      used: 1,
      reserved: 0,
      remaining: 99,
      periodStart: "2026-07-01T00:00:00.000Z",
      resetAt: "2026-08-01T00:00:00.000Z",
      costs: { ...AI_QUOTA_FEATURES },
    },
    replayPayload: { answer: "A cached response" },
    resultRef: { type: "chat_session", id: "123" },
  });
});

test("validates UUIDs, distinguishes exhaustion, and exposes response headers", async () => {
  const { service } = createHarness({ config: { limit: 1 } });
  await expectQuotaError(
    service.reserve({ userId: "student-a", feature: "chat" }),
    "AI_IDEMPOTENCY_KEY_REQUIRED",
    400,
  );
  await expectQuotaError(
    service.lookup({ userId: "student-a", feature: "chat", requestId: "not-a-uuid" }),
    "AI_INVALID_IDEMPOTENCY_KEY",
    400,
  );
  await expectQuotaError(
    service.reserve({ userId: "student-a", feature: "chat", requestId: "not-a-uuid" }),
    "AI_INVALID_IDEMPOTENCY_KEY",
    400,
  );

  const reserved = await service.reserve({
    userId: "student-a",
    feature: "chat",
    requestId: IDS.chat1,
  });
  await expectQuotaError(
    service.commit({
      eventId: reserved.eventId,
      replayPayload: { answer: "missing token" },
    }),
    "AI_QUOTA_RESERVATION_TOKEN_REQUIRED",
    400,
  );
  await expectQuotaError(
    service.refund({
      eventId: reserved.eventId,
      reservationToken: "not-a-token",
    }),
    "AI_QUOTA_RESERVATION_TOKEN_INVALID",
    400,
  );
  await expectQuotaError(
    service.reserve({ userId: "student-a", feature: "chat", requestId: IDS.chat2 }),
    "AI_USER_QUOTA_EXHAUSTED",
    429,
  );
  assert.deepEqual(service.responseHeaders(reserved.quota, reserved.cost), {
    "X-AI-Credit-Limit": "1",
    "X-AI-Credit-Remaining": "0",
    "X-AI-Credit-Reset-At": "2026-08-01T00:00:00.000Z",
    "X-AI-Credit-Cost": "1",
  });
});

test("wraps database failures as an unavailable quota error", async () => {
  const service = createAiQuotaService({
    getDb: async () => {
      throw new Error("database offline");
    },
  });
  await expectQuotaError(service.getStatus("student-a"), "AI_QUOTA_UNAVAILABLE", 503);
});
