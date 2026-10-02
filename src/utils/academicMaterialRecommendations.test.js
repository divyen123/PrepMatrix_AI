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

const searchQueries = (links) => links.map(({ href }) => {
  const url = new URL(href);
  return url.searchParams.get("q") || url.searchParams.get("search_query");
});

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

test("material searches retain field and specialty while qualification stays in the audience label", () => {
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
  assert.ok(decodedLinks.every((link) => !/BDS|Medical \/ Health Sciences|chapter\s*\d/iu.test(link)));
  assert.ok(decodedLinks.every((link) => /Medical & Health Sciences/iu.test(link)));
  assert.ok(decodedLinks.every((link) => /Dentistry/iu.test(link)));
  assert.ok(decodedLinks.every((link) => !/Private Dental College/iu.test(link)));
  assert.ok(decodedLinks.every((link) => !/machine learning|react|software engineering/iu.test(link)));
  assert.deepEqual(searchQueries(materials.lanes), [
    "Medical & Health Sciences Dentistry Oral Pathology university tutorial",
    "Medical & Health Sciences Dentistry Oral Pathology materials pdf",
    "Medical & Health Sciences Dentistry Oral Pathology practice questions",
    "Medical & Health Sciences Dentistry Oral Pathology revision notes",
  ]);
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
  assert.ok(decodedLinks.every((link) => !/B\.Sc Nursing|Medical \/ Health Sciences|chapter\s*\d/iu.test(link)));
  assert.ok(decodedLinks.every((link) => /Nursing/iu.test(link)));
  assert.ok(decodedLinks.every((link) => !/frontend|react|machine learning/iu.test(link)));
  assert.deepEqual(searchQueries(suggestions), [
    "Medical & Health Sciences Nursing Fluid balance university tutorial",
    "Medical & Health Sciences Nursing Fluid balance materials pdf",
    "Medical & Health Sciences Nursing Fluid balance practice questions",
    "Medical & Health Sciences Nursing Fluid balance revision notes",
  ]);
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
  assert.deepEqual(searchQueries(materials.lanes), [
    "Class 2 CBSE Environmental Studies tutorial",
    "Class 2 CBSE Environmental Studies materials pdf",
    "Class 2 CBSE Environmental Studies practice questions",
    "Class 2 CBSE Environmental Studies revision notes",
  ]);
});

test("matching specialty and subject appear once without losing the academic field", () => {
  const profile = { ...dentalProfile, degree: "B.Sc Nursing", department: "Nursing" };
  const materials = buildSubjectMaterials({ chapters: 4, name: "Nursing" }, { done: 3 },
    profile.academicLevel, profile.academicTrack, profile);
  assert.deepEqual(searchQueries(materials.lanes), [
    "Medical & Health Sciences Nursing university tutorial",
    "Medical & Health Sciences Nursing materials pdf",
    "Medical & Health Sciences Nursing practice questions",
    "Medical & Health Sciences Nursing revision notes",
  ]);
  assert.match(materials.trackLabel, /B\.Sc Nursing/iu);
});
