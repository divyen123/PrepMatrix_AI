import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { notebookLibraryCompletion, notebookLibraryShortcut, visibleNotebookLibraryEntries } from "./notebookLibraryModel.js";

const notebooks = [
  { id: "physics", title: "Electrostatic force", subjectName: "Physics", createdAt: "2026-10-01", chapters: [{ title: "Coulomb's law", topics: [{ title: "Force direction" }, { title: "Magnitude" }] }] },
  { id: "math", title: "Algebra essentials", subjectName: "Mathematics", createdAt: "2026-10-03", chapters: [] },
  { id: "chemistry", title: "Chemical bonds", subjectName: "Chemistry", createdAt: "2026-10-02", chapters: [] },
];
const completionForNotebook = (notebook) => ({ percent: { physics: 50, math: 100, chemistry: 0 }[notebook.id], completedTopics: notebook.id === "physics" ? 1 : 0, totalTopics: notebook.id === "physics" ? 2 : 0 });

test("searches notebook titles, subjects and topic names without changing saved notebooks", () => {
  assert.deepEqual(visibleNotebookLibraryEntries(notebooks, { search: "force direction", completionForNotebook }).map(({ notebook }) => notebook.id), ["physics"]);
  assert.deepEqual(visibleNotebookLibraryEntries(notebooks, { search: " Mathematics ", completionForNotebook }).map(({ notebook }) => notebook.id), ["math"]);
  assert.deepEqual(notebooks.map((notebook) => notebook.id), ["physics", "math", "chemistry"]);
});

test("filters completed, in-progress and untouched notebooks and sorts by completion", () => {
  for (const [state, expected] of [["completed", "math"], ["in-progress", "physics"], ["not-started", "chemistry"]]) {
    assert.deepEqual(visibleNotebookLibraryEntries(notebooks, { state, completionForNotebook }).map(({ notebook }) => notebook.id), [expected]);
  }
  assert.deepEqual(visibleNotebookLibraryEntries(notebooks, { sort: "completion-high", completionForNotebook }).map(({ notebook }) => notebook.id), ["math", "physics", "chemistry"]);
  assert.deepEqual(visibleNotebookLibraryEntries(notebooks, { sort: "completion-low", completionForNotebook }).map(({ notebook }) => notebook.id), ["chemistry", "physics", "math"]);
  assert.deepEqual(visibleNotebookLibraryEntries(notebooks).map(({ notebook }) => notebook.id), ["math", "chemistry", "physics"]);
});

test("completion percentages stay finite and within bounds", () => {
  assert.equal(notebookLibraryCompletion(notebooks[0], () => ({ percent: NaN })).percent, 0);
  assert.equal(notebookLibraryCompletion(notebooks[0], () => 140).percent, 100);
  assert.equal(notebookLibraryCompletion(notebooks[0], () => -4).percent, 0);
  assert.deepEqual(notebookLibraryCompletion(notebooks[0], () => ({ completedTopics: 1, totalTopics: 2 })), { percent: 50, completedTopics: 1, totalTopics: 2, state: "in-progress" });
});

test("keyboard shortcuts respect editors, modifiers, dialogs, busy state and empty history", () => {
  assert.equal(notebookLibraryShortcut({ key: "n" }), "new");
  assert.equal(notebookLibraryShortcut({ key: "/" }, { hasNotebooks: true }), "search");
  assert.equal(notebookLibraryShortcut({ key: "/" }), "");
  for (const key of ["ctrlKey", "metaKey", "shiftKey", "altKey", "repeat", "isComposing", "defaultPrevented"]) {
    assert.equal(notebookLibraryShortcut({ key: "n", [key]: true }), "");
  }
  assert.equal(notebookLibraryShortcut({ key: "n", target: { closest: () => ({}) } }), "");
  assert.equal(notebookLibraryShortcut({ key: "n" }, { modalOpen: true }), "");
  assert.equal(notebookLibraryShortcut({ key: "n" }, { enabled: false }), "");
});

test("renders transparent empty state and only shows library tools once notebooks exist", async () => {
  const vite = await createServer({ appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
  try {
    const { default: NotebookLibrary } = await vite.ssrLoadModule("/src/components/NotebookLibrary.jsx");
    const empty = renderToStaticMarkup(React.createElement(NotebookLibrary, { onDeleteAll: () => {} }));
    assert.match(empty, /No generated notebooks exist\./u);
    assert.match(empty, /New notebook/u);
    assert.doesNotMatch(empty, /Search notebooks|Sort and filter notebooks|Delete all notebooks/u);
    const populated = renderToStaticMarkup(React.createElement(NotebookLibrary, { notebooks, completionForNotebook, onDeleteAll: () => {}, onDelete: () => {} }));
    assert.match(populated, /Search notebooks/u);
    assert.match(populated, /Sort and filter notebooks by completion/u);
    assert.match(populated, /Delete all notebooks/u);
    assert.match(populated, /Open Electrostatic force, 50% completed/u);
    assert.match(populated, /1 of 2 topics completed/u);
    assert.match(populated, /is-completed/u);
    assert.match(populated, /Delete Algebra essentials/u);
  } finally {
    await vite.close();
  }
});
