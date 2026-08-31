export const QUIZ_ATTEMPT_STATUSES = Object.freeze({
  COMPLETED: "completed",
  ABORTED: "aborted",
});

const QUIZ_ATTEMPT_STATUS_SET = new Set(Object.values(QUIZ_ATTEMPT_STATUSES));
const QUIZ_SESSION_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,159}$/i;

export const QUIZ_ATTEMPT_SESSION_INDEX = Object.freeze({
  key: Object.freeze({ userId: 1, academicProfileId: 1, sessionId: 1 }),
  options: Object.freeze({
    unique: true,
    name: "quiz_attempt_session_id_unique",
    partialFilterExpression: Object.freeze({ sessionId: Object.freeze({ $type: "string" }) }),
  }),
});

export class QuizAttemptValidationError extends Error {
  constructor(message, { code = "QUIZ_ATTEMPT_INVALID", status = 400 } = {}) {
    super(message);
    this.name = "QuizAttemptValidationError";
    this.code = code;
    this.status = status;
  }
}

function finiteNonNegativeInteger(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.round(numeric));
}

function cleanText(value, fallback, maximum) {
  const cleaned = String(value ?? "").trim().slice(0, maximum);
  return cleaned || fallback;
}

function normalizeSessionId(value) {
  if (value == null || value === "") return null;
  const sessionId = String(value).trim();
  if (!QUIZ_SESSION_ID_PATTERN.test(sessionId)) {
    throw new QuizAttemptValidationError("The quiz session identifier is invalid.", {
      code: "QUIZ_SESSION_ID_INVALID",
    });
  }
  return sessionId;
}

export function normalizeQuizAttemptStatus(value) {
  return QUIZ_ATTEMPT_STATUS_SET.has(value)
    ? value
    : QUIZ_ATTEMPT_STATUSES.COMPLETED;
}

export function normalizeQuizAttemptSubmission(value) {
  const payload = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const questions = Array.isArray(payload.questions) ? payload.questions : [];
  const answers = payload.answers && typeof payload.answers === "object" && !Array.isArray(payload.answers)
    ? payload.answers
    : {};
  const total = finiteNonNegativeInteger(payload.total);
  const score = Math.min(total, finiteNonNegativeInteger(payload.score));
  const answeredCount = Math.min(
    total,
    finiteNonNegativeInteger(payload.answeredCount, Object.keys(answers).length),
  );

  return {
    status: normalizeQuizAttemptStatus(payload.status),
    sessionId: normalizeSessionId(payload.sessionId),
    subjectName: cleanText(payload.subjectName, "General study", 160),
    topic: cleanText(payload.topic, "General revision", 240),
    total,
    score,
    answeredCount,
    questions,
    answers,
  };
}

export function buildQuizAttemptDocument({
  userId,
  academicProfileId,
  academicProfileSnapshot = {},
  body,
  now = new Date(),
}) {
  const submission = normalizeQuizAttemptSubmission(body);
  const endedAt = now instanceof Date ? now : new Date(now);
  const statusTimestamp = submission.status === QUIZ_ATTEMPT_STATUSES.ABORTED
    ? { abortedAt: endedAt }
    : { completedAt: endedAt };

  return {
    userId,
    academicProfileId,
    ...academicProfileSnapshot,
    academicProfileSnapshot,
    ...(submission.sessionId ? { sessionId: submission.sessionId } : {}),
    status: submission.status,
    subjectName: submission.subjectName,
    topic: submission.topic,
    total: submission.total,
    score: submission.score,
    answeredCount: submission.answeredCount,
    questions: submission.questions,
    answers: submission.answers,
    endedAt,
    ...statusTimestamp,
    createdAt: endedAt,
  };
}

export function publicQuizAttempt(document) {
  if (!document || typeof document !== "object") return null;
  const { _id, userId: _userId, ...attempt } = document;
  const total = finiteNonNegativeInteger(attempt.total);
  const answers = attempt.answers && typeof attempt.answers === "object" && !Array.isArray(attempt.answers)
    ? attempt.answers
    : {};

  return {
    id: _id?.toString?.() || String(_id || ""),
    ...attempt,
    status: normalizeQuizAttemptStatus(attempt.status),
    answeredCount: Math.min(
      total,
      finiteNonNegativeInteger(attempt.answeredCount, Object.keys(answers).length),
    ),
  };
}
