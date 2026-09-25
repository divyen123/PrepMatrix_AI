import assert from "node:assert/strict";
import test from "node:test";
import { getStudyMomentumDailyMetrics } from "./studyMomentumMetrics.js";

const task = (id, name, extra = {}) => ({ id, task: name, ...extra });

test("a future first day does not count as today or start a streak", () => {
  assert.deepEqual(getStudyMomentumDailyMetrics({
    schedule: [{ day: 1, tasks: [task("future", "Future study")] }],
    completed: ["future"],
    scheduleStartDate: "2026-09-26",
    today: "2026-09-25",
  }), {
    todayCompleted: 0,
    todayTotal: 0,
    todayProgress: 0,
    streak: 0,
  });
});

test("today uses the matching schedule date rather than the first day", () => {
  assert.deepEqual(getStudyMomentumDailyMetrics({
    schedule: [
      { date: "2026-09-24", tasks: [task("past", "Past study")] },
      { date: "2026-09-25", tasks: [task("first", "First today"), task("second", "Second today")] },
    ],
    completed: ["past", "first"],
    today: "2026-09-25",
  }), {
    todayCompleted: 1,
    todayTotal: 2,
    todayProgress: 50,
    streak: 2,
  });
});

test("ID-based completions count while pending rechecks do not", () => {
  assert.deepEqual(getStudyMomentumDailyMetrics({
    schedule: [{ date: "2026-09-25", tasks: [
      task("study-1", "Study topic"),
      task("study-2", "Recheck topic", { recheckPending: true }),
    ] }],
    completed: [{ taskId: "study-1" }, { taskId: "study-2" }],
    today: "2026-09-25",
  }), {
    todayCompleted: 1,
    todayTotal: 2,
    todayProgress: 50,
    streak: 1,
  });
});

test("the streak counts consecutive completed scheduled dates from yesterday", () => {
  assert.deepEqual(getStudyMomentumDailyMetrics({
    schedule: [
      { day: 1, tasks: [task("gap", "Gap day")] },
      { day: 2, tasks: [task("one", "First completed day")] },
      { day: 3, tasks: [task("two", "Second completed day")] },
      { day: 4, tasks: [task("three", "Third completed day")] },
      { day: 5, tasks: [task("today", "Today pending")] },
      { day: 6, tasks: [task("future", "Future day")] },
    ],
    completed: ["one", "two", "three", "future"],
    scheduleStartDate: "2026-09-21",
    today: "2026-09-25",
  }), {
    todayCompleted: 0,
    todayTotal: 1,
    todayProgress: 0,
    streak: 3,
  });
});
