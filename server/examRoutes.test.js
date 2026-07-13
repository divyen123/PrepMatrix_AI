import assert from "node:assert/strict";
import test from "node:test";
import registerExamRoutes, {
  acquireExamStartLock,
  generateExamQuestions,
  isGroqJsonGenerationFailure,
  normalizeExamQuestions,
  releaseExamStartLock,
  requestGroqJson,
  summarizeExamStartLimit,
} from "./examRoutes.js";

function questionFixture(label, overrides = {}) {
  return {
    question: label,
    options: ["Option A", "Option B", "Option C", "Option D"],
    answerIndex: 0,
    explanation: `Explanation for ${label}`,
    topic: "Test topic",
    difficulty: "easy",
    ...overrides,
  };
}

test("keeps valid MCQs while skipping malformed and duplicate items", () => {
  const valid = questionFixture("Which option is correct?", {
    options: [
      { text: "One" },
      { text: "Two" },
      { text: "Three" },
      { text: "Four" },
    ],
    answerIndex: undefined,
    correctAnswer: "Two",
  });
  const normalized = normalizeExamQuestions([
    valid,
    { ...valid },
    questionFixture("Malformed options", { options: ["One", "Two"] }),
  ], 10);

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].question, valid.question);
  assert.deepEqual(normalized[0].options, ["One", "Two", "Three", "Four"]);
  assert.equal(normalized[0].answerIndex, 1);
});

test("preserves programming operators and Unicode when validating options", () => {
  const normalized = normalizeExamQuestions([
    questionFixture("How do Java increment and decrement operators differ?", {
      options: ["i++", "++i", "i--", "--i"],
    }),
    questionFixture("தமிழில் சரியான தேர்வைத் தேர்ந்தெடுக்கவும்", {
      options: ["ஆம்", "இல்லை", "முதல்", "இரண்டாம்"],
      answerIndex: 2,
    }),
    questionFixture("Which Java logical operator is shown?", {
      options: ["&&", "||", "&", "|"],
      answerIndex: 1,
    }),
  ], 10);

  assert.equal(normalized.length, 3);
  assert.deepEqual(normalized[0].options, ["i++", "++i", "i--", "--i"]);
  assert.deepEqual(normalized[1].options, ["ஆம்", "இல்லை", "முதல்", "இரண்டாம்"]);
  assert.deepEqual(normalized[2].options, ["&&", "||", "&", "|"]);
});

test("recognizes Groq JSON validation failures without treating unrelated 400s as recoverable", () => {
  assert.equal(isGroqJsonGenerationFailure({
    error: {
      code: "json_validate_failed",
      message: "Failed to generate JSON. Please adjust your prompt.",
      failed_generation: "{invalid",
    },
  }), true);
  assert.equal(isGroqJsonGenerationFailure({
    error: { code: "failed_generation", message: "Legacy JSON generation failure." },
  }), true);
  assert.equal(isGroqJsonGenerationFailure({
    error: { code: "invalid_request_error", message: "The model is unavailable." },
  }), false);
});

