import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import {
  getNextPlannerAttentionRefreshDelay,
  getPlannerScheduleAttention,
  subscribeToPlannerAttentionClock,
} from "./plannerAttention.js";

function localDate(year, month, day, hour = 0, minute = 0, second = 0) {
  return new Date(year, month - 1, day, hour, minute, second, 0);
}

function scheduleFor(date = "2026-08-31") {
  return [{
    date,
    day: 1,
    tasks: [
      { id: "task-algebra", task: "Mathematics - Algebra" },
      { id: "task-physics", task: "Physics - Motion" },
    ],
  }];
}

function eventTarget(initial = {}) {
  const listeners = new Map();
  return {
    ...initial,
    addEventListener(name, listener) {
      listeners.set(name, listener);
    },
    removeEventListener(name, listener) {
      if (listeners.get(name) === listener) listeners.delete(name);
    },
    emit(name) {
      listeners.get(name)?.();
    },
    listeners,
  };
}

test("activates at the local evening threshold only while today's work is pending", () => {
  const before = getPlannerScheduleAttention({
    schedule: scheduleFor(),
    now: localDate(2026, 8, 31, 18, 59, 59),
  });
  assert.deepEqual(before, {
    active: false,
    dateKey: "2026-08-31",
    dayIndex: 0,
    isAfterThreshold: false,
    pendingCount: 2,
    thresholdHour: 19,
    totalCount: 2,
  });

  const atThreshold = getPlannerScheduleAttention({
    schedule: scheduleFor(),
    now: localDate(2026, 8, 31, 19),
  });
  assert.equal(atThreshold.active, true);
  assert.equal(atThreshold.pendingCount, 2);

  const partial = getPlannerScheduleAttention({
    schedule: scheduleFor(),
    completed: ["Mathematics - Algebra"],
    now: localDate(2026, 8, 31, 23, 59),
  });
  assert.equal(partial.active, true);
  assert.equal(partial.pendingCount, 1);

  const complete = getPlannerScheduleAttention({
    schedule: scheduleFor(),
    completed: ["Mathematics - Algebra", "Physics - Motion"],
    now: localDate(2026, 8, 31, 23, 59),
  });
  assert.equal(complete.active, false);
  assert.equal(complete.pendingCount, 0);
});

test("uses the exact dated day and clears the previous day's signal at midnight", () => {
  const schedule = [
    ...scheduleFor(),
    {
      date: "2026-09-01",
      day: 2,
      tasks: [{ id: "task-chemistry", task: "Chemistry - Atoms" }],
    },
  ];

  const midnight = getPlannerScheduleAttention({
    schedule,
    now: localDate(2026, 9, 1, 0),
  });
  assert.equal(midnight.active, false);
  assert.equal(midnight.dayIndex, 1);
  assert.equal(midnight.pendingCount, 1);

  const nextEvening = getPlannerScheduleAttention({
    schedule,
    now: localDate(2026, 9, 1, 19),
  });
  assert.equal(nextEvening.active, true);
  assert.equal(nextEvening.dayIndex, 1);

  const outsideSchedule = getPlannerScheduleAttention({
    schedule,
    now: localDate(2026, 9, 2, 21),
  });
  assert.equal(outsideSchedule.active, false);
  assert.equal(outsideSchedule.dayIndex, -1);
  assert.equal(outsideSchedule.pendingCount, 0);
});

test("supports legacy derived dates and lets explicit dates remain authoritative", () => {
  const legacy = [{
    day: 2,
    tasks: [{ task: "Biology - Cells" }],
  }];
  const derived = getPlannerScheduleAttention({
    schedule: legacy,
    scheduleStartDate: "2026-08-30",
    now: localDate(2026, 8, 31, 19),
  });
  assert.equal(derived.active, true);
  assert.equal(derived.dateKey, "2026-08-31");

  const explicit = getPlannerScheduleAttention({
    schedule: [{ ...legacy[0], date: "2026-09-05" }],
    scheduleStartDate: "2026-08-30",
    now: localDate(2026, 8, 31, 19),
  });
  assert.equal(explicit.active, false);
  assert.equal(explicit.dayIndex, -1);

  const undated = getPlannerScheduleAttention({
    schedule: [{ tasks: [{ task: "No date" }] }],
    now: localDate(2026, 8, 31, 19),
  });
  assert.equal(undated.active, false);
});

test("honors ID-aware completion and recheck-pending planner semantics", () => {
  const schedule = [{
    date: "2026-08-31",
    day: 1,
    tasks: [{ id: "memory-review-topic", task: "Memory review" }],
  }];
  const completedById = getPlannerScheduleAttention({
    schedule,
    completed: [{ taskId: "memory-review-topic" }],
    now: localDate(2026, 8, 31, 20),
  });
  assert.equal(completedById.active, false);

  const reopened = getPlannerScheduleAttention({
    schedule: [{
      ...schedule[0],
      tasks: [{ ...schedule[0].tasks[0], recheckPending: true }],
    }],
    completed: [{ taskId: "memory-review-topic" }],
    now: localDate(2026, 8, 31, 20),
  });
  assert.equal(reopened.active, true);
  assert.equal(reopened.pendingCount, 1);
});

