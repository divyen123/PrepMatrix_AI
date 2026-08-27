import assert from "node:assert/strict";
import test from "node:test";
import express from "express";

import registerAppUsageRoutes, {
  APP_USAGE_COUNTERS_COLLECTION,
  APP_USAGE_PREFERENCES_COLLECTION,
  APP_USAGE_RETENTION_DAYS,
  aggregateAppUsageDocuments,
  getRetainedUsageDayKeys,
  normalizeUsageTimeZone,
} from "./appUsageRoutes.js";

const NOW = new Date("2026-08-27T12:00:00.000Z");
const USER_ONE = "usage-user-one";
const USER_TWO = "usage-user-two";
const SOURCE_ONE = "browser-source-one";
const SOURCE_TWO = "browser-source-two";

function sameValue(left, right) {
  return String(left) === String(right);
}

function matches(document, filter = {}) {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === "$or") return expected.some((candidate) => matches(document, candidate));
    const actual = document?.[key];
    if (expected && typeof expected === "object" && !Array.isArray(expected)) {
      if ("$lt" in expected && !(actual < expected.$lt)) return false;
      if ("$lte" in expected && !(actual <= expected.$lte)) return false;
      if ("$gt" in expected && !(actual > expected.$gt)) return false;
      if ("$gte" in expected && !(actual >= expected.$gte)) return false;
      return true;
    }
    return sameValue(actual, expected);
  });
}

function equalityFields(filter = {}) {
  return Object.fromEntries(Object.entries(filter).filter(([, value]) => (
    !value || typeof value !== "object" || Array.isArray(value)
  )));
}

function applyUpdate(document, update = {}, inserted = false) {
  if (inserted) Object.assign(document, update.$setOnInsert || {});
  Object.assign(document, update.$set || {});
  for (const [field, value] of Object.entries(update.$max || {})) {
    if (!(field in document) || Number(document[field]) < Number(value)) document[field] = value;
  }
}

class FakeCollection {
  constructor(name, documents = []) {
    this.name = name;
    this.documents = documents.map((document) => ({ ...document }));
    this.updateCalls = [];
    this.duplicatePlan = null;
  }

  duplicateNextUpsert(filter, document) {
    this.duplicatePlan = { filter, document };
  }

  async findOne(filter) {
    return this.documents.find((document) => matches(document, filter)) || null;
  }

  async updateOne(filter, update, options = {}) {
    this.updateCalls.push({ filter, update, options });
    if (
      options.upsert
      && this.duplicatePlan
      && matches(this.duplicatePlan.document, this.duplicatePlan.filter)
      && matches(this.duplicatePlan.document, filter)
    ) {
      const plan = this.duplicatePlan;
      this.duplicatePlan = null;
      this.documents.push({ ...plan.document });
      const error = new Error("duplicate key");
      error.code = 11000;
      throw error;
    }

    const existing = this.documents.find((document) => matches(document, filter));
    if (existing) {
      applyUpdate(existing, update, false);
      return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
    }
    if (!options.upsert) {
      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
    }

    const document = equalityFields(filter);
    applyUpdate(document, update, true);
    this.documents.push(document);
    return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
  }

  async deleteMany(filter) {
    const kept = this.documents.filter((document) => !matches(document, filter));
    const deletedCount = this.documents.length - kept.length;
    this.documents.splice(0, this.documents.length, ...kept);
    return { deletedCount };
  }

  find(filter) {
    const selected = this.documents.filter((document) => matches(document, filter));
    return {
      async toArray() {
        return selected.map((document) => ({ ...document }));
      },
    };
  }
}

function createMemoryDb(seed = {}) {
  const collections = new Map();
  return {
    collections,
    collection(name) {
      if (!collections.has(name)) {
        collections.set(name, new FakeCollection(name, seed[name] || []));
      }
      return collections.get(name);
    },
  };
}

