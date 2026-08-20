export const LEARNING_MASTERY_VERSION = 1;

export const LEARNING_NODE_STATES = Object.freeze([
  "new",
  "ready",
  "learning",
  "learned",
  "review_due",
  "mastered",
]);

export const LEARNING_REVIEW_INTERVAL_DAYS = Object.freeze([1, 3, 7, 14, 30, 60, 120]);
export const MAX_LEARNING_MASTERY_NODES = 180;
export const MAX_LEARNING_ATTEMPTS_PER_NODE = 32;
export const MAX_LEARNING_MISCONCEPTIONS_PER_NODE = 16;
export const MAX_LEARNING_SESSIONS = 120;

const NODE_STATE_SET = new Set(LEARNING_NODE_STATES);
const NODE_TYPE_SET = new Set(["chapter", "topic", "subtopic", "concept"]);
const SESSION_STATUS_SET = new Set(["in_progress", "completed"]);
const COMPLETION_STATES = new Set(["learned", "review_due", "mastered"]);
const RESERVED_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const MASTERED_SCORE = 85;
const LEARNED_SCORE = 70;
const MAX_LEARNING_SESSION_ACTIVE_MS = 24 * 60 * 60 * 1000;

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
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
  const cleaned = cleanText(value, 140)
    .replace(/[^a-z0-9:_-]+/giu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 140);
  if (RESERVED_OBJECT_KEYS.has(cleaned.toLocaleLowerCase())) return fallback;
  return cleaned || fallback;
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

function normalizedIso(value, fallback = "") {
  const parsed = new Date(value || fallback);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : "";
}

function actionTime(value, fallback = "") {
  return normalizedIso(value, fallback) || new Date(0).toISOString();
}

