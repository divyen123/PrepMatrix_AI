import assert from "node:assert/strict";
import test from "node:test";
import { ObjectId } from "mongodb";
import {
  QUIZ_BATTLE_QUESTION_COUNT,
  buildBattleReward,
  computeBattleOutcome,
  normalizeBattleCreateInput,
  normalizeBattleGeneratedQuestions,
  sanitizeBattleAnswers,
  sanitizeBattleQuestion,
  scoreBattleAnswers,
  summarizeBattleRewards,
} from "./quizBattleCore.js";

function rawQuestion(index) {
  return {
    question: `Question ${index + 1}?`,
    options: ["A", "B", "C", "D"].map((option) => `${option}${index}`),
    answerIndex: index % 4,
    explanation: `Explanation ${index + 1}`,
  };
}

test("normalizes an exact private ten-question set and strips keys for clients", () => {
  const questions = normalizeBattleGeneratedQuestions(
    Array.from({ length: QUIZ_BATTLE_QUESTION_COUNT }, (_, index) => rawQuestion(index)),
  );
  assert.equal(questions.length, 10);
  assert.ok(questions.every((question) => question.answerOptionId));

  const clientQuestion = sanitizeBattleQuestion(questions[0]);
  assert.equal("answerOptionId" in clientQuestion, false);
  assert.equal("explanation" in clientQuestion, false);
  assert.deepEqual(Object.keys(clientQuestion.options[0]).sort(), ["id", "text"]);
});

test("accepts only server-issued question and option identifiers and scores server-side", () => {
  const questions = normalizeBattleGeneratedQuestions(
    Array.from({ length: QUIZ_BATTLE_QUESTION_COUNT }, (_, index) => rawQuestion(index)),
  );
  const submitted = [
    { questionId: questions[0].id, optionId: questions[0].answerOptionId },
    { questionId: questions[1].id, optionId: "forged-option" },
    { questionId: "forged-question", optionId: questions[0].answerOptionId },
  ];
  const answers = sanitizeBattleAnswers(submitted, questions);
  assert.deepEqual(answers, { [questions[0].id]: questions[0].answerOptionId });
  assert.equal(scoreBattleAnswers(questions, answers), 1);
});

test("computes draws, wins, and forfeits without trusting elapsed time", () => {
  const first = new ObjectId();
  const second = new ObjectId();
  const battle = { battleDeadlineAt: new Date("2026-08-15T00:00:00.000Z") };

  assert.equal(computeBattleOutcome(battle, [
    { userId: first, status: "submitted", score: 8 },
    { userId: second, status: "submitted", score: 8 },
  ], new Date("2026-08-14T00:00:00.000Z")).kind, "draw");

  const win = computeBattleOutcome(battle, [
    { userId: first, status: "submitted", score: 9 },
    { userId: second, status: "submitted", score: 8 },
  ], new Date("2026-08-14T00:00:00.000Z"));
  assert.equal(win.kind, "win");
  assert.equal(win.winnerUserId.toString(), first.toString());

  const forfeit = computeBattleOutcome(battle, [
    { userId: first, status: "submitted", score: 9 },
  ], new Date("2026-08-16T00:00:00.000Z"));
  assert.equal(forfeit.kind, "forfeit");
  assert.equal(forfeit.rewardWinBonus, false);
});

test("awards completion, result, and perfect XP exactly as specified", () => {
  const first = new ObjectId();
  const battle = { _id: new ObjectId() };
  const completeAttempt = {
    userId: first,
    score: 10,
    answeredCount: QUIZ_BATTLE_QUESTION_COUNT,
  };
  const perfectWin = buildBattleReward({
    battle,
    attempt: completeAttempt,
    outcome: { kind: "win", winnerUserId: first, rewardWinBonus: true },
    rewardSlot: 1,
  });
  assert.deepEqual(
    {
      completionXp: perfectWin.completionXp,
      winXp: perfectWin.winXp,
      drawXp: perfectWin.drawXp,
      perfectXp: perfectWin.perfectXp,
      totalXp: perfectWin.totalXp,
    },
    { completionXp: 10, winXp: 10, drawXp: 0, perfectXp: 5, totalXp: 25 },
  );

  const capped = buildBattleReward({
    battle,
    attempt: completeAttempt,
    outcome: { kind: "win", winnerUserId: first, rewardWinBonus: true },
    rewardEligible: false,
  });
  assert.equal(capped.totalXp, 0);

  const draw = buildBattleReward({
    battle,
    attempt: completeAttempt,
    outcome: { kind: "draw", winnerUserId: null, rewardWinBonus: false },
    rewardSlot: 2,
  });
  assert.deepEqual(
    [draw.completionXp, draw.winXp, draw.drawXp, draw.perfectXp, draw.totalXp],
    [10, 0, 5, 5, 20],
  );

  const forfeit = buildBattleReward({
    battle,
    attempt: completeAttempt,
    outcome: { kind: "forfeit", winnerUserId: first, rewardWinBonus: false },
    rewardSlot: 3,
  });
  assert.deepEqual(
    [forfeit.completionXp, forfeit.winXp, forfeit.drawXp, forfeit.perfectXp, forfeit.totalXp],
    [10, 0, 0, 5, 15],
  );
});

test("summarizes persisted battle rewards for Study Momentum", () => {
  assert.deepEqual(summarizeBattleRewards([
    { totalXp: 25, outcome: "win", score: 10 },
    { totalXp: 15, outcome: "draw", score: 7 },
    { totalXp: 10, outcome: "loss", score: 6 },
  ]), {
    battleXp: 50,
    played: 3,
    wins: 1,
    draws: 1,
    losses: 1,
    uncontested: 0,
    perfectScores: 1,
  });
});

test("incomplete attempts earn no XP and do not inflate competitive stats", () => {
  const reward = buildBattleReward({
    battle: { _id: new ObjectId() },
    attempt: { userId: new ObjectId(), score: 4, answeredCount: 4 },
    outcome: { kind: "win", winnerUserId: new ObjectId(), rewardWinBonus: true },
  });
  assert.equal(reward.totalXp, 0);
  assert.equal(reward.completed, false);
  assert.deepEqual(summarizeBattleRewards([reward]), {
    battleXp: 0,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    uncontested: 0,
    perfectScores: 0,
  });
});

test("validates bounded create fields", () => {
  assert.deepEqual(normalizeBattleCreateInput({
    subjectName: " Biology ",
    topic: " Cell respiration ",
    difficulty: "hard",
  }), {
    subjectName: "Biology",
    topic: "Cell respiration",
    difficulty: "hard",
  });
  assert.throws(() => normalizeBattleCreateInput({ subjectName: "Biology", topic: "x" }), {
    code: "QUIZ_BATTLE_TOPIC_REQUIRED",
  });
});
