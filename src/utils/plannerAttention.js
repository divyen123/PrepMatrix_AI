import { isPlannerTaskPending } from "./plannerScheduleProgress.js";
import { getScheduleDateKey, toLocalDateKey } from "./scheduleDates.js";

export const PLANNER_ATTENTION_START_HOUR = 19;
export const PLANNER_ATTENTION_REFRESH_GRACE_MS = 1_000;
export const MAX_PLANNER_ATTENTION_REFRESH_DELAY_MS = 2_147_000_000;

function asValidDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function normalizeStartHour(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed)
    ? Math.min(23, Math.max(0, parsed))
    : PLANNER_ATTENTION_START_HOUR;
}

function studyTasks(day) {
  return Array.isArray(day?.tasks)
    ? day.tasks.filter((task) => (
      task
      && typeof task === "object"
      && typeof task.task === "string"
      && task.task.trim()
    ))
    : [];
}

function inactiveAttention({
  dateKey = "",
  isAfterThreshold = false,
  thresholdHour = PLANNER_ATTENTION_START_HOUR,
} = {}) {
  return {
    active: false,
    dateKey,
    dayIndex: -1,
    isAfterThreshold,
    pendingCount: 0,
    thresholdHour,
    totalCount: 0,
  };
}

/**
 * Derives the evening attention state for the schedule assigned to the
 * browser's current local calendar date. Date-only schedule values stay
 * date-only, avoiding UTC parsing shifts.
 */
export function getPlannerScheduleAttention({
  schedule = [],
  completed = [],
  scheduleStartDate = "",
  now = new Date(),
  thresholdHour = PLANNER_ATTENTION_START_HOUR,
} = {}) {
  const observedAt = asValidDate(now);
  const safeThresholdHour = normalizeStartHour(thresholdHour);
  if (!observedAt) return inactiveAttention({ thresholdHour: safeThresholdHour });

  const dateKey = toLocalDateKey(observedAt);
  const isAfterThreshold = observedAt.getHours() >= safeThresholdHour;
  if (!dateKey || !Array.isArray(schedule) || schedule.length === 0) {
    return inactiveAttention({ dateKey, isAfterThreshold, thresholdHour: safeThresholdHour });
  }

  const dayIndex = schedule.findIndex((day, index) => (
    getScheduleDateKey(day, index, scheduleStartDate) === dateKey
  ));
  if (dayIndex < 0) {
    return inactiveAttention({ dateKey, isAfterThreshold, thresholdHour: safeThresholdHour });
  }

  const tasks = studyTasks(schedule[dayIndex]);
  const pendingCount = tasks.filter((task) => isPlannerTaskPending(task, completed)).length;

  return {
    active: isAfterThreshold && pendingCount > 0,
    dateKey,
    dayIndex,
    isAfterThreshold,
    pendingCount,
    thresholdHour: safeThresholdHour,
    totalCount: tasks.length,
  };
}

/** Returns a bounded delay to just after today's threshold or local midnight. */
export function getNextPlannerAttentionRefreshDelay(
  value = new Date(),
  thresholdHour = PLANNER_ATTENTION_START_HOUR,
) {
  const now = asValidDate(value) || new Date();
  const safeThresholdHour = normalizeStartHour(thresholdHour);
  const nextBoundary = new Date(now.getTime());

  if (now.getHours() < safeThresholdHour) {
    nextBoundary.setHours(safeThresholdHour, 0, 0, 0);
  } else {
    nextBoundary.setHours(24, 0, 0, 0);
  }

  return Math.min(
    MAX_PLANNER_ATTENTION_REFRESH_DELAY_MS,
    Math.max(
      PLANNER_ATTENTION_REFRESH_GRACE_MS,
      nextBoundary.getTime() - now.getTime() + PLANNER_ATTENTION_REFRESH_GRACE_MS,
    ),
  );
}

function attentionClockKey(value, thresholdHour) {
  const date = asValidDate(value);
  if (!date) return "";
  return `${toLocalDateKey(date)}:${date.getHours() >= thresholdHour ? "after" : "before"}`;
}

/**
 * Refreshes at the only two boundaries that can change Planner attention:
 * the evening threshold and local midnight. Focus and visibility listeners
 * recover accurately after a browser suspends background timers.
 */
export function subscribeToPlannerAttentionClock(listener, options = {}) {
  if (typeof listener !== "function") return () => {};

  const windowObject = options.windowObject ?? globalThis.window;
  const documentObject = options.documentObject ?? globalThis.document;
  const now = typeof options.now === "function" ? options.now : () => new Date();
  const setTimer = options.setTimeout ?? globalThis.setTimeout;
  const clearTimer = options.clearTimeout ?? globalThis.clearTimeout;
  const thresholdHour = normalizeStartHour(options.thresholdHour);
  let lastClockKey = attentionClockKey(now(), thresholdHour);
  let timeoutId;
  let disposed = false;

  const refresh = () => {
    if (disposed) return;
    const observedAt = asValidDate(now());
    if (!observedAt) return;
    const nextClockKey = attentionClockKey(observedAt, thresholdHour);
    if (!nextClockKey || nextClockKey === lastClockKey) return;
    lastClockKey = nextClockKey;
    listener(observedAt);
  };

  const armBoundary = () => {
    if (disposed || typeof setTimer !== "function") return;
    if (timeoutId !== undefined && typeof clearTimer === "function") clearTimer(timeoutId);
    const observedAt = asValidDate(now()) || new Date();
    timeoutId = setTimer(() => {
      timeoutId = undefined;
      refresh();
      armBoundary();
    }, getNextPlannerAttentionRefreshDelay(observedAt, thresholdHour));
  };

  const refreshFromForeground = () => {
    refresh();
    armBoundary();
  };
  const onVisibilityChange = () => {
    if (!documentObject || documentObject.visibilityState === "visible") {
      refreshFromForeground();
    }
  };

  windowObject?.addEventListener?.("focus", refreshFromForeground);
  documentObject?.addEventListener?.("visibilitychange", onVisibilityChange);
  armBoundary();

  return () => {
    disposed = true;
    if (timeoutId !== undefined && typeof clearTimer === "function") clearTimer(timeoutId);
    windowObject?.removeEventListener?.("focus", refreshFromForeground);
    documentObject?.removeEventListener?.("visibilitychange", onVisibilityChange);
  };
}
