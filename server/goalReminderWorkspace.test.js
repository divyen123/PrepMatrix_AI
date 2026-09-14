import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_GOAL_REMINDER_SETTINGS,
  normalizeGoalReminderData,
  normalizeGoalReminderSettings,
} from "./goalReminderWorkspace.js";

test("normalizes goal and reminder workspace collections", () => {
  const data = normalizeGoalReminderData({
    goals: [{ id: "g1" }, null, "bad"],
    reminders: [{ id: "r1" }],
    todos: "invalid",
  });

  assert.deepEqual(data.goals, [{ id: "g1" }]);
  assert.deepEqual(data.reminders, [{ id: "r1" }]);
  assert.deepEqual(data.todos, []);
});

test("bounds planner settings and keeps supported preferences", () => {
  assert.deepEqual(normalizeGoalReminderSettings({
    dailyStudyTarget: 20,
    weeklyReviewTarget: "daily",
    targetRemindersEnabled: true,
    nudgeEnabled: false,
    repeatSeconds: 30,
    snoozeMinutes: 60,
    showCompleted: false,
  }), {
    dailyStudyTarget: 16,
    weeklyReviewTarget: "daily",
    targetRemindersEnabled: true,
    nudgeEnabled: false,
    repeatSeconds: 30,
    snoozeMinutes: 60,
    showCompleted: false,
    introCompleted: { goals: false, todos: false },
  });

  assert.equal(normalizeGoalReminderSettings({ repeatSeconds: 10 }).repeatSeconds, 20);
  assert.equal(normalizeGoalReminderSettings({ snoozeMinutes: 5 }).snoozeMinutes, 5);
  assert.equal(normalizeGoalReminderSettings({ snoozeMinutes: 20 }).snoozeMinutes, 10);
  assert.equal(normalizeGoalReminderSettings({}).snoozeMinutes, 10);
  assert.equal(normalizeGoalReminderSettings({}).targetRemindersEnabled, false);
});

test("normalizes per-section intro completion without treating truthy values as completed", () => {
  assert.deepEqual(normalizeGoalReminderSettings(), DEFAULT_GOAL_REMINDER_SETTINGS);
  for (const introCompleted of [undefined, null, "true", [], { goals: "true", todos: 1 }]) {
    assert.deepEqual(normalizeGoalReminderSettings({ introCompleted }).introCompleted, {
      goals: false,
      todos: false,
    });
  }
  for (const section of ["goals", "todos"]) {
    const introCompleted = { goals: false, todos: false, [section]: true };
    assert.deepEqual(normalizeGoalReminderSettings({ introCompleted }).introCompleted, introCompleted);
  }
});

test("preserves both completed intros when saved workspace settings are normalized again", () => {
  const saved = normalizeGoalReminderSettings({ introCompleted: { goals: true, todos: true } });
  const settings = normalizeGoalReminderSettings(JSON.parse(JSON.stringify({
    ...saved,
    dailyStudyTarget: 7,
    nudgeEnabled: false,
    showCompleted: false,
  })));

  assert.deepEqual(settings.introCompleted, { goals: true, todos: true });
  assert.equal(settings.dailyStudyTarget, 7);
  assert.equal(settings.nudgeEnabled, false);
  assert.equal(settings.showCompleted, false);
  assert.deepEqual(normalizeGoalReminderSettings(settings), settings);
});

test('preserves valid reminder snooze timestamps and removes invalid values', () => {
  const snoozedUntil = new Date(2026, 6, 13, 14, 30, 0).toISOString();
  const data = normalizeGoalReminderData({
    reminders: [
      { id: 'valid', snoozedUntil },
      { id: 'invalid', snoozedUntil: 'not-a-date' },
    ],
  });

  assert.deepEqual(data.reminders, [
    { id: 'valid', snoozedUntil },
    { id: 'invalid' },
  ]);
});
