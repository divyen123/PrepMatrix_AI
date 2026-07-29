import test from "node:test";
import assert from "node:assert/strict";
import { buildSubjectMaterials } from "./materialRecommendations.js";

const subject = {
  chapters: 2,
  name: "Data Analytics",
};

test("shows the next chapter while no chapters are complete", () => {
  const materials = buildSubjectMaterials(subject, { done: 0, pending: 2, total: 2 });

  assert.deepEqual(
    materials.chapterPath.map((chapter) => chapter.status),
    ["Start now", "Upcoming"],
  );
});

test("advances the next chapter after partial completion", () => {
  const materials = buildSubjectMaterials(subject, { done: 1, pending: 1, total: 2 });

  assert.deepEqual(
    materials.chapterPath.map((chapter) => chapter.status),
    ["Completed", "Start now"],
  );
});

test("marks the final chapter completed when the subject is fully complete", () => {
  const materials = buildSubjectMaterials(subject, { done: 2, pending: 0, total: 2 });

  assert.deepEqual(
    materials.chapterPath.map((chapter) => chapter.status),
    ["Completed", "Completed"],
  );
  assert.match(materials.spotlight, /All 2 chapters are complete/);
  assert.doesNotMatch(materials.spotlight, /Move into Chapter/);
  assert.equal(materials.completionLabel, "2/2 Completed");
});
