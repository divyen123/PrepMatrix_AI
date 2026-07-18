import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { ObjectId } from "mongodb";

import {
  NOTIFICATION_HISTORY_LIMIT,
  publicNotificationHistoryRecord,
  recordNotificationHistory,
  recordNotificationHistorySafely,
  registerNotificationHistoryRoutes,
} from "./notificationHistory.js";

const USER_ONE = "history-user-one";
const USER_TWO = "history-user-two";
const READ_AT = new Date("2026-07-17T10:30:00.000Z");

function sameValue(left, right) {
  if (left instanceof ObjectId || right instanceof ObjectId) {
    return String(left) === String(right);
  }
  return left === right;
}

function matchesReadCondition(document, condition) {
  if (!Object.prototype.hasOwnProperty.call(condition, "readAt")) return true;
  const expected = condition.readAt;
  if (expected && typeof expected === "object" && "$exists" in expected) {
    return Object.prototype.hasOwnProperty.call(document, "readAt") === expected.$exists;
  }
  return document.readAt === expected;
}

function matches(document, filter = {}) {
  if ("userId" in filter && !sameValue(document.userId, filter.userId)) return false;
  if ("eventKey" in filter && document.eventKey !== filter.eventKey) return false;
  if ("_id" in filter) {
    if (filter._id?.$in) {
      if (!filter._id.$in.some((id) => sameValue(document._id, id))) return false;
    } else if (!sameValue(document._id, filter._id)) {
      return false;
    }
  }
  if (filter.$or && !filter.$or.some((condition) => matchesReadCondition(document, condition))) {
    return false;
  }
  return true;
}

function sortable(value) {
  if (value instanceof Date) return value.getTime();
  return String(value ?? "");
}

class FakeHistoryCollection {
  constructor(documents = []) {
    this.documents = documents;
  }

  async insertOne(document) {
    const stored = { ...document, _id: document._id || new ObjectId() };
    this.documents.push(stored);
    return { insertedId: stored._id };
  }

  async updateOne(filter, update, options = {}) {
    const existing = this.documents.find((document) => matches(document, filter));
    if (existing) {
      Object.assign(existing, update.$set || {});
      return { matchedCount: 1, modifiedCount: update.$set ? 1 : 0, upsertedCount: 0, upsertedId: null };
    }
    if (!options.upsert) {
      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0, upsertedId: null };
    }

    const stored = {
      ...update.$setOnInsert,
      _id: update.$setOnInsert?._id || new ObjectId(),
    };
    this.documents.push(stored);
    return {
      matchedCount: 0,
      modifiedCount: 0,
      upsertedCount: 1,
      upsertedId: stored._id,
    };
  }

  find(filter) {
    let list = this.documents.filter((document) => matches(document, filter));
    let projection = null;
    const cursor = {
      project(value) {
        projection = value;
        return cursor;
      },
      sort(specification) {
        const entries = Object.entries(specification);
        list = [...list].sort((left, right) => {
          for (const [field, direction] of entries) {
            const leftValue = sortable(left[field]);
            const rightValue = sortable(right[field]);
            if (leftValue < rightValue) return -1 * direction;
            if (leftValue > rightValue) return 1 * direction;
          }
          return 0;
        });
        return cursor;
      },
      skip(count) {
        list = list.slice(count);
        return cursor;
      },
      limit(count) {
        list = list.slice(0, count);
        return cursor;
      },
      async toArray() {
        return list.map((document) => {
          const result = { ...document };
          for (const [field, include] of Object.entries(projection || {})) {
            if (include === 0) delete result[field];
          }
          return result;
        });
      },
    };
    return cursor;
  }

  async findOne(filter) {
    return this.documents.find((document) => matches(document, filter)) || null;
  }

  async countDocuments(filter) {
    return this.documents.filter((document) => matches(document, filter)).length;
  }

  async deleteOne(filter) {
    const index = this.documents.findIndex((document) => matches(document, filter));
    if (index < 0) return { deletedCount: 0 };
    this.documents.splice(index, 1);
    return { deletedCount: 1 };
  }

  async deleteMany(filter) {
    const before = this.documents.length;
    this.documents = this.documents.filter((document) => !matches(document, filter));
    return { deletedCount: before - this.documents.length };
  }
}

async function withHistoryRoutes(collection, run) {
  const app = express();
  app.use(express.json());
  const requireAuth = (handler) => async (req, res) => {
    const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (![USER_ONE, USER_TWO].includes(token)) {
      return res.status(401).json({ error: "Login required." });
    }
    req.user = { _id: token };
    return handler(req, res);
  };
  const mutationSecurity = (req, res, next) => (
    String(req.headers["content-type"] || "").startsWith("application/json")
      ? next()
      : res.status(415).json({ error: "Notification updates require JSON." })
  );
  registerNotificationHistoryRoutes(app, {
    getDb: async () => ({ collection: () => collection }),
    mutationSecurity,
    requireAuth,
    now: () => READ_AT,
  });

  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeIdleConnections?.();
    });
  }
}

