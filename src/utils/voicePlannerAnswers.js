function normalizePlannerVoiceText(value = "") {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s']/gu, " ")
    .replace(/\s+/gu, " ")
    .replace(/^(?:hey\s+(?:prep|prep\s*matrix)\s+)?(?:please\s+)?/u, "")
    .replace(/\s+please$/u, "")
    .trim();
}

function taskLabel(task) {
  if (typeof task === "string") return task.trim();
  return String(task?.task || task?.title || "").trim();
}

export function resolveVoicePlannerAnswer(rawText, metrics = {}) {
  const normalized = normalizePlannerVoiceText(rawText);
  if (!normalized) return "";

  if (/^(?:how am i doing|what(?: is|'s) my progress|show me my progress|give me (?:a )?progress update|tell me my progress)$/u.test(normalized)) {
    const total = Number(metrics.totalTasks) || 0;
    const completed = Number(metrics.completedTasks) || 0;
    if (!total) return "You do not have any planner tasks yet.";
    const rate = Number(metrics.completionRate) || 0;
    return `You have completed ${completed} of ${total} tasks. Your progress is ${rate} percent.`;
  }

  if (/^(?:how many tasks (?:do i have )?(?:left|remaining)|what tasks (?:are left|remain)|tell me my remaining tasks)$/u.test(normalized)) {
    const remaining = Number(metrics.remainingTasks) || 0;
    return remaining === 1
      ? "You have 1 planner task remaining."
      : `You have ${remaining} planner tasks remaining.`;
  }

  if (/^(?:what(?: is|'s) my next task|what should i (?:do|study) next|tell me my next task)$/u.test(normalized)) {
    const nextTask = taskLabel(metrics.firstPendingTask);
    return nextTask
      ? `Your next task is ${nextTask}.`
      : "You do not have any pending planner tasks right now.";
  }

  if (/^(?:what (?:do i have|should i study|am i studying) today|what(?: is|'s) (?:on )?my plan (?:for )?today|tell me (?:my|today's) plan)$/u.test(normalized)) {
    const todayTasks = Array.isArray(metrics.todayTasks)
      ? metrics.todayTasks.map(taskLabel).filter(Boolean)
      : [];
    return todayTasks.length
      ? `Today's plan includes ${todayTasks.join(", ")}.`
      : "You do not have any planner tasks scheduled for today.";
  }

  if (/^(?:what(?: is|'s) my weak subject|which subject (?:is weak|needs (?:more )?focus)|what should i focus on)$/u.test(normalized)) {
    const weakSubject = String(metrics.weakSubject || "").trim();
    return weakSubject
      ? `${weakSubject} needs the most attention right now.`
      : "No weak subject stands out yet.";
  }

  return "";
}
