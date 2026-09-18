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

  const focusTopics = source.indexOf(
    '<div className="subject-unit-group subject-focus-group">',
  );
  const studyRhythm = source.indexOf(
    '<section className="subject-plan-panel subject-rhythm-panel"',
  );

  assert.ok(focusTopics >= 0);
  assert.ok(studyRhythm > focusTopics, "Study rhythm must follow focus topics");
  assert.match(
    source,
    /<\/section>\s*<section className="subject-plan-panel subject-rhythm-panel"/u,
  );
});

test("subject planning layout has one compact scroll owner", () => {
  assert.doesNotMatch(stylesheet, /\.subject-plan-(?:summary|analysis|side)\b/u);

  const dialog = baseRule(".subject-plan-dialog");
  const body = baseRule(".subject-plan-body");
  const header = baseRule(".subject-plan-header");
  const footer = baseRule(".subject-plan-footer");
  const footerButtons = baseRule("body .subject-plan-footer-actions button");

  assert.match(dialog, /width:\s*min\(880px,/u);
  assert.match(body, /grid-template-columns:\s*minmax\(0,\s*1fr\);/u);
  assert.match(body, /overflow-y:\s*auto;/u);
  assert.match(body, /overscroll-behavior-y:\s*contain;/u);
  assert.match(header, /padding:\s*15px 18px 13px;/u);
  assert.match(footer, /padding:\s*9px 18px;/u);
  assert.match(footerButtons, /min-height:\s*36px/u);
});
