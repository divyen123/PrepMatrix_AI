import assert from "node:assert/strict";
import test from "node:test";
import { filterHistoricalQuizAttempts } from "./analyticsHistoryReport.js";

const snapshot = {
  archivedAt: "2026-09-20T12:00:00Z",
  scheduleStartDate: "2026-09-10",
  momentumSchedule: { id: "previous-plan", startedAt: "2026-09-09T08:00:00Z" },
  subjects: [{ name: "Networks" }],
};

test("historical reports use matching completed attempts before the archive cutoff", () => {
  const attempts = [
    { id: "saved", status: "completed", momentumScheduleId: "previous-plan", completedAt: "2026-09-15T09:00:00Z" },
    { id: "current", status: "completed", momentumScheduleId: "current-plan", completedAt: "2026-09-16T09:00:00Z" },
    { id: "later", status: "completed", momentumScheduleId: "previous-plan", completedAt: "2026-09-21T09:00:00Z" },
    { id: "draft", status: "draft", momentumScheduleId: "previous-plan", createdAt: "2026-09-15T09:00:00Z" },
    { id: "unknown", status: "completed", momentumScheduleId: "previous-plan" },
  ];
  const original = structuredClone(attempts);
  assert.deepEqual(filterHistoricalQuizAttempts(attempts, snapshot).map((attempt) => attempt.id), ["saved"]);
  assert.deepEqual(attempts, original);
});

test("legacy reports only include subject-matching attempts within the saved interval", () => {
  const attempts = [
    { id: "saved", subjectName: "NETWORKS", createdAt: "2026-09-15T09:00:00Z" },
    { id: "older", subjectName: "Networks", createdAt: "2026-09-08T09:00:00Z" },
    { id: "unrelated", subjectName: "Physics", createdAt: "2026-09-15T09:00:00Z" },
  ];
  assert.deepEqual(filterHistoricalQuizAttempts(attempts, snapshot).map((attempt) => attempt.id), ["saved"]);
  assert.deepEqual(filterHistoricalQuizAttempts(attempts, {}), []);
});
