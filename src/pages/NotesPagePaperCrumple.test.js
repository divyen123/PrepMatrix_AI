import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./NotesPage.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./NotesPage.css", import.meta.url), "utf8");

test("keeps the full note view free of the Study note badge and status/planner cards", () => {
  const start = source.indexOf('className="note-details-overlay"');
  const end = source.indexOf("</PaperCrumple>", start);
  assert.ok(start >= 0 && end > start, "the full-view modal should contain PaperCrumple");
  const fullView = source.slice(start, end);

  assert.match(fullView, /<PaperCrumple\b[^>]*disabled=\{isNoteDialogEditing \|\| noteDialogDeletePending\}[^>]*onDismiss=\{closeNoteDetails\}/u);
  assert.doesNotMatch(fullView, /note-details-meta|Editing study note|>Study note</u);
  assert.match(fullView, /aria-label="Close note details"[\s\S]*?onClick=\{closeNoteDetails\}/u);
});

test("hides only the full-view dialog scrollbar while retaining scrollability", () => {
  assert.match(styles, /\.note-details-dialog\s*\{[^}]*overflow-y:\s*auto;/u);
  assert.match(styles, /\.note-details-dialog\.paper-crumple-note\s*\{[^}]*scrollbar-width:\s*none;[^}]*-ms-overflow-style:\s*none;/u);
  assert.match(styles, /\.note-details-dialog\.paper-crumple-note::-webkit-scrollbar\s*\{[^}]*display:\s*none;/u);
});
