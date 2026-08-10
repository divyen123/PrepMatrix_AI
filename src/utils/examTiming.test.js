import assert from "node:assert/strict";
import test from "node:test";
import {
  ACTIVE_EXAM_ATTEMPT_STORAGE_KEY,
  canManuallySubmitExam,
  getExamMinimumSubmitAt,
  getExamMinimumSubmitRemainingSeconds,
  MINIMUM_EXAM_SUBMIT_MS,
  readStoredActiveExamAttemptId,
} from "./examTiming.js";

const STARTED_AT = "2026-07-12T10:00:00.000Z";
const STARTED_AT_MS = Date.parse(STARTED_AT);

test("derives the submit boundary from the server-owned start time", () => {
  assert.equal(
    getExamMinimumSubmitAt({ startedAt: STARTED_AT }),
    STARTED_AT_MS + MINIMUM_EXAM_SUBMIT_MS,
  );
});

test("honors a later explicit boundary without shortening the minimum", () => {
  const laterBoundary = STARTED_AT_MS + MINIMUM_EXAM_SUBMIT_MS + 60_000;
  assert.equal(getExamMinimumSubmitAt({
    startedAt: STARTED_AT,
    minimumSubmitAt: new Date(laterBoundary).toISOString(),
  }), laterBoundary);
});

test("manual submission stays locked until the exact 15-minute boundary", () => {
  const attempt = { startedAt: STARTED_AT };
  assert.equal(canManuallySubmitExam(attempt, STARTED_AT_MS), false);
  assert.equal(canManuallySubmitExam(attempt, STARTED_AT_MS + MINIMUM_EXAM_SUBMIT_MS - 1), false);
  assert.equal(canManuallySubmitExam(attempt, STARTED_AT_MS + MINIMUM_EXAM_SUBMIT_MS), true);
});

test("remaining seconds use ceiling and reach zero at the boundary", () => {
  const attempt = { startedAt: STARTED_AT };
  assert.equal(getExamMinimumSubmitRemainingSeconds(attempt, STARTED_AT_MS), 900);
  assert.equal(getExamMinimumSubmitRemainingSeconds(attempt, STARTED_AT_MS + MINIMUM_EXAM_SUBMIT_MS - 1), 1);
  assert.equal(getExamMinimumSubmitRemainingSeconds(attempt, STARTED_AT_MS + MINIMUM_EXAM_SUBMIT_MS), 0);
});

test("missing authoritative timestamps fail closed", () => {
  assert.equal(getExamMinimumSubmitAt({}), null);
  assert.equal(canManuallySubmitExam({}, STARTED_AT_MS), false);
});

test("reads a bounded active-attempt identifier without failing on unavailable storage", () => {
  assert.equal(readStoredActiveExamAttemptId({
    getItem(key) {
      assert.equal(key, ACTIVE_EXAM_ATTEMPT_STORAGE_KEY);
      return "  attempt-123  ";
    },
  }), "attempt-123");
  assert.equal(readStoredActiveExamAttemptId({
    getItem() {
      throw new Error("storage blocked");
    },
  }), "");
  assert.equal(readStoredActiveExamAttemptId(null), "");
});
