import assert from "node:assert/strict";
import test from "node:test";
import { getStudentOnboardingState, mergeOnboardingProfile, validateStudentDetails } from "./studentOnboarding.js";

test("student names retain international characters and ages are normalized", () => {
  assert.deepEqual(validateStudentDetails({ username: "  ஆரவ் Kumar  ", age: "16" }), { username: "ஆரவ் Kumar", age: 16 });
  assert.deepEqual(validateStudentDetails({ username: "Sam", age: 5 }), { username: "Sam", age: 5 });
});

test("missing, malformed and out-of-range details cannot complete a profile", () => {
  for (const username of [null, undefined, [], {}, 42, "  ", "a".repeat(101)]) {
    assert.ok(validateStudentDetails({ username, age: 16 }).error);
  }
  for (const age of [null, undefined, false, true, {}, [], "", " ", 0, -1, 121, 16.5, "16years", "1e1", Infinity, NaN]) {
    assert.ok(validateStudentDetails({ username: "Sam", age }).error, String(age));
  }
});

test("legacy accounts do not get new-registration prompts", () => {
  assert.deepEqual(getStudentOnboardingState({ username: "Student" }), {
    needsOnboardingGuide: false, needsProfileDetails: false, setupChecklistEnabled: false,
  });
});

test("closing the guide leaves profile collection and study setup pending across sessions", () => {
  const registered = { onboardingGuidePending: true, profileDetailsPending: true, setupChecklistEnabled: true };
  assert.deepEqual(getStudentOnboardingState(registered), {
    needsOnboardingGuide: true, needsProfileDetails: true, setupChecklistEnabled: true,
  });
  assert.deepEqual(getStudentOnboardingState({ ...registered, onboardingGuidePending: false }), {
    needsOnboardingGuide: false, needsProfileDetails: true, setupChecklistEnabled: true,
  });
  assert.deepEqual(getStudentOnboardingState({ ...registered, onboardingGuidePending: false, profileDetailsPending: false }), {
    needsOnboardingGuide: false, needsProfileDetails: false, setupChecklistEnabled: true,
  });
});

test("identity updates immediately without restoring a stale academic profile", () => {
  const current = { id: "student-a", username: "email-name", age: null, activeAcademicProfileId: "science", needsProfileDetails: true };
  assert.deepEqual(mergeOnboardingProfile(current, {
    id: "student-a", username: "Sam Kumar", age: 16, needsProfileDetails: false,
    activeAcademicProfileId: "old-profile", academicProfiles: [],
  }), { ...current, username: "Sam Kumar", age: 16, needsProfileDetails: false });
  assert.equal(mergeOnboardingProfile(current, { id: "student-b", username: "Wrong student" }), current);
  assert.equal(mergeOnboardingProfile(null, { id: "student-a" }), null);
  assert.deepEqual(mergeOnboardingProfile(current, { id: "student-a", needsOnboardingGuide: false }), { ...current, needsOnboardingGuide: false });
});
