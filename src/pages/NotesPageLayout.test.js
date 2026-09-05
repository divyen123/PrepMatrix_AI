import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./NotesPage.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./NotesPage.css", import.meta.url), "utf8");

test("keeps the Notes identity inside the stored-notes card", () => {
  assert.doesNotMatch(source, /<span className="section-tag">Notes<\/span>/u);
  assert.doesNotMatch(source, /<h2>Doubt board<\/h2>/u);
  assert.match(
    source,
    /className=\{`card notes-list-card[\s\S]*?<span className="section-tag">Stored notes<\/span>[\s\S]*?<h3[^>]*>Your doubt queue<\/h3>/u,
  );
});

test("groups compact note count, add, and clear actions in the stored-notes header", () => {
  assert.match(
    source,
    /className="notes-list-utilities"[\s\S]*?className="notes-status-button"[\s\S]*?className="primary-btn notes-add-btn"[\s\S]*?className="notes-clear-all-btn"/u,
  );
  assert.match(source, /onClick=\{\(\) => setIsStatusOpen\(true\)\}/u);
  assert.match(source, /onClick=\{\(\) => setIsCaptureOpen\(true\)\}/u);
  assert.match(styles, /body \.notes-page \.notes-add-btn\s*\{[\s\S]*?height: 34px !important;[\s\S]*?font-size: 0\.72rem !important/u);
  assert.match(styles, /\.notes-list-utilities \.notes-status-button\s*\{[\s\S]*?width: 34px;[\s\S]*?height: 34px/u);
});

test("keeps the compact header controls together on responsive layouts", () => {
  assert.match(
    styles,
    /@media \(max-width: 991\.98px\)[\s\S]*?\.notes-list-utilities \.notes-clear-all-btn,[\s\S]*?position: static !important/u,
  );
  assert.match(styles, /@media \(max-width: 520px\)[\s\S]*?\.notes-list-utilities\s*\{[\s\S]*?width: 100%/u);
});

test("keeps opened note details fully opaque while the page backdrop stays dimmed and blurred", () => {
  assert.match(source, /import \{ acquireDocumentScrollLock \} from "\.\.\/utils\/documentScrollLock"/u);
  assert.match(source, /const releaseScrollLock = acquireDocumentScrollLock\(\);[\s\S]*?releaseScrollLock\(\);/u);
  assert.doesNotMatch(source, /document\.body\.style\.overflow/u);
  assert.match(
    styles,
    /\.note-details-overlay\s*\{[\s\S]*?background: rgba\(3, 7, 14, 0\.68\);[\s\S]*?backdrop-filter: blur\(10px\) brightness\(0\.72\) saturate\(0\.72\);/u,
  );
  assert.match(
    styles,
    /\.note-details-dialog\s*\{[\s\S]*?--note-details-solid-surface: #ffffff;[\s\S]*?background: var\(--note-details-solid-surface\);[\s\S]*?backdrop-filter: none;/u,
  );
  assert.match(
    styles,
    /body\.dark \.note-details-dialog\s*\{\s*--note-details-solid-surface: #121b2d;\s*\}/u,
  );
  assert.match(
    styles,
    /body\.has-bg-image \.note-details-dialog\s*\{[\s\S]*?--note-details-solid-surface: rgb\(var\(--bg-surface-rgb, 18, 27, 45\)\);[\s\S]*?background: var\(--note-details-solid-surface\);/u,
  );
  assert.match(
    styles,
    /body\.no-glass-cards \.note-details-dialog\s*\{[\s\S]*?background: var\(--note-details-solid-surface\);/u,
  );
});
