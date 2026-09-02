import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./ExamPage.jsx", import.meta.url), "utf8");
const stylesheet = readFileSync(new URL("./ExamPage.css", import.meta.url), "utf8");
const overviewSource = pageSource.match(
  /\{section === "overview" && \(([\s\S]*?)\n\s*\)\}\s*\n\s*\{section === "attend"/u,
)?.[1] || "";

test("removes the Overview hero while preserving the action cards", () => {
  assert.doesNotMatch(pageSource, /Secure assessment workspace/u);
  assert.doesNotMatch(pageSource, /From focused practice to a complete exam workflow/u);
  assert.doesNotMatch(pageSource, /className="card exam-hero"/u);
  assert.doesNotMatch(stylesheet, /\.exam-hero/u);

  assert.match(overviewSource, /<nav aria-label="Exam destinations" className="exam-feature-grid">/u);
  assert.match(overviewSource, /<strong>Attend Exam<\/strong>/u);
  assert.match(overviewSource, /<strong>Generate Question Paper<\/strong>/u);
  assert.match(overviewSource, /<strong>View Results<\/strong>/u);
});

test("removes the offline timer from Overview while retaining it for generated papers", () => {
  assert.ok(overviewSource, "expected to find the Exam Overview render block");
  assert.doesNotMatch(overviewSource, /OfflineExamTimer/u);
  assert.doesNotMatch(pageSource, /section === "overview" \|\| section === "paper"/u);
  assert.match(pageSource, /\{section === "paper" && \(\s*<OfflineExamTimer/u);
});

test("presents all Overview destinations as full interactive cards", () => {
  assert.match(overviewSource, /className=\{`exam-feature-card is-attend/u);
  assert.match(overviewSource, /className="exam-feature-card is-paper"/u);
  assert.match(overviewSource, /className="exam-feature-card is-results"/u);
  assert.match(overviewSource, /onClick=\{\(\) => setSection\("attend"\)\}/u);
  assert.match(overviewSource, /onClick=\{\(\) => setSection\("paper"\)\}/u);
  assert.match(overviewSource, /onClick=\{\(\) => setSection\("results"\)\}/u);
  assert.doesNotMatch(overviewSource, /className="card exam-feature-card/u);
});

test("replaces the section tab bar with an accessible compact overview return", () => {
  assert.doesNotMatch(pageSource, /className="exam-page__tabs"/u);
  assert.doesNotMatch(pageSource, /aria-label="Exam workspace sections"/u);
  assert.doesNotMatch(stylesheet, /\.exam-page__tabs/u);
  assert.match(
    pageSource,
    /\{section !== "overview" && \(\s*<button\s+aria-label="Back to Exam overview"\s+className="exam-overview-back"[\s\S]*?onClick=\{\(\) => setSection\("overview"\)\}[\s\S]*?<ChevronLeft aria-hidden="true" size=\{18\} \/>/u,
  );
  const backButtonRule = stylesheet.match(/\.exam-overview-back\s*\{[^}]*\}/u)?.[0] || "";
  assert.match(backButtonRule, /width:\s*34px/u);
  assert.match(backButtonRule, /height:\s*34px/u);
  assert.match(stylesheet, /\.exam-overview-back:focus-visible/u);
});

test("matches Planner-style card motion across input, theme, and viewport modes", () => {
  assert.match(stylesheet, /\.exam-page \.exam-feature-card\.is-attend[\s\S]*?--exam-feature-tone/u);
  assert.match(stylesheet, /\.exam-page \.exam-feature-card\.is-paper[\s\S]*?--exam-feature-tone/u);
  assert.match(stylesheet, /\.exam-page \.exam-feature-card\.is-results[\s\S]*?--exam-feature-tone/u);
  assert.match(stylesheet, /\.exam-page \.exam-feature-card::after\s*\{\s*content: none;/u);
  assert.match(stylesheet, /\.exam-page \.exam-feature-card:focus-visible/u);
  assert.match(stylesheet, /@media \(hover: hover\) and \(pointer: fine\)[\s\S]*?\.exam-feature-card:hover:not\(:disabled\)/u);
  assert.match(stylesheet, /body\.has-bg-image:not\(\.no-glass-cards\) \.exam-page \.exam-feature-card/u);
  assert.match(stylesheet, /@media \(max-width: 920px\)[\s\S]*?\.exam-feature-grid[\s\S]*?grid-template-columns: 1fr/u);
  assert.match(stylesheet, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.exam-feature-card/u);
});

test("removes only the requested Attend Exam subtitle", () => {
  assert.doesNotMatch(
    pageSource,
    /Exactly 40 MCQs, 60 minutes, and server-side grading\./u,
  );
  assert.match(pageSource, /<h2>Prepare a secure online exam<\/h2>/u);
  assert.match(pageSource, /<span className="section-tag">Attend exam<\/span>/u);
  assert.match(pageSource, /<h3>Stay inside the exam<\/h3>/u);
});