function addUtcDays(isoValue, days) {
  const date = new Date(isoValue);
  if (!Number.isFinite(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + Math.max(0, finiteNumber(days, 0)));
  return date.toISOString();
}

function elapsedMilliseconds(startValue, endValue) {
  const start = new Date(startValue).getTime();
  const end = new Date(endValue).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return boundedInteger(end - start, 0, MAX_LEARNING_SESSION_ACTIVE_MS, 0);
}

function uniqueIds(value, maximum = MAX_LEARNING_MASTERY_NODES) {
  const list = Array.isArray(value) ? value : value == null ? [] : [value];
  const result = [];
  const seen = new Set();
  for (const item of list) {
    const id = cleanId(item?.id ?? item?.nodeId ?? item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
    if (result.length >= maximum) break;
  }
  return result;
}

function normalizedConfidence(value) {
  const raw = finiteNumber(value, 0);
  const fivePointValue = raw > 5 ? raw / 20 : raw;
  return Math.round(boundedNumber(fivePointValue, 0, 5, 0) * 10) / 10;
}

function normalizedScore(value, correct) {
  if (value == null || value === "") {
    return typeof correct === "boolean" ? (correct ? 100 : 0) : null;
  }
  return boundedInteger(value, 0, 100, 0);
}

function defaultStatusForCatalogNode(node, catalog) {
  if (node.nodeType === "chapter") return "ready";
  if (node.nodeType === "topic") {
    const isFirstTopic = !catalog.some((candidate) => (
      candidate.nodeType === "topic"
      && candidate.parentId === node.parentId
      && candidate.order < node.order
    ));
    return isFirstTopic ? "ready" : "new";
  }
  return "new";
}

function isAchievedStatus(status) {
  return COMPLETION_STATES.has(status);
}

function sessionIdentifier(now, index) {
  return `session-${cleanId(now, "time")}-${index + 1}`;
}

function attemptIdentifier(nodeId, now, index) {
  return `attempt-${cleanId(nodeId, "node")}-${cleanId(now, "time")}-${index + 1}`;
}

function misconceptionIdentifier(label, index) {
  return cleanId(label, `misconception-${index + 1}`);
}

function outlineList(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * Returns the stable chapter/topic/subtopic records used by the mastery tree.
 * It reads only notebook content and never mutates it.
 */
export function buildLearningNodeCatalog(notebook = {}) {
  const source = asObject(notebook);
  const notebookId = cleanId(source.id ?? source._id, "notebook");
  const subjectName = cleanText(source.subjectName ?? source.subject ?? source.title, 160)
    || "General study";
  const catalog = [];
  const usedIds = new Set();

  const addNode = (value, context) => {
    const raw = asObject(value);
    let nodeId = cleanId(raw.id ?? raw._id, context.fallbackId);
    let suffix = 2;
    while (usedIds.has(nodeId)) {
      nodeId = cleanId(`${context.fallbackId}-${suffix}`, `${context.fallbackId}-${suffix}`);
      suffix += 1;
    }
    usedIds.add(nodeId);
    const node = {
      nodeId,
      notebookId,
      parentId: cleanId(context.parentId),
      nodeType: context.nodeType,
      title: cleanText(raw.title ?? raw.name ?? raw.label, 180) || context.fallbackTitle,
      subjectName,
      chapterTitle: cleanText(context.chapterTitle, 180),
      order: context.order,
    };
    catalog.push(node);
    return node;
  };

  outlineList(source.chapters).forEach((chapter, chapterIndex) => {
    if (catalog.length >= MAX_LEARNING_MASTERY_NODES) return;
    const chapterNode = addNode(chapter, {
      fallbackId: `${notebookId}-chapter-${chapterIndex + 1}`,
      fallbackTitle: `Chapter ${chapterIndex + 1}`,
      nodeType: "chapter",
      parentId: "",
      chapterTitle: cleanText(chapter?.title ?? chapter?.name, 180),
      order: chapterIndex,
    });
    const chapterTitle = chapterNode.title;

    outlineList(chapter?.topics).forEach((topic, topicIndex) => {
      if (catalog.length >= MAX_LEARNING_MASTERY_NODES) return;
      const topicNode = addNode(topic, {
        fallbackId: `${chapterNode.nodeId}-topic-${topicIndex + 1}`,
        fallbackTitle: `Topic ${topicIndex + 1}`,
        nodeType: "topic",
        parentId: chapterNode.nodeId,
        chapterTitle,
        order: topicIndex,
      });

      outlineList(topic?.subtopics).forEach((subtopic, subtopicIndex) => {
        if (catalog.length >= MAX_LEARNING_MASTERY_NODES) return;
        addNode(subtopic, {
          fallbackId: `${topicNode.nodeId}-subtopic-${subtopicIndex + 1}`,
          fallbackTitle: `Subtopic ${subtopicIndex + 1}`,
          nodeType: "subtopic",
          parentId: topicNode.nodeId,
          chapterTitle,
          order: subtopicIndex,
        });
      });
    });
  });

  return catalog;
}

function normalizeAttempt(value, index, nodeId, fallbackTime = "") {
  const source = asObject(value);
  const answeredAt = normalizedIso(
    source.answeredAt ?? source.createdAt ?? source.at,
    fallbackTime,
  );
  const score = normalizedScore(source.score ?? source.percentage, source.correct);
  return {
    id: cleanId(source.id, `attempt-${cleanId(nodeId, "node")}-${index + 1}`),
    kind: cleanText(source.kind ?? source.activityType ?? source.mode, 40) || "practice",
    score,
    correct: typeof source.correct === "boolean"
      ? source.correct
      : score == null
        ? null
        : score >= LEARNED_SCORE,
    confidence: normalizedConfidence(source.confidence),
    answeredAt,
    durationMinutes: Math.round(boundedNumber(source.durationMinutes, 0, 600, 0) * 10) / 10,
    prompt: cleanText(source.prompt ?? source.question, 600),
    responseSummary: cleanText(source.responseSummary ?? source.answer ?? source.response, 800),
    misconceptionIds: uniqueIds(source.misconceptionIds ?? source.misconceptions, 12),
    sessionId: cleanId(source.sessionId),
  };
}

function normalizeMisconception(value, index, fallbackTime = "") {
  const source = typeof value === "string" ? { label: value } : asObject(value);
  const label = cleanText(source.label ?? source.title ?? source.name ?? source.text, 180)
    || `Misconception ${index + 1}`;
  const firstSeenAt = normalizedIso(source.firstSeenAt ?? source.createdAt, fallbackTime);
  const lastSeenAt = normalizedIso(source.lastSeenAt ?? source.updatedAt, firstSeenAt);
  return {
    id: cleanId(source.id, misconceptionIdentifier(label, index)),
    label,
    detail: cleanText(source.detail ?? source.description ?? source.feedback, 600),
    count: boundedInteger(source.count, 1, 999, 1),
    firstSeenAt,
    lastSeenAt,
    resolvedAt: normalizedIso(source.resolvedAt),
  };
}

function normalizeReview(value = {}) {
  const source = asObject(value);
  const stage = boundedInteger(source.stage, 0, LEARNING_REVIEW_INTERVAL_DAYS.length - 1, 0);
  return {
    stage,
    intervalDays: boundedInteger(
      source.intervalDays,
      0,
      LEARNING_REVIEW_INTERVAL_DAYS.at(-1),
      source.dueAt ? LEARNING_REVIEW_INTERVAL_DAYS[stage] : 0,
    ),
    dueAt: normalizedIso(source.dueAt ?? source.nextReviewAt),
    lastReviewedAt: normalizedIso(source.lastReviewedAt ?? source.reviewedAt),
  };
}

function normalizeNodeRecord(value, context, now) {
  const source = asObject(value);
  const attempts = outlineList(source.attempts)
    .slice(-MAX_LEARNING_ATTEMPTS_PER_NODE)
    .map((attempt, index) => normalizeAttempt(attempt, index, context.nodeId, now));
  const misconceptions = outlineList(source.misconceptions)
    .slice(-MAX_LEARNING_MISCONCEPTIONS_PER_NODE)
    .map((item, index) => normalizeMisconception(item, index, now));
  const legacyCompleted = source.completed === true || source.isCompleted === true;
  const legacyMastered = source.mastered === true || source.isMastered === true;
  const requestedStatus = cleanText(source.status ?? source.state, 30).toLocaleLowerCase();
  const status = legacyMastered
    ? "mastered"
    : legacyCompleted
      ? "learned"
      : NODE_STATE_SET.has(requestedStatus)
        ? requestedStatus
        : context.defaultStatus;
  const lastAttempt = attempts.at(-1);
  const confidence = source.confidence == null
    ? lastAttempt?.confidence ?? 0
    : normalizedConfidence(source.confidence);
  const scoreFallback = lastAttempt?.score ?? (status === "mastered" ? 100 : status === "learned" ? 70 : 0);

  return {
    nodeId: context.nodeId,
    notebookId: cleanId(context.notebookId ?? source.notebookId),
    parentId: cleanId(context.parentId ?? source.parentId),
    nodeType: NODE_TYPE_SET.has(context.nodeType ?? source.nodeType)
      ? context.nodeType ?? source.nodeType
      : "concept",
    title: cleanText(context.title ?? source.title, 180) || "Learning concept",
    subjectName: cleanText(context.subjectName ?? source.subjectName, 160) || "General study",
    chapterTitle: cleanText(context.chapterTitle ?? source.chapterTitle ?? source.chapterName, 180),
    status,
    masteryScore: boundedInteger(source.masteryScore, 0, 100, scoreFallback ?? 0),
    confidence,
    startedAt: normalizedIso(source.startedAt),
    lastStudiedAt: normalizedIso(source.lastStudiedAt ?? source.updatedAt ?? lastAttempt?.answeredAt),
    learnedAt: normalizedIso(source.learnedAt ?? source.completedAt),
    masteredAt: normalizedIso(source.masteredAt),
    attempts,
    misconceptions,
    review: normalizeReview(source.review ?? {
      stage: source.reviewStage,
      dueAt: source.nextReviewAt,
      lastReviewedAt: source.lastReviewedAt,
    }),
  };
}

function normalizeSession(value, index, fallbackTime = "") {
  const source = asObject(value);
  const startedAt = normalizedIso(source.startedAt ?? source.createdAt, fallbackTime);
  const completedAt = normalizedIso(source.completedAt ?? source.endedAt);
  const requestedStatus = cleanText(source.status, 30).toLocaleLowerCase();
  const status = SESSION_STATUS_SET.has(requestedStatus)
    ? requestedStatus
    : completedAt
      ? "completed"
      : "in_progress";
  const pausedAt = status === "in_progress" ? normalizedIso(source.pausedAt) : "";
  const suppliedDurationMinutes = boundedNumber(source.durationMinutes, 0, 1440, 0);
  const suppliedAccumulatedMs = source.accumulatedActiveMs ?? source.activeDurationMs;
  const hasAccumulatedMs = suppliedAccumulatedMs != null
    && Number.isFinite(Number(suppliedAccumulatedMs));
  const inferredEnd = status === "completed" ? completedAt : pausedAt;
  const inferredActiveMs = elapsedMilliseconds(startedAt, inferredEnd);
  const legacyDurationMs = suppliedDurationMinutes > 0
    ? Math.round(suppliedDurationMinutes * 60_000)
    : inferredActiveMs;
  const accumulatedActiveMs = hasAccumulatedMs
    ? boundedInteger(suppliedAccumulatedMs, 0, MAX_LEARNING_SESSION_ACTIVE_MS, 0)
    : legacyDurationMs;
  const activeStartedAt = status === "in_progress" && !pausedAt
    ? normalizedIso(source.activeStartedAt ?? source.segmentStartedAt, startedAt)
    : "";
  const durationMinutes = status === "completed"
    ? Math.round((suppliedDurationMinutes || accumulatedActiveMs / 60_000) * 10) / 10
    : Math.round(suppliedDurationMinutes * 10) / 10;
  return {
    id: cleanId(source.id, `session-${index + 1}`),
    notebookId: cleanId(source.notebookId),
    subjectName: cleanText(source.subjectName, 160) || "General study",
    objective: cleanText(source.objective ?? source.title, 300),
    mode: cleanText(source.mode, 40) || "guided",
    status,
    startedAt,
    updatedAt: normalizedIso(source.updatedAt, completedAt || pausedAt || activeStartedAt || startedAt),
    completedAt: status === "completed" ? completedAt : "",
    stageIndex: boundedInteger(source.stageIndex, 0, 4, 0),
    pausedAt,
    activeStartedAt,
    accumulatedActiveMs,
    durationMinutes,
    nodeIds: uniqueIds(source.nodeIds),
    learnedNodeIds: uniqueIds(source.learnedNodeIds),
    masteredNodeIds: uniqueIds(source.masteredNodeIds),
    attemptCount: boundedInteger(source.attemptCount, 0, 999, 0),
    correctAttempts: boundedInteger(source.correctAttempts, 0, 999, 0),
    accuracy: boundedInteger(source.accuracy, 0, 100, 0),
    misconceptionCount: boundedInteger(source.misconceptionCount, 0, 999, 0),
    summary: cleanText(source.summary, 800),
  };
}

function sourceNodeMap(source) {
  const rawNodes = source.nodes ?? source.nodeStates ?? source.progress;
  if (Array.isArray(rawNodes)) {
    return new Map(rawNodes.map((node) => [cleanId(node?.nodeId ?? node?.id), node]));
  }
  return new Map(Object.entries(asObject(rawNodes)).map(([id, node]) => [
    cleanId(node?.nodeId ?? node?.id ?? id),
    node,
  ]));
}

function applyReadiness(nodes, catalog) {
  const result = { ...nodes };
  catalog.forEach((catalogNode) => {
    const current = result[catalogNode.nodeId];
    if (!current || current.status !== "new") return;
    if (catalogNode.nodeType === "topic") {
      const previous = catalog
        .filter((candidate) => candidate.nodeType === "topic" && candidate.parentId === catalogNode.parentId)
        .sort((left, right) => left.order - right.order)
        .find((candidate) => candidate.order === catalogNode.order - 1);
      if (!previous || isAchievedStatus(result[previous.nodeId]?.status)) {
        result[catalogNode.nodeId] = { ...current, status: "ready" };
      }
    } else if (catalogNode.nodeType === "subtopic") {
      const parentStatus = result[catalogNode.parentId]?.status;
      if (parentStatus && parentStatus !== "new" && parentStatus !== "ready") {
        result[catalogNode.nodeId] = { ...current, status: "ready" };
      }
    }
  });
  return result;
}

/**
 * Sanitizes persisted mastery state and reconciles it with the current notebook outline.
 * Legacy/empty notebooks receive a versioned empty state, so callers need no migration branch.
 */
export function normalizeLearningState(value = {}, options = {}) {
  const source = asObject(value);
  const notebook = asObject(options.notebook);
  const now = actionTime(options.now, source.updatedAt ?? notebook.updatedAt ?? notebook.createdAt);
  const catalog = buildLearningNodeCatalog(notebook);
  const existingNodes = sourceNodeMap(source);
  const nodes = {};

  catalog.forEach((catalogNode) => {
    nodes[catalogNode.nodeId] = normalizeNodeRecord(existingNodes.get(catalogNode.nodeId), {
      ...catalogNode,
      defaultStatus: defaultStatusForCatalogNode(catalogNode, catalog),
    }, now);
  });

  if (catalog.length < MAX_LEARNING_MASTERY_NODES) {
    for (const [nodeId, valueNode] of existingNodes.entries()) {
      if (!nodeId || nodes[nodeId] || Object.keys(nodes).length >= MAX_LEARNING_MASTERY_NODES) continue;
      const raw = asObject(valueNode);
      if (!cleanText(raw.title, 180)) continue;
      nodes[nodeId] = normalizeNodeRecord(raw, {
        nodeId,
        notebookId: cleanId(notebook.id ?? notebook._id ?? raw.notebookId, "notebook"),
        parentId: raw.parentId,
        nodeType: NODE_TYPE_SET.has(raw.nodeType) ? raw.nodeType : "concept",
        title: raw.title,
        subjectName: notebook.subjectName ?? raw.subjectName,
        chapterTitle: raw.chapterTitle ?? raw.chapterName,
        defaultStatus: "new",
      }, now);
    }
  }

  const sessions = outlineList(source.sessions ?? source.sessionHistory)
    .slice(-MAX_LEARNING_SESSIONS)
    .map((session, index) => normalizeSession(session, index, now));
  const activeSessionId = cleanId(source.activeSessionId);
  const validActiveSessionId = sessions.some((session) => (
    session.id === activeSessionId && session.status === "in_progress"
  )) ? activeSessionId : "";

  return {
    version: LEARNING_MASTERY_VERSION,
    nodes: applyReadiness(nodes, catalog),
    sessions,
    activeSessionId: validActiveSessionId,
    updatedAt: normalizedIso(source.updatedAt, now),
  };
}

export function getLearningNodeStatus(node = {}, options = {}) {
  const status = NODE_STATE_SET.has(node?.status) ? node.status : "new";
  const dueAt = normalizedIso(node?.review?.dueAt ?? node?.nextReviewAt);
  const now = normalizedIso(options.now);
  const hasEvaluatedAttempt = Array.isArray(node?.attempts)
    && node.attempts.some((attempt) => attempt?.score != null);
  return dueAt
    && now
    && dueAt <= now
    && (isAchievedStatus(status) || hasEvaluatedAttempt)
    ? "review_due"
    : status;
}

export function getLearningNodeState(learningState = {}, nodeId, options = {}) {
  const state = normalizeLearningState(learningState, options);
  const node = state.nodes[cleanId(nodeId)];
  return node ? { ...node, status: getLearningNodeStatus(node, options) } : null;
}

function replaceNode(state, node) {
  return {
    ...state,
    nodes: { ...state.nodes, [node.nodeId]: node },
  };
}

function transitionNode(stateValue, nodeId, updates, options = {}) {
  const state = normalizeLearningState(stateValue, options);
  const id = cleanId(nodeId);
  const current = state.nodes[id];
  if (!current) return state;
  const now = actionTime(options.now, state.updatedAt);
  const next = typeof updates === "function" ? updates(current, now) : { ...current, ...updates };
  return {
    ...replaceNode(state, next),
    updatedAt: now,
  };
}

export function setLearningNodeStatus(learningState, nodeId, status, options = {}) {
  const normalizedStatus = cleanText(status, 30).toLocaleLowerCase();
  if (!NODE_STATE_SET.has(normalizedStatus)) {
    return normalizeLearningState(learningState, options);
  }
  return transitionNode(learningState, nodeId, (node, now) => ({
    ...node,
    status: normalizedStatus,
    startedAt: normalizedStatus === "learning" && !node.startedAt ? now : node.startedAt,
    lastStudiedAt: normalizedStatus === "learning" ? now : node.lastStudiedAt,
    learnedAt: isAchievedStatus(normalizedStatus) && !node.learnedAt ? now : node.learnedAt,
    masteredAt: normalizedStatus === "mastered" && !node.masteredAt ? now : node.masteredAt,
  }), options);
}

/** Returns the next review schedule without mutating the previous review object. */
export function calculateLearningReview(previousReview = {}, result = {}, options = {}) {
  const previous = normalizeReview(previousReview);
  const reviewedAt = actionTime(options.now ?? result.reviewedAt, previous.lastReviewedAt);
  const score = normalizedScore(result.score, result.correct);
  const confidence = normalizedConfidence(result.confidence);
  let stage = previous.dueAt ? previous.stage : 0;

  if (score != null) {
    if (score < LEARNED_SCORE) {
      stage = 0;
    } else if (previous.dueAt && (score >= MASTERED_SCORE || confidence >= 4)) {
      stage = Math.min(stage + 1, LEARNING_REVIEW_INTERVAL_DAYS.length - 1);
    }
  }

  const intervalDays = LEARNING_REVIEW_INTERVAL_DAYS[stage];
  return {
    stage,
    intervalDays,
    dueAt: addUtcDays(reviewedAt, intervalDays),
    lastReviewedAt: reviewedAt,
  };
}

/**
 * Records manual/planner completion only when the node has no existing learning evidence.
 * Existing learned, due, or mastered evidence remains authoritative and is never rescheduled.
 */
export function markLearningNodeLearned(learningState, nodeId, options = {}) {
  return transitionNode(learningState, nodeId, (node, now) => {
    const effectiveStatus = getLearningNodeStatus(node, { now });
    const hasExistingEvidence = Boolean(node.learnedAt || node.masteredAt)
      || isAchievedStatus(effectiveStatus);
    if (hasExistingEvidence) return node;
    return {
      ...node,
      status: "learned",
      startedAt: node.startedAt || now,
      lastStudiedAt: now,
      learnedAt: now,
      masteryScore: Math.max(node.masteryScore, LEARNED_SCORE),
      review: calculateLearningReview(
        node.review,
        { score: LEARNED_SCORE, confidence: node.confidence },
        { now },
      ),
    };
  }, options);
}

function mergeMisconceptions(current, supplied, resolvedIds, now) {
  const byId = new Map(current.map((item) => [item.id, { ...item }]));
  const byLabel = new Map(current.map((item) => [item.label.toLocaleLowerCase(), item.id]));

  outlineList(supplied).slice(0, MAX_LEARNING_MISCONCEPTIONS_PER_NODE).forEach((item, index) => {
    const incoming = normalizeMisconception(item, index, now);
    const existingId = byId.has(incoming.id)
      ? incoming.id
      : byLabel.get(incoming.label.toLocaleLowerCase());
    const existing = existingId ? byId.get(existingId) : null;
    const id = existingId || incoming.id;
    byId.set(id, existing ? {
      ...existing,
      detail: incoming.detail || existing.detail,
      count: Math.min(999, existing.count + 1),
      lastSeenAt: now,
      resolvedAt: "",
    } : { ...incoming, id, firstSeenAt: now, lastSeenAt: now });
    byLabel.set(incoming.label.toLocaleLowerCase(), id);
  });

  new Set(uniqueIds(resolvedIds, MAX_LEARNING_MISCONCEPTIONS_PER_NODE)).forEach((id) => {
    const existing = byId.get(id);
    if (existing) byId.set(id, { ...existing, resolvedAt: now });
  });

  return [...byId.values()]
    .sort((left, right) => (left.lastSeenAt < right.lastSeenAt ? 1 : -1))
    .slice(0, MAX_LEARNING_MISCONCEPTIONS_PER_NODE);
}

/** Records an assessed activity and advances mastery/review state immutably. */
export function recordLearningAttempt(learningState, input = {}, options = {}) {
  const source = asObject(input);
  const baseState = normalizeLearningState(learningState, options);
  const id = cleanId(source.nodeId ?? source.id);
  const sessionId = cleanId(source.sessionId ?? baseState.activeSessionId);
  return transitionNode(baseState, id, (node, now) => {
    const score = normalizedScore(source.score, source.correct);
    const confidence = normalizedConfidence(source.confidence);
    const suppliedMisconceptions = outlineList(source.misconceptions);
    const misconceptions = mergeMisconceptions(
      node.misconceptions,
      suppliedMisconceptions,
      source.resolvedMisconceptionIds,
      now,
    );
    const attempt = normalizeAttempt({
      ...source,
      id: source.attemptId || attemptIdentifier(id, now, node.attempts.length),
      answeredAt: now,
      score,
      confidence,
      sessionId,
      misconceptionIds: suppliedMisconceptions.map((item, index) => (
        normalizeMisconception(item, index, now).id
      )),
    }, node.attempts.length, id, now);
    const attempts = [...node.attempts, attempt].slice(-MAX_LEARNING_ATTEMPTS_PER_NODE);
    const previousAttemptCount = node.attempts.filter((item) => item.score != null).length;
    const masteryScore = score == null
      ? node.masteryScore
      : Math.round(previousAttemptCount
        ? node.masteryScore * 0.55 + score * 0.45
        : score);
    const passed = score != null && score >= LEARNED_SCORE;
    const mastered = passed && masteryScore >= MASTERED_SCORE && confidence >= 4;
    const status = score == null
      ? (isAchievedStatus(node.status) ? node.status : "learning")
      : mastered
        ? "mastered"
        : passed
          ? "learned"
          : node.learnedAt
            ? "review_due"
            : "learning";
    const review = score == null
      ? node.review
      : calculateLearningReview(node.review, { score, confidence }, { now });

    return {
      ...node,
      status,
      masteryScore,
      confidence,
      startedAt: node.startedAt || now,
      lastStudiedAt: now,
      learnedAt: passed ? node.learnedAt || now : node.learnedAt,
      masteredAt: mastered ? node.masteredAt || now : node.masteredAt,
      attempts,
      misconceptions,
      review,
    };
  }, options);
}

export function startLearningSession(learningState, input = {}, options = {}) {
  const source = asObject(input);
  const state = normalizeLearningState(learningState, options);
  if (state.activeSessionId) return state;
  const now = actionTime(options.now ?? source.startedAt, state.updatedAt);
  const session = normalizeSession({
    ...source,
    id: source.id || sessionIdentifier(now, state.sessions.length),
    startedAt: now,
    activeStartedAt: now,
    updatedAt: now,
    accumulatedActiveMs: 0,
    status: "in_progress",
  }, state.sessions.length, now);
  return {
    ...state,
    sessions: [...state.sessions, session].slice(-MAX_LEARNING_SESSIONS),
    activeSessionId: session.id,
    updatedAt: now,
  };
}

/** Updates the resumable guided-session cursor without changing learning evidence. */
export function updateLearningSession(learningState, input = {}, options = {}) {
  const source = asObject(input);
  const state = normalizeLearningState(learningState, options);
  const id = cleanId(source.sessionId ?? source.id ?? state.activeSessionId);
  const existing = state.sessions.find((session) => (
    session.id === id && session.status === "in_progress"
  ));
  if (!existing) return state;
  const now = actionTime(options.now, state.updatedAt);
  const hasPausedAt = Object.prototype.hasOwnProperty.call(source, "pausedAt");
  const requestsPause = hasPausedAt && Boolean(source.pausedAt);
  let pausedAt = existing.pausedAt;
  let activeStartedAt = existing.activeStartedAt;
  let accumulatedActiveMs = existing.accumulatedActiveMs;

  if (requestsPause) {
    pausedAt = existing.pausedAt
      || (source.pausedAt === true ? now : normalizedIso(source.pausedAt, now));
    if (!existing.pausedAt) {
      accumulatedActiveMs = boundedInteger(
        accumulatedActiveMs + elapsedMilliseconds(activeStartedAt || existing.startedAt, pausedAt),
        0,
        MAX_LEARNING_SESSION_ACTIVE_MS,
        accumulatedActiveMs,
      );
    }
    activeStartedAt = "";
  } else if (hasPausedAt) {
    pausedAt = "";
    if (existing.pausedAt) activeStartedAt = now;
  }

  const updated = normalizeSession({
    ...existing,
    stageIndex: source.stageIndex ?? existing.stageIndex,
    updatedAt: now,
    pausedAt,
    activeStartedAt,
    accumulatedActiveMs,
    nodeIds: Object.prototype.hasOwnProperty.call(source, "nodeIds")
      ? uniqueIds(source.nodeIds)
      : existing.nodeIds,
  }, 0, existing.startedAt);
  return {
    ...state,
    sessions: state.sessions.map((session) => session.id === id ? updated : session),
    updatedAt: now,
  };
}

function sessionAttempts(state, sessionId) {
  return Object.values(state.nodes).flatMap((node) => (
    node.attempts.filter((attempt) => attempt.sessionId === sessionId)
  ));
}

export function buildLearningSessionSummary(learningState, sessionId, overrides = {}, options = {}) {
  const state = normalizeLearningState(learningState, options);
  const id = cleanId(sessionId ?? overrides.id ?? state.activeSessionId);
  const session = state.sessions.find((item) => item.id === id);
  if (!session) return null;
  const attemptRows = sessionAttempts(state, id);
  const scoredAttempts = attemptRows.filter((attempt) => attempt.score != null);
  const correctAttempts = scoredAttempts.filter((attempt) => attempt.correct).length;
  const nodeIds = uniqueIds([
    ...session.nodeIds,
    ...attemptRows.map((attempt) => Object.values(state.nodes).find((node) => (
      node.attempts.some((candidate) => candidate.id === attempt.id)
    ))?.nodeId),
    ...uniqueIds(overrides.nodeIds),
  ]);
  const nodes = nodeIds.map((nodeId) => state.nodes[nodeId]).filter(Boolean);
  const learnedNodeIds = nodes
    .filter((node) => node.learnedAt && node.learnedAt >= session.startedAt)
    .map((node) => node.nodeId);
  const masteredNodeIds = nodes
    .filter((node) => node.masteredAt && node.masteredAt >= session.startedAt)
    .map((node) => node.nodeId);
  const now = actionTime(options.now ?? overrides.completedAt, state.updatedAt);
  const activeSegmentMs = session.pausedAt
    ? 0
    : elapsedMilliseconds(session.activeStartedAt || session.startedAt, now);
  const trackedActiveMs = boundedInteger(
    session.accumulatedActiveMs + activeSegmentMs,
    0,
    MAX_LEARNING_SESSION_ACTIVE_MS,
    session.accumulatedActiveMs,
  );
  const hasDurationOverride = overrides.durationMinutes != null
    && Number.isFinite(Number(overrides.durationMinutes));
  const durationMinutes = Math.round(boundedNumber(
    overrides.durationMinutes,
    0,
    1440,
    trackedActiveMs / 60_000,
  ) * 10) / 10;
  const completedActiveMs = hasDurationOverride
    ? Math.round(durationMinutes * 60_000)
    : trackedActiveMs;

  return normalizeSession({
    ...session,
    ...overrides,
    id,
    status: "completed",
    accumulatedActiveMs: completedActiveMs,
    activeStartedAt: "",
    pausedAt: "",
    updatedAt: now,
    completedAt: now,
    durationMinutes,
    nodeIds,
    learnedNodeIds: uniqueIds([...learnedNodeIds, ...uniqueIds(overrides.learnedNodeIds)]),
    masteredNodeIds: uniqueIds([...masteredNodeIds, ...uniqueIds(overrides.masteredNodeIds)]),
    attemptCount: scoredAttempts.length,
    correctAttempts,
    accuracy: scoredAttempts.length ? Math.round((correctAttempts / scoredAttempts.length) * 100) : 0,
    misconceptionCount: new Set(attemptRows.flatMap((attempt) => attempt.misconceptionIds)).size,
  }, 0, now);
}

export function completeLearningSession(learningState, input = {}, options = {}) {
  const source = asObject(input);
  const state = normalizeLearningState(learningState, options);
  const id = cleanId(source.sessionId ?? source.id ?? state.activeSessionId);
  const summary = buildLearningSessionSummary(state, id, source, options);
  if (!summary) return state;
  return {
    ...state,
    sessions: state.sessions.map((session) => session.id === id ? summary : session),
    activeSessionId: state.activeSessionId === id ? "" : state.activeSessionId,
    updatedAt: summary.completedAt,
  };
}

export function getLearningReviewQueue(notebooks, options = {}) {
  const rows = Array.isArray(notebooks) ? notebooks : [notebooks];
  const now = normalizedIso(options.now);
  const limit = boundedInteger(options.limit, 1, 500, 100);
  return rows.flatMap((notebookValue) => {
    const notebook = asObject(notebookValue);
    const state = normalizeLearningState(
      notebook.learningState ?? (notebook.nodes ? notebook : {}),
      { notebook: notebook.learningState ? notebook : options.notebook, now },
    );
    return Object.values(state.nodes).flatMap((node) => {
      const status = getLearningNodeStatus(node, { now });
      return status === "review_due" ? [{
        id: node.nodeId,
        notebookId: node.notebookId,
        title: node.title,
        subjectName: node.subjectName,
        chapterTitle: node.chapterTitle,
        nodeType: node.nodeType,
        status,
        masteryScore: node.masteryScore,
        confidence: node.confidence,
        dueAt: node.review.dueAt,
        lastStudiedAt: node.lastStudiedAt,
      }] : [];
    });
  }).sort((left, right) => left.dueAt.localeCompare(right.dueAt)).slice(0, limit);
}

function emptySubjectStats(subjectName) {
  return {
    subjectName,
    totalTopics: 0,
    learnedTopics: 0,
    masteredTopics: 0,
    reviewDue: 0,
    masteryRate: 0,
    studyMinutes: 0,
    attemptCount: 0,
    accuracy: 0,
  };
}

/** Canonical Analytics/Report projection for saved learning notebooks. */
export function getLearningInsights(notebooks = [], options = {}) {
  const rows = Array.isArray(notebooks) ? notebooks : [];
  const now = normalizedIso(options.now);
  const subjectMap = new Map();
  const recentLearnedTopics = [];
  const recentSessions = [];
  const subjectNames = new Set();
  let topicCount = 0;
  let learnedTopicCount = 0;
  let masteredTopicCount = 0;
  let reviewDueCount = 0;
  let sessionCount = 0;
  let studyMinutes = 0;
  let attemptCount = 0;
  let correctAttemptCount = 0;
  let confidenceTotal = 0;
  let confidenceCount = 0;
  let misconceptionCount = 0;
  let unresolvedMisconceptionCount = 0;

  rows.forEach((notebook) => {
    const safeNotebook = asObject(notebook);
    const state = normalizeLearningState(safeNotebook.learningState, { notebook: safeNotebook, now });
    const fallbackSubject = cleanText(safeNotebook.subjectName ?? safeNotebook.title, 160) || "General study";
    subjectNames.add(fallbackSubject);
    if (!subjectMap.has(fallbackSubject)) subjectMap.set(fallbackSubject, emptySubjectStats(fallbackSubject));

    Object.values(state.nodes).forEach((node) => {
      const subjectName = node.subjectName || fallbackSubject;
      subjectNames.add(subjectName);
      if (!subjectMap.has(subjectName)) subjectMap.set(subjectName, emptySubjectStats(subjectName));
      const subject = subjectMap.get(subjectName);
      const effectiveStatus = getLearningNodeStatus(node, { now });
      const attempts = node.attempts.filter((attempt) => attempt.score != null);
      attemptCount += attempts.length;
      correctAttemptCount += attempts.filter((attempt) => attempt.correct).length;
      subject.attemptCount += attempts.length;
      subject._correctAttempts = (subject._correctAttempts || 0)
        + attempts.filter((attempt) => attempt.correct).length;
      if (node.confidence > 0) {
        confidenceTotal += node.confidence;
        confidenceCount += 1;
      }
      misconceptionCount += node.misconceptions.length;
      unresolvedMisconceptionCount += node.misconceptions.filter((item) => !item.resolvedAt).length;

      if (node.nodeType !== "topic") return;
      topicCount += 1;
      subject.totalTopics += 1;
      const isLearned = Boolean(node.learnedAt || node.masteredAt)
        || effectiveStatus === "learned"
        || effectiveStatus === "mastered";
      if (isLearned) {
        learnedTopicCount += 1;
        subject.learnedTopics += 1;
        recentLearnedTopics.push({
          id: node.nodeId,
          notebookId: node.notebookId,
          title: node.title,
          subjectName,
          chapterTitle: node.chapterTitle,
          nodeType: node.nodeType,
          status: effectiveStatus,
          masteryScore: node.masteryScore,
          confidence: node.confidence,
          completedAt: node.masteredAt || node.learnedAt,
          lastStudiedAt: node.lastStudiedAt,
        });
      }
      if (effectiveStatus === "mastered") {
        masteredTopicCount += 1;
        subject.masteredTopics += 1;
      }
      if (effectiveStatus === "review_due") {
        reviewDueCount += 1;
        subject.reviewDue += 1;
      }
    });

    state.sessions.filter((session) => session.status === "completed").forEach((session) => {
      sessionCount += 1;
      studyMinutes += session.durationMinutes;
      const subjectName = session.subjectName || fallbackSubject;
      if (!subjectMap.has(subjectName)) subjectMap.set(subjectName, emptySubjectStats(subjectName));
      subjectMap.get(subjectName).studyMinutes += session.durationMinutes;
      recentSessions.push(session);
    });
  });

  const subjects = [...subjectMap.values()].map((subject) => {
    const normalized = {
      ...subject,
      masteryRate: subject.totalTopics
        ? Math.round((subject.masteredTopics / subject.totalTopics) * 100)
        : 0,
      studyMinutes: Math.round(subject.studyMinutes * 10) / 10,
      accuracy: subject.attemptCount
        ? Math.round(((subject._correctAttempts || 0) / subject.attemptCount) * 100)
        : 0,
    };
    delete normalized._correctAttempts;
    return normalized;
  }).sort((left, right) => left.subjectName.localeCompare(right.subjectName));

  return {
    notebookCount: rows.length,
    subjectCount: subjectNames.size,
    topicCount,
    learnedTopicCount,
    masteredTopicCount,
    reviewDueCount,
    sessionCount,
    studyMinutes: Math.round(studyMinutes * 10) / 10,
    masteryRate: topicCount ? Math.round((masteredTopicCount / topicCount) * 100) : 0,
    attemptCount,
    accuracy: attemptCount ? Math.round((correctAttemptCount / attemptCount) * 100) : 0,
    averageConfidence: confidenceCount
      ? Math.round((confidenceTotal / confidenceCount) * 10) / 10
      : 0,
    misconceptionCount,
    unresolvedMisconceptionCount,
    subjects,
    recentLearnedTopics: recentLearnedTopics
      .sort((left, right) => (right.lastStudiedAt || right.completedAt || "")
        .localeCompare(left.lastStudiedAt || left.completedAt || ""))
      .slice(0, 20),
    recentSessions: recentSessions
      .sort((left, right) => (right.completedAt || "").localeCompare(left.completedAt || ""))
      .slice(0, 20),
  };
}
