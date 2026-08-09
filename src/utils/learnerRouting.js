import { normalizeAcademicProfile } from "./academicProfile.js";

export const KIDS_HOME_ROUTE = "/kids";
export const STANDARD_HOME_ROUTE = "/dashboard";

const KIDS_LEARNER_BANDS = new Set(["early", "primary"]);

export function getLearnerRoutePolicy(profile = {}) {
  const academicProfile = normalizeAcademicProfile(profile);
  const isKidsLearner = KIDS_LEARNER_BANDS.has(academicProfile.band);

  return {
    academicProfile,
    canAccessKidsRoute: isKidsLearner,
    homeRoute: isKidsLearner ? KIDS_HOME_ROUTE : STANDARD_HOME_ROUTE,
    isKidsLearner,
  };
}

export function getLearnerHomeRoute(profile = {}) {
  return getLearnerRoutePolicy(profile).homeRoute;
}
