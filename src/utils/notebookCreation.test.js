import assert from "node:assert/strict";
import test from "node:test";
import {
  buildNotebookFocus,
  getNotebookScopeSuggestion,
  notebookRequirementsKey,
  parseNotebookScope,
} from "./notebookCreation.js";

test("prefills real saved topics from both the subject and nested chapters", () => {
  const subjects = [{
    name: "Physics",
    topics: [{ title: "Coulomb’s law" }, "Electric potential"],
    chapters: [
      { title: "Electrostatics", topics: ["Coulomb’s law", { name: "Force direction" }] },
      { name: "Circuits", topics: [{ label: "Kirchhoff’s laws" }] },
    ],
  }];
  const snapshot = structuredClone(subjects);
  assert.equal(
    getNotebookScopeSuggestion(subjects, " physics "),
    "Coulomb’s law\nElectric potential\nForce direction\nKirchhoff’s laws",
  );
  assert.deepEqual(subjects, snapshot, "building the suggestion must not change the saved subject");
});

test("uses actual saved chapter names when a subject has no topics", () => {
  assert.equal(getNotebookScopeSuggestion([{
    name: "Biology",
    chapters: 3,
    chapterNames: [" Cell structure ", "", "Genetics & inheritance"],
  }], "Biology"), "Cell structure\nGenetics & inheritance");
  assert.equal(getNotebookScopeSuggestion([{
    title: "Mathematics",
    chapters: [{ title: "Linear equations" }, { name: "Quadratic equations" }],
  }], "Mathematics"), "Linear equations\nQuadratic equations");
});

test("topic-only subjects prefill their topics without inventing chapters", () => {
  assert.equal(getNotebookScopeSuggestion([{
    subjectName: "Computer Networks",
    topics: [" TCP ", { title: "Routing" }, "tcp", { name: "DNS" }],
  }], "Computer Networks"), "TCP\nRouting\nDNS");
});

test("numeric chapter counts and empty curricula leave the scope empty", () => {
  const subjects = [
    { name: "History", chapters: 5 },
    { name: "Chemistry", chapterNames: ["", " "], topics: [] },
    "Geography",
  ];
  for (const name of ["History", "Chemistry", "Geography", "Missing subject", ""]) {
    assert.equal(getNotebookScopeSuggestion(subjects, name), "", name);
  }
  assert.equal(getNotebookScopeSuggestion(null, "Physics"), "");
});

test("prefill keeps the chosen subject's scope separate from other saved subjects", () => {
  const subjects = [
    { name: "Physics", chapters: 2, chapterNames: ["Electrostatics", "Optics"], topics: ["Coulomb’s law"] },
    { name: "Chemistry", topics: ["Chemical bonds", "Stoichiometry"] },
  ];
  assert.equal(getNotebookScopeSuggestion(subjects, "Physics"), "Coulomb’s law");
  assert.equal(getNotebookScopeSuggestion(subjects, "Chemistry"), "Chemical bonds\nStoichiometry");
});

test("typed scope accepts line, comma and semicolon separators while preserving actual titles", () => {
  assert.deepEqual(parseNotebookScope("  Coulomb’s law ; Electric potential\nRésistance électrique, Kirchhoff’s laws; \n"), [
    "Coulomb’s law",
    "Electric potential",
    "Résistance électrique",
    "Kirchhoff’s laws",
  ]);
  assert.deepEqual(parseNotebookScope(" ; , \n "), []);
  assert.deepEqual(parseNotebookScope(undefined), []);
});

test("typed scope deduplicates case and equivalent Unicode spelling, retaining the first title", () => {
  assert.deepEqual(parseNotebookScope("TCP\ntcp\nＴＣＰ\nCafé\nCafe\u0301\nCAFÉ\nDNS"), ["TCP", "Café", "DNS"]);
});

test("the AI focus contains only the requested subject and entered scope with explanation guidance", () => {
  const selectedSubject = "Physics";
  const enteredTopics = parseNotebookScope("Coulomb’s law\nForce direction");
  const focus = buildNotebookFocus(selectedSubject, enteredTopics);
  assert.ok(focus.includes(JSON.stringify(selectedSubject)));
  assert.ok(focus.includes(JSON.stringify(enteredTopics)));
  for (const unrelated of ["Ray optics", "Electromagnetism", "Chemical bonds", "Stoichiometry"]) {
    assert.equal(focus.includes(unrelated), false, unrelated);
  }
  for (const guidance of ["academic level", "how and why", "real-world examples", "explained outcomes", "worked calculations", "key points", "avoid unrelated material"]) {
    assert.ok(focus.includes(guidance), guidance);
  }
  assert.deepEqual(enteredTopics, ["Coulomb’s law", "Force direction"]);
});

test("draft keys treat formatting differences as the same subject", () => {
  assert.equal(notebookRequirementsKey("  Computer   Networks \n"), "computer networks");
  assert.equal(notebookRequirementsKey("ＰＨＹＳＩＣＳ"), notebookRequirementsKey("Physics"));
  assert.equal(notebookRequirementsKey(undefined), "");
});
