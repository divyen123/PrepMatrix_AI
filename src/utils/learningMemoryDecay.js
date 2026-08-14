import {
  getScheduleDateKey,
  toLocalDateKey,
} from "./scheduleDates.js";
import { normalizeLearningState } from "./learningMastery.js";

export const LEARNING_MEMORY_DECAY_VERSION = 1;
export const LEARNING_MEMORY_DECAY_MODEL = "exponential-half-life-v1";
export const DEFAULT_MEMORY_TARGET_RECALL = 0.75;
export const DEFAULT_MEMORY_MAX_DAILY_QUIZZES = 3;
export const DEFAULT_MEMORY_QUIZ_QUESTION_COUNT = 3;
export const DEFAULT_MEMORY_QUIZ_DURATION_MINUTES = 3;
export const MIN_MEMORY_HALF_LIFE_DAYS = 0.25;
export const MAX_MEMORY_HALF_LIFE_DAYS = 365;
export const MAX_MEMORY_DECAY_RECORDS = 180;

const DAY_MS = 86_400_000;
const ACHIEVED_STATES = new Set(["learned", "review_due", "mastered"]);
const ACTIVE_INJECTION_STATES = new Set(["scheduled", "in_progress"]);
const RESERVED_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asList(value) {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function boundedNumber(value, minimum, maximum, fallback = minimum) {
  return Math.min(maximum, Math.max(minimum, finiteNumber(value, fallback)));
}

function boundedInteger(value, minimum, maximum, fallback = minimum) {
  return Math.round(boundedNumber(value, minimum, maximum, fallback));
}

function cleanText(value, maximum = 240) {
  return String(value ?? "")
    .split("")
    .map((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint <= 31 || codePoint === 127 ? " " : character;
    })
    .join("")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, maximum);
}

function cleanId(value, fallback = "") {
  const cleaned = cleanText(value, 180)
    .replace(/[^a-z0-9:_-]+/giu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 180);
  return RESERVED_OBJECT_KEYS.has(cleaned.toLocaleLowerCase()) ? fallback : cleaned || fallback;
}

function normalizedIso(value, fallback = "") {
  const parsed = new Date(value || fallback);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : "";
}

function normalizedNow(value) {
  return normalizedIso(value, new Date().toISOString());
}

function round(value, places = 4) {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function addDays(isoValue, days) {
  const time = new Date(isoValue).getTime();
  if (!Number.isFinite(time)) return "";
  return new Date(time + finiteNumber(days, 0) * DAY_MS).toISOString();
}

function elapsedDays(startValue, endValue) {
  const start = new Date(startValue).getTime();
  const end = new Date(endValue).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, (end - start) / DAY_MS);
}

function normalizeTargetRecall(value) {
  return round(boundedNumber(value, 0.5, 0.95, DEFAULT_MEMORY_TARGET_RECALL), 4);
}

function normalizeHalfLife(value, fallback = 1) {
  return round(boundedNumber(
    value,
    MIN_MEMORY_HALF_LIFE_DAYS,
    MAX_MEMORY_HALF_LIFE_DAYS,
    fallback,
  ), 4);
}

function normalizedScore(value, fallback = 0) {
  return boundedInteger(value, 0, 100, fallback);
}

function normalizedConfidence(value, fallback = 0) {
  const raw = finiteNumber(value, fallback);
  return round(boundedNumber(raw > 5 ? raw / 20 : raw, 0, 5, fallback), 1);
}

function decayDaysForTarget(halfLifeDays, targetRecall) {
  return halfLifeDays * Math.log2(1 / targetRecall);
}

function stableHash(value) {
  let hash = 2_166_136_261;
  for (const character of String(value ?? "")) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}

