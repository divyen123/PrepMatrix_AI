import assert from "node:assert/strict";
import test from "node:test";
import {
  RESUME_WEEKLY_LIMIT,
  RESUME_WINDOW_MS,
  getResumeEligibility,
  getResumeQuota,
  normalizeResumeBuilderState,
  recordResumeGeneration,
} from "./resumeBuilder.js";

test("resume builder enables requested career categories", () => {
  assert.equal(getResumeEligibility({ academicTrack: "Computer Science & IT" }).enabled, true);
  assert.equal(getResumeEligibility({ academicLevel: "Diploma / Vocational" }).enabled, true);
});

test("resume builder stays hidden for school-only profiles", () => {
  assert.equal(
    getResumeEligibility({ academicLevel: "Secondary", academicTrack: "CBSE" }).enabled,
    false
  );
});

test("professional certification eligibility is optional", () => {
  assert.equal(getResumeEligibility({ academicTrack: "Professional Certification" }).optional, true);
});

test("resume quota allows five generations inside a rolling seven day window", () => {
  const now = Date.UTC(2026, 6, 20, 12);
  let state = normalizeResumeBuilderState();
  for (let index = 0; index < RESUME_WEEKLY_LIMIT; index += 1) {
    state = recordResumeGeneration(state, now + index * 1_000);
  }
  const quota = getResumeQuota(state.generationTimestamps, now + 10_000);
  assert.equal(quota.used, 5);
  assert.equal(quota.remaining, 0);
  assert.equal(quota.canGenerate, false);
});

test("resume quota releases a generation after seven days", () => {
  const now = Date.UTC(2026, 6, 20, 12);
  const quota = getResumeQuota([new Date(now - RESUME_WINDOW_MS - 1).toISOString()], now);
  assert.equal(quota.used, 0);
  assert.equal(quota.remaining, 5);
});