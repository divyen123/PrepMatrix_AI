export const EMPTY_QUIZ_BATTLE_STATS = Object.freeze({
  battleXp: 0,
  played: 0,
  wins: 0,
  draws: 0,
  losses: 0,
  uncontested: 0,
  perfectScores: 0,
  badges: [],
});

function nonNegativeInteger(value) {
  return Math.max(0, Math.trunc(Number(value) || 0));
}

export function normalizeQuizBattleStats(value = {}) {
  return {
    battleXp: nonNegativeInteger(value.battleXp),
    played: nonNegativeInteger(value.played),
    wins: nonNegativeInteger(value.wins),
    draws: nonNegativeInteger(value.draws),
    losses: nonNegativeInteger(value.losses),
    uncontested: nonNegativeInteger(value.uncontested),
    perfectScores: nonNegativeInteger(value.perfectScores),
    badges: Array.isArray(value.badges)
      ? value.badges.map((badge) => String(badge || "").trim()).filter(Boolean).slice(0, 10)
      : [],
  };
}

export function normalizeQuizBattleInviteCode(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z2-9]/gu, "").slice(0, 10);
}

export function quizBattleInviteCodeFromHash(hash = "") {
  const params = new URLSearchParams(String(hash || "").replace(/^#/u, ""));
  return normalizeQuizBattleInviteCode(params.get("battle-invite"));
}

export function shouldPreserveQuizBattleLocalAnswers({
  currentBattleId,
  nextBattleId,
  nextAttemptStatus,
  silent,
} = {}) {
  return Boolean(
    silent
    && currentBattleId
    && currentBattleId === nextBattleId
    && nextAttemptStatus === "in_progress",
  );
}

export function groupQuizBattles(battles = []) {
  return battles.reduce((groups, battle) => {
    if (battle.status === "completed") groups.completed.push(battle);
    else if (battle.status === "expired" || battle.status === "cancelled") groups.inactive.push(battle);
    else if (
      battle.status === "active"
      && (battle.canStart || battle.attemptStatus === "in_progress")
    ) groups.yourTurn.push(battle);
    else groups.waiting.push(battle);
    return groups;
  }, { yourTurn: [], waiting: [], completed: [], inactive: [] });
}

export function combinedMomentumXp(completedCount, battleXp) {
  const plannerXp = nonNegativeInteger(completedCount) * 10;
  const verifiedBattleXp = nonNegativeInteger(battleXp);
  const totalXp = plannerXp + verifiedBattleXp;
  return {
    plannerXp,
    battleXp: verifiedBattleXp,
    totalXp,
    level: Math.floor(totalXp / 100) + 1,
    levelProgress: totalXp % 100,
  };
}

export function quizBattleStatusLabel(battle = {}) {
  if (battle.status === "generating") return "Preparing battle";
  if (battle.status === "pending") return "Waiting for a friend to join";
  if (battle.status === "cancelled") return "Cancelled";
  if (battle.status === "expired") return "Expired";
  if (battle.status === "completed") {
    if (battle.result?.outcome === "win") return "Victory";
    if (battle.result?.outcome === "loss") return "Opponent won";
    if (battle.result?.outcome === "draw") return "Draw";
    return "Results ready";
  }
  if (battle.attemptStatus === "submitted") return "Attempt locked — waiting for friend";
  if (battle.attemptStatus === "expired") return "Attempt expired — waiting for friend";
  if (battle.attemptStatus === "in_progress") return "Continue your attempt";
  return "Your turn";
}
