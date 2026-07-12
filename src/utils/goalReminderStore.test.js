import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateStudyTargetPerformance,
  getLocalDateKey,
  getTargetReviewDateKeys,
  getTomorrowDateKey,
  normalizePlannerData,
  normalizePlannerSettings,
  postponeGoalToTomorrow,
  summarizePlannerData,
  syncStudyTargetReminders,
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
    targetRemindersEnabled: true,
    nudgeEnabled: false,
    repeatSeconds: 20,
    showCompleted: false,
  }), {
    dailyStudyTarget: 6.5,
    weeklyReviewTarget: "daily",
    targetRemindersEnabled: true,
    nudgeEnabled: false,
    repeatSeconds: 20,
    showCompleted: false,
  });

  assert.equal(normalizePlannerSettings({ repeatSeconds: 4 }).repeatSeconds, 20);
  assert.equal(normalizePlannerSettings({ repeatSeconds: 10 }).repeatSeconds, 20);
  assert.equal(normalizePlannerSettings({ dailyStudyTarget: 99 }).dailyStudyTarget, 16);
});

test("creates deterministic daily and weekly target reminders without duplicates", () => {
  const monday = new Date(2026, 6, 13, 10, 0, 0);
  const settings = {
    dailyStudyTarget: 4,
    weeklyReviewTarget: "2",
    targetRemindersEnabled: true,
  };
  const initial = {
    reminders: [{ id: "manual", title: "Manual reminder", date: "2026-07-14" }],
  };

  assert.deepEqual(getTargetReviewDateKeys(settings, monday), ["2026-07-15", "2026-07-19"]);

  const first = syncStudyTargetReminders(initial, settings, monday);
  const second = syncStudyTargetReminders(first, settings, monday);

  assert.equal(first.reminders.length, 4);
  assert.equal(second.reminders.length, 4);
  assert.equal(second.reminders.filter((item) => item.id === "study-target-daily-2026-07-13").length, 1);
  assert.deepEqual(
    second.reminders
      .filter((item) => item.id.startsWith("study-target-review-"))
      .map((item) => item.date)
      .sort(),
    ["2026-07-15", "2026-07-19"],
  );

  const disabled = syncStudyTargetReminders(second, {
    ...settings,
    targetRemindersEnabled: false,
  }, monday);
  assert.deepEqual(disabled.reminders.map((item) => item.id), ["manual"]);
});

test("calculates daily focused-hour and weekly review performance", () => {
  const monday = new Date(2026, 6, 13, 12, 0, 0);
  const settings = {
    dailyStudyTarget: 4,
    weeklyReviewTarget: "2",
    targetRemindersEnabled: true,
  };
  const plannerData = syncStudyTargetReminders({}, settings, monday);
  plannerData.reminders.find((item) => item.id.startsWith("study-target-review-")).completed = true;

  const performance = calculateStudyTargetPerformance({
    schedule: [{ day: 1, tasks: [{ task: "A" }, { task: "B" }, { task: "C" }] }],
    completed: ["A", "C"],
    plannerData,
    settings,
    scheduleStartDate: "2026-07-13T08:00:00.000Z",
  }, monday);

  assert.deepEqual(performance, {
    scheduleMapped: true,
    plannedHours: 3,
    completedHours: 2,
    dailyTargetHours: 4,
    dailyRemainingHours: 2,
    dailyProgress: 50,
    completedReviews: 1,
    weeklyReviewTarget: 2,
    weeklyReviewProgress: 50,
  });
});
