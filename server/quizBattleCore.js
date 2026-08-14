import { randomUUID } from "node:crypto";
import { normalizeExamQuestions } from "./examRoutes.js";

export const QUIZ_BATTLES_COLLECTION = "quizBattles";
export const QUIZ_BATTLE_ATTEMPTS_COLLECTION = "quizBattleAttempts";
export const QUIZ_BATTLE_REWARDS_COLLECTION = "quizBattleRewards";
export const QUIZ_BATTLE_CREATE_LOCKS_COLLECTION = "quizBattleCreateLocks";
export const QUIZ_BATTLE_JOIN_FAILURES_COLLECTION = "quizBattleJoinFailures";
export const QUIZ_BATTLE_PROVIDER_SLOTS_COLLECTION = "quizBattleProviderSlots";
export const QUIZ_BATTLE_ACTION_LOCKS_COLLECTION = "quizBattleActionLocks";

export const QUIZ_BATTLE_QUESTION_COUNT = 10;
export const QUIZ_BATTLE_ATTEMPT_MS = 10 * 60 * 1000;
export const QUIZ_BATTLE_INVITE_MS = 72 * 60 * 60 * 1000;
export const QUIZ_BATTLE_ACTIVE_MS = 72 * 60 * 60 * 1000;
export const QUIZ_BATTLE_REWARD_DAILY_CAP = 3;

const DIFFICULTIES = new Set(["easy", "standard", "hard"]);
const INVITE_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{10}$/u;

function cleanText(value, maximum, fallback = "") {
  return [...String(value ?? fallback)]
    .map((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint < 32 || codePoint === 127 ? " " : character;
    })
    .join("")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, maximum);
}

export function publicBattleId(value) {
  return value?._id?.toString?.() || String(value?.id || "").trim();
}

export function normalizeBattleCreateInput(body = {}) {
  const subjectName = cleanText(body.subjectName, 80, "General study");
  const topic = cleanText(body.topic, 160);
  const rawDifficulty = cleanText(body.difficulty, 20, "standard").toLowerCase();
  const difficulty = DIFFICULTIES.has(rawDifficulty) ? rawDifficulty : "standard";

  if (subjectName.length < 2) {
    throw Object.assign(new Error("Choose a subject for the battle."), {
      status: 400,
      code: "QUIZ_BATTLE_SUBJECT_REQUIRED",
    });
  }
  if (topic.length < 3) {
    throw Object.assign(new Error("Enter an exact topic with at least 3 characters."), {
      status: 400,
      code: "QUIZ_BATTLE_TOPIC_REQUIRED",
    });
  }

  return { subjectName, topic, difficulty };
}

export function normalizeBattleInviteCode(value) {
  const code = String(value || "").trim().toUpperCase().replace(/[\s-]+/gu, "");
  if (!INVITE_CODE_PATTERN.test(code)) {
    throw Object.assign(new Error("Enter a valid 10-character battle code."), {
      status: 400,
      code: "QUIZ_BATTLE_INVITE_INVALID",
    });
  }
  return code;
}

export function normalizeBattleGeneratedQuestions(rawQuestions) {
  const normalized = normalizeExamQuestions(rawQuestions, QUIZ_BATTLE_QUESTION_COUNT);
  if (normalized.length !== QUIZ_BATTLE_QUESTION_COUNT) {
    throw Object.assign(
      new Error("The AI did not return 10 valid unique questions. Please try again."),
      { status: 502, code: "AI_OUTPUT_INVALID" },
    );
  }

  return normalized.map((question) => {
    const options = question.options.map((text) => ({ id: randomUUID(), text }));
    return {
      id: question.id,
      question: question.question,
      options,
      answerOptionId: options[question.answerIndex].id,
      explanation: question.explanation,
      topic: question.topic,
      difficulty: question.difficulty,
    };
  });
}

export function sanitizeBattleQuestion(question) {
  return {
    id: question.id,
    question: question.question,
    options: (question.options || []).map(({ id, text }) => ({ id, text })),
  };
}

