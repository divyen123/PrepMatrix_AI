import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./ExamPage.jsx", import.meta.url), "utf8");
const stylesheet = readFileSync(new URL("./ExamPage.css", import.meta.url), "utf8");
const resultsPanelSource = pageSource.slice(
  pageSource.indexOf("function ResultsPanel"),
  pageSource.indexOf("function PaperHistory"),
);

test("keeps eligibility behavior but hides its banner from View Results", () => {
  assert.match(
    pageSource,
    /\{section !== "results" && \(\s*<div className=\{`exam-eligibility-row[\s\S]*?<section className=\{`exam-eligibility-banner/u,
  );
  assert.match(pageSource, /const isOnlineExamEligible/u);
  assert.doesNotMatch(pageSource, /isLockedAttendTab/u);
  assert.match(pageSource, /aria-label="Back to Exam overview"/u);
  assert.match(
    pageSource,
    /\{section === "results" && \(\s*<div className="exam-subpage-return">\s*\{overviewBackControl\}/u,
  );
});

test("simplifies the View Results heading without changing result behavior", () => {
  assert.match(resultsPanelSource, /<h2>Released and pending exams<\/h2>/u);
  assert.match(resultsPanelSource, /aria-label="Refresh results"/u);
  assert.doesNotMatch(resultsPanelSource, /<span className="section-tag">View results<\/span>/u);
  assert.doesNotMatch(
    resultsPanelSource,
    /Scores remain private for exactly 72 hours after submission/u,
  );
  assert.match(resultsPanelSource, /className="exam-result-countdown"/u);
  assert.match(resultsPanelSource, /className="exam-result-score"/u);
  assert.match(resultsPanelSource, /<Eye size=\{14\} \/> View result/u);
});

test("compacts only the results heading, grid, and result cards", () => {
  assert.match(
    stylesheet,
    /\.exam-results-section \.exam-section-title\s*\{[\s\S]*?margin-bottom:\s*12px/u,
  );
  assert.match(
    stylesheet,
    /\.exam-results-grid\s*\{[\s\S]*?max-width:\s*1080px/u,
  );
  const resultCardRule = stylesheet.match(/\.exam-result-card\s*\{[^}]*\}/u)?.[0] || "";
  assert.match(resultCardRule, /min-height:\s*164px/u);
  assert.match(resultCardRule, /padding:\s*12px/u);
  assert.match(stylesheet, /\.exam-result-card > button\s*\{[\s\S]*?min-height:\s*32px/u);
  assert.match(stylesheet, /@media \(max-width: 1100px\)[\s\S]*?\.exam-results-grid/u);
  assert.match(stylesheet, /@media \(max-width: 820px\)[\s\S]*?\.exam-results-grid/u);
});
