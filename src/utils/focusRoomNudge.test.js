import assert from "node:assert/strict";
import test from "node:test";
import { buildFocusNudgeMessage, speakFocusNudge } from "./focusRoomNudge.js";

test("builds a gentle personalized focus reminder", () => {
  assert.equal(
    buildFocusNudgeMessage("Divyen Shah", "Biology"),
    "Hey Divyen, let's get back to studying Biology.",
  );
  assert.equal(
    buildFocusNudgeMessage("", "Organic Chemistry"),
    "Hey, let's get back to studying Organic Chemistry.",
  );
});
test("uses injected browser speech without a network dependency", () => {
  const spoken = [];
  class TestUtterance {
    constructor(text) {
      this.text = text;
    }
  }

  const supported = speakFocusNudge("Let's focus.", {
    speechSynthesis: { speak: (utterance) => spoken.push(utterance) },
    Utterance: TestUtterance,
  });
  assert.equal(supported, true);
  assert.equal(spoken[0].text, "Let's focus.");
  assert.equal(spoken[0].volume, 0.72);
});
