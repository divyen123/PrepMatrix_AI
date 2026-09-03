import assert from "node:assert/strict";
import test from "node:test";
import {
  getSavedPlacementNotes,
  getStartLearningArtifactKind,
  isMedicalTrainingHash,
  isPlacementPrepHash,
  sortStartLearningNotebooks,
  shouldShowStartLearningHero,
} from "./startLearningWorkspace.js";

test("derives standalone saved-placement rows without mixing ordinary notebooks", () => {
  const notebooks = [{
    id: "notebook-1",
    title: "Operating Systems",
    updatedAt: "2026-08-10T10:00:00.000Z",
    careerPreparation: { topicAnalysis: { topics: [] } },
  }, {
    id: "notebook-2",
    title: "Data Structures",
    updatedAt: "2026-08-10T11:00:00.000Z",
    careerPreparation: {
      topicAnalysis: {
        targetRole: "Backend intern",
        topics: [{ title: "Queues" }, { title: "Stacks" }],
      },
    },
  }];

  const notes = getSavedPlacementNotes(notebooks);

  assert.equal(notes.length, 1);
  assert.equal(notes[0].id, "notebook-2:placement:placement-legacy");
  assert.equal(notes[0].historyId, "placement-legacy");
  assert.equal(notes[0].notebookId, "notebook-2");
  assert.equal(notes[0].title, "Backend intern");
  assert.equal(notes[0].topicCount, 2);
  assert.equal(notes[0].notebook, notebooks[1]);
});

test("sorts pinned notebook and placement histories above recent unpinned work", () => {
  const notebooks = [{ id: "new", updatedAt: "2026-08-10T11:00:00.000Z" }, {
    id: "pinned",
    pinned: true,
    updatedAt: "2026-08-01T11:00:00.000Z",
  }];
  assert.deepEqual(sortStartLearningNotebooks(notebooks).map((item) => item.id), ["pinned", "new"]);

  const notes = getSavedPlacementNotes([{
    id: "notebook-1",
    title: "DSA",
    careerPreparation: {
      history: [{
        id: "recent",
        generatedAt: "2026-08-10T11:00:00.000Z",
        analysis: { targetRole: "Recent", topics: [{ title: "Queues" }] },
      }, {
        id: "older-pinned",
        generatedAt: "2026-08-01T11:00:00.000Z",
        pinned: true,
        analysis: { targetRole: "Pinned", topics: [{ title: "Stacks" }] },
      }],
    },
  }]);
  assert.deepEqual(notes.map((note) => note.historyId), ["older-pinned", "recent"]);
});

test("resolves the visible artifact kind from intake and workspace state", () => {
  assert.equal(getStartLearningArtifactKind({ workspaceView: "intake", intakeMode: null }), null);
  assert.equal(getStartLearningArtifactKind({ workspaceView: "intake", intakeMode: "notebook" }), "notebook");
  assert.equal(getStartLearningArtifactKind({ workspaceView: "intake", intakeMode: "placement" }), "placement");
  assert.equal(getStartLearningArtifactKind({ workspaceView: "intake", intakeMode: "medical" }), "medical");
  assert.equal(getStartLearningArtifactKind({ workspaceView: "notebook", intakeMode: "placement" }), "notebook");
  assert.equal(getStartLearningArtifactKind({ workspaceView: "career", intakeMode: "notebook" }), "placement");
  assert.equal(getStartLearningArtifactKind({ workspaceView: "medical", intakeMode: "notebook" }), "medical");
});

test("shows the Start Learning hero only on home and preparation input views", () => {
  assert.equal(shouldShowStartLearningHero({ workspaceView: "intake", intakeMode: null }), true);
  assert.equal(shouldShowStartLearningHero({ workspaceView: "intake", intakeMode: "notebook" }), true);
  assert.equal(shouldShowStartLearningHero({ workspaceView: "intake", intakeMode: "placement" }), true);
  assert.equal(shouldShowStartLearningHero({ workspaceView: "notebook", intakeMode: "notebook" }), false);
  assert.equal(shouldShowStartLearningHero({ workspaceView: "career", intakeMode: "placement" }), false);
  assert.equal(shouldShowStartLearningHero({ workspaceView: "medical", intakeMode: "medical" }), false);
});

test("only identifies the Medical training deep link for targeted route clearing", () => {
  assert.equal(isMedicalTrainingHash("#medical-training"), true);
  assert.equal(isMedicalTrainingHash(" #MEDICAL-TRAINING "), true);
  assert.equal(isMedicalTrainingHash("#placement-prep"), false);
  assert.equal(isMedicalTrainingHash("#subject-mastery"), false);
});

test("only identifies the placement deep link for targeted route clearing", () => {
  assert.equal(isPlacementPrepHash("#placement-prep"), true);
  assert.equal(isPlacementPrepHash(" #PLACEMENT-PREP "), true);
  assert.equal(isPlacementPrepHash("#subject-mastery"), false);
  assert.equal(isPlacementPrepHash(""), false);
});
