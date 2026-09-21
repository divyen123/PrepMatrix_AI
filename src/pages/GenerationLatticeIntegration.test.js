import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const learningSource = readFileSync(new URL("./StartLearningPage.jsx", import.meta.url), "utf8");
const examSource = readFileSync(new URL("./ExamPage.jsx", import.meta.url), "utf8");
const quizSource = readFileSync(new URL("./QuizPage.jsx", import.meta.url), "utf8");
const examStyles = readFileSync(new URL("./ExamPage.css", import.meta.url), "utf8");

test("replaces the notebook and placement Generate buttons while requests run", () => {
  assert.match(
    learningSource,
    /\{analyzing \? \(\s*<LatticeLoader className="generation-lattice-loader" label="Building notebook" \/>\s*\) : \(\s*<button[^>]*className="learning-analyze-btn"/u,
  );
  assert.match(
    learningSource,
    /\{careerAnalyzing \? \(\s*<LatticeLoader className="generation-lattice-loader" label="Analyzing preparation topics" \/>\s*\) : \(\s*<button[^>]*className="learning-career-analyze"/u,
  );
  assert.doesNotMatch(learningSource, /className="learning-intake-progress"/u);
  assert.doesNotMatch(learningSource, /className="card learning-analysis-state"/u);
});

test("replaces question-paper and AI-quiz Generate buttons while requests run", () => {
  assert.match(
    examSource,
    /\{isGenerating \? \(\s*<LatticeLoader className="generation-lattice-loader" label="Generating question paper" \/>\s*\) : \(\s*<button className="exam-primary-btn"/u,
  );
  assert.match(
    quizSource,
    /\{isGenerating \? \(\s*<LatticeLoader className="generation-lattice-loader" label="Generating AI quiz" \/>\s*\) : \(\s*<button/u,
  );
  assert.match(examStyles, /\.exam-paper-summary > \.generation-lattice-loader\s*\{\s*grid-column:\s*1 \/ -1;/u);
  assert.match(examStyles, /\.exam-paper-summary > div > span\s*\{/u);
});
