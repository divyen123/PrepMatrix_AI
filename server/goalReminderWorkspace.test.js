import assert from "node:assert/strict";
import test from "node:test";

import {
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
    nudgeEnabled: false,
    repeatSeconds: 30,
    showCompleted: false,
  }), {
    dailyStudyTarget: 16,
    weeklyReviewTarget: "daily",
    nudgeEnabled: false,
    repeatSeconds: 30,
    showCompleted: false,
  });

  assert.equal(normalizeGoalReminderSettings({ repeatSeconds: 10 }).repeatSeconds, 20);
});
