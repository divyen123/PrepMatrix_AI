import {
  normalizeLearningState,
  recordLearningAttempt,
} from "./learningMastery.js";
import {
  normalizeLearningMemoryState,
  updateLearningMemoryAfterQuiz,
} from "./learningMemoryDecay.js";

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function cleanText(value, maximum = 800) {
  return String(value ?? "")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, maximum);
}

function cleanId(value, fallback = "") {
  return cleanText(value, 180)
    .replace(/[^a-z0-9:_-]+/giu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 180) || fallback;
}

function normalizedIso(value) {
  const parsed = new Date(value || new Date());
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : "";
}

function stableHash(value) {
  let hash = 2_166_136_261;
  for (const character of String(value ?? "")) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}

function legacyMemoryAttemptId(quizId) {
  return cleanId(`memory-attempt-${quizId}`).slice(0, 140);
}

function memoryAttemptId(quizId) {
  return cleanId(
    `memory-attempt-${stableHash(quizId)}-${quizId}`,
  ).slice(0, 140);
}

function findMemoryQuizAttempt(learningState, nodeId, quizId) {
  const expectedIds = new Set([
    memoryAttemptId(quizId),
    legacyMemoryAttemptId(quizId),
  ]);
  return learningState.nodes[nodeId]?.attempts?.find((attempt) => (
    attempt.kind === "memory-micro-quiz"
    && expectedIds.has(attempt.id)
  )) || null;
}

function scoredResult(value = {}) {
  const result = asObject(value);
  if (result.score != null || result.percentage != null) {
    const score = Number(result.score ?? result.percentage);
    return Number.isFinite(score) ? Math.min(100, Math.max(0, Math.round(score))) : null;
  }
  if (typeof result.correct === "boolean") return result.correct ? 100 : 0;
  if (Number.isFinite(Number(result.correctCount)) && Number.isFinite(Number(result.questionCount))) {
    const questionCount = Math.max(0, Number(result.questionCount));
    if (questionCount > 0) {
      return Math.round((Math.max(0, Number(result.correctCount)) / questionCount) * 100);
    }
  }
  return null;
}

/**
 * Applies one submitted micro-quiz to both persisted learning state projections.
 * Passing the same quizId again is idempotent and returns changed:false.
 */
export function applyPredictiveMemoryQuizResult(
  notebookValue = {},
  resultValue = {},
  options = {},
) {
  const notebook = asObject(notebookValue);
  const result = asObject(resultValue);
  const nodeId = cleanId(result.nodeId ?? result.sourceLearningNodeId);
  const score = scoredResult(result);
  if (!nodeId || score == null) return null;

  const now = normalizedIso(options.now ?? result.completedAt ?? result.reviewedAt);
  const persistedRecord = asObject(
    asObject(
      notebook.memoryDecayState ?? notebook.learningMemoryState,
    ).records,
  )[nodeId];
  const memoryDecayState = normalizeLearningMemoryState(
    notebook.memoryDecayState ?? notebook.learningMemoryState ?? {},
    { notebook, now },
  );
  const currentRecord = memoryDecayState.records[nodeId];
  if (!currentRecord) return null;

  const quizId = cleanId(
    result.quizId ?? result.memoryDecayQuizId,
    `memory-quiz-${stableHash(`${currentRecord.notebookId}:${nodeId}:${now}`)}`,
  );
  const attemptId = memoryAttemptId(quizId);
  const normalizedLearningState = normalizeLearningState(notebook.learningState, {
    notebook,
    now,
  });
  const duplicateAttempt = findMemoryQuizAttempt(
    normalizedLearningState,
    nodeId,
    quizId,
  );
  if (persistedRecord?.lastQuizId === quizId || duplicateAttempt) {
    return {
      notebook,
      learningState: normalizedLearningState,
      memoryDecayState,
      record: currentRecord,
      attempt: duplicateAttempt,
      changed: false,
      duplicate: true,
    };
  }

  const updatedRecord = {
    ...updateLearningMemoryAfterQuiz(currentRecord, {
      ...result,
      score,
      completedAt: now,
    }, { now }),
    lastQuizId: quizId,
    lastQuizCompletedAt: now,
  };
  const learningState = recordLearningAttempt(normalizedLearningState, {
    nodeId,
    attemptId,
    kind: "memory-micro-quiz",
    score,
    confidence: result.confidence,
    durationMinutes: result.durationMinutes ?? 3,
    prompt: cleanText(
      result.promptSummary
        ?? (Array.isArray(result.prompts) ? result.prompts.join(" | ") : result.prompt),
      600,
    ),
    responseSummary: cleanText(result.responseSummary, 800),
    misconceptions: result.misconceptions,
    resolvedMisconceptionIds: result.resolvedMisconceptionIds,
  }, { notebook, now });
  const nextMemoryDecayState = {
    ...memoryDecayState,
    records: {
      ...memoryDecayState.records,
      [nodeId]: updatedRecord,
    },
    updatedAt: now,
  };
  const nextNotebook = {
    ...notebook,
    learningState,
    memoryDecayState: nextMemoryDecayState,
  };

  return {
    notebook: nextNotebook,
    learningState,
    memoryDecayState: nextMemoryDecayState,
    record: updatedRecord,
    attempt: learningState.nodes[nodeId]?.attempts?.find((attempt) => attempt.id === attemptId) ?? null,
    changed: true,
    duplicate: false,
  };
}
