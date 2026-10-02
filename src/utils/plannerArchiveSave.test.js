import assert from "node:assert/strict";
import test from "node:test";
import { savePlannerArchiveAttempt } from "./plannerArchiveSave.js";

const snapshot = { schedule: [{ tasks: [{ task: "Networks - TCP" }] }], completed: ["Networks - TCP"] };
const cleared = { schedule: [], completed: [], plannerHistory: [{ id: "saved-plan" }] };

test("clearing first persists the latest plan and then accepts the authoritative archived response", async () => {
  const writes = [];
  const attempt = { cleared, snapshotPersisted: false };
  const response = { workspace: { ...cleared, plannerHistory: [{ id: "saved-plan", learningInsights: { notebookCount: 1 } }] } };
  const result = await savePlannerArchiveAttempt({ attempt, snapshot, isScopeCurrent: () => true,
    saveWorkspace: async (workspace) => { writes.push(workspace); return response; } });
  assert.deepEqual(writes, [snapshot, cleared]);
  assert.equal(attempt.snapshotPersisted, true);
  assert.equal(result, response);
});

test("retry after a lost clear response never restores the old plan or creates another archive", async () => {
  const writes = [];
  const attempt = { cleared, snapshotPersisted: false };
  let failClear = true;
  const options = { attempt, snapshot, isScopeCurrent: () => true, saveWorkspace: async (workspace) => {
    writes.push(workspace);
    if (workspace === cleared && failClear) throw new Error("Response lost after save");
    return { workspace };
  } };
  await assert.rejects(savePlannerArchiveAttempt(options), /Response lost/u);
  assert.equal(attempt.snapshotPersisted, true);
  failClear = false;
  await savePlannerArchiveAttempt(options);
  assert.deepEqual(writes, [snapshot, cleared, cleared]);
});

test("a failed initial save can be retried and switching profiles prevents clearing", async () => {
  const attempt = { cleared, snapshotPersisted: false };
  await assert.rejects(savePlannerArchiveAttempt({ attempt, snapshot, isScopeCurrent: () => true,
    saveWorkspace: async () => { throw new Error("Offline"); } }), /Offline/u);
  assert.equal(attempt.snapshotPersisted, false);
  const writes = [];
  let active = true;
  await assert.rejects(savePlannerArchiveAttempt({ attempt, snapshot, isScopeCurrent: () => active,
    saveWorkspace: async (workspace) => { writes.push(workspace); active = false; return {}; } }), /academic profile changed/u);
  assert.deepEqual(writes, [snapshot]);
});
