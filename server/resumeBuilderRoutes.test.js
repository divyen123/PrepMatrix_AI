import assert from "node:assert/strict";
import test from "node:test";
import {
  RESUME_GENERATION_LIMIT,
  RESUME_GENERATION_WINDOW_MS,
  createResumeQuota,
  isResumeBuilderEnabled,
} from "./resumeBuilderRoutes.js";

test("enables only resume-relevant academic profiles", () => {
  assert.equal(isResumeBuilderEnabled({ academicTrack: "Engineering & Technology" }), true);
  assert.equal(isResumeBuilderEnabled({ academicTrack: "Professional Certification" }), true);
  assert.equal(isResumeBuilderEnabled({ academicLevel: "Undergraduate / Bachelor's" }), true);
  assert.equal(isResumeBuilderEnabled({ academicLevel: "Secondary", academicTrack: "CBSE" }), false);
  assert.equal(
    isResumeBuilderEnabled({
      academicLevel: "Primary School",
      grade: "Class 1",
      academicTrack: "Engineering & Technology",
    }),
    false,
  );
  assert.equal(
    isResumeBuilderEnabled({
      academicLevel: "Middle School",
      grade: "Class 6",
      academicTrack: "Computer Science & IT",
    }),
    false,
  );
  assert.equal(
    isResumeBuilderEnabled({
      academicLevel: "Senior Secondary",
      grade: "Class 12",
      academicTrack: "Professional Certification",
    }),
    false,
  );
});

test("returns a five-generation rolling quota", () => {
  const now = new Date("2026-07-20T12:00:00.000Z");
  const generations = Array.from({ length: RESUME_GENERATION_LIMIT }, (_, index) => ({
    generatedAt: new Date(now.getTime() - index * 60_000),
  }));
  const quota = createResumeQuota(generations, now);
  assert.equal(quota.used, 5);
  assert.equal(quota.remaining, 0);
  assert.equal(quota.canGenerate, false);
});

test("expired generations do not consume the allowance", () => {
  const now = new Date("2026-07-20T12:00:00.000Z");
  const quota = createResumeQuota(
    [{ generatedAt: new Date(now.getTime() - RESUME_GENERATION_WINDOW_MS - 1) }],
    now
  );
  assert.equal(quota.used, 0);
  assert.equal(quota.remaining, 5);
});
