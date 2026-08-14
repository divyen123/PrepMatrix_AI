import test from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { registerLearningNotebookRoutes } from "./learningNotebookRoutes.js";

const NOTEBOOK_ID = new ObjectId("507f1f77bcf86cd799439011");

function attempt(id, score, answeredAt) {
  return { id, kind: "practice", score, confidence: 3, answeredAt };
}

function node(nodeId, attempts, masteryScore) {
  const last = attempts.at(-1);
  return {
    nodeId,
    notebookId: String(NOTEBOOK_ID),
    parentId: "chapter-1",
    nodeType: "topic",
    title: nodeId,
    subjectName: "Mathematics",
    chapterTitle: "Foundations",
    status: masteryScore >= 85 ? "mastered" : "learned",
    masteryScore,
    confidence: 3,
    learnedAt: attempts[0].answeredAt,
    lastStudiedAt: last.answeredAt,
    attempts,
    misconceptions: [],
    review: {
      stage: 1,
      intervalDays: 3,
      lastReviewedAt: last.answeredAt,
      dueAt: "2026-07-10T00:00:00.000Z",
    },
  };
}

function notebookDocument(updatedAt, learningState, memoryDecayState = {}) {
  return {
    _id: NOTEBOOK_ID,
    userId: "user-1",
    title: "Mathematics notebook",
    subjectName: "Mathematics",
    chapterNames: ["Foundations"],
    importantQuestions: [],
    overview: "Concurrent progress test notebook.",
    revisedNotes: [],
    chapters: [{
      id: "chapter-1",
      title: "Foundations",
      topics: [
        { id: "algebra", title: "algebra", subtopics: [] },
        { id: "geometry", title: "geometry", subtopics: [] },
      ],
    }],
    topics: [],
    mindMap: { nodes: [], edges: [] },
    careerPreparation: {},
    medicalTraining: {},
    sources: [],
    learningState,
    memoryDecayState,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt,
  };
}

function response() {
  return {
    body: null,
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test("PATCH retries a revision race and merges both writers' progress", async () => {
  const algebraOld = attempt("algebra-old", 70, "2026-07-05T10:00:00.000Z");
  const geometryOld = attempt("geometry-old", 65, "2026-07-05T10:00:00.000Z");
  const initial = notebookDocument(
    new Date("2026-07-05T10:00:00.000Z"),
    {
      updatedAt: "2026-07-05T10:00:00.000Z",
      nodes: {
        algebra: node("algebra", [algebraOld], 70),
        geometry: node("geometry", [geometryOld], 65),
      },
      sessions: [],
      activeSessionId: "",
    },
  );
  const memoryAttempt = attempt("memory-attempt-server", 95, "2026-07-05T10:02:00.000Z");
  const serverAfterMemoryQuiz = notebookDocument(
    new Date("2026-07-05T10:02:00.000Z"),
    {
      updatedAt: "2026-07-05T10:02:00.000Z",
      nodes: {
        algebra: node("algebra", [algebraOld, memoryAttempt], 95),
        geometry: node("geometry", [geometryOld], 65),
      },
      sessions: [],
      activeSessionId: "",
    },
    {
      version: 1,
      model: "exponential-half-life-v1",
      updatedAt: "2026-07-05T10:02:00.000Z",
      records: {
        algebra: {
          nodeId: "algebra",
          notebookId: String(NOTEBOOK_ID),
          observedAt: "2026-07-05T10:02:00.000Z",
          halfLifeDays: 9,
          targetRecall: 0.75,
          dueAt: "2026-07-09T00:00:00.000Z",
          lastScore: 95,
          lastQuizId: "memory-quiz-server",
          lastQuizCompletedAt: "2026-07-05T10:02:00.000Z",
        },
      },
    },
  );
  const geometryClientAttempt = attempt("geometry-client", 88, "2026-07-05T10:01:00.000Z");
  const staleClientSnapshot = {
    ...initial,
    learningState: {
      updatedAt: "2026-07-05T10:01:00.000Z",
      nodes: {
        algebra: node("algebra", [algebraOld], 70),
        geometry: node("geometry", [geometryOld, geometryClientAttempt], 88),
      },
      sessions: [],
      activeSessionId: "",
    },
  };

  let stored = initial;
  let updateCalls = 0;
  const updateFilters = [];
  const collection = {
    async findOne() {
      return stored;
    },
    async updateOne(filter, update) {
      updateCalls += 1;
      updateFilters.push(filter);
      if (updateCalls === 1) {
        stored = serverAfterMemoryQuiz;
        return { matchedCount: 0, modifiedCount: 0 };
      }
      assert.equal(filter.updatedAt.getTime(), stored.updatedAt.getTime());
      stored = { ...stored, ...update.$set };
      return { matchedCount: 1, modifiedCount: 1 };
    },
  };
  const routes = new Map();
  const app = {};
  ["get", "post", "patch", "delete"].forEach((method) => {
    app[method] = (path, handler) => routes.set(`${method.toUpperCase()} ${path}`, handler);
  });
  registerLearningNotebookRoutes(app, {
    getDb: async () => ({ collection: () => collection }),
    now: () => new Date("2026-07-05T10:03:00.000Z"),
    requireAuth: (handler) => handler,
  });
  const req = {
    body: { notebook: staleClientSnapshot },
    params: { id: String(NOTEBOOK_ID) },
    user: { _id: "user-1" },
  };
  const res = response();

  await routes.get("PATCH /api/learning-notebooks/:id")(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(updateCalls, 2);
  assert.equal(
    updateFilters[0].updatedAt.getTime(),
    initial.updatedAt.getTime(),
  );
  assert.equal(
    res.body.notebook.memoryDecayState.records.algebra.lastQuizId,
    "memory-quiz-server",
  );
  assert.deepEqual(
    res.body.notebook.learningState.nodes.algebra.attempts.map((item) => item.id),
    ["algebra-old", "memory-attempt-server"],
  );
  assert.deepEqual(
    res.body.notebook.learningState.nodes.geometry.attempts.map((item) => item.id),
    ["geometry-old", "geometry-client"],
  );
});

test("PATCH returns a retryable conflict after three revision races", async () => {
  const existing = notebookDocument(
    new Date("2026-07-05T10:00:00.000Z"),
    { updatedAt: "2026-07-05T10:00:00.000Z", nodes: {}, sessions: [] },
  );
  let updates = 0;
  const routes = new Map();
  const app = {};
  ["get", "post", "patch", "delete"].forEach((method) => {
    app[method] = (path, handler) => routes.set(`${method.toUpperCase()} ${path}`, handler);
  });
  registerLearningNotebookRoutes(app, {
    getDb: async () => ({
      collection: () => ({
        findOne: async () => existing,
        updateOne: async () => {
          updates += 1;
          return { matchedCount: 0, modifiedCount: 0 };
        },
      }),
    }),
    now: () => new Date("2026-07-05T10:01:00.000Z"),
    requireAuth: (handler) => handler,
  });
  const res = response();

  await routes.get("PATCH /api/learning-notebooks/:id")({
    body: { notebook: existing },
    params: { id: String(NOTEBOOK_ID) },
    user: { _id: "user-1" },
  }, res);

  assert.equal(updates, 3);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "LEARNING_NOTEBOOK_SAVE_CONFLICT");
});