export function sanitizeBattleAnswers(rawAnswers, questions = []) {
  const questionMap = new Map(
    questions.map((question) => [
      String(question.id),
      new Set((question.options || []).map((option) => String(option.id))),
    ]),
  );
  const entries = Array.isArray(rawAnswers)
    ? rawAnswers.map((entry) => [entry?.questionId, entry?.optionId])
    : Object.entries(rawAnswers && typeof rawAnswers === "object" ? rawAnswers : {});

  return entries.reduce((answers, [rawQuestionId, rawOptionId]) => {
    const questionId = String(rawQuestionId || "").trim();
    const optionId = String(rawOptionId || "").trim();
    if (questionMap.get(questionId)?.has(optionId)) answers[questionId] = optionId;
    return answers;
  }, {});
}

export function scoreBattleAnswers(questions = [], answers = {}) {
  return questions.reduce(
    (score, question) => score + (answers[question.id] === question.answerOptionId ? 1 : 0),
    0,
  );
}

function idString(value) {
  return value?.toString?.() || String(value || "");
}

export function computeBattleOutcome(battle, attempts = [], now = new Date()) {
  const submitted = attempts.filter((attempt) => attempt.status === "submitted");
  const terminalCount = attempts.filter((attempt) => (
    attempt.status === "submitted" || attempt.status === "expired"
  )).length;
  const deadlineReached = new Date(battle?.battleDeadlineAt || 0).getTime() <= now.getTime();

  if (submitted.length === 2) {
    const [first, second] = submitted;
    if (first.score === second.score) {
      return {
        kind: "draw",
        winnerUserId: null,
        rewardWinBonus: false,
      };
    }
    return {
      kind: "win",
      winnerUserId: first.score > second.score ? first.userId : second.userId,
      rewardWinBonus: true,
    };
  }

  if (!deadlineReached && terminalCount < 2) return null;
  if (submitted.length === 1) {
    return {
      kind: "forfeit",
      winnerUserId: submitted[0].userId,
      rewardWinBonus: false,
    };
  }
  return {
    kind: "expired",
    winnerUserId: null,
    rewardWinBonus: false,
  };
}

export function buildBattleReward({
  battle,
  attempt,
  outcome,
  awardedAt = new Date(),
  rewardSlot = null,
  rewardEligible = true,
}) {
  const userId = attempt.userId;
  const completed = Number(attempt.answeredCount) >= QUIZ_BATTLE_QUESTION_COUNT
    || Object.keys(attempt.answers || {}).length >= QUIZ_BATTLE_QUESTION_COUNT;
  const canReward = rewardEligible && completed;
  const isDraw = outcome.kind === "draw";
  const isWinner = outcome.kind === "win"
    && idString(outcome.winnerUserId) === idString(userId)
    && outcome.rewardWinBonus;
  const isLoser = outcome.kind === "win" && !isWinner;
  const isPerfect = Number(attempt.score) === QUIZ_BATTLE_QUESTION_COUNT;
  const completionXp = canReward ? 10 : 0;
  const winXp = canReward && isWinner ? 10 : 0;
  const drawXp = canReward && isDraw ? 5 : 0;
  const perfectXp = canReward && isPerfect ? 5 : 0;

  return {
    battleId: battle._id,
    userId,
    outcome: !completed ? "incomplete" : isWinner ? "win" : isDraw ? "draw" : isLoser ? "loss" : "expired",
    score: Number(attempt.score) || 0,
    total: QUIZ_BATTLE_QUESTION_COUNT,
    completionXp,
    winXp,
    drawXp,
    perfectXp,
    totalXp: completionXp + winXp + drawXp + perfectXp,
    completed,
    rewardEligible: canReward,
    rewardSlot,
    rewardDate: awardedAt.toISOString().slice(0, 10),
    awardedAt,
  };
}

export function summarizeBattleRewards(rewards = []) {
  return rewards.reduce((stats, reward) => {
    stats.battleXp += Math.max(0, Math.trunc(Number(reward.totalXp) || 0));
    if (reward.completed === false || reward.outcome === "incomplete") return stats;
    stats.played += 1;
    if (reward.outcome === "win") stats.wins += 1;
    if (reward.outcome === "draw") stats.draws += 1;
    if (reward.outcome === "loss") stats.losses += 1;
    if (reward.outcome === "expired") stats.uncontested += 1;
    if (Number(reward.score) === QUIZ_BATTLE_QUESTION_COUNT) stats.perfectScores += 1;
    return stats;
  }, {
    battleXp: 0,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    uncontested: 0,
    perfectScores: 0,
  });
}

export function battleDisplayName(user = {}) {
  return cleanText(
    user.displayName || user.username || user.name || "Learner",
    48,
    "Learner",
  ) || "Learner";
}
