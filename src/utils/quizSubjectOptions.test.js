import assert from "node:assert/strict";
import test from "node:test";
import { getRankedQuizSubjects } from "./quizSubjectOptions.js";

const subjects = [
  { id: "1", name: "Advanced Data Analytics" },
  { id: "2", name: "Analytics" },
  { id: "3", name: "Data Analytics" },
  { id: "4", name: "Business Analytics" },
  { id: "5", name: "Operating Systems" },
];

test("returns no suggestions for a cleared Quiz subject field", () => {
  assert.deepEqual(getRankedQuizSubjects(subjects, "   "), []);
});

test("ranks exact and prefix Quiz subject matches ahead of later matches", () => {
  assert.deepEqual(
    getRankedQuizSubjects(subjects, "analytics").map(({ name }) => name),
    ["Analytics", "Advanced Data Analytics", "Data Analytics", "Business Analytics"]
  );
});

test("matches Quiz subjects case-insensitively while preserving stable ties", () => {
  assert.deepEqual(
    getRankedQuizSubjects(subjects, "DATA").map(({ name }) => name),
    ["Data Analytics", "Advanced Data Analytics"]
  );
});