function authenticatedOptions(userId, method = "GET") {
  const options = {
    method,
    headers: { Authorization: `Bearer ${userId}` },
  };
  if (method !== "GET") {
    options.headers["Content-Type"] = "application/json";
    options.body = "{}";
  }
  return options;
}

test("deduplicates logical events and retains only the newest 100 records per user", async () => {
  const collection = new FakeHistoryCollection();
  for (let index = 0; index < NOTIFICATION_HISTORY_LIMIT + 5; index += 1) {
    await recordNotificationHistory({
      collection,
      userId: USER_ONE,
      kind: "push-test",
      title: `Notification ${index}`,
      body: `Body ${index}`,
      url: "/settings",
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
    });
  }

  assert.equal(collection.documents.length, NOTIFICATION_HISTORY_LIMIT);
  assert.equal(collection.documents.some(({ title }) => title === "Notification 0"), false);
  assert.equal(collection.documents.some(({ title }) => title === "Notification 104"), true);

  const first = await recordNotificationHistory({
    collection,
    userId: USER_ONE,
    eventKey: "daily-study-check:2026-07-17",
    kind: "daily-study-check",
    title: "First daily title",
    body: "One logical daily event.",
    url: "/planner",
    createdAt: new Date("2026-07-17T12:30:00.000Z"),
  });
  const duplicate = await recordNotificationHistory({
    collection,
    userId: USER_ONE,
    eventKey: "daily-study-check:2026-07-17",
    kind: "daily-study-check",
    title: "Duplicate device title",
    body: "Should not replace the first event.",
    url: "/planner",
    createdAt: new Date("2026-07-17T12:31:00.000Z"),
  });

  assert.equal(first.inserted, true);
  assert.equal(duplicate.inserted, false);
  assert.equal(collection.documents.length, NOTIFICATION_HISTORY_LIMIT);
  assert.equal(collection.documents.filter(({ eventKey }) => eventKey === "daily-study-check:2026-07-17").length, 1);
  assert.equal(collection.documents.find(({ eventKey }) => eventKey === "daily-study-check:2026-07-17").title, "First daily title");
});

test("best-effort history failures never escape after an accepted delivery", async () => {
  const result = await recordNotificationHistorySafely({
    db: {
      collection() {
        throw new Error("history unavailable");
      },
    },
    userId: USER_ONE,
    kind: "push-test",
    title: "Delivered",
    body: "Provider already accepted this.",
  }, {
    error() {
      throw new Error("logger unavailable");
    },
  });

  assert.deepEqual(result, { inserted: false, failed: true, id: null });
});

test("history APIs authenticate, scope IDs by user, mark read idempotently, and delete", async () => {
  const ownId = new ObjectId();
  const foreignId = new ObjectId();
  const collection = new FakeHistoryCollection([
    {
      _id: ownId,
      userId: USER_ONE,
      kind: "scheduled-reminder",
      title: "Review graphs",
      body: "Complete the graph revision cards.",
      url: "/dashboard?reminder=graphs",
      createdAt: new Date("2026-07-17T09:00:00.000Z"),
    },
    {
      _id: foreignId,
      userId: USER_TWO,
      kind: "daily-study-check",
      title: "Private notification",
      body: "Another user's message.",
      url: "/planner",
      createdAt: new Date("2026-07-17T10:00:00.000Z"),
    },
  ]);

  await withHistoryRoutes(collection, async (baseUrl) => {
    const unauthorized = await fetch(`${baseUrl}/api/notifications/history`);
    assert.equal(unauthorized.status, 401);

    const listResponse = await fetch(
      `${baseUrl}/api/notifications/history`,
      authenticatedOptions(USER_ONE),
    );
    const list = await listResponse.json();
    assert.equal(listResponse.status, 200);
    assert.equal(list.unreadCount, 1);
    assert.deepEqual(list.notifications, [{
      id: ownId.toString(),
      kind: "scheduled-reminder",
      title: "Review graphs",
      body: "Complete the graph revision cards.",
      url: "/dashboard?reminder=graphs",
      createdAt: "2026-07-17T09:00:00.000Z",
      readAt: null,
    }]);

    const invalidRead = await fetch(
      `${baseUrl}/api/notifications/history/not-an-id/read`,
      authenticatedOptions(USER_ONE, "PATCH"),
    );
    assert.equal(invalidRead.status, 400);
    assert.equal((await invalidRead.json()).code, "INVALID_NOTIFICATION_ID");

    const foreignRead = await fetch(
      `${baseUrl}/api/notifications/history/${foreignId}/read`,
      authenticatedOptions(USER_ONE, "PATCH"),
    );
    assert.equal(foreignRead.status, 404);
    assert.equal(collection.documents.find(({ _id }) => sameValue(_id, foreignId)).readAt, undefined);

    const readResponse = await fetch(
      `${baseUrl}/api/notifications/history/${ownId}/read`,
      authenticatedOptions(USER_ONE, "PATCH"),
    );
    const readPayload = await readResponse.json();
    assert.equal(readResponse.status, 200);
    assert.equal(readPayload.notification.readAt, READ_AT.toISOString());

    const repeatedRead = await fetch(
      `${baseUrl}/api/notifications/history/${ownId}/read`,
      authenticatedOptions(USER_ONE, "PATCH"),
    );
    assert.equal((await repeatedRead.json()).notification.readAt, READ_AT.toISOString());

    const foreignDelete = await fetch(
      `${baseUrl}/api/notifications/history/${foreignId}`,
      authenticatedOptions(USER_ONE, "DELETE"),
    );
    assert.equal(foreignDelete.status, 404);

    const deleteResponse = await fetch(
      `${baseUrl}/api/notifications/history/${ownId}`,
      authenticatedOptions(USER_ONE, "DELETE"),
    );
    assert.equal(deleteResponse.status, 200);
    assert.deepEqual(await deleteResponse.json(), { success: true, id: ownId.toString() });
    assert.equal(collection.documents.some(({ _id }) => sameValue(_id, foreignId)), true);
  });
});

