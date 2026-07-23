export const GOAL_REMINDER_DATA_KEY = "prepmatrix_goal_reminder_center_v1";
export const GOAL_REMINDER_SETTINGS_KEY = "prepmatrix_goal_reminder_settings_v1";
export const GOAL_REMINDER_DATA_EVENT = "prepmatrixGoalReminderDataChange";
export const GOAL_REMINDER_SETTINGS_EVENT = "prepmatrixGoalReminderSettingsChange";
export const OPEN_GOAL_REMINDER_EVENT = "openPrepMatrixGoalReminderCenter";

const DAILY_TARGET_REMINDER_PREFIX = "study-target-daily-";
const REVIEW_TARGET_REMINDER_PREFIX = "study-target-review-";

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
const ONE_DAY_MS = 24 * 60 * 60 * 1_000;

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

function safeIsoDateTime(value) {
  const next = safeText(value, 40);
  if (!next) return '';
  const timestamp = Date.parse(next);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
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
        snoozedUntil: safeIsoDateTime(item.snoozedUntil),
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

export function clearPlannerCollection(value, collection) {
  const plannerData = normalizePlannerData(value);
  if (!["goals", "reminders", "todos"].includes(collection)) return plannerData;
  return {
    ...plannerData,
    [collection]: [],
  };
}

export function normalizePlannerSettings(value) {
  const source = value && typeof value === "object" ? value : {};
  const requestedRepeat = Number.parseInt(source.repeatSeconds, 10);
  const repeatSeconds = [20, 30, 60].includes(requestedRepeat) ? requestedRepeat : 20;
  const requestedSnooze = Number.parseInt(source.snoozeMinutes, 10);
  const snoozeMinutes = SNOOZE_MINUTE_OPTIONS.includes(requestedSnooze) ? requestedSnooze : 10;
  const requestedDailyTarget = Number.parseFloat(source.dailyStudyTarget);
  const dailyStudyTarget = Number.isFinite(requestedDailyTarget)
    ? Math.min(16, Math.max(1, requestedDailyTarget))
    : 4;
  const weeklyReviewTarget = ["1", "2", "3", "daily"].includes(String(source.weeklyReviewTarget)) ? String(source.weeklyReviewTarget) : "2";

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

export function mergeStudyTargetSettings(value, dailyStudyTarget, weeklyReviewTarget) {
  return normalizePlannerSettings({
    ...normalizePlannerSettings(value),
    dailyStudyTarget,
    weeklyReviewTarget,
  });
}

function resolveDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function getLocalReminderTimestamp(reminder) {
  if (!reminder?.date) return null;
  const [year, month, day] = reminder.date.split('-').map(Number);
  const [hour, minute] = (reminder.time || '00:00').split(':').map(Number);
  const scheduled = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (
    scheduled.getFullYear() !== year
    || scheduled.getMonth() !== month - 1
    || scheduled.getDate() !== day
  ) return null;
  return scheduled.getTime();
}

export function getPlannerAttentionSummary(value, now = new Date()) {
  const plannerData = normalizePlannerData(value);
  const current = resolveDate(now);
  if (!current) return { dueGoals: [], staleTodos: [], total: 0 };

  const today = getLocalDateKey(current);
  const nowTimestamp = current.getTime();
  const dueGoals = plannerData.goals.filter((goal) => (
    !goal.completed && Boolean(goal.targetDate) && goal.targetDate <= today
  ));
  const staleTodos = plannerData.todos.filter((todo) => {
    if (todo.completed) return false;
    const createdTimestamp = Date.parse(todo.createdAt);
    return Number.isFinite(createdTimestamp) && nowTimestamp - createdTimestamp >= ONE_DAY_MS;
  });

  return {
    dueGoals,
    staleTodos,
    total: dueGoals.length + staleTodos.length,
  };
}

export function getDueReminders(value, now = new Date()) {
  const plannerData = normalizePlannerData(value);
  const current = resolveDate(now);
  if (!current) return [];
  const nowTimestamp = current.getTime();

  return plannerData.reminders
    .map((reminder) => {
      const scheduledTimestamp = getLocalReminderTimestamp(reminder);
      const snoozedTimestamp = reminder.snoozedUntil ? Date.parse(reminder.snoozedUntil) : null;
      const effectiveTimestamp = scheduledTimestamp === null
        ? null
        : Math.max(scheduledTimestamp, Number.isFinite(snoozedTimestamp) ? snoozedTimestamp : scheduledTimestamp);
      return { effectiveTimestamp, reminder, scheduledTimestamp };
    })
    .filter(({ effectiveTimestamp, reminder }) => (
      !reminder.completed
      && effectiveTimestamp !== null
      && effectiveTimestamp <= nowTimestamp
    ))
    .sort((left, right) => (
      left.effectiveTimestamp - right.effectiveTimestamp
      || left.scheduledTimestamp - right.scheduledTimestamp
      || String(left.reminder.createdAt).localeCompare(String(right.reminder.createdAt))
      || left.reminder.id.localeCompare(right.reminder.id)
    ))
    .map(({ reminder }) => reminder);
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

function addCalendarDays(date, amount) {
  const next = new Date(date);
  next.setHours(12, 0, 0, 0);
  next.setDate(next.getDate() + amount);
  return next;
}

function getWeekDateKeys(date = new Date()) {
  const anchor = new Date(date);
  anchor.setHours(12, 0, 0, 0);
  const monday = addCalendarDays(anchor, -((anchor.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => getLocalDateKey(addCalendarDays(monday, index)));
}

export function getWeeklyReviewTargetCount(value) {
  if (String(value) === "daily") return 7;
  return Math.min(3, Math.max(1, Number.parseInt(value, 10) || 2));
}

export function getTargetReviewDateKeys(settings, date = new Date()) {
  const count = getWeeklyReviewTargetCount(normalizePlannerSettings(settings).weeklyReviewTarget);
  const weekDates = getWeekDateKeys(date);
  const offsets = count === 1
    ? [6]
    : count === 2
      ? [2, 6]
      : count === 3
        ? [1, 3, 6]
        : [0, 1, 2, 3, 4, 5, 6];
  return offsets.map((offset) => weekDates[offset]);
}

function upsertGeneratedReminder(reminders, generated, createdAt) {
  const existingIndex = reminders.findIndex((item) => item.id === generated.id);
  const existing = existingIndex >= 0 ? reminders[existingIndex] : null;
  const next = {
    ...generated,
    completed: Boolean(existing?.completed),
    completedAt: existing?.completedAt || "",
    createdAt: existing?.createdAt || createdAt,
    snoozedUntil: existing?.snoozedUntil || "",
  };
  if (existingIndex >= 0) reminders[existingIndex] = next;
  else reminders.push(next);
}

export function syncStudyTargetReminders(value, settings, date = new Date()) {
  const data = normalizePlannerData(value);
  const normalizedSettings = normalizePlannerSettings(settings);
  const today = getLocalDateKey(date);
  const weekDateSet = new Set(getWeekDateKeys(date));
  const reviewDates = normalizedSettings.targetRemindersEnabled
    ? getTargetReviewDateKeys(normalizedSettings, date)
    : [];
  const reviewDateSet = new Set(reviewDates);

  const reminders = data.reminders.filter((item) => {
    if (item.completed) return true;
    if (item.id.startsWith(DAILY_TARGET_REMINDER_PREFIX)) {
      return normalizedSettings.targetRemindersEnabled || item.date < today;
    }
    if (item.id.startsWith(REVIEW_TARGET_REMINDER_PREFIX) && weekDateSet.has(item.date)) {
      return normalizedSettings.targetRemindersEnabled && reviewDateSet.has(item.date);
    }
    return true;
  });

  if (!normalizedSettings.targetRemindersEnabled) {
    return normalizePlannerData({ ...data, reminders });
  }

  const dailyTarget = normalizedSettings.dailyStudyTarget;
  const dailyTargetLabel = Number.isInteger(dailyTarget) ? String(dailyTarget) : dailyTarget.toFixed(1);
  const createdAt = date.toISOString();
  upsertGeneratedReminder(reminders, {
    id: `${DAILY_TARGET_REMINDER_PREFIX}${today}`,
    title: `Daily study target · ${dailyTargetLabel}h`,
    notes: `Complete ${dailyTargetLabel} focused study hours today. Each completed planner session counts as one focused hour.`,
    date: today,
    time: "18:00",
    priority: "medium",
  }, createdAt);

  const weeklyTarget = getWeeklyReviewTargetCount(normalizedSettings.weeklyReviewTarget);
  reviewDates.forEach((reviewDate, index) => {
    upsertGeneratedReminder(reminders, {
      id: `${REVIEW_TARGET_REMINDER_PREFIX}${reviewDate}`,
      title: weeklyTarget === 7 ? "Daily knowledge review" : `Weekly review · ${index + 1} of ${weeklyTarget}`,
      notes: `Scheduled from your ${weeklyTarget === 7 ? "daily" : `${weeklyTarget}-per-week`} review target. Recall key ideas, check weak areas, and adjust upcoming tasks.`,
      date: reviewDate,
      time: "19:00",
      priority: "medium",
    }, createdAt);
  });

  return normalizePlannerData({ ...data, reminders });
}

function getScheduleDayNumber(scheduleStartDate, date) {
  const start = new Date(scheduleStartDate);
  if (!scheduleStartDate || Number.isNaN(start.getTime())) return null;
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const currentUtc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor((currentUtc - startUtc) / 86400000) + 1;
}

export function calculateStudyTargetPerformance({
  schedule = [],
  completed = [],
  plannerData,
  settings,
  scheduleStartDate,
} = {}, date = new Date()) {
  const normalizedSettings = normalizePlannerSettings(settings);
  const data = normalizePlannerData(plannerData);
  const dayNumber = getScheduleDayNumber(scheduleStartDate, date);
  const daySchedule = Number.isInteger(dayNumber)
    ? schedule.find((item) => Number(item?.day) === dayNumber)
    : null;
  const todayTasks = Array.isArray(daySchedule?.tasks) ? daySchedule.tasks : [];
  const completedSet = new Set(Array.isArray(completed) ? completed : []);
  const completedHours = todayTasks.filter((task) => completedSet.has(String(task?.task || ""))).length;
  const dailyTargetHours = normalizedSettings.dailyStudyTarget;
  const weeklyReviewTarget = getWeeklyReviewTargetCount(normalizedSettings.weeklyReviewTarget);
  const weekDateSet = new Set(getWeekDateKeys(date));
  const completedReviews = data.reminders.filter((item) => (
    item.id.startsWith(REVIEW_TARGET_REMINDER_PREFIX)
    && item.completed
    && weekDateSet.has(item.date)
  )).length;

  return {
    scheduleMapped: Boolean(daySchedule),
    plannedHours: todayTasks.length,
    completedHours,
    dailyTargetHours,
    dailyRemainingHours: Math.max(0, dailyTargetHours - completedHours),
    dailyProgress: Math.min(100, Math.round((completedHours / dailyTargetHours) * 100)),
    completedReviews,
    weeklyReviewTarget,
    weeklyReviewProgress: Math.min(100, Math.round((completedReviews / weeklyReviewTarget) * 100)),
  };
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