test("retries without JSON Object Mode when Groq returns json_validate_failed", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];

  globalThis.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    if (requests.length === 1) {
      return {
        ok: false,
        status: 400,
        headers: { get: () => null },
        json: async () => ({
          error: {
            code: "json_validate_failed",
            message: "Failed to generate JSON. Please adjust your prompt. See 'failed_generation' for more details.",
            failed_generation: "{invalid",
          },
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ choices: [{ message: { content: '{"questions":[]}' } }] }),
    };
  };

  try {
    const result = await requestGroqJson(
      { apiKey: "test-key" },
      "test-model",
      { system: "Return JSON.", prompt: "Create questions.", temperature: 0.4 },
    );

    assert.deepEqual(result, { questions: [] });
    assert.deepEqual(requests[0].response_format, { type: "json_object" });
    assert.equal("response_format" in requests[1], false);
    assert.equal(requests[1].temperature, 0.1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("recovers partial online-exam batches by requesting only missing questions", async () => {
  const originalFetch = globalThis.fetch;
  const callsByBatch = new Map();
  const prompts = [];

  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    const prompt = request.messages.at(-1).content;
    prompts.push(prompt);
    const batch = Number(prompt.match(/Batch: (\d+) of 4/u)?.[1]);
    assert.ok(batch >= 1 && batch <= 4);
    const pass = (callsByBatch.get(batch) || 0) + 1;
    callsByBatch.set(batch, pass);

    const count = pass === 1 ? 6 : 4;
    const offset = pass === 1 ? 0 : 6;
    const questions = Array.from({ length: count }, (_, index) => (
      questionFixture(`Batch ${batch} concept ${offset + index + 1}`)
    ));
    if (pass === 1) {
      questions.push({ ...questions[0] });
      questions.push(questionFixture(`Batch ${batch} malformed`, { options: ["A", "B"] }));
    }

    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ questions }) } }],
      }),
    };
  };

  try {
    const questions = await generateExamQuestions(
      { apiKey: "test-key" },
      "test-model",
      {
        promptLines: ["LEARNER STAGE - HARD CONSTRAINT"],
        subjectName: "Java Programming",
        scopeText: "Functions, arrays, collections, and operators",
      },
    );

    assert.equal(questions.length, 40);
    assert.equal(new Set(questions.map((question) => question.question)).size, 40);
    assert.deepEqual([...callsByBatch.values()], [2, 2, 2, 2]);
    assert.equal(prompts.length, 8);
    assert.equal(prompts.filter((prompt) => /Generate exactly 4 new unique academic MCQs/u.test(prompt)).length, 4);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("applies a rolling two-exam limit and resets exactly 24 hours after the older counted start", () => {
  const now = new Date("2026-07-13T12:00:00.000Z");
  const state = summarizeExamStartLimit([
    { startedAt: new Date("2026-07-13T11:00:00.000Z") },
    { startedAt: new Date("2026-07-12T13:00:00.000Z") },
    { startedAt: new Date("2026-07-12T12:00:00.000Z") },
  ], now);

  assert.equal(state.reached, true);
  assert.equal(state.attemptsUsed, 2);
  assert.equal(state.remaining, 0);
  assert.equal(state.resetAt.toISOString(), "2026-07-13T13:00:00.000Z");
  assert.equal(state.retryAfterSeconds, 60 * 60);

  const boundaryState = summarizeExamStartLimit([
    { startedAt: new Date("2026-07-13T11:00:00.000Z") },
    { startedAt: new Date("2026-07-12T12:00:00.000Z") },
  ], now);
  assert.equal(boundaryState.reached, false);
  assert.equal(boundaryState.attemptsUsed, 1);
  assert.equal(boundaryState.remaining, 1);
  assert.equal(boundaryState.resetAt, null);
});

function createLockDatabase() {
  let document = null;
  const collection = {
    async updateOne(filter, update) {
      const now = filter.$or[0].expiresAt.$lte;
      const available = !document
        || !(document.expiresAt instanceof Date)
        || document.expiresAt.getTime() <= now.getTime();
      if (!available) {
        const error = new Error("duplicate lock");
        error.code = 11000;
        throw error;
      }
      const inserted = !document;
      document = {
        ...(document || { _id: filter._id }),
        ...(inserted ? update.$setOnInsert : {}),
        ...update.$set,
      };
      return {
        matchedCount: inserted ? 0 : 1,
        modifiedCount: inserted ? 0 : 1,
        upsertedCount: inserted ? 1 : 0,
      };
    },
    async deleteOne(filter) {
      if (document?._id !== filter._id || document?.token !== filter.token) return { deletedCount: 0 };
      document = null;
      return { deletedCount: 1 };
    },
  };
  return {
    collection(name) {
      assert.equal(name, "examStartLocks");
      return collection;
    },
    expireCurrentLock() {
      if (document) document.expiresAt = new Date(0);
    },
  };
}

test("serializes exam starts, replaces expired locks, and releases only the owner token", async () => {
  const db = createLockDatabase();
  const first = await acquireExamStartLock(db, "user-1", { timeoutMs: 0 });
  assert.ok(first);
  assert.equal(await acquireExamStartLock(db, "user-1", { timeoutMs: 0 }), null);

  db.expireCurrentLock();
  const replacement = await acquireExamStartLock(db, "user-1", { timeoutMs: 0 });
  assert.ok(replacement);
  assert.notEqual(replacement.token, first.token);

  await releaseExamStartLock(db, first);
  assert.equal(await acquireExamStartLock(db, "user-1", { timeoutMs: 0 }), null);

  await releaseExamStartLock(db, replacement);
  const next = await acquireExamStartLock(db, "user-1", { timeoutMs: 0 });
  assert.ok(next);
  await releaseExamStartLock(db, next);
});

function sameId(left, right) {
  return left?.toString?.() === right?.toString?.();
}

function createAttemptCursor(source, query) {
  let rows = source.filter((attempt) => (
    sameId(attempt.userId, query.userId)
    && (!query.startedAt?.$gt || new Date(attempt.startedAt).getTime() > query.startedAt.$gt.getTime())
  ));
  const cursor = {
    project() {
      return cursor;
    },
    sort(spec) {
      const direction = Number(spec.startedAt || 1);
      rows.sort((left, right) => direction * (new Date(left.startedAt).getTime() - new Date(right.startedAt).getTime()));
      return cursor;
    },
    limit(count) {
      rows = rows.slice(0, count);
      return cursor;
    },
    async toArray() {
      return rows.map((attempt) => ({ ...attempt }));
    },
  };
  return cursor;
}

function createRouteResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    set(name, value) {
      this.headers[name] = String(value);
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function registerRouteHarness(db) {
  const routes = new Map();
  const app = {};
  for (const method of ["get", "post", "put", "delete"]) {
    app[method] = (path, handler) => routes.set(`${method.toUpperCase()} ${path}`, handler);
  }
  registerExamRoutes(app, {
    getDb: async () => db,
    requireAuth: (handler) => handler,
    getGroqConfigStatus: () => ({ available: true, apiKey: "test-key" }),
    groqModel: "test-model",
  });
  return routes;
}

test("status, generation preflight, and start endpoint enforce the same limit contract", async () => {
  const userId = "limited-user";
  const examId = "64b000000000000000000001";
  const now = Date.now();
  const attempts = [
    { userId, examId: "older-exam", status: "submitted", startedAt: new Date(now - 2 * 60 * 60 * 1000) },
    { userId, examId: "newer-exam", status: "in_progress", startedAt: new Date(now - 60 * 60 * 1000) },
  ];
  const lockDb = createLockDatabase();
  let attemptInserts = 0;
  let workspaceReads = 0;
  const db = {
    collection(name) {
      if (name === "examStartLocks") return lockDb.collection(name);
      if (name === "examAttempts") {
        return {
          findOne: async (filter) => attempts.find((attempt) => sameId(attempt.userId, filter.userId) && sameId(attempt.examId, filter.examId)) || null,
          find: (query) => createAttemptCursor(attempts, query),
          insertOne: async () => {
            attemptInserts += 1;
            return { insertedId: `attempt-${attemptInserts}` };
          },
        };
      }
      if (name === "exams") {
        return {
          findOne: async (filter) => ({
            _id: filter._id,
            userId,
            title: "Operating systems - 40 Question Exam",
            subjectName: "Operating systems",
            questionCount: 40,
            durationMinutes: 60,
            difficulty: "medium",
            questions: [],
          }),
          updateOne: async () => ({ modifiedCount: 1 }),
        };
      }
      if (name === "workspaces") {
        return {
          findOne: async () => {
            workspaceReads += 1;
            return { schedule: [{ tasks: [{ task: "Operating systems - Unit 1", time: "Morning" }] }], completed: ["Operating systems - Unit 1"] };
          },
        };
      }
      throw new Error(`Unexpected collection: ${name}`);
    },
  };
  const routes = registerRouteHarness(db);
  const request = { user: { _id: userId }, params: { id: examId }, body: {} };

  const statusResponse = createRouteResponse();
  await routes.get("GET /api/exams/start-limit")(request, statusResponse);
  assert.deepEqual(Object.keys(statusResponse.body), ["limit", "windowHours", "attemptsUsed", "remaining", "reached", "resetAt", "retryAfterSeconds"]);
  assert.equal(statusResponse.body.reached, true);
  assert.equal(statusResponse.body.remaining, 0);

  const generationResponse = createRouteResponse();
  await routes.get("POST /api/exams/generate")(request, generationResponse);
  assert.equal(generationResponse.statusCode, 429);
  assert.equal(generationResponse.body.code, "EXAM_START_LIMIT_REACHED");
  assert.equal(workspaceReads, 0);

  const startResponse = createRouteResponse();
  await routes.get("POST /api/exams/:id/start")(request, startResponse);
  assert.equal(startResponse.statusCode, 429);
  assert.equal(startResponse.body.code, "EXAM_START_LIMIT_REACHED");
  assert.ok(Number(startResponse.headers["Retry-After"]) > 0);
  assert.equal(attemptInserts, 0);
  assert.equal(workspaceReads, 1);
});
