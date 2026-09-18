import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./SubjectPlanDialog.jsx", import.meta.url), "utf8");
const stylesheet = readFileSync(new URL("./SubjectPlanDialog.css", import.meta.url), "utf8");

function baseRule(selector) {
  const start = stylesheet.indexOf(`${selector} {`);
  assert.ok(start >= 0, `Expected ${selector} base rule`);
  const end = stylesheet.indexOf("}", start);
  assert.ok(end > start, `Expected ${selector} rule to close`);
  return stylesheet.slice(start, end + 1);
}

test("subject planning workspace keeps a compact content flow", () => {
  assert.doesNotMatch(
    source,
    /subject-plan-summary|subject-plan-analysis|subject-plan-side|getSubjectPlanAnalysis/u,
  );
  assert.doesNotMatch(source, /Optional\. Blank chapters stay as Chapter N\./u);
  assert.doesNotMatch(source, /Optional topics are added alongside every chapter\./u);
  assert.doesNotMatch(source, /\{namedChapters\.length\}\/\{chapterCount\}/u);
  assert.doesNotMatch(source, /Planner analysis|at target pace/u);

  assert.ok(source.includes('<div className="subject-unit-group subject-focus-group">'));
  assert.doesNotMatch(source, /Study rhythm|subject-rhythm-panel|subject-plan-fields/u);
  assert.doesNotMatch(source, /setPreferences|setDifficulty|studyPreferences|DEFAULT_STUDY_PREFERENCES/u);
  assert.match(
    source,
    /onSave\(\{\s*\.\.\.subject,\s*\.\.\.persistedConfiguration,\s*\}\)/u,
  );
});

test("subject planning layout has one compact scroll owner", () => {
  assert.doesNotMatch(stylesheet, /\.subject-plan-(?:summary|analysis|side)\b/u);

  const dialog = baseRule(".subject-plan-dialog");
  const body = baseRule(".subject-plan-body");
  const header = baseRule(".subject-plan-header");
  const footer = baseRule(".subject-plan-footer");
  const footerButtons = baseRule("body .subject-plan-footer-actions button");
  const close = baseRule("body .subject-plan-close");

  assert.match(dialog, /width:\s*min\(780px,/u);
  assert.match(dialog, /max-height:\s*min\(760px,/u);
  assert.match(body, /grid-template-columns:\s*minmax\(0,\s*1fr\);/u);
  assert.match(body, /overflow-y:\s*auto;/u);
  assert.match(body, /overscroll-behavior-y:\s*contain;/u);
  assert.match(header, /padding:\s*13px 16px 11px;/u);
  assert.match(footer, /padding:\s*8px 14px;/u);
  assert.match(footerButtons, /min-height:\s*36px/u);
  assert.match(close, /width:\s*32px !important;/u);
  assert.match(close, /border-radius:\s*999px !important;/u);
  assert.match(close, /background:\s*rgba\(239, 68, 68, 0\.1\) !important;/u);
  assert.match(source, /<X size=\{15\} \/>/u);
});
