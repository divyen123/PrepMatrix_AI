import assert from "node:assert/strict";
import test from "node:test";
import {
  FOCUS_ROOM_STATUS,
  createFocusRoomState,
  getFocusRoomProgress,
  transitionFocusRoomState,
} from "./focusRoomState.js";

function activate(options = {}) {
  return transitionFocusRoomState(
    createFocusRoomState({
      now: 0,
      distractionHysteresisMs: 1_000,
      recoveryHysteresisMs: 1_000,
      unknownHysteresisMs: 1_000,
      ...options,
    }),
    { type: "ACTIVATE", now: 0 },
  );
}

function sample(state, status, now, reason = status) {
  return transitionFocusRoomState(state, {
    type: "SAMPLE",
    status,
    reason,
    now,
  });
}

test("starts paused and becomes unknown only after explicit activation", () => {
  const initial = createFocusRoomState();
  assert.equal(initial.active, false);
  assert.equal(initial.status, FOCUS_ROOM_STATUS.PAUSED);

  const active = transitionFocusRoomState(initial, { type: "ACTIVATE", now: 10 });
  assert.equal(active.active, true);
  assert.equal(active.status, FOCUS_ROOM_STATUS.UNKNOWN);
  assert.equal(active.statusReason, "warming_up");
});

test("requires thirty continuous distracted seconds before the first nudge", () => {
  let state = activate();
  state = sample(state, FOCUS_ROOM_STATUS.DISTRACTED, 1_000, "phone_detected");
  state = sample(state, FOCUS_ROOM_STATUS.DISTRACTED, 2_000, "phone_detected");
  assert.equal(state.status, FOCUS_ROOM_STATUS.DISTRACTED);
  assert.equal(state.distractedSince, 1_000);

  state = sample(state, FOCUS_ROOM_STATUS.DISTRACTED, 30_999, "phone_detected");
  assert.equal(state.nudgeSequence, 0);
  assert.equal(getFocusRoomProgress(state, 30_999).remainingUntilNudgeMs, 1);

  state = sample(state, FOCUS_ROOM_STATUS.DISTRACTED, 31_000, "phone_detected");
  assert.equal(state.nudgeSequence, 1);
  assert.deepEqual(state.lastNudge, {
    at: 31_000,
    distractedSince: 1_000,
    reason: "phone_detected",
  });
});

test("hysteresis ignores an isolated distracted sample", () => {
  let state = activate();
  state = sample(state, FOCUS_ROOM_STATUS.ATTENTIVE, 1_000);
  state = sample(state, FOCUS_ROOM_STATUS.ATTENTIVE, 2_000);
  assert.equal(state.status, FOCUS_ROOM_STATUS.ATTENTIVE);

  state = sample(state, FOCUS_ROOM_STATUS.DISTRACTED, 3_000);
  assert.equal(state.status, FOCUS_ROOM_STATUS.ATTENTIVE);
  assert.equal(state.candidateStatus, FOCUS_ROOM_STATUS.DISTRACTED);

  state = sample(state, FOCUS_ROOM_STATUS.ATTENTIVE, 3_500);
  assert.equal(state.status, FOCUS_ROOM_STATUS.ATTENTIVE);
  assert.equal(state.candidateStatus, null);
  assert.equal(state.distractedSince, null);
});

test("non-face unknown observations interrupt the continuous-distraction timer", () => {
  let state = activate();
  state = sample(state, FOCUS_ROOM_STATUS.DISTRACTED, 0);
  state = sample(state, FOCUS_ROOM_STATUS.DISTRACTED, 1_000);
  state = sample(state, FOCUS_ROOM_STATUS.DISTRACTED, 20_000);
  assert.equal(state.distractedSince, 0);

  state = sample(state, FOCUS_ROOM_STATUS.UNKNOWN, 21_000, "head_pose_unavailable");
  state = sample(state, FOCUS_ROOM_STATUS.UNKNOWN, 22_000, "head_pose_unavailable");
  assert.equal(state.status, FOCUS_ROOM_STATUS.UNKNOWN);
  assert.equal(state.distractedSince, null);

  state = sample(state, FOCUS_ROOM_STATUS.DISTRACTED, 23_000);
  state = sample(state, FOCUS_ROOM_STATUS.DISTRACTED, 24_000);
  state = sample(state, FOCUS_ROOM_STATUS.DISTRACTED, 52_999);
  assert.equal(state.nudgeSequence, 0);
  state = sample(state, FOCUS_ROOM_STATUS.DISTRACTED, 53_000);
  assert.equal(state.nudgeSequence, 1);
});

test("cooldown prevents repeated reminders during the same distraction", () => {
  let state = activate({
    distractionThresholdMs: 2_000,
    nudgeCooldownMs: 5_000,
  });
  state = sample(state, FOCUS_ROOM_STATUS.DISTRACTED, 0);
  state = sample(state, FOCUS_ROOM_STATUS.DISTRACTED, 1_000);
  state = sample(state, FOCUS_ROOM_STATUS.DISTRACTED, 2_000);
  assert.equal(state.nudgeSequence, 1);

  state = sample(state, FOCUS_ROOM_STATUS.DISTRACTED, 6_999);
  assert.equal(state.nudgeSequence, 1);
  state = sample(state, FOCUS_ROOM_STATUS.DISTRACTED, 7_000);
  assert.equal(state.nudgeSequence, 2);
});

