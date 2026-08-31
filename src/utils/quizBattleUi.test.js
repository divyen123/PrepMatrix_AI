import assert from "node:assert/strict";
import test from "node:test";
import {
  combinedMomentumXp,
  groupQuizBattles,
  normalizeQuizBattleInviteCode,
  quizBattleInviteCodeFromHash,
  quizBattleStatusLabel,
  shouldPreserveQuizBattleLocalAnswers,
  normalizeQuizBattleStats,
} from "./quizBattleUi.js";

test("combines verified battle XP with planner XP without changing either source", () => {
  assert.deepEqual(combinedMomentumXp(8, 25), {
    plannerXp: 80,
    battleXp: 25,
    totalXp: 105,
    level: 2,
    levelProgress: 5,
  });
});

test("labels completed battles from the current learner's outcome", () => {
  assert.equal(quizBattleStatusLabel({
    status: "completed",
    result: { outcome: "win" },
  }), "Victory");
  assert.equal(quizBattleStatusLabel({
    status: "completed",
    result: { outcome: "loss" },
  }), "Opponent won");
  assert.equal(quizBattleStatusLabel({
    status: "completed",
    result: { outcome: "draw" },
  }), "Draw");
  assert.equal(quizBattleStatusLabel({
    status: "completed",
    result: { outcome: "expired" },
  }), "Results ready");
});

test("normalizes hostile stats and invite-code formatting", () => {
  assert.deepEqual(normalizeQuizBattleStats({
    battleXp: -5,
    played: "3",
    wins: 2.9,
    badges: [" First Duel ", "", null],
  }), {
    battleXp: 0,
    played: 3,
    wins: 2,
    draws: 0,
    losses: 0,
    uncontested: 0,
    perfectScores: 0,
    badges: ["First Duel"],
  });
  assert.equal(normalizeQuizBattleInviteCode(" abcd-efgh 23 "), "ABCDEFGH23");
  assert.equal(quizBattleInviteCodeFromHash("#battle-invite=ABCD234EFG"), "ABCD234EFG");
});

test("groups battle cards by the next meaningful action", () => {
  const groups = groupQuizBattles([
    { id: "turn", status: "active", canStart: true },
    { id: "running", status: "active", attemptStatus: "in_progress" },
    { id: "waiting", status: "pending" },
    { id: "locked", status: "active", attemptStatus: "submitted" },
    { id: "done", status: "completed" },
    { id: "old", status: "expired" },
  ]);
  assert.deepEqual(groups.yourTurn.map(({ id }) => id), ["turn", "running"]);
  assert.deepEqual(groups.waiting.map(({ id }) => id), ["waiting", "locked"]);
  assert.deepEqual(groups.completed.map(({ id }) => id), ["done"]);
  assert.deepEqual(groups.inactive.map(({ id }) => id), ["old"]);
});

test("silent polling never hydrates an older in-progress answer snapshot", () => {
  assert.equal(shouldPreserveQuizBattleLocalAnswers({
    currentBattleId: "battle-1",
    nextBattleId: "battle-1",
    nextAttemptStatus: "in_progress",
    silent: true,
  }), true);
  assert.equal(shouldPreserveQuizBattleLocalAnswers({
    currentBattleId: "battle-1",
    nextBattleId: "battle-1",
    nextAttemptStatus: "submitted",
    silent: true,
  }), false);
});
