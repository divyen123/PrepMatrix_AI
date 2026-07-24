import test from "node:test";
import assert from "node:assert/strict";
import {
  getSubjectStudyUnits,
  getSubjectStudyUnitRecords,
  normalizeStudyPreferences,
  normalizeSubjectChapterNames,
  normalizeSubjectTopics,
} from "./subjectPlanning.js";
import { generateSchedule } from "./scheduleGenerator.js";

function taskNames(schedule) {
  return schedule.flatMap((day) => day.tasks.map((task) => task.task));
}

test("normalizes optional topics without blanks or case-insensitive duplicates", () => {
  assert.deepEqual(
    normalizeSubjectTopics([" Arrays ", "", "arrays", { title: "Trees" }, { name: "Graphs" }]),
    ["Arrays", "Trees", "Graphs"],
  );
});

test("adds focus topics alongside every named or fallback chapter", () => {
  assert.deepEqual(
    getSubjectStudyUnits({
      chapters: 4,
      topics: ["Arrays", "Trees"],
    }),
    ["Arrays", "Trees", "Chapter 1", "Chapter 2", "Chapter 3", "Chapter 4"],
  );
});

test("keeps all optional topics in addition to the chapter count", () => {
  assert.deepEqual(
    getSubjectStudyUnits({
      chapters: 2,
      topics: ["Arrays", "Trees", "Graphs"],
    }),
    ["Arrays", "Trees", "Graphs", "Chapter 1", "Chapter 2"],
  );
});

test("preserves chapter positions and falls back only for unnamed chapters", () => {
  assert.deepEqual(
    normalizeSubjectChapterNames(["Introduction", "", " Routing "], 3),
    ["Introduction", "", "Routing"],
  );
  assert.deepEqual(
    getSubjectStudyUnits({
      chapterNames: ["Introduction", "", "Routing"],
      chapters: 3,
    }),
    ["Introduction", "Chapter 2", "Routing"],
  );
});

test("keeps topic and chapter identities distinct even when labels match", () => {
  assert.deepEqual(
    getSubjectStudyUnitRecords({
      chapterNames: ["Networks"],
      chapters: 1,
      topics: ["Networks"],
    }).map(({ unitKey, unitType }) => ({ unitKey, unitType })),
    [
      { unitKey: "topic:networks", unitType: "topic" },
      { unitKey: "chapter:1", unitType: "chapter" },
    ],
  );
});

test("normalizes invalid study preferences to safe defaults", () => {
  assert.deepEqual(
    normalizeStudyPreferences({
      sessionsPerWeek: 99,
      sessionMinutes: 17,
      preferredTime: "dawn",
      studyGoal: "cram",
    }),
    {
      sessionsPerWeek: 7,
      sessionMinutes: 45,
      preferredTime: "any",
      studyGoal: "coverage",
    },
  );
});

test("keeps the legacy chapter task fallback when no topics are configured", () => {
  const schedule = generateSchedule(
    [{ name: "Physics", chapters: 3, difficulty: "medium" }],
    3,
  );

  assert.deepEqual(taskNames(schedule), [
    "Physics - Chapter 1",
    "Physics - Chapter 2",
    "Physics - Chapter 3",
  ]);
});

test("applies named topics and subject study preferences to generated tasks", () => {
  const schedule = generateSchedule(
    [{
      name: "Data structures",
      chapters: 4,
      difficulty: "hard",
      topics: ["Arrays", "Trees"],
      studyPreferences: {
        sessionsPerWeek: 4,
        sessionMinutes: 60,
        preferredTime: "evening",
        studyGoal: "practice",
      },
    }],
    4,
  );
  const tasks = schedule.flatMap((day) => day.tasks);

  assert.deepEqual(tasks.filter((task) => !["Chapter 1", "Chapter 2"].includes(task.topic)).map((task) => task.task), [
    "Data structures - Arrays · Practice",
    "Data structures - Trees · Practice",
    "Data structures - Chapter 3 · Practice",
    "Data structures - Chapter 4 · Practice",
  ]);
  assert.deepEqual(tasks.map((task) => task.topic), [
    "Arrays", "Trees", "Chapter 1", "Chapter 2", "Chapter 3", "Chapter 4",
  ]);
  assert.equal(tasks.every((task) => task.time === "Evening · 60 min"), true);
  assert.equal(tasks.every((task) => task.durationMinutes === 60), true);
  assert.equal(tasks[0].topic, "Arrays");
  assert.equal(tasks[0].unitType, "topic");
  assert.equal(tasks[2].unitType, "chapter");
  assert.equal(tasks[2].unitKey, "chapter:1");
  assert.equal(tasks.every((task) => task.source === "subject"), true);
});

test("assigns an actual calendar date to every generated schedule day", () => {
  const schedule = generateSchedule(
    [{ name: "Physics", chapters: 3, difficulty: "medium" }],
    3,
    [],
    { startDate: "2026-04-15" },
  );

  assert.deepEqual(
    schedule.map((day) => ({ day: day.day, date: day.date })),
    [
      { day: 1, date: "2026-04-15" },
      { day: 2, date: "2026-04-16" },
      { day: 3, date: "2026-04-17" },
    ],
  );
});
