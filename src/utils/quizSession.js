import { academicProfileStorageKey } from "./academicProfileScope.js";

export const QUIZ_SESSION_VERSION = 1;
export const QUIZ_SESSION_STATUSES = Object.freeze({
  ACTIVE: "active",
  PAUSED: "paused",
});

const VALID_STATUSES = new Set(Object.values(QUIZ_SESSION_STATUSES));

function cleanText(value, maximum = 240) {
  return String(value ?? "").trim().slice(0, maximum);
}

function normalizeQuestion(value, index) {
  const id = cleanText(value?.id, 160) || `quiz-question-${index + 1}`;
  const question = cleanText(value?.question, 2_000);
  const options = Array.isArray(value?.options)
    ? value.options.map((option) => cleanText(option, 1_000))
    : [];
  const answerIndex = Number(value?.answerIndex);

  if (
    !question
    || options.length < 2
    || options.some((option) => !option)
    || !Number.isInteger(answerIndex)
    || answerIndex < 0
    || answerIndex >= options.length
  ) {
    return null;
  }

  return {
    id,
    question,
    options,
    answerIndex,
    explanation: cleanText(value?.explanation, 4_000),
  };
}

function normalizeQuestions(value) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 50)
    .map(normalizeQuestion)
    .filter(Boolean);
}

function normalizeAnswers(value, questions) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const questionMap = new Map(questions.map((question) => [question.id, question]));

  return Object.entries(value).reduce((answers, [rawQuestionId, rawOptionIndex]) => {
    const questionId = cleanText(rawQuestionId, 160);
    const optionIndex = Number(rawOptionIndex);
    const question = questionMap.get(questionId);
    if (
      question
      && Number.isInteger(optionIndex)
      && optionIndex >= 0
      && optionIndex < question.options.length
    ) {
      answers[questionId] = optionIndex;
    }
    return answers;
  }, {});
}

function normalizeTimestamp(value, fallback = null) {
  const timestamp = new Date(value || 0).getTime();
  return Number.isFinite(timestamp) && timestamp > 0
    ? new Date(timestamp).toISOString()
    : fallback;
}

export function createQuizSessionId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `quiz-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function getQuizSessionStorageKey(academicProfileId = "") {
  return academicProfileStorageKey(academicProfileId, "quiz-session");
}

export function normalizeQuizSession(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const questions = normalizeQuestions(value.questions);
  const status = VALID_STATUSES.has(value.status)
    ? value.status
    : QUIZ_SESSION_STATUSES.PAUSED;
  const sessionId = cleanText(value.sessionId, 160);
  const topic = cleanText(value.topic, 240);
  const subjectName = cleanText(value.subjectName, 160) || "General study";

  if (
    Number(value.version) !== QUIZ_SESSION_VERSION
    || !sessionId
    || !topic
    || questions.length === 0
  ) {
    return null;
  }

  const createdAt = normalizeTimestamp(value.createdAt, new Date().toISOString());
  return {
    version: QUIZ_SESSION_VERSION,
    sessionId,
    status,
    subjectName,
    topic,
    questionLimit: questions.length,
    questions,
    answers: normalizeAnswers(value.answers, questions),
    quizMeta: value.quizMeta && typeof value.quizMeta === "object" && !Array.isArray(value.quizMeta)
      ? {
        model: cleanText(value.quizMeta.model, 160),
        limit: Math.max(1, Math.min(50, Number(value.quizMeta.limit) || questions.length)),
        subjectName: cleanText(value.quizMeta.subjectName, 160) || subjectName,
        topic: cleanText(value.quizMeta.topic, 240) || topic,
      }
      : null,
    createdAt,
    updatedAt: normalizeTimestamp(value.updatedAt, createdAt),
  };
}

export function createQuizSession({
  answers = {},
  questions = [],
  quizMeta = null,
  sessionId = createQuizSessionId(),
  status = QUIZ_SESSION_STATUSES.ACTIVE,
  subjectName = "General study",
  topic = "",
} = {}) {
  const now = new Date().toISOString();
  return normalizeQuizSession({
    version: QUIZ_SESSION_VERSION,
    sessionId,
    status,
    subjectName,
    topic,
    questionLimit: questions.length,
    questions,
    answers,
    quizMeta,
    createdAt: now,
    updatedAt: now,
  });
}

export function readQuizSession(storage, academicProfileId = "") {
  const key = getQuizSessionStorageKey(academicProfileId);
  if (!key || !storage) return null;
  try {
    const parsed = JSON.parse(storage.getItem(key) || "null");
    const normalized = normalizeQuizSession(parsed);
    if (!normalized && parsed) storage.removeItem(key);
    return normalized;
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      // Ignore inaccessible browser storage.
    }
    return null;
  }
}

export function writeQuizSession(storage, academicProfileId = "", session) {
  const key = getQuizSessionStorageKey(academicProfileId);
  const normalized = normalizeQuizSession({
    ...(session || {}),
    updatedAt: new Date().toISOString(),
  });
  if (!key || !storage || !normalized) return null;
  try {
    storage.setItem(key, JSON.stringify(normalized));
    return normalized;
  } catch {
    return null;
  }
}

export function clearQuizSession(storage, academicProfileId = "") {
  const key = getQuizSessionStorageKey(academicProfileId);
  if (!key || !storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // Ignore inaccessible browser storage.
  }
}

export function quizSessionAnsweredCount(session) {
  return Object.keys(session?.answers || {}).length;
}

