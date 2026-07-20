import test from "node:test";
import assert from "node:assert/strict";
import {
  getSubjectStudyUnits,
  normalizeStudyPreferences,
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

test("uses topic names first and fills the remaining chapter workload", () => {
  assert.deepEqual(
    getSubjectStudyUnits({
      chapters: 4,
      topics: ["Arrays", "Trees"],
    }),
    ["Arrays", "Trees", "Chapter 3", "Chapter 4"],
  );
});

test("keeps all optional topics when they exceed the chapter count", () => {
  assert.deepEqual(
    getSubjectStudyUnits({
      chapters: 2,
      topics: ["Arrays", "Trees", "Graphs"],
    }),
    ["Arrays", "Trees", "Graphs"],
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

  assert.deepEqual(tasks.map((task) => task.task), [
    "Data structures - Arrays · Practice",
    "Data structures - Trees · Practice",
    "Data structures - Chapter 3 · Practice",
    "Data structures - Chapter 4 · Practice",
  ]);
  assert.equal(tasks.every((task) => task.time === "Evening · 60 min"), true);
  assert.equal(tasks.every((task) => task.durationMinutes === 60), true);
  assert.equal(tasks[0].topic, "Arrays");
  assert.equal(tasks[0].unitType, "topic");
  assert.equal(tasks[2].unitType, "chapter");
});
