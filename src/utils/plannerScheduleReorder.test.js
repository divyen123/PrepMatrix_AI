import assert from "node:assert/strict";
import test from "node:test";
import {
  PLANNER_SCHEDULE_REORDER_MODES,
  reorderPlannerSchedule,
} from "./plannerScheduleReorder.js";

const subjects = [
  {
    chapterNames: ["Cells", "Genetics"],
    chapters: 2,
    difficulty: "easy",
    name: "Biology",
    topics: ["Microscopy", "Cell division"],
  },
  {
    chapterNames: ["Numbers", "Equations"],
    chapters: 2,
    difficulty: "hard",
    name: "Mathematics",
    topics: ["Integers", "Variables"],
  },
  {
    chapters: 1,
    difficulty: "medium",
    name: "History",
  },
];

function subjectTask(subjectName, topic, unitKey, unitIndex, time, durationMinutes) {
  return {
    ...(durationMinutes ? { durationMinutes } : {}),
    source: "subject",
    subjectName,
    task: subjectName + " - " + topic,
    time,
    topic,
    unitIndex,
    unitKey,
    unitType: unitKey.startsWith("chapter:") ? "chapter" : "topic",
  };
}

test("reorders unfinished generated work into the saved subject and syllabus order", () => {
  const firstSlot = subjectTask("Mathematics", "Equations", "chapter:2", 3, "Morning", 30);
  const pinnedNote = {
    source: "note",
    sourceNoteId: "note-1",
    task: "Review lecture notes",
    time: "Midday",
  };
  const secondSlot = subjectTask("Biology", "Cells", "chapter:1", 2, "Evening", 60);
  const thirdSlot = subjectTask("Mathematics", "Variables", "topic:variables", 1, "Morning", 45);
  const completedTask = subjectTask("Mathematics", "Integers", "topic:integers", 0, "Midday", 30);
  const fourthSlot = subjectTask("Mathematics", "Numbers", "chapter:1", 2, "Evening", 90);
  const schedule = [
    { day: 1, date: "2026-10-25", tasks: [firstSlot, pinnedNote, secondSlot] },
    { day: 2, date: "2026-10-26", tasks: [thirdSlot, completedTask, fourthSlot] },
    { day: 3, date: "2026-10-27", tasks: [] },
  ];

  const result = reorderPlannerSchedule(schedule, [completedTask.task], subjects, {
    mode: PLANNER_SCHEDULE_REORDER_MODES.SEQUENCE,
    scheduleStartDate: "2026-10-25",
  });

  assert.equal(result.changed, true);
  assert.equal(result.movedTaskCount, 4);
  assert.notEqual(result.schedule, schedule);
  assert.equal(result.schedule[0].date, schedule[0].date);
  assert.equal(result.schedule[1].date, schedule[1].date);
  assert.equal(result.schedule[2], schedule[2]);
  assert.equal(result.schedule[0].tasks[1], pinnedNote);
  assert.equal(result.schedule[1].tasks[1], completedTask);
  assert.deepEqual(
    result.schedule.flatMap((day) => day.tasks)
      .filter((task) => task.source === "subject" && task !== completedTask)
      .map((task) => task.task),
    [
      "Biology - Cells",
      "Mathematics - Variables",
      "Mathematics - Numbers",
      "Mathematics - Equations",
    ],
  );
  assert.deepEqual(
    [
      result.schedule[0].tasks[0].time,
      result.schedule[0].tasks[2].time,
      result.schedule[1].tasks[0].time,
      result.schedule[1].tasks[2].time,
    ],
    ["Morning", "Evening", "Morning", "Evening"],
  );
  assert.deepEqual(
    [
      result.schedule[0].tasks[0].durationMinutes,
      result.schedule[0].tasks[2].durationMinutes,
      result.schedule[1].tasks[0].durationMinutes,
      result.schedule[1].tasks[2].durationMinutes,
    ],
    [30, 60, 45, 90],
  );
  assert.equal(schedule[0].tasks[0], firstSlot);
  assert.equal(schedule[1].tasks[0], thirdSlot);
});

test("puts hard, then medium, then easy unfinished work first while keeping syllabus order within a tier", () => {
  const schedule = [{
    day: 1,
    tasks: [
      subjectTask("Biology", "Genetics", "chapter:2", 3, "Morning"),
      subjectTask("Mathematics", "Numbers", "chapter:1", 2, "Midday"),
      subjectTask("History", "Chapter 1", "chapter:1", 0, "Evening"),
      subjectTask("Mathematics", "Variables", "topic:variables", 1, "Night"),
    ],
  }];

  const result = reorderPlannerSchedule(schedule, [], subjects, {
    mode: PLANNER_SCHEDULE_REORDER_MODES.PRIORITY,
  });

  assert.equal(result.changed, true);
  assert.deepEqual(
    result.schedule[0].tasks.map((task) => task.task),
    [
      "Mathematics - Variables",
      "Mathematics - Numbers",
      "History - Chapter 1",
      "Biology - Genetics",
    ],
  );
  assert.deepEqual(
    result.schedule[0].tasks.map((task) => task.time),
    ["Morning", "Midday", "Evening", "Night"],
  );
});

