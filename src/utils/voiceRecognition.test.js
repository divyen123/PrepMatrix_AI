import test from "node:test";
import assert from "node:assert/strict";
import {
  getVoiceRecognitionCandidates,
  selectVoiceRecognitionTranscript,
} from "./voiceRecognition.js";

test("builds primary and single-alternative recognition candidates", () => {
  const results = [
    [{ transcript: "go to you tube" }, { transcript: "go to youtube" }],
    [{ transcript: "and search photosynthesis" }],
  ];

  assert.deepEqual(getVoiceRecognitionCandidates(results), [
    "go to you tube and search photosynthesis",
    "go to youtube and search photosynthesis",
  ]);
});

test("prefers an alternative that resolves to a known command", () => {
  const results = [[
    { transcript: "explain planner" },
    { transcript: "open planner" },
  ]];

  assert.equal(
    selectVoiceRecognitionTranscript(results, (candidate) => candidate === "open planner"),
    "open planner",
  );
  assert.equal(selectVoiceRecognitionTranscript(results, () => null), "explain planner");
});
