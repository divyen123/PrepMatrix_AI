import test from "node:test";
import assert from "node:assert/strict";
import { generateSchedule } from "./scheduleGenerator.js";

const subjects = [{
  chapters: 1,
  difficulty: "medium",
  name: "Mathematics",
}];

test("preserves note-link metadata when carrying backlog into a new schedule", () => {
  const noteTask = {
    id: "note-note-1",
    source: "note",
    sourceNoteId: "note-1",
    task: "Revise React hooks doubt",
    time: "Evening",
  };
  const result = generateSchedule(
    subjects,
    2,
    [noteTask],
    { startDate: "2026-04-15" },
  );

  assert.equal(result[0].date, "2026-04-15");
  assert.equal(result[0].tasks[0].sourceNoteId, "note-1");
  assert.equal(result[0].tasks[0].task, noteTask.task);
  assert.equal(result[0].tasks[0].time, "Morning");
});

test("keeps accepting legacy string backlog tasks", () => {
  const result = generateSchedule(
    subjects,
    1,
    ["Revise legacy doubt"],
    { startDate: "2026-04-15" },
  );

  assert.equal(result[0].tasks[0].task, "Revise legacy doubt");
});
