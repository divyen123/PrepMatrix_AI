import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./ExamPage.jsx", import.meta.url), "utf8");
const stylesheet = readFileSync(new URL("./ExamPage.css", import.meta.url), "utf8");

test("removes the Overview hero while preserving the action cards", () => {
  assert.doesNotMatch(pageSource, /Secure assessment workspace/u);
  assert.doesNotMatch(pageSource, /From focused practice to a complete exam workflow/u);
  assert.doesNotMatch(pageSource, /className="card exam-hero"/u);
  assert.doesNotMatch(stylesheet, /\.exam-hero/u);

  assert.match(pageSource, /className="exam-feature-grid"/u);
  assert.match(pageSource, /<h3>Attend Exam<\/h3>/u);
  assert.match(pageSource, /<h3>Generate Question Paper<\/h3>/u);
  assert.match(pageSource, /<h3>View Results<\/h3>/u);
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
