import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { ObjectId } from "mongodb";
import {
  RESUME_GENERATIONS_COLLECTION,
  RESUME_HISTORY_COLLECTION,
  RESUME_HISTORY_LIMIT,
  normalizeResumeHistorySnapshot,
  pruneResumeHistory,
  publicResumeHistorySummary,
  registerResumeBuilderRoutes,
} from "./resumeBuilderRoutes.js";

const USER_ONE = "resume-user-one";
const USER_TWO = "resume-user-two";
const USER_SCHOOL = "resume-school-user";
const RECORDED_AT = new Date("2026-08-09T08:30:00.000Z");

function sameValue(left, right) {
  if (left instanceof ObjectId || right instanceof ObjectId) {
    return String(left) === String(right);
  }
  return left === right;
}

function cloneDocument(document) {
  const cloned = structuredClone(document);
  if (document?._id !== undefined) cloned._id = document._id;
  return cloned;
}

function matches(document, filter = {}) {
  return Object.entries(filter).every(([key, expected]) => {
    const actual = document[key];
    if (expected && typeof expected === "object" && !(expected instanceof Date) && !(expected instanceof ObjectId)) {
      if (Array.isArray(expected.$in)) {
        return expected.$in.some((candidate) => sameValue(actual, candidate));
      }
    }
    return sameValue(actual, expected);
  });
}

class MemoryResumeHistoryCollection {
  constructor(documents = []) {
    this.documents = documents.map(cloneDocument);
  }

  find(filter = {}) {
    let documents = this.documents.filter((document) => matches(document, filter));
    const cursor = {
      limit: (count) => {
        documents = documents.slice(0, count);
        return cursor;
      },
      project: (projection = {}) => {
        documents = documents.map((document) => {
          const includedFields = Object.entries(projection)
            .filter(([, include]) => include === 1)
            .map(([field]) => field);
          if (includedFields.length) {
            return Object.fromEntries(
              includedFields
                .filter((field) => document[field] !== undefined)
                .map((field) => [field, document[field]]),
            );
          }
          const result = structuredClone(document);
          for (const [field, include] of Object.entries(projection)) {
            if (include === 0) delete result[field];
          }
          return result;
        });
        return cursor;
      },
      skip: (count) => {
        documents = documents.slice(count);
        return cursor;
      },
      sort: (sortSpec = {}) => {
        const fields = Object.entries(sortSpec);
        documents = [...documents].sort((left, right) => {
          for (const [field, direction] of fields) {
            const leftValue = left[field] instanceof Date
              ? left[field].getTime()
              : String(left[field] ?? "");
            const rightValue = right[field] instanceof Date
              ? right[field].getTime()
              : String(right[field] ?? "");
            if (leftValue < rightValue) return -1 * direction;
            if (leftValue > rightValue) return 1 * direction;
          }
          return 0;
        });
        return cursor;
      },
      toArray: async () => documents.map(cloneDocument),
    };
    return cursor;
  }

  async findOne(filter) {
    const document = this.documents.find((candidate) => matches(candidate, filter));
    return document ? cloneDocument(document) : null;
  }

  async insertOne(document) {
    if (
      document.requestId
      && this.documents.some((candidate) => (
        sameValue(candidate.userId, document.userId)
        && candidate.requestId === document.requestId
      ))
    ) {
      const error = new Error("duplicate resume request");
      error.code = 11000;
      throw error;
    }
    const insertedId = document._id || new ObjectId();
    this.documents.push(cloneDocument({ ...document, _id: insertedId }));
    return { insertedId };
  }

