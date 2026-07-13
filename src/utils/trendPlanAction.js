const TREND_PLAN_ACTIONS = Object.freeze({
  ADD_SUBJECT: Object.freeze({
    kind: "add-subject",
    label: "Add Subject",
    route: "/subjects",
  }),
  CREATE_PLAN: Object.freeze({
    kind: "create-plan",
    label: "Create Plan",
    route: "/planner",
  }),
  VIEW_PLAN: Object.freeze({
    kind: "view-plan",
    label: "View Plan",
    route: "/planner",
  }),
});

export function getTrendPlanAction(subjects, schedule) {
  if (!Array.isArray(subjects) || subjects.length === 0) return TREND_PLAN_ACTIONS.ADD_SUBJECT;

  const hasSchedule = Array.isArray(schedule) && schedule.length > 0;
  return hasSchedule ? TREND_PLAN_ACTIONS.VIEW_PLAN : TREND_PLAN_ACTIONS.CREATE_PLAN;
}
