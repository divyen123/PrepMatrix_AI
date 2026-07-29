import test from "node:test";
import assert from "node:assert/strict";
import {
  getNotesBoardStatusCounts,
  getNoteWorkflowStatus,
} from "./notesBoardStatus.js";

test("maps planner completion and legacy resolved notes to completed", () => {
  assert.equal(getNoteWorkflowStatus({ status: "Open" }, { state: "completed" }), "Resolved");
  assert.equal(getNoteWorkflowStatus({ status: "Resolved" }, { state: "unscheduled" }), "Resolved");
});

test("keeps open, in-process, and completed board counts mutually exclusive", () => {
  const notes = [
    { id: "open", status: "Open" },
    { id: "active", status: "Open" },
    { id: "done", status: "Open" },
    { id: "legacy-done", status: "Resolved" },
  ];
  const plannerStates = new Map([
    ["open", { state: "unscheduled" }],
    ["active", { state: "added" }],
    ["done", { state: "completed" }],
    ["legacy-done", { state: "added" }],
  ]);

  assert.deepEqual(getNotesBoardStatusCounts(notes, plannerStates), {
    open: 1,
    completed: 2,
    inProcess: 1,
  });
});

test("returns empty counts for missing note data", () => {
  assert.deepEqual(getNotesBoardStatusCounts(), {
    open: 0,
    completed: 0,
    inProcess: 0,
  });
});
