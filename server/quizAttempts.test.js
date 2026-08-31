import assert from "node:assert/strict";
import test from "node:test";
import {
  QUIZ_ATTEMPT_SESSION_INDEX,
  QuizAttemptValidationError,
  buildQuizAttemptDocument,
  normalizeQuizAttemptSubmission,
  publicQuizAttempt,
} from "./quizAttempts.js";

test("normalizes completed quiz submissions and derives answered count", () => {
  const answers = { q1: 2, q2: 0 };
  const normalized = normalizeQuizAttemptSubmission({
    status: "completed",
    sessionId: "quiz-session_123",
    subjectName: "  Physics  ",
    topic: "  Motion  ",
    total: 5,
    score: 7,
    answers,
  });

  assert.deepEqual(normalized, {
    status: "completed",
    sessionId: "quiz-session_123",
    subjectName: "Physics",
    topic: "Motion",
    total: 5,
    score: 5,
    answeredCount: 2,
    questions: [],
    answers,
  });
});

test("builds an aborted history record with an abort timestamp", () => {
  const endedAt = new Date("2026-08-31T14:00:00.000Z");
  const document = buildQuizAttemptDocument({
    userId: "user-1",
    academicProfileId: "profile-1",
    academicProfileSnapshot: { classLevel: "10" },
    body: {
      status: "aborted",
      sessionId: "session-aborted",
      total: 10,
      score: 2,
      answeredCount: 3,
      answers: { q1: 1, q2: 0, q3: 2 },
    },
    now: endedAt,
  });

  assert.equal(document.status, "aborted");
  assert.equal(document.answeredCount, 3);
  assert.equal(document.sessionId, "session-aborted");
  assert.equal(document.abortedAt, endedAt);
  assert.equal(document.endedAt, endedAt);
  assert.equal(document.completedAt, undefined);
});

test("legacy history records are exposed as completed attempts", () => {
  const legacy = publicQuizAttempt({
    _id: { toString: () => "legacy-id" },
    userId: "private-user-id",
    total: 5,
    score: 3,
    answers: { q1: 0, q2: 1 },
  });

  assert.equal(legacy.id, "legacy-id");
  assert.equal(legacy.status, "completed");
  assert.equal(legacy.answeredCount, 2);
  assert.equal("userId" in legacy, false);
});

test("rejects unsafe quiz session identifiers", () => {
  assert.throws(
    () => normalizeQuizAttemptSubmission({ sessionId: "bad session/id" }),
    (error) => error instanceof QuizAttemptValidationError
      && error.code === "QUIZ_SESSION_ID_INVALID"
      && error.status === 400,
  );
});

test("declares a profile-scoped partial unique session index", () => {
  assert.deepEqual(QUIZ_ATTEMPT_SESSION_INDEX.key, {
    userId: 1,
    academicProfileId: 1,
    sessionId: 1,
  });
  assert.equal(QUIZ_ATTEMPT_SESSION_INDEX.options.unique, true);
  assert.deepEqual(QUIZ_ATTEMPT_SESSION_INDEX.options.partialFilterExpression, {
    sessionId: { $type: "string" },
  });
});
