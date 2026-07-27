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

const TEST_IDEMPOTENCY_KEY = "a808bba7-f91a-4b0e-8478-6b6231dad21b";
const TEST_QUOTA = Object.freeze({
  limit: 100,
  used: 0,
  reserved: 15,
  remaining: 85,
  periodStart: "2026-07-01T00:00:00.000Z",
  resetAt: "2026-08-01T00:00:00.000Z",
  costs: {
    secure_exam: 15,
    question_paper: 15,
  },
});

function createTestAiQuota({
  lookup: lookupOverride,
  reserve: reserveOverride,
  commit: commitOverride,
  refund: refundOverride,
} = {}) {
  const calls = {
    lookup: [],
    reserve: [],
    commit: [],
    refund: [],
  };
  return {
    calls,
    async lookup(input) {
      calls.lookup.push(input);
      if (lookupOverride) return lookupOverride(input);
      return {
        state: "none",
        cost: TEST_QUOTA.costs[input.feature],
        quota: TEST_QUOTA,
      };
    },
    async reserve(input) {
      calls.reserve.push(input);
      if (reserveOverride) return reserveOverride(input);
      return {
        state: "reserved",
        eventId: `event-${calls.reserve.length}`,
        reservationToken: `reservation-${calls.reserve.length}`,
        cost: TEST_QUOTA.costs[input.feature],
        quota: TEST_QUOTA,
      };
    },
    async commit(input) {
      calls.commit.push(input);
      if (commitOverride) return commitOverride(input);
      return { quota: { ...TEST_QUOTA, used: 15, reserved: 0 } };
    },
    async refund(input) {
      calls.refund.push(input);
      if (refundOverride) return refundOverride(input);
      return {
        refunded: true,
        status: "refunded",
        quota: { ...TEST_QUOTA, reserved: 0, remaining: 100 },
      };
    },
    responseHeaders(quota, cost) {
      return {
        "X-AI-Credit-Limit": String(quota.limit),
        "X-AI-Credit-Remaining": String(quota.remaining),
        "X-AI-Credit-Reset-At": quota.resetAt,
        "X-AI-Credit-Cost": String(cost),
      };
    },
  };
}

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

