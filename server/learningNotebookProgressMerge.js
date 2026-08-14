const RESERVED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asList(value) {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function cleanId(value, fallback = "") {
  const id = String(value ?? "").trim().slice(0, 180);
  return id && !RESERVED_KEYS.has(id.toLocaleLowerCase()) ? id : fallback;
}

function timeValue(value) {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function latestTime(...values) {
  return Math.max(Number.NEGATIVE_INFINITY, ...values.flat(Infinity).map(timeValue));
}

function newerFirst(current, incoming, currentTime, incomingTime, preferIncomingTie = false) {
  if (incomingTime > currentTime || (preferIncomingTie && incomingTime === currentTime)) {
    return [incoming, current];
  }
  return [current, incoming];
}

function entriesById(value, idForValue) {
  const source = asObject(value);
  const rows = Array.isArray(value) ? value : Object.values(source);
  return rows.flatMap((row, index) => {
    const item = asObject(row);
    const id = cleanId(idForValue(item, index));
    return id ? [[id, item]] : [];
  });
}

function mergeEvidenceRows(currentValue, incomingValue, options) {
  const merged = new Map(entriesById(currentValue, options.id));
  entriesById(incomingValue, options.id).forEach(([id, incoming]) => {
    const current = merged.get(id);
    if (!current) {
      merged.set(id, incoming);
      return;
    }
    const currentTime = options.time(current);
    const incomingTime = options.time(incoming);
    const [primary, secondary] = newerFirst(current, incoming, currentTime, incomingTime);
    merged.set(id, options.merge
      ? options.merge(primary, secondary)
      : { ...secondary, ...primary });
  });
  return [...merged.entries()]
    .sort((left, right) => (
      options.time(left[1]) - options.time(right[1])
      || left[0].localeCompare(right[0])
    ))
    .map(([, row]) => row);
}

function attemptTime(value) {
  const attempt = asObject(value);
  return latestTime(attempt.answeredAt, attempt.createdAt, attempt.at);
}

function mergeAttempts(current, incoming) {
  return mergeEvidenceRows(current, incoming, {
    id: (attempt, index) => attempt.id
      ?? `${attempt.answeredAt ?? "unknown"}:${attempt.prompt ?? attempt.question ?? index}`,
    time: attemptTime,
  });
}

function misconceptionTime(value) {
  const item = asObject(value);
  return latestTime(item.lastSeenAt, item.resolvedAt, item.firstSeenAt, item.updatedAt);
}

function mergeMisconceptions(current, incoming) {
  return mergeEvidenceRows(current, incoming, {
    id: (item, index) => item.id ?? item.label ?? item.title ?? index,
    time: misconceptionTime,
    merge: (primary, secondary) => ({
      ...secondary,
      ...primary,
      count: Math.max(Number(primary.count) || 0, Number(secondary.count) || 0, 1),
    }),
  });
}

function nodeEvidenceTime(value) {
  const node = asObject(value);
  return latestTime(
    node.updatedAt,
    node.lastStudiedAt,
    node.learnedAt,
    node.masteredAt,
    node.review?.lastReviewedAt,
    asList(node.attempts).map((attempt) => attemptTime(attempt)),
    asList(node.misconceptions).map((item) => misconceptionTime(item)),
  );
}

function nodeMap(value) {
  const source = asObject(value);
  const rows = Array.isArray(value) ? value : Object.entries(source).map(([id, node]) => ({
    ...asObject(node),
    nodeId: asObject(node).nodeId ?? asObject(node).id ?? id,
  }));
  return new Map(rows.flatMap((node, index) => {
    const item = asObject(node);
    const id = cleanId(item.nodeId ?? item.id, `node-${index + 1}`);
    return id ? [[id, item]] : [];
  }));
}

function mergeNodes(currentValue, incomingValue, stateContext) {
  const current = nodeMap(currentValue);
  const incoming = nodeMap(incomingValue);
  const ids = [...new Set([...current.keys(), ...incoming.keys()])].sort();
  return Object.fromEntries(ids.map((id) => {
    const currentNode = current.get(id);
    const incomingNode = incoming.get(id);
    if (!currentNode) return [id, incomingNode];
    if (!incomingNode) return [id, currentNode];
    const [primary, secondary] = newerFirst(
      currentNode,
      incomingNode,
      nodeEvidenceTime(currentNode),
      nodeEvidenceTime(incomingNode),
      stateContext.incomingIsNewer,
    );
    return [id, {
      ...secondary,
      ...primary,
      nodeId: id,
      review: {
        ...asObject(secondary.review),
        ...asObject(primary.review),
      },
      attempts: mergeAttempts(currentNode.attempts, incomingNode.attempts),
      misconceptions: mergeMisconceptions(
        currentNode.misconceptions,
        incomingNode.misconceptions,
      ),
    }];
  }));
}

function sessionTime(value) {
  const session = asObject(value);
  return latestTime(
    session.completedAt,
    session.pausedAt,
    session.activeStartedAt,
    session.updatedAt,
    session.startedAt,
  );
}

function mergeSessions(current, incoming) {
  return mergeEvidenceRows(current, incoming, {
    id: (session, index) => session.id ?? `session-${index + 1}`,
    time: sessionTime,
  });
}

function stateTime(value) {
  const state = asObject(value);
  return latestTime(state.updatedAt);
}

export function mergeLearningStates(currentValue = {}, incomingValue = {}) {
  const current = asObject(currentValue);
  const incoming = asObject(incomingValue);
  if (!Object.keys(incoming).length) return current;
  if (!Object.keys(current).length) return incoming;

  const currentTime = stateTime(current);
  const incomingTime = stateTime(incoming);
  const incomingIsNewer = incomingTime > currentTime;
  const [primary, secondary] = newerFirst(
    current,
    incoming,
    currentTime,
    incomingTime,
    incomingIsNewer,
  );
  const updatedTime = Math.max(currentTime, incomingTime);

  return {
    ...secondary,
    ...primary,
    nodes: mergeNodes(
      current.nodes ?? current.nodeStates ?? current.progress,
      incoming.nodes ?? incoming.nodeStates ?? incoming.progress,
      { incomingIsNewer },
    ),
    sessions: mergeSessions(
      current.sessions ?? current.sessionHistory,
      incoming.sessions ?? incoming.sessionHistory,
    ),
    activeSessionId: cleanId(primary.activeSessionId),
    ...(Number.isFinite(updatedTime) ? { updatedAt: new Date(updatedTime).toISOString() } : {}),
  };
}

function memoryRecordTime(value) {
  const record = asObject(value);
  return latestTime(record.lastQuizCompletedAt, record.observedAt);
}

function memoryRecordMap(value) {
  const source = asObject(value);
  const records = source.records ?? source.nodes ?? source;
  return new Map(entriesById(records, (record, index) => (
    record.nodeId ?? record.id ?? index
  )));
}

export function mergeLearningMemoryStates(currentValue = {}, incomingValue = {}) {
  const current = asObject(currentValue);
  const incoming = asObject(incomingValue);
  if (!Object.keys(incoming).length) return current;
  if (!Object.keys(current).length) return incoming;

  const currentRecords = memoryRecordMap(current);
  const incomingRecords = memoryRecordMap(incoming);
  const ids = [...new Set([...currentRecords.keys(), ...incomingRecords.keys()])].sort();
  const records = Object.fromEntries(ids.map((id) => {
    const currentRecord = currentRecords.get(id);
    const incomingRecord = incomingRecords.get(id);
    if (!currentRecord) return [id, incomingRecord];
    if (!incomingRecord) return [id, currentRecord];
    const [primary, secondary] = newerFirst(
      currentRecord,
      incomingRecord,
      memoryRecordTime(currentRecord),
      memoryRecordTime(incomingRecord),
    );
    return [id, { ...secondary, ...primary, nodeId: id }];
  }));
  const currentTime = stateTime(current);
  const incomingTime = stateTime(incoming);
  const [primary, secondary] = newerFirst(current, incoming, currentTime, incomingTime);
  const updatedTime = Math.max(currentTime, incomingTime);

  return {
    ...secondary,
    ...primary,
    records,
    ...(Number.isFinite(updatedTime) ? { updatedAt: new Date(updatedTime).toISOString() } : {}),
  };
}

/** Conservatively combines persisted progress with a possibly stale full notebook snapshot. */
export function mergeLearningNotebookProgress(currentDocument = {}, incomingNotebook = {}) {
  const current = asObject(currentDocument);
  const incoming = asObject(incomingNotebook);
  return {
    learningState: mergeLearningStates(
      current.learningState ?? current.masteryState ?? current.learningProgress,
      incoming.learningState ?? incoming.masteryState ?? incoming.learningProgress,
    ),
    memoryDecayState: mergeLearningMemoryStates(
      current.memoryDecayState ?? current.learningMemoryState,
      incoming.memoryDecayState ?? incoming.learningMemoryState,
    ),
  };
}

export function learningNotebookRevisionFilter(document = {}) {
  return Object.prototype.hasOwnProperty.call(asObject(document), "updatedAt")
    ? { updatedAt: document.updatedAt }
    : { updatedAt: { $exists: false } };
}

/** Returns a valid revision date that is always later than the persisted revision. */
export function nextLearningNotebookRevisionDate(nowValue, previousValue) {
  const supplied = timeValue(nowValue);
  const previous = timeValue(previousValue);
  const systemNow = Date.now();
  const nextTime = Math.max(
    Number.isFinite(supplied) ? supplied : systemNow,
    Number.isFinite(previous) ? previous + 1 : Number.NEGATIVE_INFINITY,
  );
  return new Date(nextTime);
}
