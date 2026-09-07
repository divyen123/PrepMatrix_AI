import assert from "node:assert/strict";
import test from "node:test";
import { getExamSubjectPrefill } from "./examSubjectPrefill.js";

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