function registerRouteHarness(db, { aiQuota } = {}) {
  const routes = new Map();
  const app = {};
  for (const method of ["get", "post", "put", "delete"]) {
    app[method] = (path, handler) => routes.set(`${method.toUpperCase()} ${path}`, handler);
  }
  registerExamRoutes(app, {
    aiQuota,
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
  const routes = registerRouteHarness(db, { aiQuota: createTestAiQuota() });
  const request = {
    user: { _id: userId },
    params: { id: examId },
    body: { subjectName: "Operating systems" },
    headers: { "idempotency-key": TEST_IDEMPOTENCY_KEY },
  };

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

function createAiGenerationDb({
  examDeleteError,
  examDeleteResult,
  examInsertError,
  paperDeleteError,
  paperDeleteResult,
  paperInsertError,
} = {}) {
  const stored = {
    exams: [],
    papers: [],
  };
  const deletes = {
    exams: [],
    papers: [],
  };
  const deleteStored = (documents, filter, configuredResult) => {
    if (configuredResult) return configuredResult;
    const index = documents.findIndex((document) => (
      sameId(document._id, filter._id)
      && sameId(document.userId, filter.userId)
    ));
    if (index < 0) return { deletedCount: 0 };
    documents.splice(index, 1);
    return { deletedCount: 1 };
  };
  const workspace = {
    schedule: [{ tasks: [{ task: "Operating Systems - Processes", time: "Morning" }] }],
    completed: ["Operating Systems - Processes"],
    subjects: [{ name: "Operating Systems", chapters: 5, difficulty: "medium" }],
  };
  const db = {
    collection(name) {
      if (name === "examAttempts") {
        return {
          find: (query) => createAttemptCursor([], query),
        };
      }
      if (name === "workspaces") {
        return { findOne: async () => workspace };
      }
      if (name === "exams") {
        return {
          insertOne: async (document) => {
            if (examInsertError) throw examInsertError;
            stored.exams.push(document);
            return { insertedId: "64b000000000000000000010" };
          },
          deleteOne: async (filter) => {
            deletes.exams.push(filter);
            if (examDeleteError) throw examDeleteError;
            return deleteStored(stored.exams, filter, examDeleteResult);
          },
        };
      }
      if (name === "questionPapers") {
        return {
          insertOne: async (document) => {
            if (paperInsertError) throw paperInsertError;
            stored.papers.push(document);
            return { insertedId: "64b000000000000000000020" };
          },
          deleteOne: async (filter) => {
            deletes.papers.push(filter);
            if (paperDeleteError) throw paperDeleteError;
            return deleteStored(stored.papers, filter, paperDeleteResult);
          },
          findOne: async () => null,
        };
      }
      throw new Error(`Unexpected collection: ${name}`);
    },
  };
  return { db, deletes, stored };
}

function groqJsonResponse(payload, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => (
      status >= 200 && status < 300
        ? { choices: [{ message: { content: JSON.stringify(payload) } }] }
        : payload
    ),
  };
}

function secureExamRequest() {
  return {
    body: {
      subjectName: "Operating Systems",
      difficulty: "medium",
      scopeText: "Processes and scheduling",
    },
    headers: { "idempotency-key": TEST_IDEMPOTENCY_KEY },
    user: {
      _id: "user-1",
      academicLevel: "Undergraduate / Bachelor's",
      degree: "B.Tech",
      department: "IT",
    },
  };
}

function questionPaperRequest() {
  return {
    body: {
      totalMarks: 30,
      markDistribution: [{ marks: 15, count: 2 }],
      subjectNames: ["Operating Systems"],
      difficulty: "balanced",
    },
    headers: { "idempotency-key": TEST_IDEMPOTENCY_KEY },
    user: {
      _id: "user-1",
      academicLevel: "Undergraduate / Bachelor's",
      degree: "B.Tech",
      department: "IT",
      institutionName: "Test University",
    },
  };
}

test("replays a completed secure exam before mutable preflight checks", async () => {
  let dbAccesses = 0;
  const replayPayload = {
    exam: {
      id: "64b000000000000000000010",
      title: "Replayed secure exam",
    },
  };
  const aiQuota = createTestAiQuota({
    lookup: async () => ({
      state: "replay",
      eventId: "completed-event",
      cost: 15,
      quota: { ...TEST_QUOTA, used: 15, reserved: 0 },
      replayPayload,
    }),
  });
  const db = {
    collection() {
      dbAccesses += 1;
      throw new Error("Replay should not access mutable exam state.");
    },
  };
  const routes = registerRouteHarness(db, { aiQuota });
  const res = createRouteResponse();

  await routes.get("POST /api/exams/generate")(secureExamRequest(), res);

  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.body, replayPayload);
  assert.equal(dbAccesses, 0);
  assert.equal(aiQuota.calls.lookup.length, 1);
  assert.equal(aiQuota.calls.reserve.length, 0);
  assert.equal(aiQuota.calls.commit.length, 0);
});

test("rejects an exhausted secure-exam quota before any provider request", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  const exhaustedQuota = {
    ...TEST_QUOTA,
    reserved: 0,
    remaining: 0,
    used: 100,
  };
  const aiQuota = createTestAiQuota({
    reserve: async () => {
      const error = new Error("You have used all AI credits for this month.");
      error.status = 429;
      error.code = "AI_USER_QUOTA_EXHAUSTED";
      error.details = { quota: exhaustedQuota, cost: 15 };
      throw error;
    },
  });
  const { db } = createAiGenerationDb();
  const routes = registerRouteHarness(db, { aiQuota });
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return groqJsonResponse({ questions: [] });
  };

  try {
    const res = createRouteResponse();
    await routes.get("POST /api/exams/generate")(secureExamRequest(), res);

    assert.equal(res.statusCode, 429);
    assert.equal(res.body.code, "AI_USER_QUOTA_EXHAUSTED");
    assert.equal(fetchCalls, 0);
    assert.equal(aiQuota.calls.reserve.length, 1);
    assert.equal(aiQuota.calls.reserve[0].feature, "secure_exam");
    assert.equal(aiQuota.calls.commit.length, 0);
    assert.equal(aiQuota.calls.refund.length, 0);
    assert.equal(res.headers["X-AI-Credit-Remaining"], "0");
    assert.equal(res.headers["X-AI-Credit-Cost"], "15");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("commits one secure-exam debit after all question batches persist", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  const aiQuota = createTestAiQuota();
  const { db, stored } = createAiGenerationDb();
  const routes = registerRouteHarness(db, { aiQuota });
  globalThis.fetch = async (_url, options) => {
    fetchCalls += 1;
    const prompt = JSON.parse(options.body).messages.at(-1).content;
    const batch = Number(prompt.match(/Batch: (\d+) of 4/u)?.[1]);
    return groqJsonResponse({
      questions: Array.from({ length: 10 }, (_, index) =>
        questionFixture(`Batch ${batch} quota concept ${index + 1}`)),
    });
  };

  try {
    const res = createRouteResponse();
    await routes.get("POST /api/exams/generate")(secureExamRequest(), res);

    assert.equal(res.statusCode, 201);
    assert.equal(fetchCalls, 4);
    assert.equal(stored.exams.length, 1);
    assert.equal(aiQuota.calls.reserve.length, 1);
    assert.deepEqual(aiQuota.calls.reserve[0], {
      userId: "user-1",
      feature: "secure_exam",
      requestId: TEST_IDEMPOTENCY_KEY,
    });
    assert.equal(aiQuota.calls.commit.length, 1);
    assert.equal(aiQuota.calls.refund.length, 0);
    assert.equal(res.headers["X-AI-Credit-Cost"], "15");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rolls back a persisted secure exam and refunds when quota commit fails", async () => {
  const originalFetch = globalThis.fetch;
  const aiQuota = createTestAiQuota({
    commit: async () => {
      const error = new Error("AI credit storage unavailable.");
      error.status = 503;
      error.code = "AI_QUOTA_UNAVAILABLE";
      throw error;
    },
  });
  const { db, deletes, stored } = createAiGenerationDb();
  const routes = registerRouteHarness(db, { aiQuota });
  globalThis.fetch = async (_url, options) => {
    const prompt = JSON.parse(options.body).messages.at(-1).content;
    const batch = Number(prompt.match(/Batch: (\d+) of 4/u)?.[1]);
    return groqJsonResponse({
      questions: Array.from({ length: 10 }, (_, index) =>
        questionFixture("Rollback batch " + batch + " concept " + (index + 1))),
    });
  };

  try {
    const res = createRouteResponse();
    await routes.get("POST /api/exams/generate")(secureExamRequest(), res);

    assert.equal(res.statusCode, 503);
    assert.equal(res.body.code, "AI_QUOTA_UNAVAILABLE");
    assert.equal(res.body.creditsRefunded, true);
    assert.equal(stored.exams.length, 0);
    assert.equal(deletes.exams.length, 1);
    assert.equal(aiQuota.calls.commit.length, 1);
    assert.equal(aiQuota.calls.commit[0].reservationToken, "reservation-1");
    assert.equal(aiQuota.calls.refund.length, 1);
    assert.equal(aiQuota.calls.refund[0].reservationToken, "reservation-1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("keeps question-paper variation retries within one quota debit", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  const aiQuota = createTestAiQuota();
  const { db, stored } = createAiGenerationDb();
  const routes = registerRouteHarness(db, { aiQuota });
  globalThis.fetch = async () => {
    fetchCalls += 1;
    if (fetchCalls === 1) return groqJsonResponse({ questions: [] });
    return groqJsonResponse({
      questions: [
        { question: "Explain process scheduling with an example.", modelAnswer: "Use a ready queue.", markingScheme: "Award for a correct explanation." },
        { question: "Compare preemptive and cooperative scheduling.", modelAnswer: "Preemptive scheduling can interrupt.", markingScheme: "Award for a valid comparison." },
      ],
    });
  };

  try {
    const res = createRouteResponse();
    await routes.get("POST /api/question-papers/generate")(questionPaperRequest(), res);

    assert.equal(res.statusCode, 201);
    assert.equal(fetchCalls, 2);
    assert.equal(stored.papers.length, 1);
    assert.equal(aiQuota.calls.reserve.length, 1);
    assert.equal(aiQuota.calls.reserve[0].feature, "question_paper");
    assert.equal(aiQuota.calls.commit.length, 1);
    assert.equal(aiQuota.calls.refund.length, 0);
    assert.equal(res.headers["X-AI-Credit-Cost"], "15");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("refunds a question-paper reservation when persistence fails", async () => {
  const originalFetch = globalThis.fetch;
  const aiQuota = createTestAiQuota();
  const { db } = createAiGenerationDb({
    paperInsertError: new Error("database unavailable"),
  });
  const routes = registerRouteHarness(db, { aiQuota });
  globalThis.fetch = async () => groqJsonResponse({
    questions: [
      { question: "Explain process scheduling with an example.", modelAnswer: "Use a ready queue.", markingScheme: "Award for a correct explanation." },
      { question: "Compare preemptive and cooperative scheduling.", modelAnswer: "Preemptive scheduling can interrupt.", markingScheme: "Award for a valid comparison." },
    ],
  });

  try {
    const res = createRouteResponse();
    await routes.get("POST /api/question-papers/generate")(questionPaperRequest(), res);

    assert.equal(res.statusCode, 500);
    assert.equal(res.body.creditsRefunded, true);
    assert.match(res.body.error, /credits were refunded/iu);
    assert.equal(aiQuota.calls.reserve.length, 1);
    assert.equal(aiQuota.calls.commit.length, 0);
    assert.equal(aiQuota.calls.refund.length, 1);
    assert.equal(res.headers["X-AI-Credit-Remaining"], "100");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
