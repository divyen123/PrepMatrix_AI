export const GOAL_REMINDER_DATA_KEY = "prepmatrix_goal_reminder_center_v1";
export const GOAL_REMINDER_SETTINGS_KEY = "prepmatrix_goal_reminder_settings_v1";
export const GOAL_REMINDER_DATA_EVENT = "prepmatrixGoalReminderDataChange";
export const GOAL_REMINDER_SETTINGS_EVENT = "prepmatrixGoalReminderSettingsChange";
export const OPEN_GOAL_REMINDER_EVENT = "openPrepMatrixGoalReminderCenter";

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

function safeText(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function safeDateKey(value) {
  const next = safeText(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(next) ? next : "";
}

function safeTime(value) {
  const next = safeText(value, 5);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(next) ? next : "";
}

function safePriority(value) {
  return ["low", "medium", "high"].includes(value) ? value : "medium";
}

function safeCategory(value) {
  return ["study", "exam", "project", "personal"].includes(value) ? value : "study";
}

function safeId(value, prefix) {
  const next = safeText(value, 120);
  return next || createPlannerId(prefix);
}

function resolveStorage(storage) {
  if (storage) return storage;
  if (typeof window !== "undefined") return window.localStorage;
  return null;
}

function emitPlannerEvent(eventName, detail, eventTarget) {
  const target = eventTarget || (typeof window !== "undefined" ? window : null);
  if (!target?.dispatchEvent || typeof CustomEvent === "undefined") return;
  target.dispatchEvent(new CustomEvent(eventName, { detail }));
}

export function createPlannerId(prefix = "item") {
  const randomId = globalThis.crypto?.randomUUID?.();
  if (randomId) return `${prefix}-${randomId}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getTomorrowDateKey(date = new Date()) {
  const tomorrow = new Date(date);
  tomorrow.setHours(12, 0, 0, 0);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return getLocalDateKey(tomorrow);
}

export function normalizePlannerData(value) {
  const source = value && typeof value === "object" ? value : {};
  const goals = Array.isArray(source.goals)
    ? source.goals
      .filter((item) => item && safeText(item.title, 120))
      .map((item) => ({
        id: safeId(item.id, "goal"),
        title: safeText(item.title, 120),
        notes: safeText(item.notes, 800),
        targetDate: safeDateKey(item.targetDate),
        priority: safePriority(item.priority),
        category: safeCategory(item.category),
        completed: Boolean(item.completed),
        completedAt: safeText(item.completedAt, 40),
        createdAt: safeText(item.createdAt, 40) || new Date().toISOString(),
        postponedCount: Math.max(0, Number.parseInt(item.postponedCount, 10) || 0),
      }))
    : [];

  const reminders = Array.isArray(source.reminders)
    ? source.reminders
      .filter((item) => item && safeText(item.title, 120))
      .map((item) => ({
        id: safeId(item.id, "reminder"),
        title: safeText(item.title, 120),
        notes: safeText(item.notes, 800),
        date: safeDateKey(item.date),
        time: safeTime(item.time),
        priority: safePriority(item.priority),
        completed: Boolean(item.completed),
        completedAt: safeText(item.completedAt, 40),
        createdAt: safeText(item.createdAt, 40) || new Date().toISOString(),
      }))
    : [];

  const todos = Array.isArray(source.todos)
    ? source.todos
      .filter((item) => item && safeText(item.title, 160))
      .map((item) => ({
        id: safeId(item.id, "todo"),
        title: safeText(item.title, 160),
        completed: Boolean(item.completed),
        createdAt: safeText(item.createdAt, 40) || new Date().toISOString(),
      }))
    : [];

  return { goals, reminders, todos };
}

export function normalizePlannerSettings(value) {
  const source = value && typeof value === "object" ? value : {};
  const requestedRepeat = Number.parseInt(source.repeatSeconds, 10);
  const repeatSeconds = [20, 30, 60].includes(requestedRepeat) ? requestedRepeat : 20;
  const requestedDailyTarget = Number.parseFloat(source.dailyStudyTarget);
  const dailyStudyTarget = Number.isFinite(requestedDailyTarget)
    ? Math.min(16, Math.max(1, requestedDailyTarget))
    : 4;
  const weeklyReviewTarget = ["1", "2", "3", "daily"].includes(String(source.weeklyReviewTarget)) ? String(source.weeklyReviewTarget) : "2";

  return {
    dailyStudyTarget,
    weeklyReviewTarget,
    nudgeEnabled: source.nudgeEnabled !== false,
    repeatSeconds,
    showCompleted: source.showCompleted !== false,
  };
}

export function readPlannerData(storage) {
  const target = resolveStorage(storage);
  if (!target) return normalizePlannerData(DEFAULT_GOAL_REMINDER_DATA);

  try {
    return normalizePlannerData(JSON.parse(target.getItem(GOAL_REMINDER_DATA_KEY) || "{}"));
  } catch {
    return normalizePlannerData(DEFAULT_GOAL_REMINDER_DATA);
  }
}

export function writePlannerData(value, storage, eventTarget) {
  const next = normalizePlannerData(value);
  const target = resolveStorage(storage);
  target?.setItem(GOAL_REMINDER_DATA_KEY, JSON.stringify(next));
  emitPlannerEvent(GOAL_REMINDER_DATA_EVENT, next, eventTarget);
  return next;
}

export function readPlannerSettings(storage) {
  const target = resolveStorage(storage);
  if (!target) return normalizePlannerSettings(DEFAULT_GOAL_REMINDER_SETTINGS);

  try {
    return normalizePlannerSettings(JSON.parse(target.getItem(GOAL_REMINDER_SETTINGS_KEY) || "{}"));
  } catch {
    return normalizePlannerSettings(DEFAULT_GOAL_REMINDER_SETTINGS);
  }
}

export function writePlannerSettings(value, storage, eventTarget) {
  const next = normalizePlannerSettings(value);
  const target = resolveStorage(storage);
  target?.setItem(GOAL_REMINDER_SETTINGS_KEY, JSON.stringify(next));
  emitPlannerEvent(GOAL_REMINDER_SETTINGS_EVENT, next, eventTarget);
  return next;
}

export function openGoalReminderCenter(eventTarget) {
  const target = eventTarget || (typeof window !== "undefined" ? window : null);
  if (!target?.dispatchEvent || typeof CustomEvent === "undefined") return;
  target.dispatchEvent(new CustomEvent(OPEN_GOAL_REMINDER_EVENT));
}

export function postponeGoalToTomorrow(goal, date = new Date()) {
  return {
    ...goal,
    completed: false,
    completedAt: "",
    targetDate: getTomorrowDateKey(date),
    postponedCount: (Number.parseInt(goal?.postponedCount, 10) || 0) + 1,
  };
}

export function summarizePlannerData(value, today = getLocalDateKey()) {
  const data = normalizePlannerData(value);
  return {
    activeGoals: data.goals.filter((item) => !item.completed).length,
    completedGoals: data.goals.filter((item) => item.completed).length,
    todayReminders: data.reminders.filter((item) => !item.completed && item.date === today).length,
    activeReminders: data.reminders.filter((item) => !item.completed).length,
    openTodos: data.todos.filter((item) => !item.completed).length,
  };
}
