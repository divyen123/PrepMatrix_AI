export function extractSubjectFromTask(taskName = "") {
  return taskName.split(" - ")[0]?.trim() || taskName.trim();
}

export function normalizeTimeSlot(timeLabel = "") {
  const normalized = String(timeLabel ?? "").toLowerCase();

  if (normalized.includes("morning")) return "morning";
  if (normalized.includes("evening")) return "evening";
  if (normalized.includes("priority")) return "priority";

  return "other";
}

export function getPlannerMetrics(schedule = [], completed = []) {
  const safeSchedule = Array.isArray(schedule) ? schedule : [];
  const safeCompleted = Array.isArray(completed) ? completed : [];
  const completedSet = new Set(safeCompleted);
  const subjectStats = {};

  let totalTasks = 0;
  let morningCompleted = 0;
  let eveningCompleted = 0;
  let firstPendingTask = null;

  safeSchedule.forEach((day) => {
    const tasks = Array.isArray(day?.tasks) ? day.tasks : [];
    tasks.forEach((task) => {
      if (!task || typeof task.task !== "string") return;
      totalTasks += 1;

      const taskName = task.task;
      const subject = extractSubjectFromTask(taskName);
      const isDone = completedSet.has(taskName);

      if (!subjectStats[subject]) {
        subjectStats[subject] = {
          total: 0,
          done: 0,
          pending: 0,
        };
      }

      subjectStats[subject].total += 1;

      if (isDone) {
        subjectStats[subject].done += 1;

        const timeSlot = normalizeTimeSlot(task.time);
        if (timeSlot === "morning") morningCompleted += 1;
        if (timeSlot === "evening") eveningCompleted += 1;
      } else {
        subjectStats[subject].pending += 1;
        if (!firstPendingTask) firstPendingTask = taskName;
      }
    });
  });

  const completedTasks = Math.min(completedSet.size, totalTasks);
  const remainingTasks = Math.max(totalTasks - completedTasks, 0);
  const completionRate =
    totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

  const weakSubject = Object.entries(subjectStats)
    .sort(([, left], [, right]) => right.pending - left.pending || left.done - right.done)
    .map(([subjectName]) => subjectName)[0] || null;

  const todayTasks = Array.isArray(safeSchedule[0]?.tasks) ? safeSchedule[0].tasks : [];

  return {
    totalTasks,
    completedTasks,
    remainingTasks,
    completionRate,
    firstPendingTask,
    weakSubject,
    todayTasks,
    subjectStats,
    morningCompleted,
    eveningCompleted,
  };
}
