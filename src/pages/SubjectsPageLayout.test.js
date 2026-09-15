import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./SubjectsPage.jsx", import.meta.url), "utf8");
const stylesheet = readFileSync(new URL("./SubjectsPage.css", import.meta.url), "utf8");
const snapshotDialogSource = readFileSync(
  new URL("../components/SubjectSnapshotDialog.jsx", import.meta.url),
  "utf8",
);

test("places the add form and subject snapshot side by side only after subjects exist", () => {
  assert.match(
    pageSource,
    /subjects-page-grid\$\{hasSubjects \? " has-subjects" : " is-empty"\}/u,
  );
  assert.match(
    pageSource,
    /<section className="class-profile-card">[\s\S]*?<div className="subject-page-anchor subjects-add-subject"[\s\S]*?\{hasSubjects && \([\s\S]*?subjects-side-panel[\s\S]*?\{hasSubjects && \([\s\S]*?subjects-library/u,
  );
  assert.match(
    stylesheet,
    /\.subjects-page \.subjects-page-grid\.has-subjects\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/u,
  );
  assert.match(
    stylesheet,
    /\.subjects-page \.subjects-page-grid > \.class-profile-card,[\s\S]*?\.subjects-page \.subjects-page-grid > \.subjects-library\s*\{[\s\S]*?grid-column:\s*1 \/ -1/u,
  );
  assert.match(
    stylesheet,
    /\.subjects-page \.subjects-page-grid\.has-subjects \.subjects-add-subject\s*\{[\s\S]*?max-width:\s*none;[\s\S]*?margin:\s*0;/u,
  );
  assert.match(
    stylesheet,
    /\.subjects-page \.subjects-page-grid\.is-empty\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/u,
  );
  assert.match(
    stylesheet,
    /@media \(max-width: 1180px\)[\s\S]*?\.subjects-page \.subjects-page-grid\.has-subjects\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/u,
  );
});

test("uses the concise Hard subjects label in the snapshot and its dialog", () => {
  assert.match(pageSource, /desktopLabel: "Hard subjects"/u);
  assert.doesNotMatch(pageSource, /Hard-priority subjects/u);
  assert.match(snapshotDialogSource, /metricLabel: "hard subjects"/u);
  assert.match(snapshotDialogSource, /title: "Hard subjects"/u);
  assert.match(snapshotDialogSource, /"No hard subjects"/u);
  assert.doesNotMatch(snapshotDialogSource, /hard-priority subjects/u);
});
