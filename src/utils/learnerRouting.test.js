import test from "node:test";
import assert from "node:assert/strict";
import {
  KIDS_HOME_ROUTE,
  STANDARD_HOME_ROUTE,
  getLearnerHomeRoute,
  getLearnerRoutePolicy,
} from "./learnerRouting.js";

test("routes early-years and primary learners to Play & Learn", () => {
  [
    { academicLevel: "Early Years / Kindergarten", grade: "UKG" },
    { academicLevel: "Primary School", grade: "Class 3" },
    { academicLevel: "School", grade: "Grade 5" },
  ].forEach((profile) => {
    const policy = getLearnerRoutePolicy(profile);
    assert.equal(policy.isKidsLearner, true);
    assert.equal(policy.canAccessKidsRoute, true);
    assert.equal(policy.homeRoute, KIDS_HOME_ROUTE);
    assert.equal(getLearnerHomeRoute(profile), KIDS_HOME_ROUTE);
  });
});

test("keeps older learners on the guarded standard workspace", () => {
  [
    { academicLevel: "Middle School", grade: "Class 7" },
    { academicLevel: "Secondary School", grade: "Class 10" },
    { academicLevel: "Undergraduate / Bachelor's" },
  ].forEach((profile) => {
    const policy = getLearnerRoutePolicy(profile);
    assert.equal(policy.isKidsLearner, false);
    assert.equal(policy.canAccessKidsRoute, false);
    assert.equal(policy.homeRoute, STANDARD_HOME_ROUTE);
    assert.equal(getLearnerHomeRoute(profile), STANDARD_HOME_ROUTE);
  });
});

test("uses normalized grade evidence when a persisted level is generic", () => {
  const policy = getLearnerRoutePolicy({
    academicLevel: "School",
    academicTrack: "CBSE",
    grade: "Class 4",
  });

  assert.equal(policy.academicProfile.band, "primary");
  assert.equal(policy.homeRoute, KIDS_HOME_ROUTE);
});
