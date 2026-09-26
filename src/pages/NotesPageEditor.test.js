import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("./NotesPage.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./NotesPage.css", import.meta.url), "utf8");
const toolbar = readFileSync(new URL("../components/NoteFormattingToolbar.jsx", import.meta.url), "utf8");
const tooltipStyles = readFileSync(new URL("../components/WarmTooltip.css", import.meta.url), "utf8");

test("Add Note keeps only its title and a compact priority, formatting, Save row", () => {
  const capture = page.slice(page.indexOf("{isCaptureOpen && createPortal("));
  assert.doesNotMatch(capture, /<span className="section-tag">Capture<\/span>/u);
  assert.doesNotMatch(capture, /Save doubts, questions, and revision reminders before they disappear/u);
  assert.match(capture, /<NoteRichTextEditor[\s\S]*?<NoteFormattingToolbar editorRef=\{noteCaptureDetailsRef\} \/>/u);
  assert.match(capture, /className="primary-btn notes-capture-save" type="submit">Save<\/button>/u);
  assert.match(styles, /\.notes-modal-card \.notes-form-row\s*\{\s*grid-template-columns: minmax\(104px, 124px\) minmax\(0, 1fr\) 70px;/u);
  assert.match(tooltipStyles, /\.warm-tooltip\s*\{[\s\S]*?z-index: 13000;/u);
});

test("note formatting offers only bold, italic, underline, and secure links", () => {
  assert.match(toolbar, /command: "bold"/u);
  assert.match(toolbar, /command: "italic"/u);
  assert.match(toolbar, /command: "underline"/u);
  assert.match(toolbar, /content="Add link"/u);
  assert.match(toolbar, /sanitizeNoteLink\(linkUrl\)/u);
  assert.match(page, /detailsRich: trimNoteRichText\(detailsRich\)/u);
  assert.match(page, /<NoteFormattedText[\s\S]*?richText=\{selectedNote\.detailsRich\}/u);
});
