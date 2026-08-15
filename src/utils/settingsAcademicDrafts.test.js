import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSettingsAcademicSaveProfile,
  createSettingsAcademicDrafts,
  getActiveSettingsAcademicDraft,
  getSettingsAcademicProfileChanges,
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

test("summarizes only semantic academic profile changes", () => {
  const unchanged = getSettingsAcademicProfileChanges(
    undergraduate,
    {
      ...undergraduate,
      degree: "  B.Tech  ",
      institutionName: "A different institution",
    },
  );
  assert.deepEqual(unchanged, []);

  const changes = getSettingsAcademicProfileChanges(
    undergraduate,
    {
      academicLevel: "Postgraduate / Master's",
      academicTrack: "Engineering & Technology",
      degree: "M.Tech",
      department: "Computer Science",
    },
  );

  assert.deepEqual(changes.map(({ key }) => key), [
    "academicLevel",
    "degree",
    "department",
  ]);
  assert.equal(changes[0].before, "Undergraduate / Bachelor's");
  assert.equal(changes[0].after, "Postgraduate / Master's");
});

test("includes class and curriculum changes in the confirmation summary", () => {
  const changes = getSettingsAcademicProfileChanges(
    {
      academicLevel: "Primary School",
      academicTrack: "CBSE",
      grade: "Class 4",
      schoolType: "school",
    },
    {
      academicLevel: "Primary School",
      academicTrack: "State Board",
      grade: "Class 5",
      schoolType: "school",
    },
  );

  assert.deepEqual(changes.map(({ key }) => key), ["grade", "academicTrack"]);
});

test("builds current-to-old rows for an academic profile restore preview", () => {
  const changes = getSettingsAcademicProfileChanges(
    {
      academicLevel: "Postgraduate / Master's",
      academicTrack: "Engineering & Technology",
      degree: "M.Tech",
      department: "Computer Science",
    },
    undergraduate,
  );

  assert.deepEqual(changes.map(({ key }) => key), [
    "academicLevel",
    "degree",
    "department",
  ]);
  assert.deepEqual(changes[0], {
    key: "academicLevel",
    label: "Academic stage",
    before: "Postgraduate / Master's",
    after: "Undergraduate / Bachelor's",
  });
});