test("transfers the full destination slot metadata, including a missing legacy slot", () => {
  const firstSlot = subjectTask("Biology", "Genetics", "chapter:2", 3, "Morning", 30);
  delete firstSlot.time;
  delete firstSlot.durationMinutes;
  const secondSlot = subjectTask("Mathematics", "Equations", "chapter:2", 3, "Evening", 90);
  const schedule = [{ day: 1, tasks: [firstSlot, secondSlot] }];

  const result = reorderPlannerSchedule(schedule, [], subjects, {
    mode: PLANNER_SCHEDULE_REORDER_MODES.PRIORITY,
  });

  assert.equal(result.changed, true);
  assert.equal(result.schedule[0].tasks[0].task, "Mathematics - Equations");
  assert.equal(Object.hasOwn(result.schedule[0].tasks[0], "time"), false);
  assert.equal(Object.hasOwn(result.schedule[0].tasks[0], "durationMinutes"), false);
  assert.equal(result.schedule[0].tasks[1].task, "Biology - Genetics");
  assert.equal(result.schedule[0].tasks[1].time, "Evening");
  assert.equal(result.schedule[0].tasks[1].durationMinutes, 90);
  assert.equal(secondSlot.time, "Evening");
  assert.equal(secondSlot.durationMinutes, 90);
});

test("keeps unmatched subject work fixed instead of guessing its syllabus position", () => {
  const biologyTask = subjectTask("Biology", "Genetics", "chapter:2", 3, "Morning");
  const unmatchedTask = {
    source: "subject",
    subjectName: "Mathematics",
    task: "Mathematics - Imported legacy exercise",
    time: "Midday",
    topic: "Imported legacy exercise",
    unitKey: "topic:imported-legacy-exercise",
    unitType: "topic",
  };
  const historyTask = subjectTask("History", "Chapter 1", "chapter:1", 0, "Evening");
  const schedule = [{ day: 1, tasks: [biologyTask, unmatchedTask, historyTask] }];

  const result = reorderPlannerSchedule(schedule, [], subjects, {
    mode: PLANNER_SCHEDULE_REORDER_MODES.PRIORITY,
  });

  assert.equal(result.changed, true);
  assert.deepEqual(
    result.schedule[0].tasks.map((task) => task.task),
    [
      "History - Chapter 1",
      "Mathematics - Imported legacy exercise",
      "Biology - Genetics",
    ],
  );
  assert.equal(result.schedule[0].tasks[1], unmatchedTask);
  assert.equal(result.schedule[0].tasks[1].time, "Midday");
});

test("leaves completed, recheck, external, unknown, and quiz-unlock source work fixed", () => {
  const protectedSourceTask = subjectTask("Mathematics", "Equations", "chapter:2", 3, "Morning");
  const completedTask = subjectTask("Mathematics", "Integers", "topic:integers", 0, "Midday");
  const recheckTask = {
    ...subjectTask("Biology", "Microscopy", "topic:microscopy", 0, "Evening"),
    recheckPending: true,
  };
  const noteTask = { source: "note", sourceNoteId: "note-1", task: "Review notes" };
  const learningTask = {
    source: "learning",
    sourceLearningProjectId: "notebook-1",
    task: "Review learning notebook",
  };
  const coachTask = { source: "answer-coach", sourcePaperId: "paper-1", task: "Answer Coach revision" };
  const legacyTask = { task: "Legacy task without a source" };
  const biologyTask = subjectTask("Biology", "Genetics", "chapter:2", 3, "Morning");
  const historyTask = subjectTask("History", "Chapter 1", "chapter:1", 0, "Evening");
  const schedule = [
    {
      day: 1,
      date: "2026-10-25",
      tasks: [protectedSourceTask, completedTask, recheckTask, noteTask, learningTask, coachTask, legacyTask],
    },
    {
      day: 2,
      date: "2026-10-26",
      plannerQuizUnlock: {
        sourceDayKey: "date:2026-10-25",
      },
      tasks: [biologyTask, historyTask],
    },
    { day: 3, date: "2026-10-27", tasks: [] },
  ];

  const result = reorderPlannerSchedule(schedule, [completedTask.task], subjects, {
    mode: PLANNER_SCHEDULE_REORDER_MODES.PRIORITY,
    scheduleStartDate: "2026-10-25",
  });

  assert.equal(result.changed, true);
  assert.equal(result.schedule[0], schedule[0]);
  assert.equal(result.schedule[0].tasks[0], protectedSourceTask);
  assert.equal(result.schedule[0].tasks[1], completedTask);
  assert.equal(result.schedule[0].tasks[2], recheckTask);
  assert.equal(result.schedule[0].tasks[3], noteTask);
  assert.equal(result.schedule[0].tasks[4], learningTask);
  assert.equal(result.schedule[0].tasks[5], coachTask);
  assert.equal(result.schedule[0].tasks[6], legacyTask);
  assert.equal(result.schedule[2], schedule[2]);
  assert.deepEqual(
    result.schedule[1].tasks.map((task) => task.task),
    ["History - Chapter 1", "Biology - Genetics"],
  );
  assert.deepEqual(
    result.schedule[1].tasks.map((task) => task.time),
    ["Morning", "Evening"],
  );
});

test("is stable, idempotent, and leaves unusable schedules untouched", () => {
  const ordered = [{
    day: 1,
    tasks: [
      subjectTask("Biology", "Microscopy", "topic:microscopy", 0, "Morning"),
      subjectTask("Mathematics", "Integers", "topic:integers", 0, "Midday"),
    ],
  }];
  const first = reorderPlannerSchedule(ordered, [], subjects, {
    mode: PLANNER_SCHEDULE_REORDER_MODES.SEQUENCE,
  });
  const emptySchedule = [];
  const empty = reorderPlannerSchedule(emptySchedule, [], subjects);
  const unknownSubjects = reorderPlannerSchedule(ordered, [], []);

  assert.equal(first.changed, false);
  assert.equal(first.schedule, ordered);
  assert.equal(empty.changed, false);
  assert.equal(empty.schedule, emptySchedule);
  assert.equal(unknownSubjects.changed, false);
  assert.equal(unknownSubjects.schedule, ordered);
});
