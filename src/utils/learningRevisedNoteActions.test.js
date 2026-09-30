import assert from "node:assert/strict";
import test from "node:test";
import { buildRevisedNoteActionNode } from "./learningRevisedNoteActions.js";
import { normalizeLearningNotebook } from "./learningNotebook.js";

test("revised note actions keep a stable planner target and completion after normalization", () => {
  const notebook = normalizeLearningNotebook({
    id: "notebook-1",
    subjectName: "Operating systems",
    revisedNotes: [{
      id: "paging-note",
      title: "Paging",
      content: "Pages map virtual memory to frames.",
      completed: true,
      keyPoints: ["Page tables hold mappings."],
    }],
  });

  const section = notebook.revisedNotes[0];
  const node = buildRevisedNoteActionNode(section, notebook);
  assert.equal(section.completed, true);
  assert.equal(node.id, "revised-note:paging-note");
  assert.equal(node.title, "Revise: Paging");
  assert.equal(node.chapterName, "Revised notes");
  assert.equal(node.explanation, section.content);
  assert.deepEqual(node.keyPoints, section.keyPoints);
});
