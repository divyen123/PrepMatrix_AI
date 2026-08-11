import assert from "node:assert/strict";
import test from "node:test";
import {
  getSavedPlacementNotes,
  getStartLearningArtifactKind,
  isPlacementPrepHash,
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
  assert.equal(notes[0].id, "notebook-2:placement");
  assert.equal(notes[0].notebookId, "notebook-2");
  assert.equal(notes[0].title, "Backend intern");
  assert.equal(notes[0].topicCount, 2);
  assert.equal(notes[0].notebook, notebooks[1]);
});

test("resolves the visible artifact kind from intake and workspace state", () => {
  assert.equal(getStartLearningArtifactKind({ workspaceView: "intake", intakeMode: null }), null);
  assert.equal(getStartLearningArtifactKind({ workspaceView: "intake", intakeMode: "notebook" }), "notebook");
  assert.equal(getStartLearningArtifactKind({ workspaceView: "intake", intakeMode: "placement" }), "placement");
  assert.equal(getStartLearningArtifactKind({ workspaceView: "notebook", intakeMode: "placement" }), "notebook");
  assert.equal(getStartLearningArtifactKind({ workspaceView: "career", intakeMode: "notebook" }), "placement");
});

test("only identifies the placement deep link for targeted route clearing", () => {
  assert.equal(isPlacementPrepHash("#placement-prep"), true);
  assert.equal(isPlacementPrepHash(" #PLACEMENT-PREP "), true);
  assert.equal(isPlacementPrepHash("#subject-mastery"), false);
  assert.equal(isPlacementPrepHash(""), false);
});