async function withUsageRoutes(run, { fenceError = null, seed = {} } = {}) {
  const db = createMemoryDb(seed);
  const fenceCalls = [];
  const app = express();
  app.use(express.json());
  const requireAuth = (handler) => async (req, res) => {
    const token = String(req.headers.authorization || "").replace(/^Bearer\s+/iu, "");
    if (![USER_ONE, USER_TWO].includes(token)) {
      return res.status(401).json({ error: "Login required." });
    }
    req.user = { _id: token };
    return handler(req, res);
  };
  registerAppUsageRoutes(app, {
    getDb: async () => db,
    requireAuth,
    now: () => NOW,
    withAccountWriteFence: async (database, req, write) => {
      assert.equal(database, db);
      fenceCalls.push(req.user._id);
      if (fenceError) throw fenceError;
      return write();
    },
  });
  app.use((error, _req, res, next) => {
    if (res.headersSent) return next(error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Server error" });
  });

  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const { port } = server.address();
  try {
    await run({
      baseUrl: `http://127.0.0.1:${port}`,
      db,
      fenceCalls,
    });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeIdleConnections?.();
    });
  }
}

function syncOptions(userId, body) {
  return {
    method: "POST",
    headers: {
      Authorization: `Bearer ${userId}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

function syncBody({
  days = {},
  localTimeZone = "America/New_York",
  sourceId = SOURCE_ONE,
  version = 2,
} = {}) {
  return { version, sourceId, days, localTimeZone };
}

test("sync uses an immutable first-choice IANA time zone and aggregates cumulative source counters", async () => {
  const usageTimeZone = normalizeUsageTimeZone("America/New_York");
  const retained = getRetainedUsageDayKeys(usageTimeZone, NOW);
  const yesterday = retained.at(-2);
  const today = retained.at(-1);

  await withUsageRoutes(async ({ baseUrl, db, fenceCalls }) => {
    const firstResponse = await fetch(`${baseUrl}/api/app-usage/sync`, syncOptions(USER_ONE, syncBody({
      days: { [yesterday]: 40, [today]: 120 },
    })));
    assert.equal(firstResponse.status, 200);
    assert.equal(firstResponse.headers.get("cache-control"), "no-store");
    assert.deepEqual(await firstResponse.json(), {
      usage: {
        version: 2,
        days: { [yesterday]: 40, [today]: 120 },
        usageTimeZone,
        updatedAt: NOW.toISOString(),
      },
      acknowledgedDays: { [yesterday]: 40, [today]: 120 },
    });

    const secondResponse = await fetch(`${baseUrl}/api/app-usage/sync`, syncOptions(USER_ONE, syncBody({
      days: { [today]: 50 },
      localTimeZone: "Asia/Tokyo",
      sourceId: SOURCE_TWO,
    })));
    assert.deepEqual(await secondResponse.json(), {
      usage: {
        version: 2,
        days: { [yesterday]: 40, [today]: 170 },
        usageTimeZone,
        updatedAt: NOW.toISOString(),
      },
      acknowledgedDays: { [today]: 50 },
    });

    const lowerReplay = await fetch(`${baseUrl}/api/app-usage/sync`, syncOptions(USER_ONE, syncBody({
      days: { [today]: 80 },
    })));
    const replayPayload = await lowerReplay.json();
    assert.equal(replayPayload.usage.days[today], 170);
    assert.equal(replayPayload.acknowledgedDays[today], 120);

    const counters = db.collection(APP_USAGE_COUNTERS_COLLECTION);
    assert.equal(counters.documents.length, 3);
    assert.equal(counters.updateCalls.every(({ update }) => "$max" in update), true);
    assert.equal(counters.documents.every(({ expiresAt }) => expiresAt instanceof Date), true);
    const preferences = db.collection(APP_USAGE_PREFERENCES_COLLECTION);
    assert.equal(preferences.documents.length, 1);
    assert.equal(preferences.documents[0].usageTimeZone, usageTimeZone);
    assert.deepEqual(fenceCalls, [USER_ONE, USER_ONE, USER_ONE]);
  });
});

test("a duplicate-key upsert race retries with the same atomic max and never double-counts", async () => {
  const usageTimeZone = normalizeUsageTimeZone("UTC");
  const today = getRetainedUsageDayKeys(usageTimeZone, NOW).at(-1);

  await withUsageRoutes(async ({ baseUrl, db }) => {
    await fetch(`${baseUrl}/api/app-usage/sync`, syncOptions(USER_ONE, syncBody({
      days: {},
      localTimeZone: usageTimeZone,
    })));
    const counters = db.collection(APP_USAGE_COUNTERS_COLLECTION);
    counters.duplicateNextUpsert(
      { userId: USER_ONE, sourceId: SOURCE_ONE, dayKey: today },
      { userId: USER_ONE, sourceId: SOURCE_ONE, dayKey: today, seconds: 75 },
    );

    const racedResponse = await fetch(`${baseUrl}/api/app-usage/sync`, syncOptions(USER_ONE, syncBody({
      days: { [today]: 100 },
      localTimeZone: usageTimeZone,
    })));
    const raced = await racedResponse.json();
    assert.equal(racedResponse.status, 200);
    assert.equal(raced.usage.days[today], 100);
    assert.equal(raced.acknowledgedDays[today], 100);
    assert.equal(counters.documents.length, 1);
    assert.equal(counters.updateCalls.at(-2).options.upsert, true);
    assert.equal(counters.updateCalls.at(-1).options.upsert, undefined);

    const sameReplay = await fetch(`${baseUrl}/api/app-usage/sync`, syncOptions(USER_ONE, syncBody({
      days: { [today]: 100 },
      localTimeZone: usageTimeZone,
    })));
    const lowerReplay = await fetch(`${baseUrl}/api/app-usage/sync`, syncOptions(USER_ONE, syncBody({
      days: { [today]: 10 },
      localTimeZone: usageTimeZone,
    })));
    assert.equal((await sameReplay.json()).usage.days[today], 100);
    assert.equal((await lowerReplay.json()).usage.days[today], 100);
    assert.equal(counters.documents[0].seconds, 100);
  });
});

test("a new device remaps its local calendar buckets into the account time zone", async () => {
  const accountTimeZone = normalizeUsageTimeZone("America/New_York");
  const deviceTimeZone = normalizeUsageTimeZone("Pacific/Kiritimati");
  const accountToday = getRetainedUsageDayKeys(accountTimeZone, NOW).at(-1);
  const deviceToday = getRetainedUsageDayKeys(deviceTimeZone, NOW).at(-1);
  assert.notEqual(deviceToday, accountToday);

  await withUsageRoutes(async ({ baseUrl }) => {
    const establish = await fetch(`${baseUrl}/api/app-usage/sync`, syncOptions(
      USER_ONE,
      syncBody({ days: {}, localTimeZone: accountTimeZone }),
    ));
    assert.equal(establish.status, 200);

    const migrated = await fetch(`${baseUrl}/api/app-usage/sync`, syncOptions(
      USER_ONE,
      syncBody({
        days: { [deviceToday]: 75 },
        localTimeZone: deviceTimeZone,
        sourceId: SOURCE_TWO,
      }),
    ));
    assert.equal(migrated.status, 200);
    assert.deepEqual(await migrated.json(), {
      usage: {
        version: 2,
        days: { [accountToday]: 75 },
        usageTimeZone: accountTimeZone,
        updatedAt: NOW.toISOString(),
      },
      acknowledgedDays: { [accountToday]: 75 },
    });

    const refreshed = await fetch(`${baseUrl}/api/app-usage/sync`, syncOptions(
      USER_ONE,
      syncBody({ days: { [accountToday]: 25 }, localTimeZone: accountTimeZone }),
    ));
    const refreshedPayload = await refreshed.json();
    assert.equal(refreshedPayload.usage.days[accountToday], 100);
  });
});

test("sync authenticates, isolates accounts, prunes stale counters, and returns only the source acknowledgement", async () => {
  const usageTimeZone = normalizeUsageTimeZone("UTC");
  const retained = getRetainedUsageDayKeys(usageTimeZone, NOW);
  const today = retained.at(-1);
  const staleDay = "2026-01-01";
  const seed = {
    [APP_USAGE_COUNTERS_COLLECTION]: [
      { userId: USER_ONE, sourceId: SOURCE_ONE, dayKey: staleDay, seconds: 999 },
      { userId: USER_TWO, sourceId: SOURCE_ONE, dayKey: staleDay, seconds: 555 },
    ],
  };

  await withUsageRoutes(async ({ baseUrl, db }) => {
    const unauthorized = await fetch(`${baseUrl}/api/app-usage/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(syncBody({ days: { [today]: 10 }, localTimeZone: usageTimeZone })),
    });
    assert.equal(unauthorized.status, 401);

    await fetch(`${baseUrl}/api/app-usage/sync`, syncOptions(USER_ONE, syncBody({
      days: { [today]: 90 },
      localTimeZone: usageTimeZone,
    })));
    const otherResponse = await fetch(`${baseUrl}/api/app-usage/sync`, syncOptions(USER_TWO, syncBody({
      days: { [today]: 25 },
      localTimeZone: usageTimeZone,
      sourceId: SOURCE_TWO,
    })));
    const other = await otherResponse.json();
    assert.deepEqual(other.usage.days, { [today]: 25 });
    assert.deepEqual(other.acknowledgedDays, { [today]: 25 });

    const ownRefresh = await fetch(`${baseUrl}/api/app-usage/sync`, syncOptions(USER_ONE, syncBody({
      days: {},
      localTimeZone: "Pacific/Honolulu",
    })));
    const own = await ownRefresh.json();
    assert.deepEqual(own.usage.days, { [today]: 90 });
    assert.deepEqual(own.acknowledgedDays, { [today]: 90 });

    const documents = db.collection(APP_USAGE_COUNTERS_COLLECTION).documents;
    assert.equal(documents.some(({ userId, dayKey }) => userId === USER_ONE && dayKey === staleDay), false);
    assert.equal(documents.some(({ userId, dayKey }) => userId === USER_TWO && dayKey === staleDay), false);
    assert.equal(documents.filter(({ dayKey }) => dayKey === today).length, 2);
  }, { seed });
});

