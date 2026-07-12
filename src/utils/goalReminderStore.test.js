import assert from "node:assert/strict";
import test from "node:test";

import {
  getLocalDateKey,
  getTomorrowDateKey,
  normalizePlannerData,
  normalizePlannerSettings,
  postponeGoalToTomorrow,
  summarizePlannerData,
} from "./goalReminderStore.js";

test("normalizes planner records and skips empty items", () => {
  const data = normalizePlannerData({
    goals: [
      { id: "g1", title: "  Finish calculus  ", targetDate: "2026-07-14", priority: "high" },
      { id: "g2", title: "   " },
    ],
    reminders: [
      { id: "r1", title: "Revision", date: "2026-07-12", time: "18:30" },
      { id: "r2", title: "Invalid time", date: "bad-date", time: "29:00" },
    ],
    todos: [{ id: "t1", title: "  Read notes ", completed: true }, { title: "" }],
  });

  assert.equal(data.goals.length, 1);
  assert.equal(data.goals[0].title, "Finish calculus");
  assert.equal(data.goals[0].priority, "high");
  assert.equal(data.reminders[1].date, "");
  assert.equal(data.reminders[1].time, "");
  assert.equal(data.todos.length, 1);
  assert.equal(data.todos[0].completed, true);
});

test("uses local calendar dates for today and tomorrow", () => {
  const date = new Date(2026, 6, 12, 23, 45, 0);
  assert.equal(getLocalDateKey(date), "2026-07-12");
  assert.equal(getTomorrowDateKey(date), "2026-07-13");
});

test("postpones an incomplete goal to tomorrow", () => {
  const goal = {
    id: "g1",
    title: "Complete mock test",
    targetDate: "2026-07-12",
    completed: true,
    completedAt: "2026-07-12T10:00:00.000Z",
    postponedCount: 1,
  };
  const next = postponeGoalToTomorrow(goal, new Date(2026, 6, 12, 10, 0, 0));

  assert.equal(next.targetDate, "2026-07-13");
  assert.equal(next.completed, false);
  assert.equal(next.completedAt, "");
  assert.equal(next.postponedCount, 2);
});

test("summarizes active goals, current-day reminders, and todos", () => {
  const summary = summarizePlannerData({
    goals: [
      { id: "g1", title: "One", completed: false },
      { id: "g2", title: "Two", completed: true },
    ],
    reminders: [
      { id: "r1", title: "Today", date: "2026-07-12", completed: false },
      { id: "r2", title: "Done", date: "2026-07-12", completed: true },
    ],
    todos: [{ id: "t1", title: "Open", completed: false }],
  }, "2026-07-12");

  assert.deepEqual(summary, {
    activeGoals: 1,
    completedGoals: 1,
    todayReminders: 1,
    activeReminders: 1,
    openTodos: 1,
  });
});

test("normalizes reminder nudge preferences to supported values", () => {
  assert.deepEqual(normalizePlannerSettings({
    dailyStudyTarget: 6.5,
    weeklyReviewTarget: "daily",
    nudgeEnabled: false,
    repeatSeconds: 20,
    showCompleted: false,
  }), {
    dailyStudyTarget: 6.5,
    weeklyReviewTarget: "daily",
    nudgeEnabled: false,
    repeatSeconds: 20,
    showCompleted: false,
  });

  assert.equal(normalizePlannerSettings({ repeatSeconds: 4 }).repeatSeconds, 20);
  assert.equal(normalizePlannerSettings({ repeatSeconds: 10 }).repeatSeconds, 20);
  assert.equal(normalizePlannerSettings({ dailyStudyTarget: 99 }).dailyStudyTarget, 16);
});
