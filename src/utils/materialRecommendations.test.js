import test from "node:test";
import assert from "node:assert/strict";
import { buildSubjectMaterials, getLevelProfile } from "./materialRecommendations.js";

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

test("uses playful early-years resources instead of college-depth fallbacks", () => {
  const lkgProfile = getLevelProfile("LKG");

  assert.equal(lkgProfile.label, "LKG play & learn");
  assert.equal(lkgProfile.queryPrefix, "lkg");
  assert.match(lkgProfile.guidance, /audio-led or picture-led/iu);

  const materials = buildSubjectMaterials({ chapters: 1, name: "Counting" }, { done: 0 }, "Kindergarten");
  const decodedLinks = materials.lanes.map((lane) => decodeURIComponent(lane.href));

  assert.match(materials.trackLabel, /Kindergarten play & learn/iu);
  assert.doesNotMatch(materials.trackLabel, /college|depth/iu);
  assert.ok(decodedLinks.every((href) => /kindergarten/iu.test(href)));
  assert.ok(decodedLinks.some((href) => /matching counting learning game/iu.test(href)));
});
