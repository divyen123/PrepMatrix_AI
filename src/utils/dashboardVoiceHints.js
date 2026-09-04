export const DASHBOARD_VOICE_HINT_DURATION_MS = 5000;
export const DASHBOARD_VOICE_HINT_REENTRY_GAP_MS = 5 * 60 * 1000;
export const DASHBOARD_VOICE_HINT_STORAGE_KEY = "prepmatrix_dashboard_voice_hint_index";

export const DASHBOARD_VOICE_HINTS = Object.freeze([
  "Hey PrepMatrix, can you plan a roadmap for today’s schedule?",
  "Hey PrepMatrix, what’s on my plan today?",
  "Hey PrepMatrix, what should I study next?",
  "Hey PrepMatrix, how am I progressing this week?",
  "Hey PrepMatrix, which subject needs more focus?",
  "Hey PrepMatrix, break my next task into small steps.",
  "Hey PrepMatrix, create a focused study plan for this evening.",
  "Hey PrepMatrix, help me revise what I learned today.",
  "Hey PrepMatrix, explain a difficult topic in simple words.",
  "Hey PrepMatrix, quiz me on something I studied today.",
]);

function getDefaultStorage() {
  try {
    return typeof globalThis !== "undefined" ? globalThis.localStorage : null;
  } catch {
    return null;
  }
}

function readLastHintIndex(storage) {
  if (!storage?.getItem) return -1;

  try {
    const parsedIndex = Number.parseInt(
      storage.getItem(DASHBOARD_VOICE_HINT_STORAGE_KEY) || "",
      10,
    );
    return Number.isInteger(parsedIndex)
      && parsedIndex >= 0
      && parsedIndex < DASHBOARD_VOICE_HINTS.length
      ? parsedIndex
      : -1;
  } catch {
    return -1;
  }
}

export function getNextDashboardVoiceHint(storage) {
  const targetStorage = storage === undefined ? getDefaultStorage() : storage;
  const nextIndex = (readLastHintIndex(targetStorage) + 1) % DASHBOARD_VOICE_HINTS.length;

  try {
    targetStorage?.setItem?.(DASHBOARD_VOICE_HINT_STORAGE_KEY, String(nextIndex));
  } catch {
    // The hint can still be shown when browser privacy settings block local storage.
  }

  return DASHBOARD_VOICE_HINTS[nextIndex];
}

export function hasDashboardVoiceHintReentryGapElapsed(hiddenAt, visibleAt = Date.now()) {
  return Number.isFinite(hiddenAt)
    && Number.isFinite(visibleAt)
    && visibleAt >= hiddenAt
    && visibleAt - hiddenAt >= DASHBOARD_VOICE_HINT_REENTRY_GAP_MS;
}
