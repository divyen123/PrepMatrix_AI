import assert from "node:assert/strict";
import test from "node:test";
import { createGuideDemoState, guideDemoReducer } from "./prepMatrixGuideDemoState.js";

const examples = { subject: "Chemistry", chapter: "Atomic structure", topic: "Electron shells" };
const steps = ["profile", "subjects", "plan", "learn", "follow", "revise", "review"];
const apply = (state, type, extra = {}) => guideDemoReducer(state, { type, examples, ...extra });

test("each guide demo is opt-in and stops after its three actions", () => {
  for (const stepId of steps) {
    let state = createGuideDemoState(stepId, examples);
    assert.equal(state.playing, false);
    assert.equal(apply(state, "advance"), state, `${stepId}: an idle preview cannot advance`);
    state = apply(state, "watch");
    for (let phase = 1; phase <= 3; phase += 1) {
      state = apply(state, "advance");
      assert.equal(state.phase, phase, stepId);
      assert.equal(state.playing, phase < 3, stepId);
    }
    assert.equal(apply(state, "advance"), state, `${stepId}: finished playback cannot loop`);
  }
});

test("pause preserves a scene and resume continues the remaining actions", () => {
  let state = apply(createGuideDemoState("subjects", examples), "watch");
  state = apply(state, "advance");
  assert.equal(state.subjectName, "Chemistry");
  state = apply(state, "pause");
  assert.equal(apply(state, "advance"), state, "a queued timer cannot change a paused scene");
  state = apply(state, "watch");
  assert.equal(state.phase, 1);
  state = apply(state, "advance");
  assert.equal(state.phase, 2);
  assert.equal(state.difficulty, "Hard");
  assert.equal(state.subjectAdded, false);
});

test("manual input takes control and a stale playback tick cannot overwrite it", () => {
  let state = apply(createGuideDemoState("subjects", examples), "watch");
  state = apply(state, "advance");
  state = apply(state, "interact", { changes: { subjectName: "History", chapters: "9", difficulty: "Easy" } });
  assert.equal(state.playing, false);
  assert.equal(state.subjectName, "History");
  assert.equal(apply(state, "advance"), state);

  const replay = apply(state, "replay");
  assert.equal(replay.stepId, "subjects");
  assert.equal(replay.subjectName, "");
  assert.equal(replay.chapters, "3");
  assert.equal(replay.phase, 0);
  assert.equal(replay.playing, true);
  assert.equal(state.subjectName, "History", "replay must not mutate an earlier state");
});

test("demonstrations complete the same local outcomes the controls teach", () => {
  const completed = Object.fromEntries(steps.map((stepId) => {
    let state = apply(createGuideDemoState(stepId, examples), "watch");
    for (let i = 0; i < 3; i += 1) state = apply(state, "advance");
    return [stepId, state];
  }));
  assert.equal(completed.profile.contextTarget, "AI");
  assert.equal(completed.subjects.subjectAdded, true);
  assert.equal(completed.subjects.subjectName, examples.subject);
  assert.equal(completed.plan.generated, true);
  assert.match(completed.plan.examDate, /^\d{4}-\d{2}-\d{2}$/u);
  assert.equal(completed.plan.strategy, "priority");
  assert.equal(completed.learn.sourceAdded && completed.learn.outlineReady && completed.learn.scheduled && completed.learn.learned, true);
  assert.deepEqual(completed.follow.completed, [false, true, true]);
  assert.equal(completed.follow.recovered, true, "recovering missed work must not falsely mark it complete");
  assert.equal(completed.revise.noteSaved, true);
  assert.equal(completed.revise.answer, "revisit");
  assert.equal(completed.revise.bookmarked, true);
  assert.equal(completed.review.selectedLane, 2, "review ends with the chapter most in need of attention");
});

test("a new step gets fresh state and curriculum-specific examples", () => {
  const learning = createGuideDemoState("learn", examples);
  const notes = createGuideDemoState("revise", examples);
  assert.match(notes.note, /Electron shells/u);
  assert.equal(notes.sourceAdded, false);
  assert.notEqual(notes.completed, learning.completed, "step state must not share mutable task arrays");
});