test("ignores revision blocks, malformed tasks, and invalid observation times", () => {
  const revision = getPlannerScheduleAttention({
    schedule: [{ date: "2026-08-31", day: 1, tasks: [] }],
    now: localDate(2026, 8, 31, 20),
  });
  assert.equal(revision.active, false);
  assert.equal(revision.totalCount, 0);

  const malformed = getPlannerScheduleAttention({
    schedule: [{ date: "2026-08-31", tasks: [null, {}, { task: "  " }] }],
    now: localDate(2026, 8, 31, 20),
  });
  assert.equal(malformed.active, false);
  assert.equal(malformed.totalCount, 0);

  const invalid = getPlannerScheduleAttention({
    schedule: scheduleFor(),
    now: "not-a-date",
  });
  assert.equal(invalid.active, false);
  assert.equal(invalid.dateKey, "");
});

test("accepts a configurable, bounded threshold", () => {
  const atSeven = getPlannerScheduleAttention({
    schedule: scheduleFor(),
    now: localDate(2026, 8, 31, 19),
    thresholdHour: 20,
  });
  assert.equal(atSeven.active, false);
  assert.equal(atSeven.thresholdHour, 20);

  const atEight = getPlannerScheduleAttention({
    schedule: scheduleFor(),
    now: localDate(2026, 8, 31, 20),
    thresholdHour: 20,
  });
  assert.equal(atEight.active, true);

  const clamped = getPlannerScheduleAttention({
    schedule: scheduleFor(),
    now: localDate(2026, 8, 31, 23),
    thresholdHour: 99,
  });
  assert.equal(clamped.thresholdHour, 23);
  assert.equal(clamped.active, true);
});

test("calculates one-shot delays for the threshold and local midnight", () => {
  assert.equal(
    getNextPlannerAttentionRefreshDelay(localDate(2026, 8, 31, 18, 30)),
    1_801_000,
  );
  assert.equal(
    getNextPlannerAttentionRefreshDelay(localDate(2026, 8, 31, 19)),
    18_001_000,
  );
});

test("refreshes after a boundary, recovers on focus, and cleans up", () => {
  let current = localDate(2026, 8, 31, 18, 59, 59);
  const windowObject = eventTarget();
  const documentObject = eventTarget({ visibilityState: "visible" });
  const timers = [];
  const cleared = [];
  const dates = [];
  const unsubscribe = subscribeToPlannerAttentionClock((date) => dates.push(date), {
    windowObject,
    documentObject,
    now: () => current,
    setTimeout: (callback, delay) => {
      const timer = { callback, delay };
      timers.push(timer);
      return timer;
    },
    clearTimeout: (timer) => cleared.push(timer),
  });

  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 2_000);
  current = localDate(2026, 8, 31, 19, 0, 1);
  timers[0].callback();
  assert.equal(dates.length, 1);
  assert.equal(dates[0].getHours(), 19);
  assert.equal(timers.length, 2);

  windowObject.emit("focus");
  assert.equal(dates.length, 1, "same clock phase should not notify twice");

  documentObject.visibilityState = "hidden";
  current = localDate(2026, 9, 1, 0, 1);
  documentObject.emit("visibilitychange");
  assert.equal(dates.length, 1, "hidden visibility changes are ignored");
  documentObject.visibilityState = "visible";
  documentObject.emit("visibilitychange");
  assert.equal(dates.length, 2);
  assert.equal(dates[1].getDate(), 1);

  unsubscribe();
  assert.equal(windowObject.listeners.size, 0);
  assert.equal(documentObject.listeners.size, 0);
  assert.ok(cleared.length >= 1);
});

test("keeps date-only planner days stable in a non-UTC timezone", () => {
  const moduleUrl = new URL("./plannerAttention.js", import.meta.url).href;
  const script = `
    import { getPlannerScheduleAttention } from ${JSON.stringify(moduleUrl)};
    const result = getPlannerScheduleAttention({
      schedule: [{ date: "2026-08-31", tasks: [{ task: "Local task" }] }],
      now: new Date("2026-08-31T19:00:00-07:00")
    });
    process.stdout.write(JSON.stringify(result));
  `;
  const output = execFileSync(process.execPath, ["--input-type=module", "--eval", script], {
    encoding: "utf8",
    env: { ...process.env, TZ: "America/Los_Angeles" },
  });
  const result = JSON.parse(output);
  assert.equal(result.dateKey, "2026-08-31");
  assert.equal(result.active, true);
  assert.equal(result.dayIndex, 0);
});
