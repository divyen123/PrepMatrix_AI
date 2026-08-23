import test from "node:test";
import assert from "node:assert/strict";
import {
  KIDS_HOME_ROUTE,
  STANDARD_HOME_ROUTE,
  YOUNG_KIDS_NAV_ROUTES,
  getLearnerHomeRoute,
  getLearnerRoutePolicy,
  getYoungKidsParentRouteDecision,
  isYoungKidsNavRoute,
  isYoungKidsParentGuidedRoute,
} from "./learnerRouting.js";

test("routes early-years through Class 3 learners to Play & Learn", () => {
  [
    { academicLevel: "Early Years / Kindergarten", grade: "UKG" },
    { academicLevel: "Primary School", grade: "Class 1" },
    { academicLevel: "Primary School", grade: "Class 3" },
  ].forEach((profile) => {
    const policy = getLearnerRoutePolicy(profile);
    assert.equal(policy.isKidsLearner, true);
    assert.equal(policy.isYoungKidsLearner, true);
    assert.equal(policy.canUseParentCorner, true);
    assert.equal(policy.canAccessKidsRoute, true);
    assert.equal(policy.quizRequiresParentPin, true);
    assert.equal(policy.examRequiresParentPin, true);
    assert.equal(policy.homeRoute, KIDS_HOME_ROUTE);
    assert.equal(getLearnerHomeRoute(profile), KIDS_HOME_ROUTE);
  });
});

test("only allows known Parent Corner return routes", () => {
  ["/planner", "/settings", "/notification-history", "/quiz", "/exam", "/exam/about"].forEach((route) => {
    assert.equal(isYoungKidsParentGuidedRoute(route), true, route);
  });
  [
    "/kids",
    "/dashboard",
    "https://example.com",
    "//example.com",
    "/quiz?next=/settings",
    "/notification-history?filter=unread",
  ].forEach((route) => {
    assert.equal(isYoungKidsParentGuidedRoute(route), false, route);
  });
});

test("young kids can reach Subjects without exposing unavailable school or career modules", () => {
  assert.equal(isYoungKidsNavRoute("/subjects"), true);
  assert.equal(isYoungKidsNavRoute("/resources"), false);
  assert.equal(isYoungKidsNavRoute("/resume-builder"), false);
  assert.ok(YOUNG_KIDS_NAV_ROUTES.includes("/subjects"));
});

test("keeps parent-guided routes pending until the server session resolves and relocks immediately", () => {
  assert.equal(getYoungKidsParentRouteDecision({
    isYoungKidsLearner: true,
    parentAccess: { resolved: false, unlocked: false },
  }), "pending");
  assert.equal(getYoungKidsParentRouteDecision({
    isYoungKidsLearner: true,
    parentAccess: { resolved: true, unlocked: false },
  }), "locked");
  assert.equal(getYoungKidsParentRouteDecision({
    isYoungKidsLearner: true,
    parentAccess: { resolved: true, unlocked: true },
  }), "allowed");
  assert.equal(getYoungKidsParentRouteDecision({
    isYoungKidsLearner: false,
    parentAccess: { resolved: true, unlocked: false },
  }), "allowed");
});

test("allows only an already-started exam to continue after Parent Corner expires", () => {
  const lockedParentAccess = { resolved: true, unlocked: false };
  assert.equal(getYoungKidsParentRouteDecision({
    isYoungKidsLearner: true,
    parentAccess: lockedParentAccess,
    route: "/exam",
    hasActiveExamAttempt: true,
  }), "allowed");
  assert.equal(getYoungKidsParentRouteDecision({
    isYoungKidsLearner: true,
    parentAccess: lockedParentAccess,
    route: "/exam/about",
    hasActiveExamAttempt: true,
  }), "locked");
  assert.equal(getYoungKidsParentRouteDecision({
    isYoungKidsLearner: true,
    parentAccess: lockedParentAccess,
    route: "/quiz",
    hasActiveExamAttempt: true,
  }), "locked");
});

test("gives Classes 4 through 8 a school challenge without young-kids controls", () => {
  [
    { academicLevel: "School", grade: "Class 4" },
    { academicLevel: "Primary School", grade: "Grade 5" },
    { academicLevel: "Middle School", grade: "Class 6" },
    { academicLevel: "Middle School", grade: "Class 7" },
    { academicLevel: "Middle School", grade: "Class 8" },
  ].forEach((profile) => {
    const policy = getLearnerRoutePolicy(profile);
    assert.equal(policy.isKidsLearner, false);
    assert.equal(policy.isSchoolChallengeLearner, true);
    assert.equal(policy.canAccessKidsRoute, true);
    assert.equal(policy.canUseParentCorner, false);
    assert.equal(policy.homeRoute, STANDARD_HOME_ROUTE);
  });
});

test("keeps Class 9 and older learners on the standard workspace", () => {
  [
    { academicLevel: "Secondary School", grade: "Class 9" },
    { academicLevel: "Secondary School", grade: "Class 10" },
    { academicLevel: "Senior Secondary", grade: "Class 12" },
    { academicLevel: "Undergraduate / Bachelor's" },
  ].forEach((profile) => {
    const policy = getLearnerRoutePolicy(profile);
    assert.equal(policy.isKidsLearner, false);
    assert.equal(policy.canAccessKidsRoute, false);
    assert.equal(policy.homeRoute, STANDARD_HOME_ROUTE);
    assert.equal(getLearnerHomeRoute(profile), STANDARD_HOME_ROUTE);
  });
});

test("uses exact grade evidence when a persisted level is generic", () => {
  const policy = getLearnerRoutePolicy({
    academicLevel: "School",
    academicTrack: "CBSE",
    grade: "Class 4",
  });

  assert.equal(policy.academicProfile.band, "primary");
  assert.equal(policy.isSchoolChallengeLearner, true);
  assert.equal(policy.homeRoute, STANDARD_HOME_ROUTE);
});

test("does not guess that a legacy generic primary profile is a young child", () => {
  const policy = getLearnerRoutePolicy({
    academicLevel: "Primary School",
    academicTrack: "CBSE",
  });

  assert.equal(policy.isKidsLearner, false);
  assert.equal(policy.canUseParentCorner, false);
  assert.equal(policy.homeRoute, STANDARD_HOME_ROUTE);
});
