export const SUBJECT_REQUIRED_PROGRESS_NOTICE = "Add a subject first to view your progress.";

export function getDashboardOverviewCardAction(label, subjectCount) {
  const normalizedLabel = String(label || "").toLowerCase();
  const isProgressCard = normalizedLabel.includes("completed")
    || normalizedLabel.includes("remaining");

  if (!subjectCount && isProgressCard) {
    return { type: "notice", message: SUBJECT_REQUIRED_PROGRESS_NOTICE };
  }

  if (normalizedLabel.includes("subject")) return { type: "subjects" };
  if (normalizedLabel.includes("planned")) {
    return { type: "navigate", route: "/planner/schedule" };
  }
  if (normalizedLabel.includes("remaining")) {
    return { type: "navigate", route: "/analytics#topic-progress" };
  }

  return { type: "navigate", route: "/analytics" };
}
