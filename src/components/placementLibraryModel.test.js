import test from "node:test";
import assert from "node:assert/strict";
import {
  placementLibraryKey,
  placementLibraryShortcut,
  placementLibrarySource,
  placementLibraryTopics,
  visiblePlacementLibraryEntries,
} from "./placementLibraryModel.js";

const preparations = [
  { id: "java", title: "Software engineer", generatedAt: "2026-10-03", analysis: { topics: [{ title: "Euclidean GCD" }, { title: "Arrays" }] }, preparationSource: { type: "custom" } },
  { id: "design", title: "UI designer", generatedAt: "2026-10-01", pinned: true, analysis: { topics: [{ title: "Design systems" }] }, preparationSource: { type: "notebook", label: "Interaction design" } },
  { id: "sql", title: "Database engineer", generatedAt: "2026-10-05", topics: ["SQL joins"], preparationSource: { type: "custom" } },
];

test("preparations search their role, exact requested topics, and notebook source", () => {
  assert.deepEqual(visiblePlacementLibraryEntries(preparations, { search: "  euCLIDean  " }).map((entry) => entry.key), ["java"]);
  assert.deepEqual(visiblePlacementLibraryEntries(preparations, { search: "database" }).map((entry) => entry.key), ["sql"]);
  assert.deepEqual(visiblePlacementLibraryEntries(preparations, { search: "interaction design" }).map((entry) => entry.key), ["design"]);
  assert.equal(visiblePlacementLibraryEntries(preparations, { search: "not found" }).length, 0);
});

test("source and pin filters combine with search and chronological sort", () => {
  assert.deepEqual(visiblePlacementLibraryEntries(preparations).map((entry) => entry.key), ["sql", "java", "design"]);
  assert.deepEqual(visiblePlacementLibraryEntries(preparations, { sort: "oldest" }).map((entry) => entry.key), ["design", "java", "sql"]);
  assert.deepEqual(visiblePlacementLibraryEntries(preparations, { filter: "pinned" }).map((entry) => entry.key), ["design"]);
  assert.deepEqual(visiblePlacementLibraryEntries(preparations, { filter: "notebook" }).map((entry) => entry.key), ["design"]);
  assert.deepEqual(visiblePlacementLibraryEntries(preparations, { filter: "typed", search: "arrays" }).map((entry) => entry.key), ["java"]);
});

test("history identity stays distinct across source notebooks and incomplete records are safe", () => {
  assert.notEqual(placementLibraryKey({ notebookId: "a", historyId: "same" }), placementLibraryKey({ notebookId: "b", historyId: "same" }));
  assert.deepEqual(placementLibraryTopics({ topics: ["GCD", { name: "Loops" }, {}, null] }), ["GCD", "Loops"]);
  assert.deepEqual(placementLibrarySource({ preparationSource: { type: "notebook" }, notebook: { title: "Computer science" } }), { type: "notebook", label: "Computer science" });
  assert.deepEqual(placementLibrarySource({ sourceLabel: "Old private custom context" }), { type: "typed", label: "" });
  assert.deepEqual(visiblePlacementLibraryEntries(null), []);
  const valid = visiblePlacementLibraryEntries([null, undefined, { title: "A" }, { title: "B", generatedAt: "invalid" }]);
  assert.deepEqual(valid.map((entry) => entry.title), ["A", "B"]);
});

test("N remains available in an empty library; search and filter require preparations", () => {
  assert.equal(placementLibraryShortcut({ key: "n" }), "new");
  assert.equal(placementLibraryShortcut({ key: "/" }), "");
  assert.equal(placementLibraryShortcut({ key: "f" }), "");
  assert.equal(placementLibraryShortcut({ key: "/" }, { hasPreparations: true }), "search");
  assert.equal(placementLibraryShortcut({ key: "F" }, { hasPreparations: true }), "filter");
});

test("library shortcuts never consume editing, modified, repeating, disabled or modal keyboard events", () => {
  for (const flag of ["defaultPrevented", "repeat", "isComposing", "ctrlKey", "metaKey", "altKey", "shiftKey"]) {
    assert.equal(placementLibraryShortcut({ key: "n", [flag]: true }), "", flag);
  }
  assert.equal(placementLibraryShortcut({ key: "n", target: { closest: () => ({}) } }), "");
  assert.equal(placementLibraryShortcut({ key: "n" }, { enabled: false }), "");
  assert.equal(placementLibraryShortcut({ key: "n" }, { modalOpen: true }), "");
});
