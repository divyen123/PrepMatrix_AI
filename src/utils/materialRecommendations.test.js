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
  assert.ok(decodedLinks.some((href) => /Counting learning game/iu.test(href)));
});

test("all material providers use compact field, branch and subject queries with one resource intent", () => {
  const profile = {
    academicLevel: "Undergraduate / Bachelor's",
    academicTrack: "Engineering & Technology",
    degree: "B.Tech",
    department: "Information Technology",
    institutionName: "Private University",
  };
  const materials = buildSubjectMaterials({ chapters: 4, name: "RestAPI" }, { done: 4 },
    profile.academicLevel, profile.academicTrack, profile);
  const queries = materials.lanes.map((lane) => {
    const url = new URL(lane.href);
    return url.searchParams.get(lane.provider === "YouTube" ? "search_query" : "q");
  });
  const context = "Engineering & Technology Information Technology RestAPI";
  assert.deepEqual(queries, [
    `${context} university tutorial`, `${context} materials pdf`,
    `${context} practice questions`, `${context} revision notes`,
  ]);
  assert.ok(queries.every((query) => !/undergraduate|bachelor|B\.Tech|chapter 4|technical|standards|Private University/iu.test(query)));
  assert.equal(new URL(materials.lanes[0].href).hostname, "www.youtube.com");
  assert.ok(materials.lanes.slice(1).every((lane) => new URL(lane.href).hostname === "www.google.com"));
  assert.equal(materials.completionLabel, "4/4 Completed");
  assert.ok(materials.chapterPath.every((chapter) => chapter.status === "Completed"));
});

test("generic profiles omit empty placeholders and duplicate context without damaging subject punctuation", () => {
  const generic = buildSubjectMaterials({ name: "C++ & REST APIs", chapters: 1 });
  assert.equal(new URL(generic.lanes[1].href).searchParams.get("q"), "C++ & REST APIs materials pdf");
  const sameField = buildSubjectMaterials({ name: "Nursing", chapters: 1 }, {}, "College", "General", {
    academicTrack: "Nursing", department: "NURSING", degree: "B.Sc Nursing",
  });
  assert.equal(new URL(sameField.lanes[1].href).searchParams.get("q"), "Nursing materials pdf");
});

test("school searches retain class, board and stream while using concise resource phrases", () => {
  const profile = { academicLevel: "Senior / Higher Secondary School", grade: "Class 12", academicTrack: "CBSE", schoolStream: "Commerce" };
  const materials = buildSubjectMaterials({ name: "Accountancy", chapters: 5 }, { done: 2 }, profile.academicLevel, profile.academicTrack, profile);
  assert.equal(new URL(materials.lanes[1].href).searchParams.get("q"), "Class 12 CBSE Commerce Accountancy materials pdf");
  assert.ok(materials.lanes.every((lane) => !decodeURIComponent(lane.href).includes("chapter 3")));
  assert.match(materials.spotlight, /Move into Chapter 3/u);
});
