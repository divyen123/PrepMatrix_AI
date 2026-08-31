export const RESUME_BUILDER_INTRO_MINIMUM_MS = 2200;
export const RESUME_BUILDER_INTRO_EXIT_MS = 650;

export function getResumeBuilderIntroDurations(prefersReducedMotion = false) {
  return prefersReducedMotion
    ? { minimumMs: 80, exitMs: 30 }
    : {
      minimumMs: RESUME_BUILDER_INTRO_MINIMUM_MS,
      exitMs: RESUME_BUILDER_INTRO_EXIT_MS,
    };
}

export function createResumeBuilderIntroState() {
  return {
    historySettled: false,
    minimumElapsed: false,
    phase: "playing",
    quotaSettled: false,
  };
}

function settleIntroSignal(state, key) {
  if (state.phase !== "playing" || state[key]) return state;
  const nextState = { ...state, [key]: true };
  const ready = nextState.minimumElapsed
    && nextState.historySettled
    && nextState.quotaSettled;
  return ready ? { ...nextState, phase: "exiting" } : nextState;
}

export function resumeBuilderIntroReducer(state, action) {
  switch (action?.type) {
    case "minimum_elapsed":
      return settleIntroSignal(state, "minimumElapsed");
    case "history_settled":
      return settleIntroSignal(state, "historySettled");
    case "quota_settled":
      return settleIntroSignal(state, "quotaSettled");
    case "exit_finished":
      return state.phase === "exiting" ? { ...state, phase: "done" } : state;
    default:
      return state;
  }
}
