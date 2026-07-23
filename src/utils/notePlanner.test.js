import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRevisionTask,
  findNotePlannerTask,
  getNotePlannerState,
  getScheduleDateOptions,
  pruneRemovedTaskCompletions,
  removeNotesFromPlanner,
  upsertNotePlannerTask,
} from "./notePlanner.js";

const note = {
  id: "note-1",
  topic: "React hooks",
  leftTopics: [],
};

const schedule = [
  { day: 1, date: "2026-04-15", tasks: [{ time: "Morning", task: "Math - Algebra" }] },
  { day: 2, date: "2026-04-16", tasks: [] },
];

test("builds readable revision task names from current and legacy notes", () => {
  assert.equal(buildRevisionTask(note), "Revise React hooks doubt");
  assert.equal(
    buildRevisionTask({ ...note, leftTopics: ["Effects", "Memoization"] }),
    "Revise React hooks doubt: Effects, Memoization",
  );
});

test("lists actual schedule dates and marks past dates without timezone shifts", () => {
  assert.deepEqual(
    getScheduleDateOptions(schedule, "", "2026-04-16").map(({ dateKey, isPast, label }) => ({
      dateKey,
      isPast,
      label,
    })),
    [
      { dateKey: "2026-04-15", isPast: true, label: "Day 1 - 15/04/2026" },
      { dateKey: "2026-04-16", isPast: false, label: "Day 2 - 16/04/2026" },
    ],
  );
});

test("adds a linked note task and reschedules the same task without duplication", () => {
  const added = upsertNotePlannerTask(schedule, note, "2026-04-15");
  assert.equal(added.task.sourceNoteId, note.id);
  assert.equal(added.schedule[0].tasks.length, 2);

  const rescheduled = upsertNotePlannerTask(
    added.schedule,
    { ...note, plannedTask: added.task.task },
    "2026-04-16",
  );
  assert.equal(rescheduled.schedule[0].tasks.length, 1);
  assert.equal(rescheduled.schedule[1].tasks.length, 1);
  assert.equal(rescheduled.schedule[1].tasks[0].id, added.task.id);
});

test("gives duplicate note topics distinct stable completion names", () => {
  const first = upsertNotePlannerTask(schedule, note, "2026-04-15");
  const second = upsertNotePlannerTask(
    first.schedule,
    { ...note, id: "note-2" },
    "2026-04-16",
  );

  assert.equal(first.task.task, "Revise React hooks doubt");
  assert.equal(second.task.task, "Revise React hooks (2) doubt");
});

test("derives added and completed states from the linked planner task", () => {
  const added = upsertNotePlannerTask(schedule, note, "2026-04-16");
  const persistedNote = { ...note, planned: true, plannedTask: added.task.task };

  assert.equal(getNotePlannerState(persistedNote, added.schedule, []).state, "added");
  assert.equal(
    getNotePlannerState(persistedNote, added.schedule, [added.task.task]).state,
    "completed",
  );
});

test("finds legacy planner tasks by the stored planned task name", () => {
  const legacyNote = { ...note, planned: true, plannedTask: "Revise old note doubt" };
  const legacySchedule = [{
    day: 1,
    date: "2026-04-15",
    tasks: [{ time: "Morning", task: legacyNote.plannedTask }],
  }];

  assert.equal(findNotePlannerTask(legacySchedule, legacyNote)?.task.task, legacyNote.plannedTask);
});

test("removes linked tasks and only prunes completion names no longer in the schedule", () => {
  const added = upsertNotePlannerTask(schedule, note, "2026-04-16");
  const removed = removeNotesFromPlanner(added.schedule, [{ ...note, plannedTask: added.task.task }]);

  assert.equal(removed.changed, true);
  assert.equal(findNotePlannerTask(removed.schedule, note), null);
  assert.deepEqual(
    pruneRemovedTaskCompletions(
      [added.task.task, "Math - Algebra"],
      removed.removedTaskNames,
      removed.schedule,
    ),
    ["Math - Algebra"],
  );
});

test("does not fabricate a planner day when no schedule date exists", () => {
  assert.equal(upsertNotePlannerTask([], note, "2026-04-15"), null);
  assert.deepEqual(getScheduleDateOptions([{ day: 1, tasks: [] }]), []);
});
