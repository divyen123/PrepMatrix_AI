import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./ResourcesHub.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../App.css", import.meta.url), "utf8");

test("opens one subject materials view and keeps direct subject links coherent", () => {
  assert.match(source, /const targetSubject = searchParams\.get\("subject"\)/u);
  assert.match(source, /resolveMaterialGuideSubjects\(subjects, targetSubject\)/u);
  assert.match(source, /const activeResource = guide\.focusedSubject[\s\S]*?materials\.find/u);
  assert.match(source, /nextSearchParams\.set\("subject", subject\)[\s\S]*?setSearchParams\(nextSearchParams\)/u);
  assert.match(source, /activeResource \? \([\s\S]*?className="resource-detail-view"/u);
  assert.match(source, /activeResource\.lanes\.map/u);
  assert.doesNotMatch(source, /materials\.map\(\(resource\) => \([\s\S]*?className="card resource-card"/u);
});

test("returns from subject materials to the card overview with an accessible compact control", () => {
  assert.match(source, /nextSearchParams\.delete\("subject"\)/u);
  assert.match(source, /aria-label="Back to subjects"[\s\S]*?className="resource-detail-back"[\s\S]*?onClick=\{returnToSubjects\}/u);
  assert.match(source, /pendingViewFocusRef\.current = "overview"/u);
  assert.match(source, /subjectOverviewHeadingRef\.current/u);
  assert.match(styles, /body \.resource-detail-back\s*\{[\s\S]*?width: 38px;[\s\S]*?height: 38px/u);
});

test("uses interactive staggered subject cards with distinct theme-safe tones", () => {
  assert.match(source, /const SUBJECT_CARD_TONES = \["teal", "indigo", "amber", "violet", "rose"\]/u);
  assert.match(source, /className="resource-subject-grid"[\s\S]*?materials\.map\(\(resource, index\)/u);
  assert.match(source, /aria-label=\{`Open \$\{resource\.subject\} materials`\}/u);
  assert.match(source, /--resource-card-delay/u);
  assert.match(styles, /\.resource-subject-card\.tone-teal[\s\S]*?\.resource-subject-card\.tone-indigo[\s\S]*?\.resource-subject-card\.tone-amber[\s\S]*?\.resource-subject-card\.tone-violet[\s\S]*?\.resource-subject-card\.tone-rose/u);
  assert.match(styles, /body\.has-bg-image \.resource-subject-card/u);
  assert.match(styles, /animation-delay: var\(--resource-card-delay, 0ms\)/u);
  assert.match(styles, /body \.resource-subject-card:hover\s*\{[\s\S]*?transform: translateY\(-5px\)/u);
});

test("keeps bookmark and save behavior while separating overview from subject detail", () => {
  assert.match(source, /!activeResource && safeMaterialBookmarks\.length > 0/u);
  assert.match(source, /onSaveBookmark\?\.\(\{[\s\S]*?subject: activeResource\.subject/u);
  assert.match(source, /\{saved \? "Saved" : "Save"\}/u);
  assert.match(source, /activeResource\.chapterPath\.map/u);
});

test("subject navigation is responsive and respects reduced motion", () => {
  assert.match(styles, /@media \(max-width: 620px\)\s*\{[\s\S]*?\.resource-subject-grid\s*\{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/u);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\.resource-subject-overview,[\s\S]*?\.resource-detail-view,[\s\S]*?body \.resource-subject-card[\s\S]*?animation: none;[\s\S]*?opacity: 1/u);
  assert.match(styles, /body \.resource-subject-card:hover,[\s\S]*?body \.resource-detail-back:hover[\s\S]*?transform: none/u);
});
