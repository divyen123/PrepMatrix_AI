export const DEFAULT_GOAL_REMINDER_DATA = Object.freeze({
  goals: [],
  reminders: [],
  todos: [],
});

export const DEFAULT_GOAL_REMINDER_SETTINGS = Object.freeze({
  dailyStudyTarget: 4,
  weeklyReviewTarget: "2",
  targetRemindersEnabled: false,
  nudgeEnabled: true,
  repeatSeconds: 20,
  snoozeMinutes: 10,
  showCompleted: true,
});

const SNOOZE_MINUTE_OPTIONS = Object.freeze([5, 10, 15, 30, 60]);

function normalizeObjectList(value, limit) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object" && !Array.isArray(item))
    .slice(0, limit)
    .map((item) => ({ ...item }));
}

function normalizeSnoozedUntil(value) {
  const timestamp = Date.parse(String(value || '').trim());
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
}

function normalizeReminder(item) {
  const snoozedUntil = normalizeSnoozedUntil(item.snoozedUntil);
  if (snoozedUntil) return { ...item, snoozedUntil };
  const { snoozedUntil: _invalidSnooze, ...reminder } = item;
  return reminder;
}

export function normalizeGoalReminderData(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    goals: normalizeObjectList(source.goals, 250),
    reminders: normalizeObjectList(source.reminders, 500).map(normalizeReminder),
    todos: normalizeObjectList(source.todos, 500),
  };
}

export function normalizeGoalReminderSettings(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const requestedDailyTarget = Number.parseFloat(source.dailyStudyTarget);
  const dailyStudyTarget = Number.isFinite(requestedDailyTarget)
    ? Math.min(16, Math.max(1, requestedDailyTarget))
    : 4;
  const requestedRepeat = Number.parseInt(source.repeatSeconds, 10);
  const repeatSeconds = [20, 30, 60].includes(requestedRepeat) ? requestedRepeat : 20;
  const requestedSnooze = Number.parseInt(source.snoozeMinutes, 10);
  const snoozeMinutes = SNOOZE_MINUTE_OPTIONS.includes(requestedSnooze) ? requestedSnooze : 10;
  const weeklyReviewTarget = ["1", "2", "3", "daily"].includes(String(source.weeklyReviewTarget))
    ? String(source.weeklyReviewTarget)
    : "2";

  return {
    dailyStudyTarget,
    weeklyReviewTarget,
    targetRemindersEnabled: source.targetRemindersEnabled === true,
    nudgeEnabled: source.nudgeEnabled !== false,
    repeatSeconds,
    snoozeMinutes,
    showCompleted: source.showCompleted !== false,
  };
}
