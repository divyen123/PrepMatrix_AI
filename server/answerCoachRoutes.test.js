import assert from "node:assert/strict";
import test from "node:test";
import { ObjectId } from "mongodb";
import registerAnswerCoachRoutes, {
  normalizeAnswerCoachGrade,
  normalizeAnswerCoachTranscription,
} from "./answerCoachRoutes.js";

const paper = {
  _id: new ObjectId(),
  paperTitle: "Algebra paper",
  subjectNames: ["Maths"],
  questions: [
    { id: "q1", question: "Solve x + 2 = 5", topic: "Equations", marks: 5 },
    { id: "q2", question: "Factor x² - 4", topic: "Factoring", marks: 3 },
  ],
};

test("only clearly transcribed, numbered answers can receive marks", () => {
  const transcription = normalizeAnswerCoachTranscription({
    answers: [
      { questionNumber: 1, observedAnswer: "x = 3" },
      { questionNumber: 2, observedAnswer: "" },
      { questionNumber: 999, observedAnswer: "invented" },
      { questionNumber: 1, observedAnswer: "conflicting duplicate" },
    ],
    unreadableQuestionNumbers: [1, 2],
  }, 2);
  const analysis = normalizeAnswerCoachGrade({
    questions: [
      { questionNumber: 1, awardedMarks: 3, steps: [{ observation: "Correct method", marksAwarded: 3, marksPossible: 5 }] },
      { questionNumber: 2, awardedMarks: 3 },
    ],
  }, paper, transcription);

  assert.deepEqual(transcription.answers, [{ questionNumber: 1, observedAnswer: "x = 3" }]);
  assert.equal(analysis.questions.length, 1);
  assert.equal(analysis.totalAwarded, 3);
  assert.equal(analysis.totalPossible, 5);
  assert.deepEqual(analysis.unreadableQuestionNumbers, [2]);
});

test("clamps provisional and step marks to the paper rubric", () => {
  const transcription = { answers: [{ questionNumber: 1, observedAnswer: "x = 3" }], unreadableQuestionNumbers: [] };
  const analysis = normalizeAnswerCoachGrade({ questions: [{
    questionNumber: 1,
    awardedMarks: 99,
    steps: [
      { observation: "First step", marksAwarded: 4, marksPossible: 4 },
      { observation: "Second step", marksAwarded: 4, marksPossible: 4 },
    ],
  }] }, paper, transcription);

  assert.equal(analysis.questions[0].awardedMarks, 5);
  assert.deepEqual(analysis.questions[0].steps.map((step) => step.marksPossible), [4, 1]);
  assert.deepEqual(analysis.questions[0].steps.map((step) => step.marksAwarded), [4, 1]);
});

test("omitted grading scores leave a transcribed answer ungraded", () => {
  const transcription = { answers: [{ questionNumber: 1, observedAnswer: "x = 3" }], unreadableQuestionNumbers: [] };
  const analysis = normalizeAnswerCoachGrade({ questions: [{ questionNumber: 1, feedback: "No score supplied" }] }, paper, transcription);

  assert.equal(analysis.totalPossible, 0);
  assert.equal(analysis.totalAwarded, 0);
  assert.deepEqual(analysis.unreadableQuestionNumbers, [1]);
});

test("saved answer reviews are scoped to the active academic profile", async () => {
  const reportId = new ObjectId();
  const routes = new Map();
  const app = {
    get: (path, handler) => routes.set(`GET ${path}`, handler),
    post: (path, handler) => routes.set(`POST ${path}`, handler),
    patch: (path, handler) => routes.set(`PATCH ${path}`, handler),
  };
  let seenFilter;
  const db = {
    collection(name) {
      assert.equal(name, "answerCoachReports");
      return {
        async findOne(filter) { seenFilter = filter; return null; },
      };
    },
  };
  registerAnswerCoachRoutes(app, {
    aiQuota: {}, getDb: async () => db, requireAuth: (handler) => handler,
    getGroqConfigStatus: () => ({ available: false }),
  });
  const req = {
    params: { id: String(reportId) },
    academicProfileId: "profile-b",
    user: { _id: "user-1", academicLevel: "College" },
  };
  const res = {
    statusCode: 200,
    set() { return this; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.payload = value; return this; },
  };

  await routes.get("GET /api/answer-coach/reports/:id")(req, res);

  assert.equal(res.statusCode, 404);
  assert.equal(seenFilter.userId, "user-1");
  assert.equal(seenFilter.academicProfileId, "profile-b");
  assert.equal(String(seenFilter._id), String(reportId));
});

