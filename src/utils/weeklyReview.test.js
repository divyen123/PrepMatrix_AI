import assert from "node:assert/strict";
import test from "node:test";

import { buildWeeklyReview } from "./weeklyReview.js";

function metrics(completedTasks, totalTasks, overrides = {}) {
  return {
    hasScheduledPlanner: totalTasks > 0,
    completedTasks,
    totalTasks,
    remainingTasks: Math.max(totalTasks - completedTasks, 0),
    firstPendingTask: completedTasks < totalTasks ? "DBMS - Transactions" : null,
    weakSubject: "DBMS",
    ...overrides,
  };
}

test("does not build a review without scheduled topics", () => {
  assert.equal(buildWeeklyReview(metrics(0, 0)), null);
});

test("guides an untouched schedule toward its first topic", () => {
  const review = buildWeeklyReview(metrics(0, 5));

  assert.equal(review.state, "not-started");
  assert.match(review.headline, /ready to begin/iu);
  assert.match(review.actions[0], /DBMS - Transactions/iu);
});

test("classifies exact progress below 50 percent as early", () => {
  const review = buildWeeklyReview(metrics(49, 100));

  assert.equal(review.state, "early");
  assert.match(review.headline, /49 of 100 topics/iu);
});

test("keeps exact 50 through 79 percent in the progress state", () => {
  assert.equal(buildWeeklyReview(metrics(50, 100)).state, "progress");
  assert.equal(buildWeeklyReview(metrics(79, 100)).state, "progress");
});

test("starts the near-complete state at exactly 80 percent", () => {
  const review = buildWeeklyReview(metrics(80, 100));

  assert.equal(review.state, "near-complete");
  assert.match(review.headline, /20 topics remain/iu);
});

test("does not mistake a rounded 100 percent display for full completion", () => {
  const review = buildWeeklyReview(metrics(199, 200, { completionRate: 100 }));
  const reviewText = `${review.headline} ${review.actions.join(" ")}`;

  assert.equal(review.state, "near-complete");
  assert.match(reviewText, /1 topic remains/iu);
  assert.doesNotMatch(reviewText, /schedule is fully completed/iu);
});

test("celebrates exact completion and recommends the next schedule", () => {
  const review = buildWeeklyReview(metrics(10, 10, { completionRate: 0 }));
  const reviewText = `${review.headline} ${review.highlights.map(({ value }) => value).join(" ")} ${review.actions.join(" ")}`;

  assert.equal(review.state, "complete");
  assert.match(review.headline, /schedule is fully completed/iu);
  assert.match(reviewText, /plan your next schedule/iu);
  assert.doesNotMatch(reviewText, /pending|backlog|weak|repair/iu);
});
