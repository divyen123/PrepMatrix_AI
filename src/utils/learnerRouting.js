import { normalizeAcademicProfile } from "./academicProfile.js";

export const KIDS_HOME_ROUTE = "/kids";
export const STANDARD_HOME_ROUTE = "/dashboard";
export const YOUNG_KIDS_NAV_ROUTES = Object.freeze([
  "/kids",
  "/ai-chat",
  "/dashboard",
  "/subjects",
  "/learn",
  "/planner",
  "/planner/schedule",
  "/analytics",
  "/notes",
  "/quiz",
  "/exam",
  "/report",
]);
export const YOUNG_KIDS_PARENT_GUIDED_ROUTES = Object.freeze([
  "/planner",
  "/planner/schedule",
  "/notes",
  "/settings",
  "/quiz",
  "/notification-history",
  "/exam",
  "/exam/about",
]);

const YOUNG_KIDS_PARENT_GUIDED_ROUTE_SET = new Set(YOUNG_KIDS_PARENT_GUIDED_ROUTES);
const YOUNG_KIDS_NAV_ROUTE_SET = new Set(YOUNG_KIDS_NAV_ROUTES);

export function isYoungKidsNavRoute(route) {
  return YOUNG_KIDS_NAV_ROUTE_SET.has(String(route || "").trim());
}

export function isYoungKidsParentGuidedRoute(route) {
  return YOUNG_KIDS_PARENT_GUIDED_ROUTE_SET.has(String(route || "").trim());
}

export function getYoungKidsParentRouteDecision({
  isYoungKidsLearner = false,
  parentAccess = {},
  route = "",
  hasActiveExamAttempt = false,
} = {}) {
  if (!isYoungKidsLearner) return "allowed";
  if (!parentAccess?.resolved) return "pending";
  if (!parentAccess?.unlocked && route === "/exam" && hasActiveExamAttempt) {
    return "allowed";
  }
  return parentAccess?.unlocked ? "allowed" : "locked";
}

function isClassBetween(value, minimum, maximum) {
  return Number.isInteger(value) && value >= minimum && value <= maximum;
}

export function getLearnerRoutePolicy(profile = {}) {
  const academicProfile = normalizeAcademicProfile(profile);
  const isYoungKidsLearner = academicProfile.band === "early"
    || isClassBetween(academicProfile.classNumber, 1, 3);
  const isSchoolChallengeLearner = isClassBetween(academicProfile.classNumber, 4, 8);
  const isSchoolLearner = academicProfile.schoolType === "school";

  return {
    academicProfile,
    canAccessKidsRoute: isYoungKidsLearner || isSchoolChallengeLearner,
    canUseParentCorner: isYoungKidsLearner,
    canUseSchoolChallenge: isSchoolChallengeLearner,
    homeRoute: isYoungKidsLearner ? KIDS_HOME_ROUTE : STANDARD_HOME_ROUTE,
    isKidsLearner: isYoungKidsLearner,
    isSchoolChallengeLearner,
    isSchoolLearner,
    isYoungKidsLearner,
    plannerCreationRequiresParentPin: isYoungKidsLearner,
    quizRequiresParentPin: isYoungKidsLearner,
    examRequiresParentPin: isYoungKidsLearner,
    settingsRequiresParentPin: isYoungKidsLearner,
  };
}

export function getLearnerHomeRoute(profile = {}) {
  return getLearnerRoutePolicy(profile).homeRoute;
}
