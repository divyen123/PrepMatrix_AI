import assert from "node:assert/strict";
import test from "node:test";
import { ObjectId } from "mongodb";
import {
  battleDetailPayload,
  registerQuizBattleRoutes,
} from "./quizBattleRoutes.js";

function fixture() {
  const creatorId = new ObjectId();
  const inviteeId = new ObjectId();
  const question = {
    id: "question-1",
    question: "Which choice is correct?",
    options: [
      { id: "option-a", text: "A" },
      { id: "option-b", text: "B" },
      { id: "option-c", text: "C" },
      { id: "option-d", text: "D" },
    ],
    answerOptionId: "option-b",
    explanation: "B is correct.",
  };
  const battle = {
    _id: new ObjectId(),
    creatorId,
    inviteeId,
    participantIds: [creatorId, inviteeId],
    creatorDisplayName: "Creator",
    inviteeDisplayName: "Friend",
    subjectName: "Biology",
    topic: "Cells",
    difficulty: "standard",
    status: "active",
    questions: [question],
    createdAt: new Date("2026-08-14T00:00:00.000Z"),
    inviteExpiresAt: new Date("2026-08-15T00:00:00.000Z"),
    battleDeadlineAt: new Date("2026-08-16T00:00:00.000Z"),
  };
  const attempt = {
    _id: new ObjectId(),
    battleId: battle._id,
    userId: creatorId,
    status: "in_progress",
    questionOrder: [question.id],
    optionOrderByQuestion: {
      [question.id]: question.options.map(({ id }) => id),
    },
    answers: {},
    startedAt: new Date("2026-08-14T01:00:00.000Z"),
    deadlineAt: new Date("2026-08-14T01:10:00.000Z"),
  };
  return { battle, creatorId, inviteeId, question, attempt };
}

test("active battle payload exposes playable choices but never keys or explanations", () => {
  const { battle, creatorId, attempt } = fixture();
  const payload = battleDetailPayload(
    battle,
    creatorId,
    [attempt],
    null,
    new Date("2026-08-14T01:01:00.000Z"),
  );
  assert.equal(payload.attempt.questions.length, 1);
  assert.deepEqual(Object.keys(payload.attempt.questions[0]).sort(), ["id", "options", "question"]);
  assert.equal(JSON.stringify(payload).includes("answerOptionId"), false);
  assert.equal(JSON.stringify(payload).includes("B is correct"), false);
});

test("first submission is locked without leaking either score or review", () => {
  const { battle, creatorId, attempt } = fixture();
  const submitted = {
    ...attempt,
    status: "submitted",
    score: 1,
    answers: { "question-1": "option-b" },
    submittedAt: new Date("2026-08-14T01:05:00.000Z"),
  };
  const payload = battleDetailPayload(battle, creatorId, [submitted], null);
  assert.equal(payload.attempt.status, "submitted");
  assert.equal("score" in payload.attempt, false);
  assert.equal("questions" in payload.attempt, false);
  assert.equal("answers" in payload.attempt, false);
  assert.equal("result" in payload, false);
});

test("completed result reveals scores and own review without opponent selections", () => {
  const { battle, creatorId, inviteeId, attempt } = fixture();
  const creatorAttempt = {
    ...attempt,
    status: "submitted",
    score: 1,
    answers: { "question-1": "option-b" },
  };
  const inviteeAttempt = {
    ...attempt,
    _id: new ObjectId(),
    userId: inviteeId,
    status: "submitted",
    score: 0,
    answers: { "question-1": "option-a" },
  };
  battle.status = "completed";
  battle.result = {
    kind: "win",
    winnerUserId: creatorId,
    rewardWinBonus: true,
    finalizedAt: new Date("2026-08-14T02:00:00.000Z"),
  };
  const payload = battleDetailPayload(
    battle,
    creatorId,
    [creatorAttempt, inviteeAttempt],
    null,
  );
  assert.equal(payload.result.outcome, "win");
  assert.deepEqual(payload.result.participants.map(({ score }) => score), [1, 0]);
  assert.equal(payload.result.review[0].selectedOptionId, "option-b");
  assert.equal(payload.result.review[0].opponentCorrect, false);
  assert.equal("opponentSelectedOptionId" in payload.result.review[0], false);
});

test("does not offer a start when a full ten-minute attempt no longer fits", () => {
  const { battle, creatorId } = fixture();
  const fiveMinutesBeforeClose = new Date(battle.battleDeadlineAt.getTime() - 5 * 60 * 1000);
  const elevenMinutesBeforeClose = new Date(battle.battleDeadlineAt.getTime() - 11 * 60 * 1000);
  assert.equal(battleDetailPayload(battle, creatorId, [], null, fiveMinutesBeforeClose).canStart, false);
  assert.equal(battleDetailPayload(battle, creatorId, [], null, elevenMinutesBeforeClose).canStart, true);
});

test("registers invite preview as a mutation instead of a state-changing GET", () => {
  const registrations = [];
  const app = Object.fromEntries(["get", "post", "put"].map((method) => [
    method,
    (path) => registrations.push({ method, path }),
  ]));
  registerQuizBattleRoutes(app, {
    aiQuota: {},
    getDb: async () => ({}),
    getGroqConfigStatus: () => ({ available: false }),
    groqModel: "test-model",
    mutationSecurity: (_req, _res, next) => next(),
    requireAuth: (handler) => handler,
  });
  assert.ok(registrations.some(({ method, path }) => (
    method === "post" && path === "/api/quiz-battles/invites/:code/preview"
  )));
  assert.equal(registrations.some(({ method, path }) => (
    method === "get" && path.includes("/invites/:code")
  )), false);
});
