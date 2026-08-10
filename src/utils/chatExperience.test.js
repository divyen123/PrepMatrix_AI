import assert from "node:assert/strict";
import test from "node:test";
import { getChatExperienceCopy } from "./chatExperience.js";

test("uses clear age-appropriate copy for the Kids AI Chat", () => {
  const copy = getChatExperienceCopy(true);

  assert.equal(copy.heading, "Kids AI Chat");
  assert.match(copy.intro, /school|learning/i);
  assert.match(copy.subtitle, /age-appropriate/i);
});

test("keeps the standard study-assistant copy for older learners", () => {
  const copy = getChatExperienceCopy(false);

  assert.equal(copy.heading, "Study assistant");
  assert.match(copy.intro, /planner-based advice/i);
});
