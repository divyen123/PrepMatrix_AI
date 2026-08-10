import assert from "node:assert/strict";
import test from "node:test";
import {
  RESUME_WEEKLY_LIMIT,
  RESUME_WINDOW_MS,
  createFreshResumeBuilderState,
  getResumeEligibility,
  getResumeQuota,
  normalizeResumeBuilderState,
  recordResumeGeneration,
} from "./resumeBuilder.js";

test("starts a fresh resume without changing PDF usage metadata", () => {
  const now = Date.UTC(2026, 7, 10, 10);
  const generatedAt = new Date(now - 60_000).toISOString();
  const current = normalizeResumeBuilderState({
    draft: {
      personal: {
        fullName: "Saved Candidate",
        headline: "Loaded resume",
        email: "saved@example.com",
      },
      summary: "This content came from resume history.",
      skills: ["React"],
    },
    layout: { template: "compact", accent: "#5b7cfa" },
    generationTimestamps: [generatedAt],
    lastGeneratedAt: generatedAt,
  }, {}, { now });

  const fresh = createFreshResumeBuilderState(current, {
    username: "New Candidate",
    email: "new@example.com",
  }, { mode: "editing", now });

  assert.equal(fresh.draft.personal.fullName, "New Candidate");
  assert.equal(fresh.draft.personal.email, "new@example.com");
  assert.equal(fresh.draft.personal.headline, "");
  assert.equal(fresh.draft.summary, "");
  assert.deepEqual(fresh.draft.skills, []);
  assert.equal(fresh.layout.template, "modern");
  assert.deepEqual(fresh.generationTimestamps, [generatedAt]);
  assert.equal(fresh.lastGeneratedAt, generatedAt);
  assert.equal(fresh.updatedAt, new Date(now).toISOString());
});

test("resume builder enables requested career categories", () => {
  assert.equal(getResumeEligibility({ academicTrack: "Computer Science & IT" }).enabled, true);
  assert.equal(getResumeEligibility({ academicLevel: "Diploma / Vocational" }).enabled, true);
});

test("resume builder stays hidden for every school class regardless of track", () => {
  [
    { academicLevel: "Primary School", grade: "Class 1", academicTrack: "Engineering & Technology" },
    { academicLevel: "Middle School", grade: "Class 6", academicTrack: "Computer Science & IT" },
    { academicLevel: "Senior Secondary", grade: "Class 12", academicTrack: "Professional Certification" },
    { academicLevel: "Secondary", academicTrack: "CBSE" },
  ].forEach((profile) => {
    assert.equal(getResumeEligibility(profile).enabled, false);
  });
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
