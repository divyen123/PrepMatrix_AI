import { isPlannerTaskCompleted, isPlannerTaskRecheckPending } from "./plannerScheduleProgress.js";
import { addDaysToDateKey, getScheduleDateKey, toLocalDateKey } from "./scheduleDates.js";

function getScheduledTasks(day) {
  return Array.isArray(day?.tasks)
    ? day.tasks.filter((task) => typeof task?.task === "string" && task.task.trim())
    : [];
}

export function getStudyMomentumDailyMetrics({
  schedule = [],
  completed = [],
  scheduleStartDate = "",
  today = new Date(),
} = {}) {
  const todayKey = toLocalDateKey(today);
  const completedByDate = new Map();
  let todayTotal = 0;
  let todayCompleted = 0;

  if (!todayKey) return { todayCompleted, todayTotal, todayProgress: 0, streak: 0 };

  (Array.isArray(schedule) ? schedule : []).forEach((day, index) => {
    const dateKey = getScheduleDateKey(day, index, scheduleStartDate);
    if (!dateKey || dateKey > todayKey) return;

    const tasks = getScheduledTasks(day);
    if (tasks.length === 0) return;
    const doneCount = tasks.filter((task) => (
      isPlannerTaskCompleted(task, completed) && !isPlannerTaskRecheckPending(task)
    )).length;

    if (dateKey === todayKey) {
      todayTotal += tasks.length;
      todayCompleted += doneCount;
    }
    completedByDate.set(dateKey, completedByDate.get(dateKey) || doneCount > 0);
  });

  const yesterdayKey = addDaysToDateKey(todayKey, -1);
  let streakDate = completedByDate.get(todayKey)
    ? todayKey
    : completedByDate.get(yesterdayKey) ? yesterdayKey : "";
  let streak = 0;
  while (streakDate && completedByDate.get(streakDate)) {
    streak += 1;
    streakDate = addDaysToDateKey(streakDate, -1);
  }

  return {
    todayCompleted,
    todayTotal,
    todayProgress: todayTotal === 0 ? 0 : Math.round((todayCompleted / todayTotal) * 100),
    streak,
  };
}