function normalizedMatchText(value) {
  return cleanText(value, 1_200)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function meaningfulTokens(value) {
  return new Set(
    normalizedMatchText(value)
      .split(" ")
      .filter((token) => token.length >= 3),
  );
}

function recordKey(value = {}) {
  const source = asObject(value);
  const notebookId = cleanId(source.notebookId);
  const nodeId = cleanId(source.nodeId ?? source.id);
  return notebookId && nodeId ? `${notebookId}:${nodeId}` : '';
}

function latestScoredAttempt(node = {}) {
  return asList(node.attempts)
    .filter((attempt) => attempt?.score != null)
    .sort((left, right) => (
      normalizedIso(left?.answeredAt).localeCompare(normalizedIso(right?.answeredAt))
    ))
    .at(-1) || null;
}

function inferredObservedAt(node = {}, fallback = "") {
  const attempt = latestScoredAttempt(node);
  return normalizedIso(
    node?.review?.lastReviewedAt
      ?? attempt?.answeredAt
      ?? node?.lastStudiedAt
      ?? node?.masteredAt
      ?? node?.learnedAt,
    fallback,
  );
}

function hasMemoryEvidence(node = {}) {
  return Boolean(
    node?.review?.dueAt
    || node?.review?.lastReviewedAt
    || latestScoredAttempt(node)
    || node?.learnedAt
    || node?.masteredAt
    || ACHIEVED_STATES.has(node?.status),
  );
}

function inferInitialHalfLife(node, observedAt, targetRecall) {
  const review = asObject(node?.review);
  const dueAt = normalizedIso(review.dueAt ?? node?.nextReviewAt);
  const scheduledDays = elapsedDays(observedAt, dueAt);
  const thresholdDecay = Math.log2(1 / targetRecall);

  if (scheduledDays > 0 && thresholdDecay > 0) {
    return {
      dueAt,
      halfLifeDays: normalizeHalfLife(scheduledDays / thresholdDecay),
      source: "mastery-review-date",
    };
  }

  const intervalDays = boundedNumber(
    review.intervalDays ?? node?.reviewIntervalDays,
    0,
    MAX_MEMORY_HALF_LIFE_DAYS,
    0,
  );
  if (intervalDays > 0 && thresholdDecay > 0) {
    const halfLifeDays = normalizeHalfLife(intervalDays / thresholdDecay);
    return {
      dueAt: addDays(observedAt, intervalDays),
      halfLifeDays,
      source: "mastery-review-interval",
    };
  }

  const latestAttempt = latestScoredAttempt(node);
  const score = normalizedScore(latestAttempt?.score ?? node?.masteryScore, 0);
  const confidence = normalizedConfidence(
    latestAttempt?.confidence ?? node?.confidence,
    0,
  );
  const scoreFactor = (score / 100) ** 2;
  const confidenceFactor = 0.8 + confidence * 0.08;
  const masteryFactor = node?.status === "mastered" ? 1.5 : 1;
  const halfLifeDays = normalizeHalfLife(
    (0.5 + scoreFactor * 4.5) * confidenceFactor * masteryFactor,
  );
  return {
    dueAt: addDays(observedAt, decayDaysForTarget(halfLifeDays, targetRecall)),
    halfLifeDays,
    source: latestAttempt ? "mastery-attempt" : "mastery-estimate",
  };
}

/**
 * Converts one legacy mastery node into the versioned half-life model.
 * Existing review dates remain authoritative, so migration does not move a due review.
 */
export function migrateLearningMemoryRecord(nodeValue = {}, options = {}) {
  const node = asObject(nodeValue);
  if (!cleanId(node.nodeId ?? node.id) || !hasMemoryEvidence(node)) return null;

  const targetRecall = normalizeTargetRecall(options.targetRecall);
  const observedAt = inferredObservedAt(node, options.fallbackObservedAt);
  if (!observedAt) return null;
  const inferred = inferInitialHalfLife(node, observedAt, targetRecall);
  const latestAttempt = latestScoredAttempt(node);
  const scoredAttempts = asList(node.attempts).filter((attempt) => attempt?.score != null);

  return {
    version: LEARNING_MEMORY_DECAY_VERSION,
    model: LEARNING_MEMORY_DECAY_MODEL,
    nodeId: cleanId(node.nodeId ?? node.id),
    notebookId: cleanId(node.notebookId ?? options.notebookId, "notebook"),
    parentId: cleanId(node.parentId),
    nodeType: cleanId(node.nodeType ?? node.type, "concept"),
    title: cleanText(node.title ?? node.label, 180) || "Learning concept",
    subjectName: cleanText(node.subjectName ?? options.subjectName, 160) || "General study",
    chapterTitle: cleanText(node.chapterTitle ?? node.chapterName, 180),
    observedAt,
    halfLifeDays: inferred.halfLifeDays,
    targetRecall,
    dueAt: inferred.dueAt,
    lastScore: normalizedScore(latestAttempt?.score ?? node.masteryScore, 0),
    confidence: normalizedConfidence(latestAttempt?.confidence ?? node.confidence, 0),
    masteryScore: normalizedScore(node.masteryScore, 0),
    reviewCount: boundedInteger(scoredAttempts.length, 0, 10_000, 0),
    source: inferred.source,
  };
}

function normalizedSavedRecord(value, fallbackRecord) {
  const source = asObject(value);
  const fallback = asObject(fallbackRecord);
  if (!fallback.nodeId) return null;
  const observedAt = normalizedIso(source.observedAt, fallback.observedAt);
  const targetRecall = normalizeTargetRecall(source.targetRecall ?? fallback.targetRecall);
  const halfLifeDays = normalizeHalfLife(source.halfLifeDays, fallback.halfLifeDays);
  const suppliedDueAt = normalizedIso(source.dueAt);
  const dueAt = suppliedDueAt && suppliedDueAt >= observedAt
    ? suppliedDueAt
    : addDays(observedAt, decayDaysForTarget(halfLifeDays, targetRecall));

  return {
    ...fallback,
    version: LEARNING_MEMORY_DECAY_VERSION,
    model: LEARNING_MEMORY_DECAY_MODEL,
    observedAt,
    halfLifeDays,
    targetRecall,
    dueAt,
    lastScore: normalizedScore(source.lastScore, fallback.lastScore),
    confidence: normalizedConfidence(source.confidence, fallback.confidence),
    masteryScore: normalizedScore(source.masteryScore, fallback.masteryScore),
    reviewCount: boundedInteger(source.reviewCount, 0, 10_000, fallback.reviewCount),
    source: cleanId(source.source, fallback.source),
    lastQuizId: cleanId(source.lastQuizId),
    lastQuizCompletedAt: normalizedIso(source.lastQuizCompletedAt),
  };
}

function savedRecordMap(value) {
  const source = asObject(value);
  const records = source.records ?? source.nodes ?? source;
  if (Array.isArray(records)) {
    return new Map(records.map((record) => [recordKey(record), record]));
  }
  return new Map(Object.entries(asObject(records)).map(([key, record]) => {
    const sourceRecord = asObject(record);
    const normalizedKey = recordKey(sourceRecord) || cleanText(key, 360);
    return [normalizedKey, sourceRecord];
  }));
}

/**
 * Reconciles persisted decay records with the canonical learning mastery state.
 * A newer mastery attempt always replaces an older derived record.
 */
export function normalizeLearningMemoryState(value = {}, options = {}) {
  const notebook = asObject(options.notebook);
  const learningStateValue = options.learningState
    ?? notebook.learningState
    ?? notebook.masteryState
    ?? notebook.learningProgress
    ?? (notebook.nodes ? notebook : {});
  const now = normalizedNow(options.now);
  const learningState = normalizeLearningState(learningStateValue, {
    notebook,
    now,
  });
  const source = asObject(value);
  const persistedRecords = savedRecordMap(source.records ? source : source.memoryDecayState ?? source);
  const records = {};

  Object.values(learningState.nodes).slice(0, MAX_MEMORY_DECAY_RECORDS).forEach((node) => {
    const migrated = migrateLearningMemoryRecord(node, {
      fallbackObservedAt: learningState.updatedAt,
      notebookId: notebook.id ?? notebook._id,
      subjectName: notebook.subjectName,
      targetRecall: options.targetRecall ?? source.targetRecall,
    });
    if (!migrated) return;

    const persisted = persistedRecords.get(recordKey(migrated));
    const persistedObservedAt = normalizedIso(persisted?.observedAt);
    const record = persistedObservedAt >= migrated.observedAt
      ? normalizedSavedRecord(persisted, migrated)
      : migrated;
    records[record.nodeId] = record;
  });

  return {
    version: LEARNING_MEMORY_DECAY_VERSION,
    model: LEARNING_MEMORY_DECAY_MODEL,
    targetRecall: normalizeTargetRecall(options.targetRecall ?? source.targetRecall),
    records,
    updatedAt: now,
  };
}

/** Returns the predicted probability (0-1) that a learner can recall the concept. */
export function calculateLearningRecallProbability(recordValue = {}, options = {}) {
  const record = asObject(recordValue);
  const observedAt = normalizedIso(record.observedAt ?? record.lastReviewedAt);
  const now = normalizedIso(options.now, observedAt);
  if (!observedAt || !now) return 0;
  const halfLifeDays = normalizeHalfLife(record.halfLifeDays, 1);
  const probability = 2 ** (-elapsedDays(observedAt, now) / halfLifeDays);
  return round(boundedNumber(probability, 0, 1, 0), 4);
}

/**
 * Applies a scored micro-quiz result to a record. Successful delayed recall expands
 * the half-life; a failed recall contracts it. The function is deterministic.
 */
export function updateLearningMemoryAfterQuiz(recordValue = {}, resultValue = {}, options = {}) {
  const record = asObject(recordValue);
  if (!cleanId(record.nodeId ?? record.id)) return null;
  const result = asObject(resultValue);
  const hasResult = result.score != null
    || result.percentage != null
    || typeof result.correct === 'boolean';
  if (!hasResult) return null;
  const score = normalizedScore(
    result.score ?? result.percentage,
    result.correct === true ? 100 : result.correct === false ? 0 : record.lastScore,
  );
  const confidence = normalizedConfidence(result.confidence, record.confidence);
  const now = normalizedNow(options.now ?? result.completedAt ?? result.reviewedAt);
  const previousHalfLife = normalizeHalfLife(record.halfLifeDays, 1);
  const targetRecall = normalizeTargetRecall(record.targetRecall);
  const expectedInterval = Math.max(
    MIN_MEMORY_HALF_LIFE_DAYS,
    decayDaysForTarget(previousHalfLife, targetRecall),
  );
  const actualInterval = elapsedDays(record.observedAt, now);

  let performanceMultiplier;
  if (score < 50) performanceMultiplier = 0.5;
  else if (score < 70) performanceMultiplier = 0.8;
  else if (score < 85) performanceMultiplier = 1.35;
  else performanceMultiplier = 1.8;

  const confidenceMultiplier = 0.9 + confidence * 0.04;
  const successfulDelayMultiplier = score >= 70
    ? boundedNumber(0.8 + (actualInterval / expectedInterval) * 0.2, 0.85, 1.2, 1)
    : 1;
  const halfLifeDays = normalizeHalfLife(
    previousHalfLife * performanceMultiplier * confidenceMultiplier * successfulDelayMultiplier,
  );

  return {
    ...record,
    version: LEARNING_MEMORY_DECAY_VERSION,
    model: LEARNING_MEMORY_DECAY_MODEL,
    observedAt: now,
    halfLifeDays,
    targetRecall,
    dueAt: addDays(now, decayDaysForTarget(halfLifeDays, targetRecall)),
    lastScore: score,
    confidence,
    masteryScore: normalizedScore(
      score * 0.45 + normalizedScore(record.masteryScore, score) * 0.55,
      score,
    ),
    reviewCount: boundedInteger(record.reviewCount, 0, 10_000, 0) + 1,
    source: "memory-micro-quiz",
  };
}

function compareCandidates(left, right) {
  return left.dueAt.localeCompare(right.dueAt)
    || left.predictedRecall - right.predictedRecall
    || left.masteryScore - right.masteryScore
    || recordKey(left).localeCompare(recordKey(right));
}

function candidateFromRecord(record, options) {
  const targetDateKey = toLocalDateKey(options.dateKey ?? options.now);
  const dueDateKey = toLocalDateKey(record.dueAt);
  const predictedRecall = calculateLearningRecallProbability(record, { now: options.now });
  const isDue = Boolean(
    targetDateKey
    && dueDateKey
    && dueDateKey <= targetDateKey,
  ) || predictedRecall <= record.targetRecall;
  if (!isDue) return null;

  return {
    ...record,
    id: recordKey(record),
    dueDateKey,
    predictedRecall,
    daysOverdue: dueDateKey && targetDateKey && dueDateKey < targetDateKey
      ? Math.floor(elapsedDays(`${dueDateKey}T00:00:00.000Z`, `${targetDateKey}T00:00:00.000Z`))
      : 0,
    reason: dueDateKey === targetDateKey ? "predicted-forgetting-day" : "overdue-review",
  };
}

/** Selects due concepts across notebooks with a stable urgency order. */
export function selectLearningMemoryCandidates(notebooksValue = [], options = {}) {
  const notebooks = asList(notebooksValue).filter((item) => item && typeof item === "object");
  const now = normalizedNow(options.now);
  const targetDateKey = toLocalDateKey(options.dateKey ?? now);
  const limit = boundedInteger(options.limit, 1, 500, 100);

  return notebooks.flatMap((notebook) => {
    const memoryState = normalizeLearningMemoryState(
      notebook.memoryDecayState ?? notebook.learningMemoryState ?? {},
      {
        notebook,
        now,
        targetRecall: options.targetRecall,
      },
    );
    return Object.values(memoryState.records).flatMap((record) => {
      const candidate = candidateFromRecord(record, {
        dateKey: targetDateKey,
        now,
      });
      return candidate ? [candidate] : [];
    });
  }).sort(compareCandidates).slice(0, limit);
}

function normalizeInjection(value = {}, fallbackDateKey = "") {
  const source = asObject(value);
  const notebookId = cleanId(source.notebookId ?? source.sourceLearningProjectId);
  const nodeId = cleanId(source.nodeId ?? source.sourceLearningNodeId);
  const dateKey = toLocalDateKey(source.dateKey ?? fallbackDateKey);
  if (!notebookId || !nodeId || !dateKey) return null;
  const key = `${notebookId}:${nodeId}`;
  const status = cleanId(source.status ?? source.memoryDecayStatus, "scheduled");
  return {
    id: cleanId(source.id ?? source.memoryDecayInjectionId, `memory-decay-${stableHash(`${dateKey}:${key}`)}`),
    source: "memory-decay",
    dateKey,
    notebookId,
    nodeId,
    status,
    createdAt: normalizedIso(source.createdAt),
  };
}

/**
 * Creates persistence-ready, idempotent injection records. Existing records count
 * toward the daily cap and prevent the same node being inserted twice that day.
 */
export function buildLearningMemoryPlannerInjections(candidatesValue = [], options = {}) {
  const targetDateKey = toLocalDateKey(options.dateKey ?? options.now);
  const now = normalizedNow(options.now);
  const maxPerDay = boundedInteger(
    options.maxPerDay,
    1,
    12,
    DEFAULT_MEMORY_MAX_DAILY_QUIZZES,
  );
  if (!targetDateKey) {
    return {
      dateKey: "",
      injections: [],
      remainingCapacity: 0,
      skipped: asList(candidatesValue),
    };
  }

  const existing = asList(options.existingInjections)
    .map((item) => normalizeInjection(item, targetDateKey))
    .filter(Boolean);
  const existingForDay = existing.filter((item) => item.dateKey === targetDateKey);
  const occupiedIds = new Set(existingForDay.map((item) => item.id));
  const occupiedKeys = new Set(existingForDay.map(recordKey));
  const occupiedCount = new Set(existingForDay.map((item) => item.id)).size;
  const remainingCapacity = Math.max(0, maxPerDay - occupiedCount);
  const uniqueCandidates = new Map();

  asList(candidatesValue).forEach((candidateValue) => {
    const candidate = asObject(candidateValue);
    const key = recordKey(candidate);
    const dueDateKey = toLocalDateKey(candidate.dueDateKey ?? candidate.dueAt);
    if (!key || !dueDateKey || dueDateKey > targetDateKey || uniqueCandidates.has(key)) return;
    uniqueCandidates.set(key, candidate);
  });

  const sortedCandidates = [...uniqueCandidates.values()].sort(compareCandidates);
  const selected = sortedCandidates
    .filter((candidate) => !occupiedKeys.has(recordKey(candidate)))
    .slice(0, remainingCapacity);
  const injections = selected.map((candidate) => {
    const key = recordKey(candidate);
    const id = `memory-decay-${stableHash(`${targetDateKey}:${key}`)}`;
    return {
      id,
      source: "memory-decay",
      version: LEARNING_MEMORY_DECAY_VERSION,
      model: LEARNING_MEMORY_DECAY_MODEL,
      dateKey: targetDateKey,
      notebookId: cleanId(candidate.notebookId, "notebook"),
      nodeId: cleanId(candidate.nodeId ?? candidate.id),
      status: "scheduled",
      durationMinutes: DEFAULT_MEMORY_QUIZ_DURATION_MINUTES,
      quizId: `memory-quiz-${stableHash(`${targetDateKey}:${key}`)}`,
      dueAt: normalizedIso(candidate.dueAt),
      predictedRecall: round(boundedNumber(candidate.predictedRecall, 0, 1, 0), 4),
      targetRecall: normalizeTargetRecall(candidate.targetRecall),
      createdAt: now,
    };
  }).filter((item) => !occupiedIds.has(item.id));
  const selectedKeys = new Set(injections.map(recordKey));

  return {
    dateKey: targetDateKey,
    injections,
    remainingCapacity: Math.max(0, remainingCapacity - injections.length),
    skipped: sortedCandidates.filter((candidate) => (
      occupiedKeys.has(recordKey(candidate)) || !selectedKeys.has(recordKey(candidate))
    )),
  };
}

function plannerTaskFromInjection(injection, candidate) {
  const subjectName = cleanText(candidate.subjectName, 160) || "General study";
  const title = cleanText(candidate.title, 180) || "Learning concept";
  const nodeType = cleanId(candidate.nodeType, "concept");
  const chapterName = cleanText(candidate.chapterTitle, 180);
  return {
    id: injection.id,
    source: "memory-decay",
    sourceLearningProjectId: injection.notebookId,
    sourceLearningNodeId: injection.nodeId,
    memoryDecayInjectionId: injection.id,
    memoryDecayQuizId: injection.quizId,
    memoryDecayStatus: injection.status,
    subjectName,
    topic: title,
    task: `3-minute memory check: ${subjectName} - ${title}`,
    time: "Morning",
    unitKey: `memory-decay:${injection.notebookId}:${injection.nodeId}:${injection.dateKey}`,
    unitType: nodeType,
    durationMinutes: DEFAULT_MEMORY_QUIZ_DURATION_MINUTES,
    dueAt: injection.dueAt,
    predictedRecall: injection.predictedRecall,
    targetRecall: injection.targetRecall,
    ...(chapterName ? { chapterName } : {}),
  };
}

/** Adds capped memory-review tasks to one existing planner day without mutating it. */
export function injectLearningMemoryPlannerTasks(
  scheduleValue = [],
  candidatesValue = [],
  options = {},
) {
  if (!Array.isArray(scheduleValue)) return null;
  const dateKey = toLocalDateKey(options.dateKey ?? options.now);
  const targetDayIndex = scheduleValue.findIndex((day, index) => (
    getScheduleDateKey(day, index, options.scheduleStartDate) === dateKey
  ));
  if (!dateKey || targetDayIndex < 0) return null;

  const schedule = structuredClone(scheduleValue);
  if (!Array.isArray(schedule[targetDayIndex].tasks)) schedule[targetDayIndex].tasks = [];
  const existingInjections = schedule[targetDayIndex].tasks
    .filter((task) => task?.source === "memory-decay")
    .map((task) => ({ ...task, dateKey }));
  const built = buildLearningMemoryPlannerInjections(candidatesValue, {
    ...options,
    dateKey,
    existingInjections: [
      ...asList(options.existingInjections),
      ...existingInjections,
    ],
  });
  const candidateMap = new Map(asList(candidatesValue).map((candidate) => [
    recordKey(candidate),
    candidate,
  ]));
  const tasks = built.injections.map((injection) => plannerTaskFromInjection(
    injection,
    candidateMap.get(recordKey(injection)) ?? {},
  ));
  schedule[targetDayIndex].tasks.push(...tasks);

  return {
    ...built,
    schedule,
    targetDayIndex,
    tasks,
  };
}

function notebookNodeRows(notebookValue = {}) {
  const notebook = asObject(notebookValue);
  const rows = [];
  asList(notebook.chapters).forEach((chapter) => {
    rows.push({ ...asObject(chapter), nodeType: "chapter", chapterTitle: chapter?.title });
    asList(chapter?.topics).forEach((topic) => {
      rows.push({ ...asObject(topic), nodeType: "topic", chapterTitle: chapter?.title });
      asList(topic?.subtopics).forEach((subtopic) => {
        rows.push({ ...asObject(subtopic), nodeType: "subtopic", chapterTitle: chapter?.title });
      });
    });
  });
  if (!rows.length) {
    asList(notebook.topics).forEach((topic) => rows.push({
      ...asObject(topic),
      nodeType: "topic",
    }));
  }
  return rows;
}

function findNotebookNode(notebook, candidate) {
  const rows = notebookNodeRows(notebook);
  const nodeId = cleanId(candidate.nodeId ?? candidate.id);
  const exact = rows.find((row) => cleanId(row.id ?? row.nodeId) === nodeId);
  if (exact) return exact;
  const title = normalizedMatchText(candidate.title);
  return title ? rows.find((row) => normalizedMatchText(row.title) === title) ?? null : null;
}

function questionRows(value, context = {}) {
  return asList(value).flatMap((item, index) => {
    const source = typeof item === "string" ? { question: item } : asObject(item);
    const prompt = cleanText(source.question ?? source.prompt ?? source.title ?? source.text, 700);
    if (!prompt) return [];
    const sourceQuestionId = cleanId(
      source.id,
      `${context.fallbackPrefix ?? "question"}-${index + 1}`,
    );
    const options = asList(source.options ?? source.choices)
      .map((option) => cleanText(option?.text ?? option?.label ?? option, 300))
      .filter(Boolean)
      .slice(0, 6);
    return [{
      id: sourceQuestionId,
      sourceQuestionId,
      prompt,
      answer: cleanText(
        source.answer ?? source.modelAnswer ?? source.correctAnswer ?? source.explanation ?? source.guidance,
        2_400,
      ),
      whyItMatters: cleanText(source.whyItMatters ?? source.reason ?? source.importance, 700),
      difficulty: cleanId(source.difficulty, "medium"),
      options,
      questionType: options.length >= 2 ? "multiple-choice" : "short-answer",
      source: context.source ?? "notebook-question",
      sourceIndex: index,
      explicitNodeId: cleanId(
        source.nodeId ?? source.topicId ?? source.subtopicId ?? source.chapterId,
      ),
      tags: asList(source.tags).map((tag) => cleanText(tag, 80)).filter(Boolean).slice(0, 12),
    }];
  });
}

function localQuestionRows(node) {
  if (!node) return [];
  const fields = [
    node.activeRecallQuestions,
    node.reviewQuestions,
    node.practiceQuestions,
    node.quizQuestions,
    node.importantQuestions,
    node.questions,
  ];
  return fields.flatMap((value, fieldIndex) => questionRows(value, {
    fallbackPrefix: `${cleanId(node.id ?? node.nodeId, "node")}-question-${fieldIndex + 1}`,
    source: "notebook-node-question",
  }));
}

function previousAttemptMap(notebook, nodeId) {
  const learningState = asObject(notebook?.learningState ?? notebook?.masteryState);
  const rawNodes = learningState.nodes ?? learningState.nodeStates ?? learningState.progress;
  const node = Array.isArray(rawNodes)
    ? rawNodes.find((item) => cleanId(item?.nodeId ?? item?.id) === nodeId)
    : asObject(rawNodes)[nodeId];
  return new Map(asList(node?.attempts).flatMap((attempt) => {
    const prompt = normalizedMatchText(attempt?.prompt ?? attempt?.question);
    return prompt ? [[prompt, attempt]] : [];
  }));
}

function scoreQuestion(question, candidate, node, previousAttempts, onlyNotebookNode) {
  if (question.source === "notebook-node-question") return 1_000;
  const candidateNodeId = cleanId(candidate.nodeId ?? candidate.id);
  if (question.explicitNodeId && question.explicitNodeId === candidateNodeId) return 900;
  const titleText = normalizedMatchText(candidate.title ?? node?.title);
  const chapterText = normalizedMatchText(candidate.chapterTitle ?? node?.chapterTitle);
  const candidateTokens = meaningfulTokens([
    titleText,
    chapterText,
    ...question.tags,
  ].join(" "));
  const searchable = normalizedMatchText([
    question.prompt,
    question.answer,
    question.whyItMatters,
    question.tags.join(" "),
  ].join(" "));
  let score = titleText && searchable.includes(titleText) ? 100 : 0;
  candidateTokens.forEach((token) => {
    if (searchable.includes(token)) score += 8;
  });
  const previous = previousAttempts.get(normalizedMatchText(question.prompt));
  if (previous?.correct === false) score += 40;
  else if (previous?.correct === true) score += 5;
  return score || (onlyNotebookNode ? 1 : 0);
}

function buildGenerationInput(notebook, candidate, node, missingCount) {
  if (missingCount <= 0) return null;
  const misconceptions = asList(
    asObject(asObject(notebook?.learningState).nodes)[cleanId(candidate.nodeId)]?.misconceptions,
  ).filter((item) => !item?.resolvedAt).map((item) => cleanText(item?.label ?? item, 180));
  return {
    feature: "memory-micro-quiz",
    questionCount: missingCount,
    durationMinutes: DEFAULT_MEMORY_QUIZ_DURATION_MINUTES,
    notebookId: cleanId(candidate.notebookId ?? notebook?.id ?? notebook?._id, "notebook"),
    nodeId: cleanId(candidate.nodeId ?? candidate.id),
    subjectName: cleanText(candidate.subjectName ?? notebook?.subjectName, 160),
    chapterTitle: cleanText(candidate.chapterTitle ?? node?.chapterTitle, 180),
    title: cleanText(candidate.title ?? node?.title, 180),
    context: {
      overview: cleanText(notebook?.overview, 1_200),
      summary: cleanText(node?.summary ?? node?.explanation ?? node?.description, 1_600),
      keyPoints: asList(node?.keyPoints).map((item) => cleanText(item, 320)).filter(Boolean).slice(0, 8),
      examples: asList(node?.examples).map((item) => cleanText(item, 500)).filter(Boolean).slice(0, 4),
      misconceptions: misconceptions.slice(0, 6),
    },
    requirements: {
      useOnlyProvidedStudyMaterial: true,
      conciseAnswers: true,
      avoidDuplicatePrompts: true,
      maximumAnswerMinutes: DEFAULT_MEMORY_QUIZ_DURATION_MINUTES,
    },
  };
}

/**
 * Reuses saved notebook questions first. If fewer than requested are relevant, it
 * returns a bounded generationInput rather than calling an AI provider itself.
 */
export function selectLearningMemoryQuizQuestions(notebookValue = {}, candidateValue = {}, options = {}) {
  const notebook = asObject(notebookValue);
  const candidate = asObject(candidateValue);
  const requestedCount = boundedInteger(
    options.count,
    1,
    5,
    DEFAULT_MEMORY_QUIZ_QUESTION_COUNT,
  );
  const node = findNotebookNode(notebook, candidate);
  const nodeId = cleanId(candidate.nodeId ?? candidate.id);
  const previousAttempts = previousAttemptMap(notebook, nodeId);
  const onlyNotebookNode = notebookNodeRows(notebook).filter((row) => (
    row.nodeType === "topic" || row.nodeType === "subtopic"
  )).length <= 1;
  const rawQuestions = [
    ...localQuestionRows(node),
    ...questionRows(notebook.importantQuestions ?? notebook.questions, {
      fallbackPrefix: "important-question",
      source: "notebook-important-question",
    }),
  ];
  const byPrompt = new Map();
  rawQuestions.forEach((question) => {
    const promptKey = normalizedMatchText(question.prompt);
    const relevance = scoreQuestion(
      question,
      candidate,
      node,
      previousAttempts,
      onlyNotebookNode,
    );
    if (!promptKey || relevance <= 0) return;
    const existing = byPrompt.get(promptKey);
    if (!existing || existing.relevance < relevance) {
      byPrompt.set(promptKey, { ...question, relevance });
    }
  });

  const recentIds = new Set(asList(
    options.recentQuestionIds ?? options.excludeQuestionIds,
  ).map((item) => cleanId(item?.sourceQuestionId ?? item?.id ?? item)).filter(Boolean));
  const rotationKey = cleanText(
    options.rotationKey ?? options.dateKey ?? candidate.dueDateKey ?? candidate.dueAt,
    120,
  );
  const ranked = [...byPrompt.values()].sort((left, right) => (
    right.relevance - left.relevance
    || stableHash(`${rotationKey}:${left.sourceQuestionId}`)
      .localeCompare(stableHash(`${rotationKey}:${right.sourceQuestionId}`))
    || left.sourceIndex - right.sourceIndex
  ));
  const fresh = ranked.filter((question) => !recentIds.has(question.sourceQuestionId));
  const repeated = ranked.filter((question) => recentIds.has(question.sourceQuestionId));
  const selected = [...fresh, ...repeated].slice(0, requestedCount).map((question) => ({
    id: `memory-question-${stableHash(`${nodeId}:${question.sourceQuestionId}`)}`,
    sourceQuestionId: question.sourceQuestionId,
    prompt: question.prompt,
    answer: question.answer,
    whyItMatters: question.whyItMatters,
    difficulty: question.difficulty,
    options: question.options,
    questionType: question.questionType,
    source: question.source,
    repeated: recentIds.has(question.sourceQuestionId),
  }));
  const missingCount = Math.max(0, requestedCount - selected.length);

  return {
    requestedCount,
    questions: selected,
    reusedCount: selected.length,
    missingCount,
    needsAiGeneration: missingCount > 0,
    generationInput: buildGenerationInput(notebook, candidate, node, missingCount),
  };
}

/** Builds the UI/API payload for one three-minute quiz without invoking AI. */
export function buildLearningMemoryMicroQuiz(notebookValue = {}, candidateValue = {}, options = {}) {
  const notebook = asObject(notebookValue);
  const candidate = asObject(candidateValue);
  const dateKey = toLocalDateKey(options.dateKey ?? candidate.dueDateKey ?? options.now);
  const notebookId = cleanId(candidate.notebookId ?? notebook.id ?? notebook._id, "notebook");
  const nodeId = cleanId(candidate.nodeId ?? candidate.id);
  if (!nodeId || !dateKey) return null;
  const selection = selectLearningMemoryQuizQuestions(notebook, candidate, options);
  return {
    id: `memory-quiz-${stableHash(`${dateKey}:${notebookId}:${nodeId}`)}`,
    type: "memory-micro-quiz",
    version: LEARNING_MEMORY_DECAY_VERSION,
    dateKey,
    durationMinutes: DEFAULT_MEMORY_QUIZ_DURATION_MINUTES,
    notebookId,
    nodeId,
    subjectName: cleanText(candidate.subjectName ?? notebook.subjectName, 160) || "General study",
    title: cleanText(candidate.title, 180) || "Memory review",
    dueAt: normalizedIso(candidate.dueAt),
    predictedRecall: round(boundedNumber(candidate.predictedRecall, 0, 1, 0), 4),
    targetRecall: normalizeTargetRecall(candidate.targetRecall),
    ...selection,
  };
}