test("sync enforces the version, source, time zone, seconds, request size, and 90-day window", async () => {
  const usageTimeZone = normalizeUsageTimeZone("UTC");
  const retained = getRetainedUsageDayKeys(usageTimeZone, NOW);
  const today = retained.at(-1);
  const tooManyDays = Object.fromEntries(Array.from(
    { length: APP_USAGE_RETENTION_DAYS + 1 },
    (_, index) => [`2025-01-${String(index + 1).padStart(2, "0")}`, index],
  ));

  await withUsageRoutes(async ({ baseUrl, db }) => {
    const cases = [
      [syncBody({ version: 1 }), "APP_USAGE_VERSION_UNSUPPORTED"],
      [syncBody({ sourceId: "short" }), "APP_USAGE_SOURCE_INVALID"],
      [syncBody({ localTimeZone: "Mars/Olympus_Mons" }), "APP_USAGE_TIME_ZONE_INVALID"],
      [syncBody({ days: { [today]: 1.5 }, localTimeZone: usageTimeZone }), "APP_USAGE_SECONDS_INVALID"],
      [syncBody({ days: tooManyDays, localTimeZone: usageTimeZone }), "APP_USAGE_DAYS_LIMIT_EXCEEDED"],
      [syncBody({ days: { "2026-01-01": 20 }, localTimeZone: usageTimeZone }), "APP_USAGE_DAY_OUTSIDE_RETENTION"],
      [syncBody({ days: { "2026-08-28": 20 }, localTimeZone: usageTimeZone }), "APP_USAGE_DAY_OUTSIDE_RETENTION"],
    ];

    for (const [body, expectedCode] of cases) {
      const response = await fetch(
        `${baseUrl}/api/app-usage/sync`,
        syncOptions(USER_ONE, body),
      );
      const payload = await response.json();
      assert.equal(response.status, 400);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(payload.code, expectedCode);
    }
    assert.equal(db.collection(APP_USAGE_COUNTERS_COLLECTION).documents.length, 0);
    assert.equal(db.collection(APP_USAGE_PREFERENCES_COLLECTION).documents.length, 0);
  });
});

test("defensive aggregation takes one max per source and caps an account day at 24 hours", () => {
  const result = aggregateAppUsageDocuments([
    { dayKey: "2026-08-27", sourceId: SOURCE_ONE, seconds: 100 },
    { dayKey: "2026-08-27", sourceId: SOURCE_ONE, seconds: 80 },
    { dayKey: "2026-08-27", sourceId: SOURCE_TWO, seconds: 86_350 },
  ], SOURCE_ONE);
  assert.deepEqual(result.days, { "2026-08-27": 86_400 });
  assert.deepEqual(result.acknowledgedDays, { "2026-08-27": 100 });
});

test("returns retryable account-fence conflicts without masking them as server errors", async () => {
  const fenceError = new Error("Another account update is already in progress.");
  fenceError.status = 409;
  fenceError.code = "PROFILE_UPDATE_IN_PROGRESS";

  await withUsageRoutes(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/api/app-usage/sync`, syncOptions(
      USER_ONE,
      syncBody(),
    ));
    assert.equal(response.status, 409);
    assert.equal(response.headers.get("retry-after"), "1");
    assert.deepEqual(await response.json(), {
      error: fenceError.message,
      code: fenceError.code,
    });
  }, { fenceError });
});
