import { getScheduleDateKey, toLocalDateKey } from "./scheduleDates.js";

export const PLANNER_RECHECK_PENDING_FIELD = "recheckPending";

function getTask(schedule, dayIndex, taskIndex) {
  if (!Array.isArray(schedule)) return null;
  const tasks = schedule[dayIndex]?.tasks;
  if (!Array.isArray(tasks)) return null;
  const task = tasks[taskIndex];
  return task && typeof task === "object" ? task : null;
}

function getTaskName(task) {
  if (typeof task?.task !== "string" || !task.task.trim()) return "";
  return task.task;
}

function updateTask(schedule, dayIndex, taskIndex, update) {
  const task = getTask(schedule, dayIndex, taskIndex);
  if (!task || typeof update !== "function") return schedule;

  const nextTask = update(task);
  if (!nextTask || nextTask === task) return schedule;

  return schedule.map((day, currentDayIndex) => {
    if (currentDayIndex !== dayIndex) return day;
    return {
      ...day,
      tasks: day.tasks.map((candidate, currentTaskIndex) => (
        currentTaskIndex === taskIndex ? nextTask : candidate
      )),
    };
  });
}

export function isPlannerTaskCompleted(task, completed = []) {
  const taskName = getTaskName(task);
  return Boolean(taskName && Array.isArray(completed) && completed.includes(taskName));
}

export function isPlannerTaskRecheckPending(task) {
  return task?.[PLANNER_RECHECK_PENDING_FIELD] === true;
}

export function isPlannerTaskPending(task, completed = []) {
  return !isPlannerTaskCompleted(task, completed) || isPlannerTaskRecheckPending(task);
}

export function isPlannerDayCompleted(day, completed = []) {
  const tasks = Array.isArray(day?.tasks)
    ? day.tasks.filter((task) => getTaskName(task))
    : [];
  return tasks.length > 0 && tasks.every((task) => isPlannerTaskCompleted(task, completed));
}

/**
 * The complete plan remains visible, but dated days unlock only when their
 * local calendar date arrives. Day 1 is intentionally available immediately,
 * including schedules generated after the evening cutoff for the next day.
 */
export function getPlannerDayAvailability(
  day,
  dayIndex = 0,
  scheduleStartDate = "",
  today = new Date(),
) {
  const safeDayIndex = Math.max(0, Number.parseInt(dayIndex, 10) || 0);
  const dateKey = getScheduleDateKey(day, safeDayIndex, scheduleStartDate);
  const todayKey = toLocalDateKey(today);
  const isFirstDay = safeDayIndex === 0;
  const hasUsableDate = Boolean(dateKey && todayKey);
  const isUnlocked = isFirstDay || (hasUsableDate && dateKey <= todayKey);

  return {
    dateKey,
    isFirstDay,
    isLocked: !isUnlocked,
    isUnlocked,
  };
}

export function reopenPlannerTask(schedule, completed, dayIndex, taskIndex) {
  const task = getTask(schedule, dayIndex, taskIndex);
  if (
    !isPlannerTaskCompleted(task, completed)
    || isPlannerTaskRecheckPending(task)
  ) {
    return schedule;
  }

  return updateTask(schedule, dayIndex, taskIndex, (currentTask) => ({
    ...currentTask,
    [PLANNER_RECHECK_PENDING_FIELD]: true,
  }));
}

/**
 * Completes a task without ever removing historical completion. A repeated
 * completion only clears its per-occurrence recheck flag, keeping analytics
 * and eligibility counts stable and preventing duplicate completion entries.
 */
export function completePlannerTask(schedule, completed, dayIndex, taskIndex) {
  const safeCompleted = Array.isArray(completed) ? completed : [];
  const task = getTask(schedule, dayIndex, taskIndex);
  const taskName = getTaskName(task);

  if (!taskName) {
    return { completed: safeCompleted, schedule };
  }

  if (isPlannerTaskRecheckPending(task)) {
    const nextSchedule = updateTask(schedule, dayIndex, taskIndex, (currentTask) => {
      const nextTask = { ...currentTask };
      delete nextTask[PLANNER_RECHECK_PENDING_FIELD];
      return nextTask;
    });

    return { completed: safeCompleted, schedule: nextSchedule };
  }

  if (safeCompleted.includes(taskName)) {
    return { completed: safeCompleted, schedule };
  }

  return {
    completed: [...safeCompleted, taskName],
    schedule,
  };
}

export function clearPlannerScheduleState(state = {}) {
  return {
    ...state,
    completed: [],
    schedule: [],
    scheduleStartDate: null,
  };
}
