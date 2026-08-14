export const FOCUS_ROOM_STATUS = Object.freeze({
  ATTENTIVE: "attentive",
  DISTRACTED: "distracted",
  UNKNOWN: "unknown",
  PAUSED: "paused",
});

export const DEFAULT_FOCUS_ROOM_TIMING = Object.freeze({
  distractionThresholdMs: 30_000,
  distractionHysteresisMs: 1_500,
  recoveryHysteresisMs: 2_000,
  unknownHysteresisMs: 1_500,
  missingFaceGraceMs: 4_000,
  nudgeCooldownMs: 120_000,
});

const OBSERVABLE_STATUSES = new Set([
  FOCUS_ROOM_STATUS.ATTENTIVE,
  FOCUS_ROOM_STATUS.DISTRACTED,
  FOCUS_ROOM_STATUS.UNKNOWN,
]);

function nonNegativeNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}
function normalizeTimestamp(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeTiming(options = {}) {
  return {
    distractionThresholdMs: nonNegativeNumber(
      options.distractionThresholdMs,
      DEFAULT_FOCUS_ROOM_TIMING.distractionThresholdMs,
    ),
    distractionHysteresisMs: nonNegativeNumber(
      options.distractionHysteresisMs,
      DEFAULT_FOCUS_ROOM_TIMING.distractionHysteresisMs,
    ),
    recoveryHysteresisMs: nonNegativeNumber(
      options.recoveryHysteresisMs,
      DEFAULT_FOCUS_ROOM_TIMING.recoveryHysteresisMs,
    ),
    unknownHysteresisMs: nonNegativeNumber(
      options.unknownHysteresisMs,
      DEFAULT_FOCUS_ROOM_TIMING.unknownHysteresisMs,
    ),
    missingFaceGraceMs: nonNegativeNumber(
      options.missingFaceGraceMs,
      DEFAULT_FOCUS_ROOM_TIMING.missingFaceGraceMs,
    ),
    nudgeCooldownMs: nonNegativeNumber(
      options.nudgeCooldownMs,
      DEFAULT_FOCUS_ROOM_TIMING.nudgeCooldownMs,
    ),
  };
}

function eventTimestamp(state, event) {
  const fallback = state.lastSampleAt ?? state.createdAt ?? 0;
  return Math.max(fallback, normalizeTimestamp(event?.now, fallback));
}

function hysteresisFor(status, timing) {
  if (status === FOCUS_ROOM_STATUS.DISTRACTED) {
    return timing.distractionHysteresisMs;
  }
  if (status === FOCUS_ROOM_STATUS.ATTENTIVE) {
    return timing.recoveryHysteresisMs;
  }
  return timing.unknownHysteresisMs;
}

function maybeIssueNudge(state, now) {
  if (state.status !== FOCUS_ROOM_STATUS.DISTRACTED || state.distractedSince == null) {
    return state;
  }

  const distractedForMs = Math.max(0, now - state.distractedSince);
  if (distractedForMs < state.timing.distractionThresholdMs) return state;

  const cooldownElapsed = state.lastNudgeAt == null
    || now - state.lastNudgeAt >= state.timing.nudgeCooldownMs;
  if (!cooldownElapsed) return state;

  const lastNudge = {
    at: now,
    distractedSince: state.distractedSince,
    reason: state.statusReason || "distracted",
  };

  return {
    ...state,
    lastNudgeAt: now,
    lastNudge,
    nudgeSequence: state.nudgeSequence + 1,
  };
}

/**
 * Creates the deterministic state used by the focus-room monitor. No camera,
 * model, timer, or browser global is touched here, which keeps timing behavior
 * independently testable.
 */
export function createFocusRoomState(options = {}) {
  const createdAt = normalizeTimestamp(options.now, 0);
  return {
    active: false,
    status: FOCUS_ROOM_STATUS.PAUSED,
    statusReason: "not_started",
    candidateStatus: null,
    candidateReason: "",
    candidateSince: null,
    missingFaceSince: null,
    distractedSince: null,
    lastSampleAt: createdAt,
    lastNudgeAt: null,
    lastNudge: null,
    nudgeSequence: 0,
    createdAt,
    timing: normalizeTiming(options),
  };
}

/**
 * Advances the focus-room state. A nudge is represented by an incremented
 * `nudgeSequence`; callers can perform a voice/UI side effect after comparing
 * the previous and next values.
 */
export function transitionFocusRoomState(state, event = {}) {
  if (!state?.timing) {
    throw new TypeError("A focus-room state created by createFocusRoomState is required.");
  }

  const now = eventTimestamp(state, event);

  if (event.type === "ACTIVATE") {
    return {
      ...state,
      active: true,
      status: FOCUS_ROOM_STATUS.UNKNOWN,
      statusReason: event.reason || "warming_up",
      candidateStatus: null,
      candidateReason: "",
      candidateSince: null,
      missingFaceSince: null,
      distractedSince: null,
      lastSampleAt: now,
    };
  }

  if (event.type === "PAUSE") {
    return {
      ...state,
      active: false,
      status: FOCUS_ROOM_STATUS.PAUSED,
      statusReason: event.reason || "paused",
      candidateStatus: null,
      candidateReason: "",
      candidateSince: null,
      missingFaceSince: null,
      distractedSince: null,
      lastSampleAt: now,
    };
  }

  if (event.type !== "SAMPLE" || !state.active) return state;

  let observedStatus = OBSERVABLE_STATUSES.has(event.status)
    ? event.status
    : FOCUS_ROOM_STATUS.UNKNOWN;
  let observedReason = typeof event.reason === "string" && event.reason
    ? event.reason
    : observedStatus;
  const faceNotVisible = observedStatus === FOCUS_ROOM_STATUS.UNKNOWN
    && observedReason === "face_not_visible";
  const missingFaceSince = faceNotVisible
    ? (state.missingFaceSince ?? now)
    : null;

  // A missed face frame is ordinary uncertainty. Sustained absence is a useful
  // local distraction signal. Count continuity from the first missing frame;
  // losing the face while already distracted must not erase the active timer.
  const missingFaceGraceElapsed = faceNotVisible
    && now - missingFaceSince >= state.timing.missingFaceGraceMs;
  if (faceNotVisible && (state.status === FOCUS_ROOM_STATUS.DISTRACTED || missingFaceGraceElapsed)) {
    observedStatus = FOCUS_ROOM_STATUS.DISTRACTED;
    observedReason = "face_not_visible";
  }

  let next = {
    ...state,
    lastSampleAt: now,
    missingFaceSince,
  };

  if (missingFaceGraceElapsed && state.status !== FOCUS_ROOM_STATUS.DISTRACTED) {
    next = {
      ...next,
      status: FOCUS_ROOM_STATUS.DISTRACTED,
      statusReason: "face_not_visible",
      candidateStatus: null,
      candidateReason: "",
      candidateSince: null,
      distractedSince: missingFaceSince,
    };
    return maybeIssueNudge(next, now);
  }

  if (observedStatus === state.status) {
    next = {
      ...next,
      statusReason: observedReason,
      candidateStatus: null,
      candidateReason: "",
      candidateSince: null,
      distractedSince: observedStatus === FOCUS_ROOM_STATUS.DISTRACTED
        ? (state.distractedSince ?? now)
        : null,
    };
  } else {
    const continuingCandidate = state.candidateStatus === observedStatus;
    const candidateSince = continuingCandidate ? state.candidateSince : now;
    const candidateReason = continuingCandidate
      ? (state.candidateReason || observedReason)
      : observedReason;
    const stableForMs = Math.max(0, now - candidateSince);

    if (stableForMs >= hysteresisFor(observedStatus, state.timing)) {
      next = {
        ...next,
        status: observedStatus,
        statusReason: candidateReason,
        candidateStatus: null,
        candidateReason: "",
        candidateSince: null,
        distractedSince: observedStatus === FOCUS_ROOM_STATUS.DISTRACTED
          ? candidateSince
          : null,
      };
    } else {
      next = {
        ...next,
        candidateStatus: observedStatus,
        candidateReason,
        candidateSince,
      };
    }
  }

  return maybeIssueNudge(next, now);
}

export function getFocusRoomProgress(state, now = state?.lastSampleAt ?? 0) {
  if (!state?.timing) {
    return {
      distractedForMs: 0,
      remainingUntilNudgeMs: 0,
      progress: 0,
      cooldownRemainingMs: 0,
    };
  }

  const timestamp = Math.max(
    state.lastSampleAt ?? 0,
    normalizeTimestamp(now, state.lastSampleAt ?? 0),
  );
  const distractedForMs = state.status === FOCUS_ROOM_STATUS.DISTRACTED
    && state.distractedSince != null
    ? Math.max(0, timestamp - state.distractedSince)
    : 0;
  const threshold = state.timing.distractionThresholdMs;
  const remainingUntilNudgeMs = Math.max(0, threshold - distractedForMs);
  const progress = threshold === 0 ? 1 : Math.min(1, distractedForMs / threshold);
  const cooldownRemainingMs = state.lastNudgeAt == null
    ? 0
    : Math.max(0, state.timing.nudgeCooldownMs - (timestamp - state.lastNudgeAt));

  return {
    distractedForMs,
    remainingUntilNudgeMs,
    progress,
    cooldownRemainingMs,
  };
}
