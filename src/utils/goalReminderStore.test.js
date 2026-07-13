import assert from "node:assert/strict";
import test from "node:test";

import {
  clearPlannerCollection,
  calculateStudyTargetPerformance,
  getDueReminders,
  getLocalDateKey,
  getPlannerAttentionSummary,
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

test("bulk clear removes only the selected planner collection", () => {
  const plannerData = {
    goals: [{ id: "g1", title: "Goal", completed: true }],
    reminders: [{ id: "r1", title: "Reminder", completed: true }],
    todos: [{ id: "t1", title: "To-do", completed: true }],
  };

  for (const collection of ["goals", "reminders", "todos"]) {
    const cleared = clearPlannerCollection(plannerData, collection);
    assert.deepEqual(cleared[collection], []);
    for (const preservedCollection of ["goals", "reminders", "todos"].filter((key) => key !== collection)) {
      assert.equal(cleared[preservedCollection].length, 1);
      assert.equal(cleared[preservedCollection][0].id, plannerData[preservedCollection][0].id);
    }
  }
});

test("bulk clear ignores unsupported planner collections", () => {
  const plannerData = { goals: [{ id: "g1", title: "Goal" }] };
  const cleared = clearPlannerCollection(plannerData, "unknown");
  assert.equal(cleared.goals.length, 1);
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
    snoozeMinutes: 30,
    showCompleted: false,
  }), {
    dailyStudyTarget: 6.5,
    weeklyReviewTarget: "daily",
    targetRemindersEnabled: true,
    nudgeEnabled: false,
    repeatSeconds: 20,
    snoozeMinutes: 30,
    showCompleted: false,
  });

  assert.equal(normalizePlannerSettings({ repeatSeconds: 4 }).repeatSeconds, 20);
  assert.equal(normalizePlannerSettings({ repeatSeconds: 10 }).repeatSeconds, 20);
  assert.equal(normalizePlannerSettings({ snoozeMinutes: 15 }).snoozeMinutes, 15);
  assert.equal(normalizePlannerSettings({ snoozeMinutes: 20 }).snoozeMinutes, 10);
  assert.equal(normalizePlannerSettings({}).snoozeMinutes, 10);
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
  const snoozedUntil = new Date(2026, 6, 13, 10, 30, 0).toISOString();
  first.reminders.find((item) => item.id === "study-target-daily-2026-07-13").snoozedUntil = snoozedUntil;
  const second = syncStudyTargetReminders(first, settings, monday);

  assert.equal(first.reminders.length, 4);
  assert.equal(second.reminders.length, 4);
  assert.equal(second.reminders.filter((item) => item.id === "study-target-daily-2026-07-13").length, 1);
  assert.equal(
    second.reminders.find((item) => item.id === "study-target-daily-2026-07-13").snoozedUntil,
    snoozedUntil,
  );
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

test('preserves valid reminder snooze timestamps and rejects invalid values', () => {
  const snoozedUntil = new Date(2026, 6, 13, 14, 30, 0).toISOString();
  const data = normalizePlannerData({
    reminders: [
      { id: 'valid', title: 'Valid snooze', date: '2026-07-13', snoozedUntil },
      { id: 'invalid', title: 'Invalid snooze', date: '2026-07-13', snoozedUntil: 'not-a-date' },
    ],
  });

  assert.equal(data.reminders[0].snoozedUntil, snoozedUntil);
  assert.equal(data.reminders[1].snoozedUntil, '');
});

test('summarizes due goals and incomplete todos that are at least 24 hours old', () => {
  const now = new Date(2026, 6, 13, 12, 0, 0, 0);
  const exactBoundary = new Date(now.getTime() - (24 * 60 * 60 * 1_000)).toISOString();
  const oneMillisecondFresh = new Date(now.getTime() - (24 * 60 * 60 * 1_000) + 1).toISOString();
  const older = new Date(now.getTime() - (48 * 60 * 60 * 1_000)).toISOString();
  const summary = getPlannerAttentionSummary({
    goals: [
      { id: 'past-goal', title: 'Past goal', targetDate: '2026-07-12' },
      { id: 'today-goal', title: 'Today goal', targetDate: '2026-07-13' },
      { id: 'future-goal', title: 'Future goal', targetDate: '2026-07-14' },
      { id: 'done-goal', title: 'Done goal', targetDate: '2026-07-12', completed: true },
    ],
    todos: [
      { id: 'boundary-todo', title: 'Exactly one day old', createdAt: exactBoundary },
      { id: 'old-todo', title: 'Two days old', createdAt: older },
      { id: 'fresh-todo', title: 'One millisecond too fresh', createdAt: oneMillisecondFresh },
      { id: 'done-todo', title: 'Completed old task', createdAt: older, completed: true },
      { id: 'invalid-todo', title: 'Invalid timestamp', createdAt: 'not-a-date' },
    ],
  }, now);

  assert.deepEqual(summary.dueGoals.map((goal) => goal.id), ['past-goal', 'today-goal']);
  assert.deepEqual(summary.staleTodos.map((todo) => todo.id), ['boundary-todo', 'old-todo']);
  assert.equal(summary.total, 4);
});

test('returns due reminders in effective scheduled and snoozed order', () => {
  const now = new Date(2026, 6, 13, 12, 0, 0, 0);
  const at1045 = new Date(2026, 6, 13, 10, 45, 0, 0).toISOString();
  const atNoon = new Date(2026, 6, 13, 12, 0, 0, 0).toISOString();
  const afterNoon = new Date(2026, 6, 13, 12, 1, 0, 0).toISOString();
  const due = getDueReminders({
    reminders: [
      { id: 'scheduled-at-boundary', title: 'Scheduled now', date: '2026-07-13', time: '12:00' },
      { id: 'future', title: 'Future', date: '2026-07-13', time: '12:01' },
      { id: 'mid-morning', title: 'Mid morning', date: '2026-07-13', time: '10:00' },
      { id: 'snoozed-due', title: 'Snoozed due', date: '2026-07-13', time: '07:00', snoozedUntil: at1045 },
      { id: 'snoozed-at-boundary', title: 'Snoozed until now', date: '2026-07-13', time: '06:00', snoozedUntil: atNoon },
      { id: 'snoozed-future', title: 'Still snoozed', date: '2026-07-13', time: '05:00', snoozedUntil: afterNoon },
      { id: 'all-day', title: 'All day', date: '2026-07-13', time: '' },
      { id: 'morning', title: 'Morning', date: '2026-07-13', time: '08:00' },
      { id: 'completed', title: 'Completed', date: '2026-07-13', time: '09:00', completed: true },
      { id: 'invalid-calendar-date', title: 'Invalid date', date: '2026-02-31', time: '09:00' },
    ],
  }, now);

  assert.deepEqual(due.map((reminder) => reminder.id), [
    'all-day',
    'morning',
    'mid-morning',
    'snoozed-due',
    'snoozed-at-boundary',
    'scheduled-at-boundary',
  ]);
});
