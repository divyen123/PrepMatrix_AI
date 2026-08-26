import test from "node:test";
import assert from "node:assert/strict";
import { buildChatMaterialSuggestions } from "./chatMaterialSuggestions.js";
import { buildSubjectMaterials, getSubjectProfile } from "./materialRecommendations.js";

const dentalProfile = {
  academicLevel: "Medical / Health Sciences",
  academicTrack: "Medical & Health Sciences",
  degree: "BDS",
  department: "Dentistry",
  institutionName: "Private Dental College",
};

test("medical subject names containing short computing substrings stay in their health domain", () => {
  const dental = getSubjectProfile("Brain anatomy", dentalProfile);
  const nursing = getSubjectProfile("Fluid balance", {
    ...dentalProfile,
    degree: "B.Sc Nursing",
    department: "Nursing",
  });

  assert.match(dental.trackLabel, /Dental sciences/iu);
  assert.doesNotMatch(dental.trackLabel, /Model intuition/iu);
  assert.match(nursing.trackLabel, /Nursing sciences/iu);
  assert.doesNotMatch(nursing.trackLabel, /Build-and-ship/iu);
});

test("compact computing acronyms keep their intended subject profiles", () => {
  const artificialIntelligence = getSubjectProfile("AIML", {});
  const algorithms = getSubjectProfile("DSA", {});

  assert.match(artificialIntelligence.trackLabel, /Model intuition/iu);
  assert.match(algorithms.trackLabel, /Problem-solving/iu);
});

test("material searches include the active qualification and field without leaking institution name", () => {
  const materials = buildSubjectMaterials(
    { chapters: 3, name: "Oral Pathology" },
    { done: 0, pending: 3, total: 3 },
    dentalProfile.academicLevel,
    dentalProfile.academicTrack,
    dentalProfile,
  );
  const decodedLinks = materials.lanes.map((lane) => decodeURIComponent(lane.href));

  assert.match(materials.trackLabel, /BDS/iu);
  assert.match(materials.trackLabel, /Dentistry/iu);
  assert.match(materials.trackLabel, /Dental sciences track/iu);
  assert.ok(decodedLinks.every((link) => /BDS/iu.test(link)));
  assert.ok(decodedLinks.every((link) => /Dentistry/iu.test(link)));
  assert.ok(decodedLinks.every((link) => !/Private Dental College/iu.test(link)));
  assert.ok(decodedLinks.every((link) => !/machine learning|react|software engineering/iu.test(link)));
});

test("chat material suggestions preserve the full active academic profile", () => {
  const nursingProfile = {
    academicLevel: "Medical / Health Sciences",
    academicTrack: "Medical & Health Sciences",
    degree: "B.Sc Nursing",
    department: "Nursing",
  };
  const suggestions = buildChatMaterialSuggestions({
    academicLevel: nursingProfile.academicLevel,
    academicProfile: nursingProfile,
    academicTrack: nursingProfile.academicTrack,
    message: "Recommend Fluid balance materials",
    metrics: { subjectStats: {} },
    subjects: [{ chapters: 2, name: "Fluid balance" }],
  });
  const decodedLinks = suggestions.map((item) => decodeURIComponent(item.href));

  assert.equal(suggestions.length, 4);
  assert.ok(decodedLinks.every((link) => /B\.Sc Nursing/iu.test(link)));
  assert.ok(decodedLinks.every((link) => /Nursing/iu.test(link)));
  assert.ok(decodedLinks.every((link) => !/frontend|react|machine learning/iu.test(link)));
});

test("school material searches follow the active class and board", () => {
  const profile = {
    academicLevel: "Primary School",
    academicTrack: "CBSE",
    grade: "Class 2",
    department: "General / Undeclared",
  };
  const materials = buildSubjectMaterials(
    { chapters: 2, name: "Environmental Studies" },
    { done: 1, pending: 1, total: 2 },
    profile.academicLevel,
    profile.academicTrack,
    profile,
  );
  const decodedLinks = materials.lanes.map((lane) => decodeURIComponent(lane.href));

  assert.match(materials.trackLabel, /Class 2/iu);
  assert.match(materials.trackLabel, /CBSE/iu);
  assert.ok(decodedLinks.every((link) => /class 2/iu.test(link)));
  assert.ok(decodedLinks.every((link) => /CBSE/iu.test(link)));
});
