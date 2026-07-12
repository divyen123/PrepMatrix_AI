export const DEFAULT_GOAL_REMINDER_DATA = Object.freeze({
  goals: [],
  reminders: [],
  todos: [],
});

export const DEFAULT_GOAL_REMINDER_SETTINGS = Object.freeze({
  dailyStudyTarget: 4,
  weeklyReviewTarget: "2",
  nudgeEnabled: true,
  repeatSeconds: 20,
  showCompleted: true,
});

function normalizeObjectList(value, limit) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object" && !Array.isArray(item))
    .slice(0, limit)
    .map((item) => ({ ...item }));
}

export function normalizeGoalReminderData(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    goals: normalizeObjectList(source.goals, 250),
    reminders: normalizeObjectList(source.reminders, 500),
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
  const weeklyReviewTarget = ["1", "2", "3", "daily"].includes(String(source.weeklyReviewTarget))
    ? String(source.weeklyReviewTarget)
    : "2";

  return {
    dailyStudyTarget,
    weeklyReviewTarget,
    nudgeEnabled: source.nudgeEnabled !== false,
    repeatSeconds,
    showCompleted: source.showCompleted !== false,
  };
}
