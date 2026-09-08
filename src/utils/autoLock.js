export const AUTO_LOCK_ENABLED_STORAGE_KEY = "prepmatrix_auto_lock_enabled";
export const AUTO_LOCK_MINUTES_STORAGE_KEY = "prepmatrix_auto_lock_minutes";
export const AUTO_LOCK_DEFAULT_MINUTES = 5;
export const AUTO_LOCK_MIN_MINUTES = 2;
export const AUTO_LOCK_MAX_MINUTES = 1_440;
export const AUTO_LOCK_ACTIVITY_EVENTS = Object.freeze([
  "keydown",
  "pointerdown",
  "pointermove",
  "touchstart",
  "wheel",
]);

const MAX_TIMER_DELAY_MS = 2_147_000_000;
const ACTIVITY_LISTENER_OPTIONS = Object.freeze({ capture: true, passive: true });

function numericMinutes(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeAutoLockMinutes(value, fallback = AUTO_LOCK_DEFAULT_MINUTES) {
  const fallbackMinutes = numericMinutes(fallback) ?? AUTO_LOCK_DEFAULT_MINUTES;
  const minutes = numericMinutes(value) ?? fallbackMinutes;
  return Math.min(
    AUTO_LOCK_MAX_MINUTES,
    Math.max(AUTO_LOCK_MIN_MINUTES, Math.round(minutes)),
  );
}

export function normalizeAutoLockPreferences(preferences = {}) {
  return {
    enabled: preferences.enabled === true || preferences.enabled === "true",
    minutes: normalizeAutoLockMinutes(preferences.minutes),
  };
}

function resolveStorage(storage) {
  if (storage !== undefined) return storage;
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function readAutoLockPreferences(storage) {
  const storageObject = resolveStorage(storage);
  if (!storageObject?.getItem) return normalizeAutoLockPreferences();

  try {
    return normalizeAutoLockPreferences({
      enabled: storageObject.getItem(AUTO_LOCK_ENABLED_STORAGE_KEY),
      minutes: storageObject.getItem(AUTO_LOCK_MINUTES_STORAGE_KEY),
    });
  } catch {
    return normalizeAutoLockPreferences();
  }
}

export function writeAutoLockPreferences(preferences, storage) {
  const normalized = normalizeAutoLockPreferences(preferences);
  const storageObject = resolveStorage(storage);
  if (!storageObject?.setItem) return normalized;

  try {
    storageObject.setItem(AUTO_LOCK_ENABLED_STORAGE_KEY, String(normalized.enabled));
    storageObject.setItem(AUTO_LOCK_MINUTES_STORAGE_KEY, String(normalized.minutes));
  } catch {
    // The live preference remains active when browser privacy settings block storage.
  }
  return normalized;
}

function timestamp(value) {
  const parsed = value instanceof Date ? value.getTime() : Number(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

/**
 * Subscribes to app activity and invokes `onLock` once the inactivity deadline
 * expires. Activity only updates the deadline, so high-frequency pointer moves
 * do not repeatedly allocate timers. Foreground checks recover from suspended
 * or throttled background tabs.
 */
export function subscribeToAutoLock(onLock, options = {}) {
  if (typeof onLock !== "function" || options.enabled === false) return () => {};

  const windowObject = options.windowObject ?? globalThis.window;
  const documentObject = options.documentObject ?? globalThis.document;
  const now = typeof options.now === "function" ? options.now : () => Date.now();
  const setTimer = options.setTimeout ?? globalThis.setTimeout;
  const clearTimer = options.clearTimeout ?? globalThis.clearTimeout;
  if (typeof setTimer !== "function") return () => {};

  const timeoutMs = normalizeAutoLockMinutes(options.minutes) * 60_000;
  let deadline = timestamp(now()) + timeoutMs;
  let timeoutId;
  let disposed = false;
  let locked = false;

  const clearCurrentTimer = () => {
    if (timeoutId === undefined || typeof clearTimer !== "function") return;
    clearTimer(timeoutId);
    timeoutId = undefined;
  };

  const expireIfDue = () => {
    if (disposed || locked || timestamp(now()) < deadline) return false;
    locked = true;
    clearCurrentTimer();
    onLock();
    return true;
  };

  const armTimer = () => {
    if (disposed || locked) return;
    clearCurrentTimer();
    const remaining = Math.max(0, deadline - timestamp(now()));
    timeoutId = setTimer(() => {
      timeoutId = undefined;
      if (!expireIfDue()) armTimer();
    }, Math.min(remaining, MAX_TIMER_DELAY_MS));
  };

  const recordActivity = () => {
    if (disposed || locked || documentObject?.visibilityState === "hidden") return;
    const observedAt = timestamp(now());
    if (observedAt >= deadline) {
      expireIfDue();
      return;
    }
    deadline = observedAt + timeoutMs;
  };

  const checkFromForeground = () => {
    if (disposed || locked || documentObject?.visibilityState === "hidden") return;
    if (!expireIfDue()) recordActivity();
  };

  const handleVisibilityChange = () => {
    if (!documentObject || documentObject.visibilityState === "visible") {
      checkFromForeground();
    }
  };

  const handleVoiceActivity = (event) => {
    if (event?.detail?.isRecording === true) recordActivity();
  };

  for (const eventName of AUTO_LOCK_ACTIVITY_EVENTS) {
    documentObject?.addEventListener?.(
      eventName,
      recordActivity,
      ACTIVITY_LISTENER_OPTIONS,
    );
  }
  documentObject?.addEventListener?.("visibilitychange", handleVisibilityChange);
  windowObject?.addEventListener?.("focus", checkFromForeground);
  windowObject?.addEventListener?.("pageshow", checkFromForeground);
  windowObject?.addEventListener?.("voiceRecordingChange", handleVoiceActivity);
  armTimer();

  return () => {
    disposed = true;
    clearCurrentTimer();
    for (const eventName of AUTO_LOCK_ACTIVITY_EVENTS) {
      documentObject?.removeEventListener?.(
        eventName,
        recordActivity,
        ACTIVITY_LISTENER_OPTIONS,
      );
    }
    documentObject?.removeEventListener?.("visibilitychange", handleVisibilityChange);
    windowObject?.removeEventListener?.("focus", checkFromForeground);
    windowObject?.removeEventListener?.("pageshow", checkFromForeground);
    windowObject?.removeEventListener?.("voiceRecordingChange", handleVoiceActivity);
  };
}
