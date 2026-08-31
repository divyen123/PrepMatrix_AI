import assert from "node:assert/strict";
import test from "node:test";
import {
  QUIZ_BATTLE_INTRO_EXIT_MS,
  QUIZ_BATTLE_INTRO_MINIMUM_MS,
  createQuizBattleIntroState,
  getQuizBattleIntroDurations,
  quizBattleIntroReducer,
} from "./quizBattleIntro.js";

function dispatchAll(state, actions) {
  return actions.reduce(quizBattleIntroReducer, state);
}

test("holds the intro until both its minimum time and initial list request settle", () => {
  const initial = createQuizBattleIntroState();
  const loadFirst = quizBattleIntroReducer(initial, { type: "list_settled" });
  const timeFirst = quizBattleIntroReducer(initial, { type: "minimum_elapsed" });

  assert.equal(loadFirst.phase, "playing");
  assert.equal(timeFirst.phase, "playing");
  assert.equal(
    quizBattleIntroReducer(loadFirst, { type: "minimum_elapsed" }).phase,
    "exiting",
  );
  assert.equal(
    quizBattleIntroReducer(timeFirst, { type: "list_settled" }).phase,
    "exiting",
  );
});

test("also waits for deep-linked battle and invite requests when present", () => {
  const initial = createQuizBattleIntroState({ waitForBattle: true, waitForInvite: true });
  const waiting = dispatchAll(initial, [
    { type: "minimum_elapsed" },
    { type: "list_settled" },
    { type: "battle_settled" },
  ]);

  assert.equal(waiting.phase, "playing");
  assert.equal(
    quizBattleIntroReducer(waiting, { type: "invite_settled" }).phase,
    "exiting",
  );
});

test("dismissal is sticky for refreshes while a fresh mount starts visible", () => {
  const exiting = dispatchAll(createQuizBattleIntroState(), [
    { type: "list_settled" },
    { type: "minimum_elapsed" },
  ]);
  const done = quizBattleIntroReducer(exiting, { type: "exit_finished" });

  assert.equal(done.phase, "done");
  assert.strictEqual(
    quizBattleIntroReducer(done, { type: "list_settled" }),
    done,
  );
  assert.equal(createQuizBattleIntroState().phase, "playing");
});

test("reduced motion shortens presentation without bypassing data readiness", () => {
  assert.deepEqual(getQuizBattleIntroDurations(false), {
    minimumMs: QUIZ_BATTLE_INTRO_MINIMUM_MS,
    exitMs: QUIZ_BATTLE_INTRO_EXIT_MS,
  });
  const reduced = getQuizBattleIntroDurations(true);
  assert.ok(reduced.minimumMs < QUIZ_BATTLE_INTRO_MINIMUM_MS);
  assert.ok(reduced.exitMs < QUIZ_BATTLE_INTRO_EXIT_MS);

  const waiting = quizBattleIntroReducer(
    createQuizBattleIntroState(),
    { type: "minimum_elapsed" },
  );
  assert.equal(waiting.phase, "playing");
});
