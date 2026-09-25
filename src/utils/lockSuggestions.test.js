import assert from "node:assert/strict";
import test from "node:test";
import { buildLockSuggestions } from "./lockSuggestions.js";

test("gives subject, planner, and assistant ideas when the workspace is empty", () => {
  const suggestions = buildLockSuggestions();

  assert.ok(suggestions.length >= 4);
  assert.ok(suggestions.some((suggestion) => suggestion.includes("Add a subject")));
  assert.ok(suggestions.some((suggestion) => suggestion.includes("study schedule")));
  assert.ok(suggestions.some((suggestion) => suggestion.startsWith("Ask the assistant")));
});

test("uses saved subjects and planned tasks for contextual suggestions", () => {
  const suggestions = buildLockSuggestions({
    subjects: [{ name: "Physics" }, { name: "Data Analytics" }],
    schedule: [{ tasks: [{ task: "Physics - Waves" }, { task: "Data Analytics - Big data" }] }],
  });

  assert.ok(suggestions.some((suggestion) => suggestion.includes("Physics")));
  assert.ok(suggestions.some((suggestion) => suggestion.includes("Data Analytics")));
  assert.ok(suggestions.some((suggestion) => suggestion.includes("Physics - Waves")));
  assert.ok(suggestions.some((suggestion) => suggestion.includes("Big data")));
  assert.ok(!suggestions.some((suggestion) => suggestion.includes("Create a study schedule")));
});

test("suggests making a schedule when subjects exist without planned tasks", () => {
  const suggestions = buildLockSuggestions({ subjects: ["Chemistry"], schedule: [{ tasks: [] }] });

  assert.ok(suggestions.some((suggestion) => suggestion.includes("Create a study schedule for Chemistry")));
  assert.ok(suggestions.some((suggestion) => suggestion.includes("Ask the assistant") && suggestion.includes("Chemistry")));
});

test("ignores malformed entries, deduplicates labels, and bounds suggestion text", () => {
  const suggestions = buildLockSuggestions({
    subjects: [null, { name: "Physics" }, { name: " physics " }, { name: "X".repeat(300) }],
    schedule: [null, { tasks: [null, { task: "Physics - Waves" }, "physics - waves", { task: "Y".repeat(300) }] }],
  });

  assert.equal(suggestions.filter((suggestion) => suggestion.includes("Review one chapter from Physics")).length, 1);
  assert.equal(suggestions.filter((suggestion) => suggestion.includes("Revisit your study plan: Physics - Waves")).length, 1);
  assert.ok(suggestions.every((suggestion) => suggestion.length <= 120));
  assert.ok(suggestions.every((suggestion) => !suggestion.includes("[object Object]")));
});