test("analyzes a numbered photo, saves text only, and commits one credit reservation", async () => {
  const routes = new Map();
  const app = {
    get: (path, handler) => routes.set(`GET ${path}`, handler),
    post: (path, handler) => routes.set(`POST ${path}`, handler),
    patch: (path, handler) => routes.set(`PATCH ${path}`, handler),
  };
  const saved = [];
  const db = {
    collection(name) {
      if (name === "questionPapers") return {
        async findOne(filter) {
          return filter.userId === "student-1" && filter.academicProfileId === "profile-a"
            && String(filter._id) === String(paper._id) ? paper : null;
        },
      };
      if (name === "answerCoachReports") return {
        async insertOne(document) { saved.push(document); return { insertedId: new ObjectId() }; },
        async deleteOne() { throw new Error("A successful review should not be removed."); },
      };
      throw new Error(`Unexpected collection ${name}`);
    },
  };
  const quotaCalls = [];
  const aiQuota = {
    async lookup() { quotaCalls.push("lookup"); return { state: "new", cost: 8, quota: {} }; },
    async reserve() { quotaCalls.push("reserve"); return { state: "reserved", cost: 8, quota: {}, eventId: "event", reservationToken: "token" }; },
    async commit() { quotaCalls.push("commit"); return { quota: {} }; },
    async refund() { quotaCalls.push("refund"); return { refunded: true, quota: {} }; },
    responseHeaders() { return {}; },
  };
  let providerCall = 0;
  let noReadableAnswers = false;
  const fetchImpl = async (_url, options) => {
    providerCall += 1;
    const request = JSON.parse(options.body);
    const isVision = Array.isArray(request.messages[1].content);
    assert.equal(request.model, isVision ? "vision-model" : "text-model");
    const content = isVision
      ? JSON.stringify({ answers: noReadableAnswers ? [] : [{ questionNumber: 1, observedAnswer: "x = 3" }] })
      : JSON.stringify({ questions: [{
          questionNumber: 1,
          awardedMarks: 4,
          steps: [{ observation: "Correct equation", marksAwarded: 4, marksPossible: 5 }],
          feedback: "Check the final statement.",
          errorType: "incomplete",
        }] });
    return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) };
  };
  registerAnswerCoachRoutes(app, {
    aiQuota,
    getDb: async () => db,
    requireAuth: (handler) => handler,
    getGroqConfigStatus: () => ({ available: true, apiKey: "test-key" }),
    textModel: "text-model",
    visionModel: "vision-model",
    fetchImpl,
    withProfileWriteFence: (_db, _req, action) => action(),
  });
  const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl5fvwAAAAASUVORK5CYII=";
  const req = {
    user: { _id: "student-1", academicLevel: "College" },
    academicProfileId: "profile-a",
    body: { paperId: String(paper._id), attachments: [{ name: "answers.png", type: "image/png", dataUrl: image }] },
    get: () => "a1e84b89-3a77-4b82-9572-313dd5891737",
  };
  const res = {
    statusCode: 200,
    set() { return this; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.payload = value; return this; },
  };

  await routes.get("POST /api/answer-coach/analyze")(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(providerCall, 2);
  assert.deepEqual(quotaCalls, ["lookup", "reserve", "commit"]);
  assert.equal(res.payload.analysis.totalAwarded, 4);
  assert.equal(saved.length, 1);
  assert.doesNotMatch(JSON.stringify(saved[0]), /data:image|iVBORw0KGgo/u);

  noReadableAnswers = true;
  const retryRes = { ...res, statusCode: 200, payload: null };
  await routes.get("POST /api/answer-coach/analyze")(req, retryRes);
  assert.equal(retryRes.statusCode, 422);
  assert.equal(retryRes.payload.creditsRefunded, true);
  assert.deepEqual(quotaCalls.slice(-3), ["lookup", "reserve", "refund"]);
  assert.equal(saved.length, 1);
});
