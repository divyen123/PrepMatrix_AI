import { normalizeAcademicProfile } from "./academicProfile.js";

export const KIDS_HOME_ROUTE = "/kids";
export const STANDARD_HOME_ROUTE = "/dashboard";

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
    settingsRequiresParentPin: isYoungKidsLearner,
  };
}

export function getLearnerHomeRoute(profile = {}) {
  return getLearnerRoutePolicy(profile).homeRoute;
}
