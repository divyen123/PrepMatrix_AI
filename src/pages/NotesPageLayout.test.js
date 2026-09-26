import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./NotesPage.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./NotesPage.css", import.meta.url), "utf8");

test("keeps the Notes identity inside the stored-notes card", () => {
  assert.doesNotMatch(source, /<span className="section-tag">Notes<\/span>/u);
  assert.doesNotMatch(source, /<h2>Doubt board<\/h2>/u);
  assert.doesNotMatch(source, /<span className="section-tag">Stored notes<\/span>/u);
  assert.match(
    source,
    /className=\{`card notes-list-card[\s\S]*?<h3[^>]*>Saved notes<\/h3>/u,
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

test("filters notes by status or priority while treating legacy priorities as Medium", () => {
  assert.match(source, /<option value="Open">Open<\/option>[\s\S]*?<option value="Resolved">Resolved<\/option>[\s\S]*?<option value="High">High priority<\/option>[\s\S]*?<option value="Medium">Medium priority<\/option>[\s\S]*?<option value="Low">Low priority<\/option>/u);
  assert.match(source, /const isPriorityFilter = \["Low", "Medium", "High"\]\.includes\(filter\)/u);
  assert.match(source, /isPriorityFilter[\s\S]*?\["Low", "Medium", "High"\]\.includes\(note\.priority\) \? note\.priority : "Medium"\) === filter[\s\S]*?: getNoteWorkflowStatus\(note, plannerStates\.get\(note\.id\)\) === filter/u);
  assert.match(source, /return statusFiltered[\s\S]*?rank: rankSearchMatch\([\s\S]*?\["Low", "Medium", "High"\]\.includes\(note\.priority\) \? note\.priority : "Medium"/u);
  assert.match(source, /setNotesPage\(1\);\s*\}, \[filter, notesSearchQuery\]\);/u);
});

test("places the Notes header near its sticky position at first render", () => {
  assert.match(styles, /@media \(min-width: 992px\) \{[\s\S]*?\.app-container:has\(\.notes-page\) \.workspace-main\s*\{\s*padding-top: 66px !important;/u);
  assert.match(styles, /\.app-container\.has-sidebar:has\(\.notes-page\) \.app-main-content\.topbar-auto-hide-enabled:not\(\.topbar-visible\) > \.workspace-main\s*\{\s*padding-top: 12px !important;/u);
  assert.match(styles, /\.topbar-auto-hide-enabled:not\(\.topbar-visible\) \.notes-page \.notes-list-header\s*\{\s*top: 30px;/u);
});

test("uses the page scrollbar while the Saved notes controls stay visible", () => {
  assert.match(
    styles,
    /body \.notes-page \.card\.notes-list-card,[\s\S]*?background: transparent !important;[\s\S]*?border-color: transparent !important;[\s\S]*?box-shadow: none !important;/u,
  );
  assert.match(styles, /body \.notes-page \.card\.notes-list-card::before\s*\{\s*display: none !important;/u);
  assert.match(styles, /\.app-container:has\(\.notes-page\)\s*\{\s*overflow-x: clip;\s*overflow-y: visible;/u);
  assert.match(styles, /body \.notes-page \.card\.notes-list-card,[\s\S]*?overflow: visible !important;/u);
  assert.match(styles, /body \.notes-page \.notes-list-header\s*\{[\s\S]*?position: sticky;[\s\S]*?z-index: 20;/u);
  assert.match(styles, /body \.notes-page \.notes-list-grid\s*\{[\s\S]*?overflow: visible !important;[\s\S]*?max-height: none !important;/u);
  assert.match(source, /className="notes-list-header"[\s\S]*?className="stored-search-field notes-mobile-search"/u);
  assert.doesNotMatch(source, /onScroll=\{handleNotesScroll\}/u);
  assert.match(source, /new IntersectionObserver\([\s\S]*?rootMargin: "240px 0px"/u);
});

test("keeps the Notes search input transparent inside its outer search pill", () => {
  assert.match(
    styles,
    /body\.has-bg-image \.notes-page \.stored-search-field input\[type="search"\]:focus\s*\{[\s\S]*?background: transparent !important;[\s\S]*?box-shadow: none !important;/u,
  );
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
    /body\.dark \.note-details-dialog\s*\{\s*--note-details-solid-surface: var\(--bg, #0f151a\);\s*\}/u,
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

test("opened note surfaces follow the active palette or image background", () => {
  assert.match(source, /className="note-details-overlay note-opened-overlay"/u);
  assert.match(source, /className="note-details-dialog note-opened-dialog"/u);
  assert.match(styles, /\.note-details-overlay\.note-opened-overlay\s*\{[^}]*background: rgba\(0, 0, 0, 0\.38\);/u);
  assert.match(styles, /body\.has-bg-image \.note-details-overlay\.note-opened-overlay\s*\{[^}]*background: rgba\(0, 0, 0, 0\.58\);/u);
  assert.match(styles, /body\.dark \.note-details-dialog\.note-opened-dialog\s*\{[^}]*--note-details-solid-surface: var\(--bg, #ffffff\);/u);
  assert.match(styles, /body\.has-bg-image \.note-details-dialog\.note-opened-dialog\s*\{[^}]*--bg-surface-rgb[^}]*backdrop-filter: blur\(18px\);/u);
  assert.match(styles, /body\.has-bg-image\.no-glass-cards \.note-details-dialog\.note-opened-dialog\s*\{[^}]*--bg-surface-rgb[^}]*backdrop-filter: none;/u);
});
