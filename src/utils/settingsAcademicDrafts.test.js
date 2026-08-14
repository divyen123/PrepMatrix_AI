import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSettingsAcademicSaveProfile,
  createSettingsAcademicDrafts,
  getActiveSettingsAcademicDraft,
  hydrateSettingsAcademicDrafts,
  switchSettingsAcademicStage,
  updateSettingsAcademicDraft,
} from "./settingsAcademicDrafts.js";

const undergraduate = {
  academicLevel: "Undergraduate / Bachelor's",
  academicTrack: "Engineering & Technology",
  degree: "B.Tech",
  department: "Information Technology",
};

test("restores each stage's academic draft when switching back", () => {
  let state = createSettingsAcademicDrafts(undergraduate);
  state = switchSettingsAcademicStage(state, "Early Years / Kindergarten");
  state = updateSettingsAcademicDraft(state, { academicTrack: "CBSE", grade: "Kindergarten" });
  state = switchSettingsAcademicStage(state, "Undergraduate / Bachelor's");

  assert.deepEqual(getActiveSettingsAcademicDraft(state), {
    academicLevel: "Undergraduate / Bachelor's",
    academicTrack: "Engineering & Technology",
    degree: "B.Tech",
    department: "Information Technology",
    grade: "",
    schoolType: "college",
  });

  state = switchSettingsAcademicStage(state, "Early Years / Kindergarten");
  assert.equal(getActiveSettingsAcademicDraft(state).academicTrack, "CBSE");
  assert.equal(getActiveSettingsAcademicDraft(state).grade, "Kindergarten");
});

test("builds a save payload only from fields valid for the active stage", () => {
  let state = createSettingsAcademicDrafts(undergraduate);
  state = switchSettingsAcademicStage(state, "Early Years / Kindergarten");
  state = updateSettingsAcademicDraft(state, { academicTrack: "State Board", grade: "LKG" });
  state = switchSettingsAcademicStage(state, "Undergraduate / Bachelor's");

  const college = buildSettingsAcademicSaveProfile(state, "R.M.K Engineering College");
  assert.equal(college.academicLevel, "Undergraduate / Bachelor's");
  assert.equal(college.grade, "");
  assert.equal(college.degree, "B.Tech");
  assert.equal(college.department, "Information Technology");

  state = switchSettingsAcademicStage(state, "Early Years / Kindergarten");
  const school = buildSettingsAcademicSaveProfile(state, "R.M.K Engineering College");
  assert.equal(school.academicLevel, "Early Years / Kindergarten");
  assert.equal(school.grade, "LKG");
  assert.equal(school.degree, "");
  assert.equal(school.department, "");
});

test("server hydration keeps the saved previous-stage draft", () => {
  let state = createSettingsAcademicDrafts(undergraduate);
  state = hydrateSettingsAcademicDrafts(
    state,
    { academicLevel: "Early Years / Kindergarten", academicTrack: "CBSE", grade: "Kindergarten" },
    undergraduate,
  );
  state = switchSettingsAcademicStage(state, "Undergraduate / Bachelor's");

  assert.equal(getActiveSettingsAcademicDraft(state).degree, "B.Tech");
  assert.equal(getActiveSettingsAcademicDraft(state).academicTrack, "Engineering & Technology");
});

test("recovers a legacy higher-education field that was left on a child profile", () => {
  let state = createSettingsAcademicDrafts({
    academicLevel: "Early Years / Kindergarten",
    academicTrack: "Engineering & Technology",
    grade: "Kindergarten",
  });
  state = switchSettingsAcademicStage(state, "Undergraduate / Bachelor's");
  assert.equal(getActiveSettingsAcademicDraft(state).academicTrack, "Engineering & Technology");

  state = createSettingsAcademicDrafts(undergraduate);
  state = switchSettingsAcademicStage(state, "Early Years / Kindergarten");
  assert.equal(getActiveSettingsAcademicDraft(state).academicTrack, "General");
});
