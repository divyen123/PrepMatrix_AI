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
  assert.equal(copy.subtitle, "");
});

test("shows exactly one added subject in the new-chat prompt", () => {
  assert.equal(
    getNewChatPrompt([
      { name: "Mathematics" },
      { name: "Physics" },
      { name: "Chemistry" },
    ], () => 0.4),
    "Ask about Physics",
  );
});

test("shuffles across normalized subjects without listing the others", () => {
  const subjects = [
    { name: "Mathematics" },
    { name: " mathematics " },
    { name: "Physics" },
    { name: "Chemistry" },
  ];

  assert.equal(
    getNewChatPrompt(subjects, () => 0),
    "Ask about Mathematics",
  );
  assert.equal(
    getNewChatPrompt(subjects, () => 0.99),
    "Ask about Chemistry",
  );
  assert.equal(
    getNewChatPrompt(subjects, () => 0, "Ask about Mathematics"),
    "Ask about Physics",
  );
});

test("uses a clear new-chat fallback before subjects are added", () => {
  assert.equal(getNewChatPrompt([]), "What would you like to study?");
});
