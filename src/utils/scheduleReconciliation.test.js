import test from "node:test";
import assert from "node:assert/strict";
import {
  reconcileScheduleWithSubjects,
  reconcileSubjectSchedule,
} from "./scheduleReconciliation.js";

const previousSubject = {
  chapters: 2,
  difficulty: "hard",
  name: "Networks",
};

function subjectTask(chapterNumber, time) {
  return {
    source: "subject",
    subjectName: "Networks",
    task: `Networks - Chapter ${chapterNumber}`,
    time,
    topic: `Chapter ${chapterNumber}`,
    unitType: "chapter",
  };
}

test("updates named chapters in place and adds new topics without moving unrelated work", () => {
  const noteTask = {
    id: "note-1",
    source: "note",
    sourceNoteId: "note-1",
    task: "Revise a networking doubt",
    time: "Evening",
  };
  const otherTask = {
    source: "subject",
    subjectName: "Mathematics",
    task: "Mathematics - Chapter 1",
    time: "Midday",
    topic: "Chapter 1",
    unitType: "chapter",
  };
  const schedule = [
    {
      date: "2026-07-25",
      day: 1,
      tasks: [subjectTask(1, "Morning"), noteTask, otherTask],
    },
    {
      date: "2026-07-26",
      day: 2,
      tasks: [subjectTask(2, "Midday")],
    },
  ];
  const nextSubject = {
    ...previousSubject,
    chapterNames: ["Network foundations", "Routing"],
    topics: ["OSI model", "Mail configuration"],
  };

  const result = reconcileSubjectSchedule(
    schedule,
    ["Networks - Chapter 1", "Mathematics - Chapter 1"],
    previousSubject,
    nextSubject,
  );

  assert.equal(result.changed, true);
  assert.deepEqual(result.schedule.map((day) => day.date), ["2026-07-25", "2026-07-26"]);
  assert.equal(result.schedule[0].tasks[0].task, "Networks - Network foundations");
  assert.equal(result.schedule[0].tasks[0].time, "Morning");
  assert.equal(result.schedule[1].tasks[0].task, "Networks - Routing");
  assert.equal(result.schedule[1].tasks[0].time, "Midday");
  assert.deepEqual(result.schedule[0].tasks[1], noteTask);
  assert.deepEqual(result.schedule[0].tasks[2], otherTask);
  assert.deepEqual(
    result.schedule
      .flatMap((day) => day.tasks)
      .filter((task) => task.subjectName === "Networks")
      .map((task) => task.topic)
      .sort(),
    ["Mail configuration", "Network foundations", "OSI model", "Routing"].sort(),
  );
  assert.equal(result.completed.includes("Networks - Network foundations"), true);
  assert.equal(result.completed.includes("Networks - Chapter 1"), false);
  assert.equal(result.completed.includes("Networks - OSI model"), false);
  assert.equal(result.completed.includes("Mathematics - Chapter 1"), true);
});

test("reconciles legacy raw chapter tasks while ignoring note-linked tasks", () => {
  const legacyChapterTask = {
    task: "Networks - Chapter 1",
    time: "Morning",
  };
  const noteTask = {
    source: "note",
    sourceNoteId: "note-2",
    task: "Networks - Chapter 1 follow-up",
    time: "Evening",
  };
  const schedule = [{
    date: "2026-07-25",
    day: 1,
    tasks: [
      {
        source: "subject",
        subjectName: "Networks",
        task: "Networks - OSI model",
        time: "Midday",
        topic: "OSI model",
        unitType: "topic",
      },
      legacyChapterTask,
      noteTask,
    ],
  }];
  const result = reconcileSubjectSchedule(
    schedule,
    ["Networks - OSI model", "Networks - Chapter 1"],
    { ...previousSubject, chapters: 1, topics: ["OSI model"] },
    { ...previousSubject, chapterNames: ["Network basics"], chapters: 1, topics: [] },
  );

  assert.deepEqual(
    result.schedule[0].tasks.map((task) => task.task),
    ["Networks - Network basics", "Networks - Chapter 1 follow-up"],
  );
  assert.equal(result.schedule[0].tasks[0].time, "Morning");
  assert.deepEqual(result.schedule[0].tasks[1], noteTask);
  assert.deepEqual(result.completed, ["Networks - Network basics"]);
});

test("only reconciles subjects whose planning signature changed", () => {
  const schedule = [{
    day: 1,
    tasks: [subjectTask(1, "Morning")],
  }];
  const result = reconcileScheduleWithSubjects(
    schedule,
    [],
    [previousSubject],
    [{ ...previousSubject }],
  );

  assert.equal(result.changed, false);
  assert.equal(result.schedule, schedule);
});
