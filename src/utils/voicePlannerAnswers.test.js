import test from "node:test";
import assert from "node:assert/strict";
import { resolveVoicePlannerAnswer } from "./voicePlannerAnswers.js";

const metrics = {
  completedTasks: 3,
  completionRate: 60,
  firstPendingTask: "Revise algebra",
  remainingTasks: 2,
  todayTasks: [{ task: "Read science" }, { task: "Practice maths" }],
  totalTasks: 5,
  weakSubject: "Maths",
};

test("answers planner progress, remaining, next-task, today, and focus questions locally", () => {
  assert.equal(
    resolveVoicePlannerAnswer("how am I doing", metrics),
    "You have completed 3 of 5 tasks. Your progress is 60 percent.",
  );
  assert.equal(resolveVoicePlannerAnswer("how many tasks do I have left", metrics), "You have 2 planner tasks remaining.");
  assert.equal(resolveVoicePlannerAnswer("what should I do next", metrics), "Your next task is Revise algebra.");
  assert.equal(
    resolveVoicePlannerAnswer("what do I have today", metrics),
    "Today's plan includes Read science, Practice maths.",
  );
  assert.equal(resolveVoicePlannerAnswer("which subject needs more focus", metrics), "Maths needs the most attention right now.");
});

test("does not intercept ordinary study questions", () => {
  assert.equal(resolveVoicePlannerAnswer("explain photosynthesis", metrics), "");
  assert.equal(resolveVoicePlannerAnswer("how many planets are there", metrics), "");
});
