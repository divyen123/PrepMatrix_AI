import { isPlannerMemoryReviewTask, isPlannerTaskPending } from "./plannerScheduleProgress.js";

const list = (value) => Array.isArray(value) ? value : [];
const validDays = (value) => list(value).filter((day) => day && typeof day === "object").map((day) => ({
  ...day,
  tasks: list(day.tasks).filter((task) => task && typeof task === "object"),
}));

export function normalizeMemoryReviewData(value = {}) {
  return { schedule: validDays(value?.schedule), completed: [...list(value?.completed)] };
}

// Older workspaces stored automatic recall reminders inside the study timetable.
// Move them once, keeping their completion, dismissal and recheck records intact.
export function separatePlannerRecall(workspace = {}) {
  const memoryReviewData = normalizeMemoryReviewData(workspace.memoryReviewData);
  const memoryKeys = new Set();
  const schedule = [];
  for (const day of validDays(workspace.schedule)) {
    const recallTasks = day.tasks.filter(isPlannerMemoryReviewTask);
    const studyTasks = day.tasks.filter((task) => !isPlannerMemoryReviewTask(task));
    recallTasks.forEach((task) => {
      [task.task, task.id, String(task.id || "").replace(/^memory-decay-/u, "memory-review-")]
        .filter(Boolean).forEach((key) => memoryKeys.add(key));
    });
    if (recallTasks.length || day.memoryReviewDismissals?.length) {
      const existing = memoryReviewData.schedule.find((entry) => entry.date === day.date && entry.day === day.day);
      if (existing) {
        const keys = new Set(existing.tasks.map((task) => task.id || task.task));
        existing.tasks = [...existing.tasks, ...recallTasks.filter((task) => !keys.has(task.id || task.task))];
        existing.memoryReviewDismissals = [...list(existing.memoryReviewDismissals), ...list(day.memoryReviewDismissals)];
      } else {
        memoryReviewData.schedule.push({ ...day, tasks: recallTasks });
      }
    }
    if (studyTasks.length || (!recallTasks.length && !day.memoryReviewDismissals?.length)) {
      const studyDay = { ...day, tasks: studyTasks };
      delete studyDay.memoryReviewDismissals;
      schedule.push(studyDay);
    }
  }
  const completed = list(workspace.completed).filter((entry) => {
    const key = typeof entry === "object" && entry ? entry.taskId ?? entry.id ?? entry.task ?? entry.taskName : entry;
    if (!memoryKeys.has(key)) return true;
    if (!memoryReviewData.completed.some((saved) => JSON.stringify(saved) === JSON.stringify(entry))) {
      memoryReviewData.completed.push(entry);
    }
    return false;
  });
  return { schedule, completed, memoryReviewData };
}

export function getScheduleCompletion(schedule = [], completed = []) {
  const tasks = list(schedule).flatMap((day) => list(day?.tasks))
    .filter((task) => typeof task?.task === "string" && task.task.trim() && !isPlannerMemoryReviewTask(task));
  const complete = tasks.length > 0 && tasks.every((task) => !isPlannerTaskPending(task, completed));
  // Use exact task membership, not a rounded percentage. Adding a new task re-arms the invitation.
  const key = complete ? JSON.stringify(list(schedule).map((day) => [
    day?.date, day?.day, list(day?.tasks).filter((task) => !isPlannerMemoryReviewTask(task))
      .map((task) => [task?.id, task?.task]),
  ])) : "";
  return { complete, totalTasks: tasks.length, key,
    shouldInvite: complete && !list(schedule).some((day) => day?.examInvitationAcknowledged === key) };
}

export function acknowledgeScheduleExam(schedule, key) {
  if (!key || !Array.isArray(schedule) || !schedule.length) return schedule;
  return schedule.map((day, index) => index === 0 ? { ...day, examInvitationAcknowledged: key } : day);
}
