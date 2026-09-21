import assert from "node:assert/strict";
import test from "node:test";
import { getChatExperienceCopy, getNewChatPrompt } from "./chatExperience.js";

test("uses clear age-appropriate copy for the Kids AI Chat", () => {
  const copy = getChatExperienceCopy(true);

  assert.equal(copy.heading, "Kids AI Chat");
  assert.match(copy.intro, /school|learning/i);
  assert.match(copy.subtitle, /age-appropriate/i);
});

test("keeps the standard study-assistant copy for older learners", () => {
  const copy = getChatExperienceCopy(false);

  assert.equal(copy.heading, "Study assistant");
  assert.equal(copy.intro, "What would you like to study?");
  assert.match(copy.subtitle, /planner-aware/i);
});

test("builds the new-chat prompt from added subjects", () => {
  assert.equal(
    getNewChatPrompt([
      { name: "Mathematics" },
      { name: "Physics" },
      { name: "Chemistry" },
    ]),
    "Ask about Mathematics, Physics, or Chemistry",
  );
});

test("deduplicates and caps long subject lists in the new-chat prompt", () => {
  assert.equal(
    getNewChatPrompt([
      { name: "Mathematics" },
      { name: " mathematics " },
      { name: "Physics" },
      { name: "Chemistry" },
      { name: "Biology" },
      { name: "English" },
    ]),
    "Ask about Mathematics, Physics, Chemistry, or 2 more subjects",
  );
});

test("uses a clear new-chat fallback before subjects are added", () => {
  assert.equal(getNewChatPrompt([]), "What would you like to study?");
});
