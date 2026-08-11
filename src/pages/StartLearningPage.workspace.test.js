import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./StartLearningPage.jsx", import.meta.url), "utf8");
const stylesheet = readFileSync(new URL("./StartLearningPage.css", import.meta.url), "utf8");

test("keeps notebook and placement preparation in separate workspace views", () => {
  assert.ok(pageSource.includes('className="learning-intake-choice-card is-notebook"'));
  assert.ok(pageSource.includes('className="learning-intake-choice-card is-placement"'));
  assert.ok(pageSource.includes('intakeMode === "notebook" ? ('));
  assert.ok(pageSource.includes(') : intakeMode === "placement" ? ('));
  assert.ok(pageSource.includes('activeArtifactKind === "notebook" && ('));
  assert.ok(pageSource.includes('activeArtifactKind === "placement" && ('));
  assert.ok(pageSource.includes("Saved notebooks"));
  assert.ok(pageSource.includes("Saved placement notes"));
  assert.ok(pageSource.includes("savedPlacementNotes.map((note)"));
  assert.ok(
    pageSource.includes("onClick={() => openSavedPlacementNote(note)}"),
    "saved placement cards should open the Placement workspace directly",
  );

  [
    "learning-intake-tabs",
    "learning-subpage-tabs",
    "Open placement and internship preparation",
    "Placement prep saved",
    "Save with notebook",
    "Saved in notebook",
    'className="card learning-career-panel"',
  ].forEach((legacyText) => {
    assert.equal(pageSource.includes(legacyText), false, `unexpected legacy UI: ${legacyText}`);
  });
});

test("keeps saved placement rows non-destructive and legacy guides visible", () => {
  const placementListStart = pageSource.indexOf("savedPlacementNotes.map((note)");
  const placementListEnd = pageSource.indexOf("</section>", placementListStart);
  const placementListSource = pageSource.slice(placementListStart, placementListEnd);

  assert.ok(placementListStart >= 0, "expected a saved placement-note list");
  assert.equal(placementListSource.includes("deleteNotebook"), false);
  assert.equal(placementListSource.includes("Trash2"), false);
  assert.equal(placementListSource.includes("learning-notebook-delete"), false);
  assert.ok(
    pageSource.includes(
      "getSavedPlacementNotes(activeNotebook ? [activeNotebook] : []).length > 0",
    ),
  );
});

test("styles the workspace chooser and saved-work selectors responsively", () => {
  assert.ok(stylesheet.includes(".learning-intake-choice-grid {"));
  assert.ok(stylesheet.includes("grid-template-columns: repeat(2, minmax(0, 1fr));"));
  assert.ok(stylesheet.includes(".learning-saved-kind-grid {"));
  assert.ok(stylesheet.includes(".learning-notebook-row.is-placement {"));

  const mobileStyles = stylesheet.slice(stylesheet.indexOf("@media (max-width: 700px)"));
  assert.ok(mobileStyles.includes(".learning-intake-choice-grid {"));
  assert.ok(mobileStyles.includes("grid-template-columns: 1fr;"));
});
