export const MINIMUM_EXAM_SUBMIT_MINUTES = 15;
export const MINIMUM_EXAM_SUBMIT_MS = MINIMUM_EXAM_SUBMIT_MINUTES * 60 * 1000;

function validTimestamp(value) {
  if (value === null || value === undefined || value === "") return null;
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function getExamMinimumSubmitAt(attempt = {}) {
  const explicit = validTimestamp(attempt.minimumSubmitAt || attempt.submitAvailableAt);
  const startedAt = validTimestamp(attempt.startedAt || attempt.createdAt);
  const derived = startedAt === null ? null : startedAt + MINIMUM_EXAM_SUBMIT_MS;
  const candidates = [explicit, derived].filter((timestamp) => timestamp !== null);
  return candidates.length ? Math.max(...candidates) : null;
}

export function getExamMinimumSubmitRemainingSeconds(attempt = {}, now = Date.now()) {
  const minimumSubmitAt = getExamMinimumSubmitAt(attempt);
  const nowTimestamp = validTimestamp(now) ?? Date.now();
  if (minimumSubmitAt === null) return 0;
  return Math.max(0, Math.ceil((minimumSubmitAt - nowTimestamp) / 1000));
}

export function canManuallySubmitExam(attempt = {}, now = Date.now()) {
  const minimumSubmitAt = getExamMinimumSubmitAt(attempt);
  if (minimumSubmitAt === null) return false;
  const nowTimestamp = validTimestamp(now) ?? Date.now();
  return nowTimestamp >= minimumSubmitAt;
}
