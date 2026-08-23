import assert from "node:assert/strict";
import test from "node:test";
import {
  PLANNER_RECHECK_PENDING_FIELD,
  clearPlannerScheduleState,
  completePlannerTask,
  getPlannerDayAvailability,
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
