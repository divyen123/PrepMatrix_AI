import test from "node:test";
import assert from "node:assert/strict";
import {
  KIDS_HOME_ROUTE,
  STANDARD_HOME_ROUTE,
  getLearnerHomeRoute,
  getLearnerRoutePolicy,
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
    assert.equal(policy.homeRoute, KIDS_HOME_ROUTE);
    assert.equal(getLearnerHomeRoute(profile), KIDS_HOME_ROUTE);
  });
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
