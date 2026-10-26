import assert from "node:assert/strict";
import test from "node:test";
import { persistChatSubjectMutation } from "./chatSubjectPersistence.js";
import { mergeChatSubjectOutline, undoChatSubjectOutline } from "./chatSubjectOutline.js";

function harness(overrides = {}) {
  const state = { profileId: "profile-a", epoch: 1, ready: true, subjects: [] };
  const writes = [];
  const commits = [];
  const options = {
    readCurrent: () => state,
    prepare: (subjects) => ({ subjects: [...subjects, { name: "Maths" }], changed: true }),
    saveSubjects: async (subjects, profileId) => { writes.push({ subjects, profileId }); },
    commitSubjects: (subjects) => { commits.push(subjects); state.subjects = subjects; },
    ...overrides,
  };
  return { state, writes, commits, options };
}

test("saves subjects for the captured profile before updating local state", async () => {
  const h = harness();
  h.options.saveSubjects = async (subjects, profileId) => {
    assert.equal(h.commits.length, 0);
    h.writes.push({ subjects, profileId });
  };
  const result = await persistChatSubjectMutation(h.options);
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].profileId, "profile-a");
  assert.equal(h.commits[0], result.subjects);
});

test("a failed save keeps the local subject list unchanged", async () => {
  const h = harness({ saveSubjects: async () => { throw new Error("Offline"); } });
  const before = h.state.subjects;
  await assert.rejects(persistChatSubjectMutation(h.options), /Offline/u);
  assert.equal(h.state.subjects, before);
  assert.deepEqual(h.commits, []);
});

test("duplicate imports do not perform another save", async () => {
  const h = harness({ prepare: (subjects) => ({ subjects, changed: false }) });
  assert.equal((await persistChatSubjectMutation(h.options)).changed, false);
  assert.deepEqual(h.writes, []);
  assert.deepEqual(h.commits, []);
});

test("waits for pending autosave and rejects a profile switch before saving", async () => {
  const h = harness();
  h.options.waitForPendingSave = async () => { h.state.profileId = "profile-b"; };
  await assert.rejects(persistChatSubjectMutation(h.options), /profile changed/u);
  assert.deepEqual(h.writes, []);
  assert.deepEqual(h.commits, []);
});

test("a late response cannot update another profile or a reloaded workspace", async () => {
  for (const changeScope of [
    (state) => { state.profileId = "profile-b"; },
    (state) => { state.epoch += 1; },
    (state) => { state.ready = false; },
  ]) {
    const h = harness();
    h.options.saveSubjects = async () => { changeScope(h.state); };
    await assert.rejects(persistChatSubjectMutation(h.options), /profile changed/u);
    assert.deepEqual(h.commits, []);
  }
});

test("preserves a concurrent subject addition by rebasing before commit", async () => {
  const h = harness();
  const physics = { name: "Physics", chapters: 3 };
  h.options.saveSubjects = async (subjects, profileId) => {
    h.writes.push({ subjects, profileId });
    if (h.writes.length === 1) h.state.subjects = [physics];
  };
  await persistChatSubjectMutation(h.options);
  assert.equal(h.writes.length, 2);
  assert.deepEqual(h.state.subjects, [physics, { name: "Maths" }]);
  assert.equal(h.state.subjects[0], physics);
});

test("a destination deleted during a save is not recreated by a stale commit", async () => {
  const h = harness();
  const original = { name: "Maths" };
  h.state.subjects = [original];
  h.options.prepare = (subjects) => {
    if (!subjects.length) throw new Error("Destination no longer exists");
    return { subjects: [{ ...original, topics: ["Algebra"] }], changed: true };
  };
  h.options.saveSubjects = async (subjects, profileId) => {
    h.writes.push({ subjects, profileId });
    if (h.writes.length === 1) h.state.subjects = [];
  };
  await assert.rejects(persistChatSubjectMutation(h.options), /no longer exists/u);
  assert.deepEqual(h.writes.at(-1).subjects, []);
  assert.deepEqual(h.commits, []);
});

test("a real outline import and Undo persist only subjects and retain the planner", async () => {
  const schedule = [{ day: 1, tasks: [{ task: "Maths - Fractions", unitKey: "chapter:1" }] }];
  const completed = ["Maths - Fractions"];
  const before = { name: "Maths", chapters: 1, chapterNames: ["Fractions"], difficulty: "hard" };
  const workspace = { subjects: [before], schedule, completed, scheduleStartDate: "2026-10-25" };
  const h = harness();
  h.state.subjects = workspace.subjects;
  h.options.prepare = (subjects) => mergeChatSubjectOutline(subjects, {
    subjectName: "Maths", chapterNames: ["Fractions", "Algebra"], topics: ["Equations"],
  });
  h.options.saveSubjects = async (subjects) => { workspace.subjects = structuredClone(subjects); };
  const imported = await persistChatSubjectMutation(h.options);
  assert.deepEqual(workspace.subjects[0].chapterNames, ["Fractions", "Algebra"]);
  assert.equal(workspace.subjects[0].difficulty, "hard");
  h.options.prepare = (subjects) => ({ subjects: undoChatSubjectOutline(subjects, imported.undoReceipt), changed: true });
  await persistChatSubjectMutation(h.options);
  assert.deepEqual(workspace.subjects, [before]);
  assert.equal(workspace.schedule, schedule);
  assert.equal(workspace.completed, completed);
  assert.equal(workspace.scheduleStartDate, "2026-10-25");
});
