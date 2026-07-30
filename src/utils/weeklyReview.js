function toCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

function topicCount(count) {
  return `${count} topic${count === 1 ? "" : "s"}`;
}

function cleanLabel(value, fallback = "") {
  const label = String(value || "").trim();
  return label || fallback;
}

function getReviewContext(academicLevel, academicTrack) {
  const level = cleanLabel(academicLevel, "College");
  const track = cleanLabel(academicTrack, "General");
  return ` · ${level} (${track})`;
}

function getPendingHighlights(completedTasks, totalTasks, remainingTasks, weakSubject) {
  return [
    { label: "Completed", value: `${completedTasks}/${totalTasks} topics completed` },
    { label: "Priority subject", value: weakSubject || "Follow planner order" },
    { label: "Remaining", value: topicCount(remainingTasks) },
  ];
}

export function buildWeeklyReview(
  metrics = {},
  { academicLevel = "College", academicTrack = "General" } = {}
) {
  const totalTasks = toCount(metrics.totalTasks);
  const hasScheduledPlanner = metrics.hasScheduledPlanner ?? totalTasks > 0;
  if (!hasScheduledPlanner || totalTasks === 0) return null;

  const completedTasks = Math.min(toCount(metrics.completedTasks), totalTasks);
  const remainingTasks = totalTasks - completedTasks;
  const firstPendingTask = cleanLabel(
    metrics.firstPendingTask,
    "the next unchecked topic in Planner"
  );
  const weakSubject = cleanLabel(metrics.weakSubject);
  const context = getReviewContext(academicLevel, academicTrack);

  if (remainingTasks === 0) {
    return {
      state: "complete",
      headline: `Your schedule is fully completed${context}`,
      highlights: [
        { label: "Completed", value: `${totalTasks}/${totalTasks} topics completed` },
        { label: "Achievement", value: "All scheduled topics completed" },
        { label: "Next step", value: "Plan your next schedule" },
      ],
      actions: [
        "Excellent work—every topic in this schedule is complete.",
        "Use one active-recall session to reinforce what you learned.",
        "Plan your next schedule and keep building on this achievement.",
      ],
    };
  }

  const highlights = getPendingHighlights(
    completedTasks,
    totalTasks,
    remainingTasks,
    weakSubject
  );
  const continueAction = metrics.firstPendingTask
    ? `Continue with ${firstPendingTask}.`
    : "Continue with the next unchecked topic in Planner.";
  const priorityAction = weakSubject
    ? `Prioritize ${weakSubject}; it has the largest unfinished workload.`
    : "Work through the remaining topics in planner order.";

  if (completedTasks === 0) {
    return {
      state: "not-started",
      headline: `Your schedule is ready to begin${context}`,
      highlights: [
        { label: "Completed", value: `0/${totalTasks} topics completed` },
        { label: "Current stage", value: "Ready to begin" },
        { label: "Planned workload", value: topicCount(totalTasks) },
      ],
      actions: [
        metrics.firstPendingTask
          ? `Begin with ${firstPendingTask}.`
          : "Begin with the first unchecked topic in Planner.",
        "Complete one topic today and mark it done in Planner to build momentum.",
        priorityAction,
      ],
    };
  }

  if (completedTasks * 100 < totalTasks * 50) {
    const momentumTarget = Math.min(3, remainingTasks);
    return {
      state: "early",
      headline: `You have completed ${completedTasks} of ${totalTasks} topics—build steady momentum${context}`,
      highlights,
      actions: [
        continueAction,
        priorityAction,
        `Complete the next ${topicCount(momentumTarget)} before adding more topics to this schedule.`,
      ],
    };
  }

  if (completedTasks * 100 < totalTasks * 80) {
    const progressTarget = Math.min(3, remainingTasks);
    return {
      state: "progress",
      headline: `You are at least halfway through—keep the current rhythm${context}`,
      highlights,
      actions: [
        continueAction,
        priorityAction,
        `Clear the next ${topicCount(progressTarget)}, then use one short revision block for completed work.`,
      ],
    };
  }

  return {
    state: "near-complete",
    headline: `You are close to finishing—only ${topicCount(remainingTasks)} ${remainingTasks === 1 ? "remains" : "remain"}${context}`,
    highlights,
    actions: [
      metrics.firstPendingTask
        ? `Complete ${firstPendingTask} next.`
        : "Complete the next unchecked topic in Planner.",
      `Finish the final ${topicCount(remainingTasks)} before starting a new plan.`,
      "After that, review this achievement and plan your next schedule.",
    ],
  };
}
