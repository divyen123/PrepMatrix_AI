import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const stylesheet = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("standard popup scrims dim without imposing a navy cast", () => {
  const cases = [
    ["AcademicProfileCreateDialog.css", /\.academic-profile-create-layer\s*\{[\s\S]*?rgba\(0, 0, 0, 0\.68\);/u],
    ["LearningSubjectMasteryDialog.css", /\.learning-subject-mastery-backdrop\s*\{[^}]*background: rgba\(0, 0, 0, 0\.68\);/u],
    ["SubjectSnapshotDialog.css", /\.subject-snapshot-backdrop\s*\{[^}]*background: rgba\(0, 0, 0, 0\.52\);/u],
    ["QuizExitDialog.css", /\.quiz-exit-backdrop\s*\{[^}]*background: rgba\(0, 0, 0, 0\.72\);/u],
    ["StudyPlanPreviewDialog.css", /\.study-plan-preview-dialog::backdrop\s*\{[^}]*background: rgb\(0 0 0 \/ 65%\);/u],
  ];

  for (const [file, pattern] of cases) {
    assert.match(stylesheet(file), pattern, `${file} should have a neutral backdrop`);
  }
});

test("wallpaper popup surfaces retain a subtle selected-theme tint", () => {
  const files = [
    "KeyboardShortcutDialog.css",
    "PrepMatrixGuideDialog.css",
    "ReportModal.css",
    "AcademicProfileCreateDialog.css",
    "QuizExitDialog.css",
    "PredictiveMemoryReview.css",
    "SubjectPlanDialog.css",
    "SubjectSnapshotDialog.css",
    "LearningSubjectMasteryDialog.css",
  ];

  for (const file of files) {
    const css = stylesheet(file);
    assert.match(css, /body\.has-bg-image/u, `${file} should include a wallpaper rule`);
    assert.match(css, /rgb\(var\(--bg-surface-rgb, 16, 21, 26\)\) 20%, #101010 80%/u, `${file} should blend its wallpaper palette with neutral charcoal`);
  }
});
