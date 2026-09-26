import assert from "node:assert/strict";
import test from "node:test";
import { getCometDialProgressTone } from "./cometDialTone.js";

test("grades the dial tone against its current level, not lifetime XP", () => {
  assert.equal(getCometDialProgressTone(200, 200, 300), "empty");
  assert.equal(getCometDialProgressTone(225, 200, 300), "starting");
  assert.equal(getCometDialProgressTone(260, 200, 300), "building");
  assert.equal(getCometDialProgressTone(290, 200, 300), "nearly");
  assert.equal(getCometDialProgressTone(300, 200, 300), "complete");
});

test("handles unavailable or out-of-range progress without an invalid tone", () => {
  assert.equal(getCometDialProgressTone(NaN, 0, 100), "empty");
  assert.equal(getCometDialProgressTone(-10, 0, 100), "empty");
  assert.equal(getCometDialProgressTone(101, 0, 100), "complete");
  assert.equal(getCometDialProgressTone(25, 100, 100), "empty");
});
