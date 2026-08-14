import { toLocalDateKey } from "./scheduleDates.js";

export const LOCAL_DATE_REFRESH_GRACE_MS = 1_000;
export const MAX_LOCAL_DATE_REFRESH_DELAY_MS = 2_147_000_000;

function asDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isFinite(date.getTime()) ? date : new Date();
}

/** Calculates a bounded one-shot refresh delay to just after the next local midnight. */
export function getNextLocalDateRefreshDelay(value = new Date()) {
  const now = asDate(value);
  const nextMidnight = new Date(now.getTime());
  nextMidnight.setHours(24, 0, 0, 0);
  return Math.min(
    MAX_LOCAL_DATE_REFRESH_DELAY_MS,
    Math.max(LOCAL_DATE_REFRESH_GRACE_MS, (
      nextMidnight.getTime() - now.getTime() + LOCAL_DATE_REFRESH_GRACE_MS
    )),
  );
}

/**
 * Installs one bounded midnight timeout plus focus/visibility refreshes. The
 * timeout re-arms only after firing; background tabs need no polling interval.
 */
export function subscribeToLocalDateChanges(listener, options = {}) {
  if (typeof listener !== "function") return () => {};
  const windowObject = options.windowObject ?? globalThis.window;
  const documentObject = options.documentObject ?? globalThis.document;
  const now = typeof options.now === "function" ? options.now : () => new Date();
  const setTimer = options.setTimeout ?? globalThis.setTimeout;
  const clearTimer = options.clearTimeout ?? globalThis.clearTimeout;
  let lastDateKey = toLocalDateKey(now());
  let timeoutId;
  let disposed = false;

  const refresh = () => {
    if (disposed) return;
    const date = now();
    const dateKey = toLocalDateKey(date);
    if (dateKey && dateKey !== lastDateKey) {
      lastDateKey = dateKey;
      listener(date);
    }
  };

  const armMidnight = () => {
    if (disposed || typeof setTimer !== "function") return;
    if (timeoutId !== undefined && typeof clearTimer === "function") clearTimer(timeoutId);
    const date = now();
    timeoutId = setTimer(() => {
      timeoutId = undefined;
      refresh();
      armMidnight();
    }, getNextLocalDateRefreshDelay(date));
  };
  const onFocus = () => refresh();
  const onVisibilityChange = () => {
    if (!documentObject || documentObject.visibilityState === "visible") refresh();
  };

  windowObject?.addEventListener?.("focus", onFocus);
  documentObject?.addEventListener?.("visibilitychange", onVisibilityChange);
  armMidnight();

  return () => {
    disposed = true;
    if (timeoutId !== undefined && typeof clearTimer === "function") clearTimer(timeoutId);
    windowObject?.removeEventListener?.("focus", onFocus);
    documentObject?.removeEventListener?.("visibilitychange", onVisibilityChange);
  };
}
