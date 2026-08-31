import assert from "node:assert/strict";
import test from "node:test";
import {
  RESUME_BUILDER_INTRO_EXIT_MS,
  RESUME_BUILDER_INTRO_MINIMUM_MS,
  createResumeBuilderIntroState,
  getResumeBuilderIntroDurations,
  resumeBuilderIntroReducer,
} from "./resumeBuilderIntro.js";
import {
  QUIZ_BATTLE_INTRO_EXIT_MS,
  QUIZ_BATTLE_INTRO_MINIMUM_MS,
} from "./quizBattleIntro.js";

function dispatchAll(state, actions) {
  return actions.reduce(resumeBuilderIntroReducer, state);
}

test("holds the resume intro until time, history, and quota have all settled", () => {
  const initial = createResumeBuilderIntroState();
  const waiting = dispatchAll(initial, [
    { type: "minimum_elapsed" },
    { type: "history_settled" },
  ]);

  assert.equal(waiting.phase, "playing");
  assert.equal(
    resumeBuilderIntroReducer(waiting, { type: "quota_settled" }).phase,
    "exiting",
  );
});

test("readiness signals may arrive in any order", () => {
  const dataFirst = dispatchAll(createResumeBuilderIntroState(), [
    { type: "quota_settled" },
    { type: "history_settled" },
  ]);
  const timeFirst = resumeBuilderIntroReducer(
    createResumeBuilderIntroState(),
    { type: "minimum_elapsed" },
  );

  assert.equal(dataFirst.phase, "playing");
  assert.equal(timeFirst.phase, "playing");
  assert.equal(
    resumeBuilderIntroReducer(dataFirst, { type: "minimum_elapsed" }).phase,
    "exiting",
  );
  assert.equal(
    dispatchAll(timeFirst, [
      { type: "history_settled" },
      { type: "quota_settled" },
    ]).phase,
    "exiting",
  );
});

test("finishes once per mount and a fresh mount starts visible", () => {
  const exiting = dispatchAll(createResumeBuilderIntroState(), [
    { type: "minimum_elapsed" },
    { type: "history_settled" },
    { type: "quota_settled" },
  ]);
  const done = resumeBuilderIntroReducer(exiting, { type: "exit_finished" });

  assert.equal(done.phase, "done");
  assert.strictEqual(
    resumeBuilderIntroReducer(done, { type: "history_settled" }),
    done,
  );
  assert.equal(createResumeBuilderIntroState().phase, "playing");
});

test("reduced motion shortens presentation without bypassing data readiness", () => {
  assert.equal(RESUME_BUILDER_INTRO_MINIMUM_MS, QUIZ_BATTLE_INTRO_MINIMUM_MS);
  assert.equal(RESUME_BUILDER_INTRO_EXIT_MS, QUIZ_BATTLE_INTRO_EXIT_MS);
  assert.deepEqual(getResumeBuilderIntroDurations(false), {
    minimumMs: RESUME_BUILDER_INTRO_MINIMUM_MS,
    exitMs: RESUME_BUILDER_INTRO_EXIT_MS,
  });
  const reduced = getResumeBuilderIntroDurations(true);
  assert.ok(reduced.minimumMs < RESUME_BUILDER_INTRO_MINIMUM_MS);
  assert.ok(reduced.exitMs < RESUME_BUILDER_INTRO_EXIT_MS);

  const waiting = resumeBuilderIntroReducer(
    createResumeBuilderIntroState(),
    { type: "minimum_elapsed" },
  );
  assert.equal(waiting.phase, "playing");
});
