export const QUIZ_BATTLE_INTRO_MINIMUM_MS = 2200;
export const QUIZ_BATTLE_INTRO_EXIT_MS = 650;

export function getQuizBattleIntroDurations(prefersReducedMotion = false) {
  return prefersReducedMotion
    ? { minimumMs: 80, exitMs: 30 }
    : {
      minimumMs: QUIZ_BATTLE_INTRO_MINIMUM_MS,
      exitMs: QUIZ_BATTLE_INTRO_EXIT_MS,
    };
}

export function createQuizBattleIntroState({
  waitForBattle = false,
  waitForInvite = false,
} = {}) {
  return {
    battleSettled: !waitForBattle,
    inviteSettled: !waitForInvite,
    listSettled: false,
    minimumElapsed: false,
    phase: "playing",
  };
}

function settleIntroSignal(state, key) {
  if (state.phase !== "playing" || state[key]) return state;
  const nextState = { ...state, [key]: true };
  const ready = nextState.minimumElapsed
    && nextState.listSettled
    && nextState.battleSettled
    && nextState.inviteSettled;
  return ready ? { ...nextState, phase: "exiting" } : nextState;
}

export function quizBattleIntroReducer(state, action) {
  switch (action?.type) {
    case "minimum_elapsed":
      return settleIntroSignal(state, "minimumElapsed");
    case "list_settled":
      return settleIntroSignal(state, "listSettled");
    case "battle_settled":
      return settleIntroSignal(state, "battleSettled");
    case "invite_settled":
      return settleIntroSignal(state, "inviteSettled");
    case "exit_finished":
      return state.phase === "exiting" ? { ...state, phase: "done" } : state;
    default:
      return state;
  }
}
