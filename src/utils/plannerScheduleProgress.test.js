import assert from "node:assert/strict";
import test from "node:test";
import {
  MEMORY_REVIEW_RECHECK_REVISION_FIELD,
  PLANNER_QUIZ_UNLOCK_FIELD,
  PLANNER_RECHECK_PENDING_FIELD,
  clearPlannerScheduleState,
  completePlannerTask,
  completePlannerUnlockQuiz,
  getPlannerDayAvailability,
  getPlannerDayProgression,
  getPlannerNextUnlockCandidateIndex,
  getPlannerUnlockQuizContext,
  isPlannerDayCompleted,
  isPlannerTaskCompleted,
  isPlannerTaskPending,
  isPlannerTaskRecheckPending,
  reopenPlannerTask,
} from "./plannerScheduleProgress.js";
import { getPlannerMetrics } from "./plannerMetrics.js";

function localDate(year, month, day) {
  return new Date(year, month - 1, day, 12, 0, 0);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

test("Day 1 is available immediately, even when its scheduled date is in the future", () => {
  const availability = getPlannerDayAvailability(
    { day: 1, date: "2026-04-16", tasks: [{ task: "Algebra" }] },
    0,
    "2026-04-16",
    localDate(2026, 4, 15),
  );

  assert.deepEqual(availability, {
    dateKey: "2026-04-16",
    isFirstDay: true,
    isLocked: false,
    isUnlocked: true,
  });
});

test("later days stay locked before their date and unlock on that local date", () => {
  const day = { day: 2, date: "2026-04-16", tasks: [{ task: "Geometry" }] };

  assert.deepEqual(
    getPlannerDayAvailability(day, 1, "2026-04-15", localDate(2026, 4, 15)),
    {
      dateKey: "2026-04-16",
      isFirstDay: false,
      isLocked: true,
      isUnlocked: false,
    },
  );
  assert.equal(
    getPlannerDayAvailability(day, 1, "2026-04-15", localDate(2026, 4, 16)).isUnlocked,
    true,
  );
  assert.equal(
    getPlannerDayAvailability(day, 1, "2026-04-15", localDate(2026, 4, 17)).isUnlocked,
    true,
  );
});

test("legacy schedules derive dates from their start date and safely lock undated later days", () => {
  const legacyDay = { day: 3, tasks: [{ task: "Trigonometry" }] };
  const dated = getPlannerDayAvailability(
    legacyDay,
    2,
    "2026-04-15",
    localDate(2026, 4, 16),
  );
  const undated = getPlannerDayAvailability(
    legacyDay,
    2,
    "",
    localDate(2026, 4, 30),
  );

  assert.equal(dated.dateKey, "2026-04-17");
  assert.equal(dated.isLocked, true);
  assert.deepEqual(undated, {
    dateKey: "",
    isFirstDay: false,
    isLocked: true,
    isUnlocked: false,
  });
});

test("rest days use the same date gate and are not counted as completed study days", () => {
  const restDay = { day: 2, date: "2026-04-16", tasks: [] };

  assert.equal(isPlannerDayCompleted(restDay, []), false);
  assert.equal(
    getPlannerDayAvailability(restDay, 1, "2026-04-15", localDate(2026, 4, 15)).isLocked,
    true,
  );
  assert.equal(
    getPlannerDayAvailability(restDay, 1, "2026-04-15", localDate(2026, 4, 16)).isUnlocked,
    true,
  );
});

test("completed and reopened task predicates preserve historical completion", () => {
  const completed = ["Algebra"];
  const completedTask = { task: "Algebra" };
  const reopenedTask = {
    task: "Algebra",
    [PLANNER_RECHECK_PENDING_FIELD]: true,
  };

  assert.equal(isPlannerTaskCompleted(completedTask, completed), true);
  assert.equal(isPlannerTaskPending(completedTask, completed), false);
  assert.equal(isPlannerTaskRecheckPending(completedTask), false);

  assert.equal(isPlannerTaskCompleted(reopenedTask, completed), true);
  assert.equal(isPlannerTaskPending(reopenedTask, completed), true);
  assert.equal(isPlannerTaskRecheckPending(reopenedTask), true);
  assert.equal(
    isPlannerDayCompleted({ tasks: [completedTask, reopenedTask] }, completed),
    true,
    "rechecking must not erase completion used by analytics",
  );
});

test("reopening one duplicate task occurrence flags only that occurrence and keeps the full plan", () => {
  const originalSchedule = deepFreeze([
    {
      day: 1,
      date: "2026-04-15",
      tasks: [{ task: "Algebra", time: "Morning" }],
    },
    {
      day: 2,
      date: "2026-04-16",
      tasks: [],
    },
    {
      day: 3,
      date: "2026-04-17",
      tasks: [{ task: "Algebra", time: "Evening" }],
    },
    {
      day: 4,
      date: "2026-04-18",
      tasks: [{ task: "Calculus", time: "Morning" }],
    },
  ]);
  const snapshot = structuredClone(originalSchedule);

  const reopened = reopenPlannerTask(originalSchedule, ["Algebra"], 0, 0);

  assert.equal(reopened.length, originalSchedule.length);
  assert.equal(reopened[0].tasks[0][PLANNER_RECHECK_PENDING_FIELD], true);
  assert.equal(reopened[2].tasks[0][PLANNER_RECHECK_PENDING_FIELD], undefined);
  assert.equal(isPlannerTaskPending(reopened[0].tasks[0], ["Algebra"]), true);
  assert.equal(isPlannerTaskPending(reopened[2].tasks[0], ["Algebra"]), false);
  assert.strictEqual(reopened[1], originalSchedule[1]);
  assert.strictEqual(reopened[2], originalSchedule[2]);
  assert.strictEqual(reopened[3], originalSchedule[3]);
  assert.deepEqual(originalSchedule, snapshot, "the generated plan must not be mutated");
});

test("rechecking preserves analytics before reopen, while pending, and after finishing again", () => {
  const completed = deepFreeze(["Algebra", "Geometry"]);
  const schedule = deepFreeze([
    {
      day: 1,
      tasks: [{ task: "Algebra" }],
    },
    {
      day: 2,
      tasks: [{ task: "Geometry" }],
    },
  ]);
  const snapshot = structuredClone(schedule);
  const beforeMetrics = getPlannerMetrics(schedule, completed);
  const reopenedSchedule = reopenPlannerTask(schedule, completed, 0, 0);
  const pendingMetrics = getPlannerMetrics(reopenedSchedule, completed);

  const result = completePlannerTask(reopenedSchedule, completed, 0, 0);
  const afterMetrics = getPlannerMetrics(result.schedule, result.completed);

  assert.strictEqual(result.completed, completed);
  assert.deepEqual(result.completed, ["Algebra", "Geometry"]);
  assert.equal(result.schedule.length, 2);
  assert.equal(result.schedule[0].tasks[0].recheckPending, undefined);
  assert.strictEqual(result.schedule[1], schedule[1]);
  assert.deepEqual(schedule, snapshot);
  assert.deepEqual(
    {
      completedTasks: beforeMetrics.completedTasks,
      completionRate: beforeMetrics.completionRate,
    },
    { completedTasks: 2, completionRate: 100 },
  );
  assert.deepEqual(
    {
      completedTasks: pendingMetrics.completedTasks,
      completionRate: pendingMetrics.completionRate,
    },
    {
      completedTasks: beforeMetrics.completedTasks,
      completionRate: beforeMetrics.completionRate,
    },
  );
  assert.deepEqual(
    {
      completedTasks: afterMetrics.completedTasks,
      completionRate: afterMetrics.completionRate,
    },
    {
      completedTasks: beforeMetrics.completedTasks,
      completionRate: beforeMetrics.completionRate,
    },
  );

  const repeated = completePlannerTask(result.schedule, result.completed, 0, 0);
  assert.strictEqual(repeated.completed, completed);
  assert.strictEqual(repeated.schedule, result.schedule);
  assert.deepEqual(repeated.completed, ["Algebra", "Geometry"]);
});

test("each intentional memory-review reopen gets a stable new attempt revision", () => {
  const completed = ["3-minute memory check: Biology - Mitosis"];
  const schedule = [{
    day: 1,
    tasks: [{
      id: "memory-review-mitosis",
      source: "memory_review",
      task: completed[0],
    }],
  }];

  const firstReopen = reopenPlannerTask(schedule, completed, 0, 0);
  assert.equal(firstReopen[0].tasks[0][PLANNER_RECHECK_PENDING_FIELD], true);
  assert.equal(
    firstReopen[0].tasks[0][MEMORY_REVIEW_RECHECK_REVISION_FIELD],
    1,
  );

  const firstCompletion = completePlannerTask(firstReopen, completed, 0, 0);
  assert.strictEqual(firstCompletion.completed, completed);
  assert.equal(
    firstCompletion.schedule[0].tasks[0][PLANNER_RECHECK_PENDING_FIELD],
    undefined,
  );
  assert.equal(
    firstCompletion.schedule[0].tasks[0][MEMORY_REVIEW_RECHECK_REVISION_FIELD],
    1,
  );

  const secondReopen = reopenPlannerTask(firstCompletion.schedule, completed, 0, 0);
  assert.equal(
    secondReopen[0].tasks[0][MEMORY_REVIEW_RECHECK_REVISION_FIELD],
    2,
  );
  assert.deepEqual(completed, ["3-minute memory check: Biology - Mitosis"]);
});

test("ID-aware memory completions reopen only their exact Planner occurrence", () => {
  const taskName = "3-minute memory check: Biology - Mitosis";
  const schedule = [{
    day: 1,
    tasks: [
      { id: "memory-review-a", source: "memory_review", task: taskName },
      { id: "memory-review-b", source: "memory_review", task: taskName },
    ],
  }];
  const completed = ["memory-decay-a"];

  assert.equal(isPlannerTaskCompleted(schedule[0].tasks[0], completed), true);
  assert.equal(isPlannerTaskCompleted(schedule[0].tasks[1], completed), false);
  const reopened = reopenPlannerTask(schedule, completed, 0, 0);
  assert.equal(reopened[0].tasks[0][PLANNER_RECHECK_PENDING_FIELD], true);
  assert.equal(
    reopened[0].tasks[0][MEMORY_REVIEW_RECHECK_REVISION_FIELD],
    1,
  );
  assert.strictEqual(reopened[0].tasks[1], schedule[0].tasks[1]);
  assert.strictEqual(reopenPlannerTask(schedule, completed, 0, 1), schedule);
  assert.deepEqual(completed, ["memory-decay-a"]);
});

test("first completion appends once while invalid and repeated completions are no-ops", () => {
  const schedule = [{ day: 1, tasks: [{ task: "Calculus" }, { task: "" }] }];
  const first = completePlannerTask(schedule, ["Algebra"], 0, 0);
  const repeated = completePlannerTask(first.schedule, first.completed, 0, 0);
  const invalid = completePlannerTask(first.schedule, first.completed, 0, 1);

  assert.deepEqual(first.completed, ["Algebra", "Calculus"]);
  assert.strictEqual(first.schedule, schedule);
  assert.strictEqual(repeated.completed, first.completed);
  assert.strictEqual(repeated.schedule, schedule);
  assert.strictEqual(invalid.completed, first.completed);
  assert.strictEqual(invalid.schedule, schedule);
});

test("clear removes planner progress but preserves subjects and unrelated profile state", () => {
  const subjects = [{ name: "Mathematics", chapters: 8 }];
  const state = {
    profileName: "Exam prep",
    subjects,
    completed: ["Algebra"],
    schedule: [{ day: 1, tasks: [{ task: "Algebra" }] }],
    scheduleStartDate: "2026-04-15",
  };

  const cleared = clearPlannerScheduleState(state);

  assert.deepEqual(cleared.completed, []);
  assert.deepEqual(cleared.schedule, []);
  assert.equal(cleared.scheduleStartDate, null);
  assert.strictEqual(cleared.subjects, subjects);
  assert.equal(cleared.profileName, "Exam prep");
  assert.deepEqual(state.completed, ["Algebra"]);
  assert.equal(state.scheduleStartDate, "2026-04-15");
});

test("planner unlock quiz requires exactly 8 of 10 and persists an immutable proof", () => {
  const schedule = deepFreeze([
    {
      day: 1,
      date: "2999-01-01",
      tasks: [
        {
          subjectName: "Mathematics",
          task: "Mathematics - Fractions",
          topic: "Fractions",
          unitKey: "maths-fractions",
        },
        {
          subjectName: "Science",
          task: "Science - Cells",
          topic: "Cells",
          unitKey: "science-cells",
        },
      ],
    },
    {
      day: 2,
      date: "2999-01-02",
      tasks: [{ task: "Mathematics - Decimals", topic: "Decimals" }],
    },
  ]);
  const completed = ["Mathematics - Fractions", "Science - Cells"];
  const options = {
    now: new Date("2026-08-23T10:00:00.000Z"),
    scheduleStartDate: "2999-01-01",
    today: localDate(2026, 8, 23),
  };

  const context = getPlannerUnlockQuizContext(schedule, 1, options.scheduleStartDate);
  assert.deepEqual(context.subjects, ["Mathematics", "Science"]);
  assert.deepEqual(context.topics, ["Fractions", "Cells"]);
  assert.equal(context.sourceDayIndex, 0);

  const before = getPlannerDayProgression(
    schedule,
    completed,
    1,
    options.scheduleStartDate,
    options.today,
  );
  assert.equal(before.isLocked, true);
  assert.equal(before.canAttemptUnlockQuiz, true);

  const failed = completePlannerUnlockQuiz(
    schedule,
    completed,
    1,
    { score: 7, total: 10 },
    options,
  );
  assert.strictEqual(failed.schedule, schedule);
  assert.equal(failed.passed, false);
  assert.equal(failed.percentage, 70);
  assert.equal(failed.reason, "score-below-threshold");

  const passed = completePlannerUnlockQuiz(
    schedule,
    completed,
    1,
    { score: 8, total: 10 },
    options,
  );
  assert.notStrictEqual(passed.schedule, schedule);
  assert.strictEqual(passed.schedule[0], schedule[0]);
  assert.equal(passed.schedule[1][PLANNER_QUIZ_UNLOCK_FIELD].score, 8);
  assert.equal(passed.schedule[1][PLANNER_QUIZ_UNLOCK_FIELD].total, 10);
  assert.equal(schedule[1][PLANNER_QUIZ_UNLOCK_FIELD], undefined);
  assert.equal(
    getPlannerDayProgression(
      passed.schedule,
      completed,
      1,
      options.scheduleStartDate,
      options.today,
    ).isQuizUnlocked,
    true,
  );

  const invalidTotal = completePlannerUnlockQuiz(
    schedule,
    completed,
    1,
    { score: 8, total: 9 },
    options,
  );
  assert.strictEqual(invalidTotal.schedule, schedule);
  assert.equal(invalidTotal.reason, "invalid-result");
});

test("generic chapter quiz context preserves each subject and requests clarification", () => {
  const schedule = [
    {
      day: 1,
      date: "2999-01-01",
      tasks: [
        {
          subjectName: "RestAPI",
          task: "RestAPI - Chapter 1",
          topic: "Chapter 1",
          unitKey: "chapter:1",
        },
        {
          subjectName: "Cloud",
          task: "Cloud - Chapter 2",
          topic: "Chapter 2",
          unitKey: "chapter:2",
        },
        {
          subjectName: "Data analytics",
          task: "Data analytics - Chapter 1",
          topic: "Chapter 1",
          unitKey: "chapter:1",
        },
      ],
    },
    {
      day: 2,
      date: "2999-01-02",
      tasks: [{ task: "Next topic" }],
    },
  ];

  const context = getPlannerUnlockQuizContext(schedule, 1, "2999-01-01");

  assert.deepEqual(context.topics, [
    "RestAPI — Chapter 1",
    "Cloud — Chapter 2",
    "Data analytics — Chapter 1",
  ]);
  assert.deepEqual(context.genericTopics, context.topics);
  assert.equal(context.needsTopicDetails, true);
  assert.match(context.topic, /RestAPI — Chapter 1; Cloud — Chapter 2/u);

  const legacyContext = getPlannerUnlockQuizContext([
    {
      day: 1,
      tasks: [{ task: "Networking - Chapter 4" }],
    },
    {
      day: 2,
      tasks: [{ task: "Next topic" }],
    },
  ], 1);

  assert.deepEqual(legacyContext.topics, ["Networking — Chapter 4"]);
  assert.equal(legacyContext.needsTopicDetails, true);
});

test("only the first locked study day can become the sequential unlock candidate", () => {
  const schedule = [
    {
      day: 1,
      date: "2999-01-01",
      tasks: [{ task: "Day 1 topic" }],
    },
    {
      day: 2,
      date: "2999-01-02",
      tasks: [{ task: "Day 2 topic" }],
    },
    {
      day: 3,
      date: "2999-01-03",
      tasks: [{ task: "Day 3 topic" }],
    },
  ];
  const today = localDate(2026, 8, 23);
  const options = {
    scheduleStartDate: "2999-01-01",
    today,
  };

  assert.equal(
    getPlannerNextUnlockCandidateIndex(
      schedule,
      [],
      options.scheduleStartDate,
      today,
    ),
    -1,
  );
  assert.equal(
    getPlannerNextUnlockCandidateIndex(
      schedule,
      ["Day 1 topic"],
      options.scheduleStartDate,
      today,
    ),
    1,
  );

  const dayTwoUnlocked = completePlannerUnlockQuiz(
    schedule,
    ["Day 1 topic"],
    1,
    { score: 8, total: 10 },
    options,
  ).schedule;

  assert.equal(
    getPlannerNextUnlockCandidateIndex(
      dayTwoUnlocked,
      ["Day 1 topic"],
      options.scheduleStartDate,
      today,
    ),
    -1,
    "Day 3 stays unavailable until every Day 2 task is complete",
  );
  assert.equal(
    getPlannerNextUnlockCandidateIndex(
      dayTwoUnlocked,
      ["Day 1 topic", "Day 2 topic"],
      options.scheduleStartDate,
      today,
    ),
    2,
  );
});

test("unlock proof follows the exact source topics but survives a historical recheck", () => {
  const schedule = [
    {
      day: 1,
      date: "2999-01-01",
      tasks: [{
        subjectName: "Physics",
        task: "Physics - Motion",
        topic: "Motion",
        unitKey: "physics-motion",
      }],
    },
    {
      day: 2,
      date: "2999-01-02",
      tasks: [{ task: "Physics - Force", topic: "Force" }],
    },
  ];
  const completed = ["Physics - Motion"];
  const options = {
    scheduleStartDate: "2999-01-01",
    today: localDate(2026, 8, 23),
  };
  const unlocked = completePlannerUnlockQuiz(
    schedule,
    completed,
    1,
    { score: 9, total: 10 },
    options,
  ).schedule;
  const reopenedSource = [
    {
      ...unlocked[0],
      tasks: [{
        ...unlocked[0].tasks[0],
        [PLANNER_RECHECK_PENDING_FIELD]: true,
      }],
    },
    unlocked[1],
  ];

  assert.equal(
    getPlannerDayProgression(
      reopenedSource,
      completed,
      1,
      options.scheduleStartDate,
      options.today,
    ).isQuizUnlocked,
    true,
    "rechecking must not revoke an earned unlock",
  );

  const changedSource = [
    {
      ...unlocked[0],
      tasks: [{
        ...unlocked[0].tasks[0],
        topic: "Accelerated motion",
      }],
    },
    unlocked[1],
  ];
  const changedProgression = getPlannerDayProgression(
    changedSource,
    completed,
    1,
    options.scheduleStartDate,
    options.today,
  );

  assert.equal(changedProgression.isQuizUnlocked, false);
  assert.equal(changedProgression.isLocked, true);
  assert.notEqual(
    getPlannerUnlockQuizContext(changedSource, 1, options.scheduleStartDate)
      .sourceTaskSignature,
    unlocked[1][PLANNER_QUIZ_UNLOCK_FIELD].sourceTaskSignature,
  );
});

test("revision blocks auto-unlock after the last real study day and never become quiz sources", () => {
  const schedule = [
    {
      day: 1,
      date: "2999-01-01",
      tasks: [{
        subjectName: "Biology",
        task: "Biology - Cell structure",
        topic: "Cell structure",
      }],
    },
    { day: 2, date: "2999-01-02", tasks: [] },
    { day: 3, date: "2999-01-03", tasks: [] },
    {
      day: 4,
      date: "2999-01-04",
      tasks: [{ task: "Biology - Genetics", topic: "Genetics" }],
    },
  ];
  const completed = ["Biology - Cell structure"];
  const today = localDate(2026, 8, 23);

  const revisionDayTwo = getPlannerDayProgression(
    schedule,
    completed,
    1,
    "2999-01-01",
    today,
  );
  const revisionDayThree = getPlannerDayProgression(
    schedule,
    completed,
    2,
    "2999-01-01",
    today,
  );
  const nextStudyDay = getPlannerDayProgression(
    schedule,
    completed,
    3,
    "2999-01-01",
    today,
  );

  assert.equal(revisionDayTwo.isRevisionDay, true);
  assert.equal(revisionDayTwo.isRevisionAutoUnlocked, true);
  assert.equal(revisionDayTwo.isLocked, false);
  assert.equal(revisionDayTwo.canAttemptUnlockQuiz, false);

  assert.equal(revisionDayThree.isRevisionAutoUnlocked, true);
  assert.equal(revisionDayThree.sourceDayIndex, 0);

  assert.equal(nextStudyDay.isRevisionDay, false);
  assert.equal(nextStudyDay.isLocked, true);
  assert.equal(nextStudyDay.canAttemptUnlockQuiz, true);
  assert.equal(nextStudyDay.sourceDayIndex, 0);
  assert.deepEqual(nextStudyDay.quizContext.topics, ["Cell structure"]);
});

test("revision blocks remain locked early until their prior study day is complete", () => {
  const schedule = [
    {
      day: 1,
      date: "2999-01-01",
      tasks: [{ task: "Chemistry - Atoms", topic: "Atoms" }],
    },
    { day: 2, date: "2999-01-02", tasks: [] },
  ];

  const progression = getPlannerDayProgression(
    schedule,
    [],
    1,
    "2999-01-01",
    localDate(2026, 8, 23),
  );

  assert.equal(progression.isRevisionDay, true);
  assert.equal(progression.isRevisionAutoUnlocked, false);
  assert.equal(progression.isLocked, true);
  assert.equal(progression.canAttemptUnlockQuiz, false);
});