  async updateOne(filter, update) {
    const index = this.documents.findIndex((document) => matches(document, filter));
    if (index < 0) return { matchedCount: 0, modifiedCount: 0 };
    const next = { ...this.documents[index], ...structuredClone(update.$set || {}) };
    if (
      next.requestId
      && this.documents.some((candidate, candidateIndex) => (
        candidateIndex !== index
        && sameValue(candidate.userId, next.userId)
        && candidate.requestId === next.requestId
      ))
    ) {
      const error = new Error("duplicate resume request");
      error.code = 11000;
      throw error;
    }
    this.documents[index] = next;
    return { matchedCount: 1, modifiedCount: 1 };
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

function draft(name, overrides = {}) {
  return {
    personal: {
      fullName: name,
      headline: "Software Engineer",
      email: "learner@example.com",
    },
    summary: "A concise professional summary.",
    skills: ["JavaScript", "Node.js"],
    education: [{ institution: "PrepMatrix University", degree: "B.Tech" }],
    ...overrides,
  };
}

async function withResumeRoutes(collection, run, options = {}) {
  const generationCollection = options.generationCollection || { documents: [] };
  const app = express();
  app.use(express.json());
  const requireAuth = (handler) => async (req, res, next) => {
    const userId = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (![USER_ONE, USER_TWO, USER_SCHOOL].includes(userId)) {
      return res.status(401).json({ error: "Login required." });
    }
    req.user = {
      _id: userId,
      academicLevel: userId === USER_SCHOOL ? "Primary School" : "Undergraduate / Bachelor's",
    };
    try {
      return await handler(req, res);
    } catch (error) {
      return next(error);
    }
  };
  registerResumeBuilderRoutes(app, {
    getDb: async () => ({
      collection(name) {
        if (name === RESUME_HISTORY_COLLECTION) return collection;
        if (name === RESUME_GENERATIONS_COLLECTION) return generationCollection;
        return assert.fail(`Unexpected collection access: ${name}`);
      },
    }),
    now: () => RECORDED_AT,
    requireAuth,
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

function requestOptions(userId, method = "GET", body) {
  const options = {
    method,
    headers: { Authorization: `Bearer ${userId}` },
  };
  if (body !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  return options;
}

test("normalizes and bounds a resume-history snapshot using the resume name", () => {
  const snapshot = normalizeResumeHistorySnapshot({
    draft: draft(`  ${"A".repeat(140)}  `, {
      skills: Array.from({ length: 80 }, (_, index) => `Skill ${index}`),
      ignored: "not persisted",
    }),
    layout: { template: "unsafe-template", accent: "javascript:alert(1)" },
    requestId: "r".repeat(160),
    sourceGenerationId: "g".repeat(180),
    untrusted: { admin: true },
  }, { now: RECORDED_AT });

  assert.ok(snapshot.name.length <= 120);
  assert.equal(snapshot.name, snapshot.draft.personal.fullName);
  assert.equal(snapshot.draft.skills.length, 40);
  assert.equal(snapshot.draft.ignored, undefined);
  assert.equal(snapshot.layout.template, "modern");
  assert.equal(snapshot.layout.accent, "#0f9f8f");
  assert.equal(snapshot.requestId.length, 100);
  assert.equal(snapshot.sourceGenerationId.length, 120);
  assert.equal(snapshot.untrusted, undefined);
});

test("compact history summaries omit the resume draft", () => {
  const summary = publicResumeHistorySummary({
    _id: new ObjectId(),
    ...normalizeResumeHistorySnapshot({ draft: draft("Avery Sharma") }, { now: RECORDED_AT }),
  });
  assert.equal(summary.name, "Avery Sharma");
  assert.equal(summary.headline, "Software Engineer");
  assert.equal(summary.draft, undefined);
  assert.equal(summary.generatedAt, RECORDED_AT.toISOString());
});

test("history endpoints authenticate, isolate users, retry idempotently, update, and delete", async () => {
  const collection = new MemoryResumeHistoryCollection();
  const generationCollection = {
    documents: [{ _id: "quota-record-1", userId: USER_ONE, requestId: "generation-1" }],
  };
  await withResumeRoutes(collection, async (baseUrl) => {
    const unauthorized = await fetch(`${baseUrl}/api/resume-builder/history`);
    assert.equal(unauthorized.status, 401);

    const ineligible = await fetch(
      `${baseUrl}/api/resume-builder/history`,
      requestOptions(USER_SCHOOL),
    );
    assert.equal(ineligible.status, 403);
    assert.equal((await ineligible.json()).code, "RESUME_NOT_ELIGIBLE");

    const createResponse = await fetch(
      `${baseUrl}/api/resume-builder/history`,
      requestOptions(USER_ONE, "POST", {
        draft: draft("Avery \n Sharma"),
        layout: { template: "classic", accent: "#5b7cfa" },
        requestId: "generation-1",
        sourceGenerationId: "quota-record-1",
      }),
    );
    const created = await createResponse.json();
    assert.equal(createResponse.status, 201);
    assert.equal(created.idempotent, false);
    assert.equal(created.resume.name, "Avery Sharma");
    assert.equal(created.resume.generatedAt, RECORDED_AT.toISOString());

    const retryResponse = await fetch(
      `${baseUrl}/api/resume-builder/history`,
      requestOptions(USER_ONE, "POST", {
        draft: draft("A different retry payload"),
        requestId: "generation-1",
      }),
    );
    const retried = await retryResponse.json();
    assert.equal(retryResponse.status, 200);
    assert.equal(retried.idempotent, true);
    assert.equal(retried.resume.id, created.resume.id);
    assert.equal(retried.resume.name, "Avery Sharma");

    const foreignCreate = await fetch(
      `${baseUrl}/api/resume-builder/history`,
      requestOptions(USER_TWO, "POST", {
        draft: draft("Private User"),
        requestId: "generation-1",
      }),
    );
    const foreign = await foreignCreate.json();
    assert.equal(foreignCreate.status, 201);
    assert.notEqual(foreign.resume.id, created.resume.id);

    const listResponse = await fetch(
      `${baseUrl}/api/resume-builder/history`,
      requestOptions(USER_ONE),
    );
    const list = await listResponse.json();
    assert.equal(listResponse.status, 200);
    assert.equal(list.limit, RESUME_HISTORY_LIMIT);
    assert.equal(list.history.length, 1);
    assert.equal(list.history[0].name, "Avery Sharma");
    assert.equal(list.history[0].draft, undefined);

    const ownResponse = await fetch(
      `${baseUrl}/api/resume-builder/history/${created.resume.id}`,
      requestOptions(USER_ONE),
    );
    const own = await ownResponse.json();
    assert.equal(ownResponse.status, 200);
    assert.equal(own.resume.draft.personal.fullName, "Avery Sharma");
    assert.equal(own.resume.layout.template, "classic");

    const foreignRead = await fetch(
      `${baseUrl}/api/resume-builder/history/${foreign.resume.id}`,
      requestOptions(USER_ONE),
    );
    assert.equal(foreignRead.status, 404);

    const foreignUpdate = await fetch(
      `${baseUrl}/api/resume-builder/history/${foreign.resume.id}`,
      requestOptions(USER_ONE, "PUT", {
        draft: draft("Attempted overwrite"),
      }),
    );
    assert.equal(foreignUpdate.status, 404);

    const invalidRead = await fetch(
      `${baseUrl}/api/resume-builder/history/not-an-id`,
      requestOptions(USER_ONE),
    );
    assert.equal(invalidRead.status, 400);
    assert.equal((await invalidRead.json()).code, "INVALID_RESUME_HISTORY_ID");

    const updateResponse = await fetch(
      `${baseUrl}/api/resume-builder/history/${created.resume.id}`,
      requestOptions(USER_ONE, "PUT", {
        draft: draft("Avery Sharma - Platform Resume"),
        layout: { template: "compact", accent: "#a56ef5" },
        sourceGenerationId: "quota-record-2",
        requestId: "generation-2",
      }),
    );
    const updated = await updateResponse.json();
    assert.equal(updateResponse.status, 200);
    assert.equal(updated.resume.id, created.resume.id);
    assert.equal(updated.resume.name, "Avery Sharma - Platform Resume");
    assert.equal(updated.resume.layout.template, "compact");

    const foreignDelete = await fetch(
      `${baseUrl}/api/resume-builder/history/${foreign.resume.id}`,
      requestOptions(USER_ONE, "DELETE"),
    );
    assert.equal(foreignDelete.status, 404);

    const ownDelete = await fetch(
      `${baseUrl}/api/resume-builder/history/${created.resume.id}`,
      requestOptions(USER_ONE, "DELETE"),
    );
    assert.equal(ownDelete.status, 200);
    assert.deepEqual(await ownDelete.json(), {
      success: true,
      id: created.resume.id,
    });
    assert.equal(collection.documents.some(({ userId }) => userId === USER_TWO), true);
  }, { generationCollection });
  assert.deepEqual(generationCollection.documents, [{ _id: "quota-record-1", userId: USER_ONE, requestId: "generation-1" }]);
});

test("bulk delete and retention pruning affect only the selected user's history", async () => {
  const documents = Array.from({ length: RESUME_HISTORY_LIMIT + 3 }, (_, index) => ({
    _id: new ObjectId(),
    userId: USER_ONE,
    ...normalizeResumeHistorySnapshot({ draft: draft(`Resume ${index}`) }, {
      now: new Date(RECORDED_AT.getTime() + index * 1_000),
    }),
  }));
  documents.push({
    _id: new ObjectId(),
    userId: USER_TWO,
    ...normalizeResumeHistorySnapshot({ draft: draft("Foreign resume") }, { now: RECORDED_AT }),
  });
  const collection = new MemoryResumeHistoryCollection(documents);
  const generationCollection = {
    documents: [{ _id: "quota-record-2", userId: USER_ONE, requestId: "generation-2" }],
  };
  const pruned = await pruneResumeHistory(collection, USER_ONE);
  assert.equal(pruned, 3);
  assert.equal(collection.documents.filter(({ userId }) => userId === USER_ONE).length, RESUME_HISTORY_LIMIT);
  assert.equal(collection.documents.some(({ userId }) => userId === USER_TWO), true);

  await withResumeRoutes(collection, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/resume-builder/history`,
      requestOptions(USER_ONE, "DELETE"),
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      success: true,
      deletedCount: RESUME_HISTORY_LIMIT,
    });
  }, { generationCollection });
  assert.equal(collection.documents.length, 1);
  assert.equal(collection.documents[0].userId, USER_TWO);
  assert.deepEqual(generationCollection.documents, [{ _id: "quota-record-2", userId: USER_ONE, requestId: "generation-2" }]);
});