test("pause immediately clears pending distraction timing", () => {
  let state = activate();
  state = sample(state, FOCUS_ROOM_STATUS.DISTRACTED, 1_000);
  state = sample(state, FOCUS_ROOM_STATUS.DISTRACTED, 2_000);
  state = transitionFocusRoomState(state, {
    type: "PAUSE",
    reason: "document_hidden",
    now: 10_000,
  });

  assert.equal(state.active, false);
  assert.equal(state.status, FOCUS_ROOM_STATUS.PAUSED);
  assert.equal(state.statusReason, "document_hidden");
  assert.equal(state.distractedSince, null);

  const ignored = sample(state, FOCUS_ROOM_STATUS.DISTRACTED, 50_000);
  assert.equal(ignored, state);
  assert.equal(ignored.nudgeSequence, 0);
});

test("out-of-order samples cannot move timers backwards", () => {
  let state = activate({ distractionHysteresisMs: 0 });
  state = sample(state, FOCUS_ROOM_STATUS.DISTRACTED, 10_000);
  state = sample(state, FOCUS_ROOM_STATUS.DISTRACTED, 5_000);
  assert.equal(state.lastSampleAt, 10_000);
  assert.equal(getFocusRoomProgress(state, 5_000).distractedForMs, 0);
});
test("brief missing-face observations stay in grace and do not start a distraction", () => {
  let state = activate({ missingFaceGraceMs: 4_000 });
  state = sample(state, FOCUS_ROOM_STATUS.ATTENTIVE, 1_000);
  state = sample(state, FOCUS_ROOM_STATUS.ATTENTIVE, 2_000);

  state = sample(state, FOCUS_ROOM_STATUS.UNKNOWN, 3_000, "face_not_visible");
  state = sample(state, FOCUS_ROOM_STATUS.UNKNOWN, 4_000, "face_not_visible");
  assert.equal(state.status, FOCUS_ROOM_STATUS.UNKNOWN);
  assert.equal(state.missingFaceSince, 3_000);
  assert.equal(state.distractedSince, null);

  state = sample(state, FOCUS_ROOM_STATUS.ATTENTIVE, 6_999, "attentive");
  state = sample(state, FOCUS_ROOM_STATUS.ATTENTIVE, 7_999, "attentive");
  assert.equal(state.status, FOCUS_ROOM_STATUS.ATTENTIVE);
  assert.equal(state.missingFaceSince, null);
  assert.equal(state.nudgeSequence, 0);
});

test("sustained missing face becomes distracted and preserves disappearance continuity", () => {
  let state = activate({ missingFaceGraceMs: 4_000 });
  state = sample(state, FOCUS_ROOM_STATUS.ATTENTIVE, 0);
  state = sample(state, FOCUS_ROOM_STATUS.ATTENTIVE, 1_000);

  state = sample(state, FOCUS_ROOM_STATUS.UNKNOWN, 2_000, "face_not_visible");
  state = sample(state, FOCUS_ROOM_STATUS.UNKNOWN, 5_999, "face_not_visible");
  assert.notEqual(state.status, FOCUS_ROOM_STATUS.DISTRACTED);
  assert.equal(state.nudgeSequence, 0);

  state = sample(state, FOCUS_ROOM_STATUS.UNKNOWN, 6_000, "face_not_visible");
  assert.equal(state.status, FOCUS_ROOM_STATUS.DISTRACTED);
  assert.equal(state.statusReason, "face_not_visible");
  assert.equal(state.distractedSince, 2_000);
  assert.equal(getFocusRoomProgress(state, 6_000).distractedForMs, 4_000);

  state = sample(state, FOCUS_ROOM_STATUS.UNKNOWN, 31_999, "face_not_visible");
  assert.equal(state.nudgeSequence, 0);
  state = sample(state, FOCUS_ROOM_STATUS.UNKNOWN, 32_000, "face_not_visible");
  assert.equal(state.nudgeSequence, 1);
  assert.deepEqual(state.lastNudge, {
    at: 32_000,
    distractedSince: 2_000,
    reason: "face_not_visible",
  });
});

test("generic detector uncertainty never matures into a missing-face distraction", () => {
  let state = activate({ missingFaceGraceMs: 1_000 });
  state = sample(state, FOCUS_ROOM_STATUS.UNKNOWN, 0, "head_pose_unavailable");
  state = sample(state, FOCUS_ROOM_STATUS.UNKNOWN, 1_000, "head_pose_unavailable");
  state = sample(state, FOCUS_ROOM_STATUS.UNKNOWN, 60_000, "head_pose_unavailable");

  assert.equal(state.status, FOCUS_ROOM_STATUS.UNKNOWN);
  assert.equal(state.statusReason, "head_pose_unavailable");
  assert.equal(state.missingFaceSince, null);
  assert.equal(state.distractedSince, null);
  assert.equal(state.nudgeSequence, 0);
});

test("losing the face while already distracted does not reset continuity", () => {
  let state = activate({ missingFaceGraceMs: 4_000 });
  state = sample(state, FOCUS_ROOM_STATUS.DISTRACTED, 1_000, "looking_away");
  state = sample(state, FOCUS_ROOM_STATUS.DISTRACTED, 2_000, "looking_away");
  state = sample(state, FOCUS_ROOM_STATUS.UNKNOWN, 10_000, "face_not_visible");

  assert.equal(state.status, FOCUS_ROOM_STATUS.DISTRACTED);
  assert.equal(state.statusReason, "face_not_visible");
  assert.equal(state.distractedSince, 1_000);

  state = sample(state, FOCUS_ROOM_STATUS.UNKNOWN, 31_000, "face_not_visible");
  assert.equal(state.nudgeSequence, 1);
});
