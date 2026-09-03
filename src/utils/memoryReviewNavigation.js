export const MEMORY_REVIEW_ROUTE = "/planner/recall";
export const MEMORY_REVIEW_TASK_QUERY_PARAM = "memoryTaskId";
export const MEMORY_REVIEW_UNIT_QUERY_PARAM = "memoryUnitKey";

function cleanTaskId(value) {
  const taskId = String(value ?? "")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 220)
    .replace(/^memory-decay-/u, "memory-review-");

  return /^[a-zA-Z0-9._:-]{1,220}$/u.test(taskId) ? taskId : "";
}

/** Normalizes legacy memory-decay IDs to the current Planner task contract. */
export function normalizeMemoryReviewTaskId(value) {
  return cleanTaskId(value);
}

/** Normalizes the occurrence-level key used when a legacy task has no stable ID. */
export function normalizeMemoryReviewUnitKey(value) {
  const unitKey = String(value ?? "")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 520)
    .replace(/^memory-decay:/u, "memory-review:");

  return /^[a-zA-Z0-9._:-]{1,520}$/u.test(unitKey) ? unitKey : "";
}

/** Builds the canonical route for opening one exact scheduled memory check. */
export function buildMemoryReviewRoute(taskValue = {}) {
  const taskId = normalizeMemoryReviewTaskId(
    typeof taskValue === "string" ? taskValue : taskValue?.id,
  );
  const unitKey = normalizeMemoryReviewUnitKey(
    typeof taskValue === "string" ? "" : taskValue?.unitKey,
  );
  if (!taskId && !unitKey) return MEMORY_REVIEW_ROUTE;

  const params = new URLSearchParams();
  if (taskId) params.set(MEMORY_REVIEW_TASK_QUERY_PARAM, taskId);
  if (unitKey) params.set(MEMORY_REVIEW_UNIT_QUERY_PARAM, unitKey);
  return `${MEMORY_REVIEW_ROUTE}?${params.toString()}`;
}

/** Reads an exact memory-check request from a URL search string or location. */
export function parseMemoryReviewRoute(value = "") {
  const source = value && typeof value === "object" ? value.search : value;
  const text = String(source ?? "");
  let params;

  try {
    params = text.startsWith("?")
      ? new URLSearchParams(text)
      : new URL(text || MEMORY_REVIEW_ROUTE, "https://prepmatrix.local").searchParams;
  } catch {
    params = new URLSearchParams();
  }

  const taskId = normalizeMemoryReviewTaskId(
    params.get(MEMORY_REVIEW_TASK_QUERY_PARAM),
  );
  const unitKey = normalizeMemoryReviewUnitKey(
    params.get(MEMORY_REVIEW_UNIT_QUERY_PARAM),
  );
  return {
    requested: Boolean(taskId || unitKey),
    taskId,
    unitKey,
  };
}

/** Removes only the one-shot memory-review locator while preserving other query state. */
export function clearMemoryReviewRouteRequest(value = "") {
  const source = value && typeof value === "object" ? value.search : value;
  const params = new URLSearchParams(String(source ?? ""));
  params.delete(MEMORY_REVIEW_TASK_QUERY_PARAM);
  params.delete(MEMORY_REVIEW_UNIT_QUERY_PARAM);
  const search = params.toString();
  return search ? `?${search}` : "";
}
