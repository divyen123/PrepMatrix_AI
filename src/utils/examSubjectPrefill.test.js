import assert from "node:assert/strict";
import test from "node:test";
import {
  getExamPaperScopeBlocks,
  getExamPaperScopePrefill,
  getExamSubjectPrefill,
  mergeExamPaperScope,
} from "./examSubjectPrefill.js";

test("prefills all named chapters, unnamed chapter positions, and optional topics", () => {
  const subjects = [{
    name: "Data Analytics",
    chapters: 3,
    chapterNames: ["Foundations", "", "Big data"],
    topics: ["Big Data", "Four V's", { title: "Data cleaning" }],
  }];
  assert.deepEqual(getExamSubjectPrefill(" Data Analytics ", subjects), {
    subjectName: "Data Analytics",
    scopeText: "Foundations\nChapter 2\nBig data\nFour V's\nData cleaning",
  });
});

test("collects nested chapters, topics, and subtopics without duplicate labels", () => {
  assert.deepEqual(getExamSubjectPrefill("Biology", [{
    name: "Biology",
    chapters: [{ name: "Cells", topics: [{ title: "Organelles", subtopics: ["Mitochondria"] }] }],
    topics: ["Organelles", "Transport"],
  }]), {
    subjectName: "Biology",
    scopeText: "Cells\nOrganelles\nMitochondria\nTransport",
  });
});

test("merges structured and legacy tasks while removing controls and excluding other subjects", () => {
  const subjects = [{ name: "Data Analytics", chapters: 1, chapterNames: ["Big data"] }];
  const schedule = [{ tasks: [
    { task: "Data Analytics - Big data" },
    { task: "Knowledge check: Data Analytics - Sampling · Revision" },
    { task: "3-minute memory check: Data Analytics - Sampling" },
    { task: "Data Analytics - check: Visualization" },
    { task: "Data Analytics - Control text", subjectName: "Data Analytics", chapterName: "Statistics", topic: "Regression" },
    { task: "check: Data Analytics - Four V's" },
    { task: "Data Analytics Advanced - Deep learning" },
    { task: "Data Analytics - Wrong subject", subjectName: "Physics", topic: "Mechanics" },
    { task: "Physics - Waves" },
    { task: "Physics - Imported note", subjectName: "Data Analytics", topic: "Data governance" },
  ] }];
  assert.deepEqual(getExamSubjectPrefill("Data Analytics", subjects, schedule), {
    subjectName: "Data Analytics",
    scopeText: "Big data\nSampling\nVisualization\nStatistics\nRegression\nFour V's\nData governance",
  });
});

test("keeps saved subject spelling and curriculum when schedule spelling differs", () => {
  assert.deepEqual(getExamSubjectPrefill("data analytics", [{
    name: "Data Analytics", chapters: 1, chapterNames: ["Foundations"],
  }], [{ tasks: [{ task: "data analytics - Sampling", subjectName: "data analytics" }] }]), {
    subjectName: "Data Analytics",
    scopeText: "Foundations\nSampling",
  });
});

test("supports schedule-only and legacy string subjects without inventing a curriculum", () => {
  assert.deepEqual(getExamSubjectPrefill("Physics", [], [{ tasks: [
    { task: "Physics - Waves" }, { task: "Physics - Optics" },
  ] }]), { subjectName: "Physics", scopeText: "Waves\nOptics" });
  assert.deepEqual(getExamSubjectPrefill("Chemistry", ["Chemistry"]), {
    subjectName: "Chemistry", scopeText: "",
  });
});

test("does not select an arbitrary subject for direct entry or an invalid requested subject", () => {
  assert.equal(getExamSubjectPrefill("", [{ name: "Physics" }]), null);
  assert.equal(getExamSubjectPrefill("Biology", [{ name: "Physics" }]), null);
  assert.equal(getExamSubjectPrefill("Physics", null, null), null);
});

test("question-paper scope includes saved chapter and topic names without unnamed chapter placeholders", () => {
  const subjects = [{
    name: "Data Analytics",
    chapters: 3,
    chapterNames: ["Foundations", "", "Big data"],
    topics: ["Sampling"],
  }];
  const schedule = [{ tasks: [
    { subjectName: "Data Analytics", chapterName: "Big data", topic: "Regression" },
    { subjectName: "Physics", topic: "Waves" },
  ] }];

  assert.equal(
    getExamPaperScopePrefill(["Data Analytics"], subjects, schedule),
    "Foundations\nBig data\nSampling\nRegression",
  );
  assert.equal(getExamPaperScopePrefill(["Physics"], subjects, schedule), "Waves");
});

test("question-paper scope separates multiple selected subjects and only includes available saved content", () => {
  const subjects = [
    { name: "Physics", chapters: 2, chapterNames: ["Mechanics", "Optics"] },
    { name: "Chemistry", chapters: 3 },
    { name: "Biology", chapters: [{ title: "Cells", topics: ["Organelles"] }] },
  ];

  assert.equal(
    getExamPaperScopePrefill(["Physics", "Chemistry", "Biology"], subjects),
    "Physics:\n- Mechanics\n- Optics\n\nBiology:\n- Cells\n- Organelles",
  );
  assert.equal(getExamPaperScopePrefill(["Chemistry"], subjects), "");
  assert.equal(getExamPaperScopePrefill([], subjects), "");
});

test("question-paper selection changes update intact suggestions and preserve manual additions", () => {
  const subjects = [
    { name: "Physics", chapters: 1, chapterNames: ["Mechanics"] },
    { name: "Biology", topics: ["Cells"] },
  ];
  const physics = getExamPaperScopeBlocks(["Physics"], subjects);
  const both = getExamPaperScopeBlocks(["Physics", "Biology"], subjects);
  const biology = getExamPaperScopeBlocks(["Biology"], subjects);

  assert.equal(mergeExamPaperScope("Mechanics", physics, both),
    "Physics:\n- Mechanics\n\nBiology:\n- Cells");
  const withManualAddition = mergeExamPaperScope(
    "Mechanics\n\nInclude derivations",
    physics,
    both,
  );
  assert.equal(withManualAddition,
    "Physics:\n- Mechanics\n\nInclude derivations\n\nBiology:\n- Cells");
  assert.equal(mergeExamPaperScope(withManualAddition, both, biology),
    "Include derivations\n\nCells");
});

test("question-paper scope does not delete edited text when removing a subject", () => {
  const subjects = [
    { name: "Physics", chapterNames: ["Mechanics"], chapters: 1 },
    { name: "Biology", topics: ["Cells"] },
  ];
  const physics = getExamPaperScopeBlocks(["Physics"], subjects);
  const both = getExamPaperScopeBlocks(["Physics", "Biology"], subjects);
  const biology = getExamPaperScopeBlocks(["Biology"], subjects);
  const manuallyEdited = mergeExamPaperScope("Mechanics and waves", physics, both);
  assert.equal(manuallyEdited, "Mechanics and waves\n\nBiology:\n- Cells");
  assert.equal(mergeExamPaperScope(manuallyEdited, both, biology),
    "Mechanics and waves\n\nCells");
  assert.equal(mergeExamPaperScope("", physics, both), "Biology:\n- Cells");
});
