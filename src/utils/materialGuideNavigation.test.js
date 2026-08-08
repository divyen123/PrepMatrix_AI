import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMaterialGuidePath,
  getMaterialGuideCardId,
  resolveMaterialGuideSubjects,
} from "./materialGuideNavigation.js";

test("builds an encoded subject-specific Materials route", () => {
  assert.equal(
    buildMaterialGuidePath("Data Structures & Algorithms"),
    "/resources?subject=Data%20Structures%20%26%20Algorithms",
  );
  assert.equal(buildMaterialGuidePath(""), "/resources");
});

test("focuses an existing planner subject without duplicating it", () => {
  const subjects = [{ name: "Operating Systems", chapters: 5 }];
  const guide = resolveMaterialGuideSubjects(subjects, " operating systems ");

  assert.equal(guide.focusedSubject, "Operating Systems");
  assert.equal(guide.isTransient, false);
  assert.deepEqual(guide.subjects, subjects);
  assert.equal(getMaterialGuideCardId(guide.focusedSubject), "subject-Operating-Systems");
});

test("adds a transient guide for a generated subject not yet in the planner", () => {
  const guide = resolveMaterialGuideSubjects([], "Quantum Computing");

  assert.equal(guide.focusedSubject, "Quantum Computing");
  assert.equal(guide.isTransient, true);
  assert.deepEqual(guide.subjects, [{
    chapters: 1,
    materialGuideOnly: true,
    name: "Quantum Computing",
  }]);
});