test("bulk delete clears only the authenticated user's notification history", async () => {
  const firstOwnId = new ObjectId();
  const secondOwnId = new ObjectId();
  const foreignId = new ObjectId();
  const collection = new FakeHistoryCollection([
    {
      _id: firstOwnId,
      userId: USER_ONE,
      kind: "scheduled-reminder",
      title: "First reminder",
      body: "First private notification.",
      url: "/planner",
      createdAt: new Date("2026-07-17T09:00:00.000Z"),
    },
    {
      _id: secondOwnId,
      userId: USER_ONE,
      kind: "push-test",
      title: "Second reminder",
      body: "Second private notification.",
      url: "/settings",
      createdAt: new Date("2026-07-17T10:00:00.000Z"),
    },
    {
      _id: foreignId,
      userId: USER_TWO,
      kind: "daily-study-check",
      title: "Another user's reminder",
      body: "This record must be preserved.",
      url: "/planner",
      createdAt: new Date("2026-07-17T11:00:00.000Z"),
    },
  ]);

  await withHistoryRoutes(collection, async (baseUrl) => {
    const unauthorized = await fetch(
      `${baseUrl}/api/notifications/history`,
      authenticatedOptions("unknown-user", "DELETE"),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(collection.documents.length, 3);

    const invalidContentType = await fetch(`${baseUrl}/api/notifications/history`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${USER_ONE}` },
    });
    assert.equal(invalidContentType.status, 415);
    assert.equal(collection.documents.length, 3);

    const response = await fetch(
      `${baseUrl}/api/notifications/history`,
      authenticatedOptions(USER_ONE, "DELETE"),
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true, deletedCount: 2 });
    assert.deepEqual(collection.documents.map(({ _id }) => String(_id)), [foreignId.toString()]);

    const ownListResponse = await fetch(
      `${baseUrl}/api/notifications/history`,
      authenticatedOptions(USER_ONE),
    );
    const ownList = await ownListResponse.json();
    assert.equal(ownListResponse.status, 200);
    assert.deepEqual(ownList.notifications, []);
    assert.equal(ownList.unreadCount, 0);

    const foreignListResponse = await fetch(
      `${baseUrl}/api/notifications/history`,
      authenticatedOptions(USER_TWO),
    );
    const foreignList = await foreignListResponse.json();
    assert.equal(foreignListResponse.status, 200);
    assert.equal(foreignList.notifications.length, 1);
    assert.equal(foreignList.notifications[0].id, foreignId.toString());

    const repeated = await fetch(
      `${baseUrl}/api/notifications/history`,
      authenticatedOptions(USER_ONE, "DELETE"),
    );
    assert.equal(repeated.status, 200);
    assert.deepEqual(await repeated.json(), { success: true, deletedCount: 0 });
  });
});

test("public history records bound text and reject unsafe external URLs", () => {
  const notification = publicNotificationHistoryRecord({
    _id: new ObjectId(),
    kind: "push-test",
    title: "T".repeat(200),
    body: "B".repeat(600),
    url: "https://attacker.example/path",
    createdAt: READ_AT,
    readAt: null,
  });
  const backslashNotification = publicNotificationHistoryRecord({
    _id: new ObjectId(),
    kind: "scheduled-reminder",
    title: "Reminder",
    body: "Open the related page.",
    url: "/\\attacker.example/path",
    createdAt: READ_AT,
    readAt: null,
  });

  assert.equal(notification.title.length, 160);
  assert.equal(notification.body.length, 500);
  assert.equal(notification.url, "/");
  assert.equal(backslashNotification.url, "/");
  assert.equal(notification.readAt, null);
});
