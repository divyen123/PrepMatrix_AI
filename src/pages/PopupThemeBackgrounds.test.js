import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const examStyles = readFileSync(new URL("./ExamPage.css", import.meta.url), "utf8");
const profileStyles = readFileSync(new URL("./SettingsProfilePage.css", import.meta.url), "utf8");
const learningStyles = readFileSync(new URL("./StartLearningPage.css", import.meta.url), "utf8");
const settingsStyles = readFileSync(new URL("./SettingsPage.css", import.meta.url), "utf8");
const resumeStyles = readFileSync(new URL("./ResumeBuilderPage.css", import.meta.url), "utf8");

test("Exam popups use neutral scrims and theme-derived panels", () => {
  assert.match(examStyles, /\.exam-result-modal\s*\{[^}]*background:\s*rgba\(0, 0, 0, 0\.48\);/u);
  assert.match(examStyles, /\.exam-certificate-modal\s*\{[^}]*background:\s*rgba\(0, 0, 0, 0\.58\);/u);
  assert.match(examStyles, /\.exam-confirm-dialog\s*\{[^}]*background:\s*var\(--surface-strong\);/u);
  assert.match(examStyles, /body\.has-bg-image :is\(\.exam-certificate-dialog, \.exam-fullscreen-gate__card, \.exam-confirm-dialog\)/u);
  assert.match(examStyles, /\.exam-generation-layer\.is-centered\s*\{[^}]*background:\s*rgba\(0, 0, 0, 0\.5\)/u);
  assert.match(examStyles, /body\.has-bg-image \.exam-generation-notice\s*\{[^}]*color-mix\(in srgb, rgb\(var\(--bg-surface-rgb/u);
});

test("Resume preview fullscreen uses a neutral scrim and theme-derived panel", () => {
  assert.match(resumeStyles, /\.resume-preview-fullscreen-backdrop\s*\{[^}]*background:\s*rgba\(0, 0, 0, 0\.68\)/u);
  assert.match(resumeStyles, /body\.has-bg-image \.resume-preview-fullscreen-backdrop\s*\{[^}]*--resume-panel-strong:\s*color-mix\(in srgb, rgb\(var\(--bg-surface-rgb/u);
});

test("profile dialogs keep the chosen wallpaper visible without a blue sheet", () => {
  assert.match(profileStyles, /\.settings-profile-dialog-layer\s*\{[^}]*background:\s*rgba\(0, 0, 0, 0\.38\);/u);
  assert.match(profileStyles, /body\.has-bg-image \.settings-profile-dialog-layer\s*\{\s*background:\s*rgba\(0, 0, 0, 0\.48\);/u);
  assert.match(profileStyles, /body\.has-bg-image \.settings-profile-dialog\s*\{[^}]*color-mix\(in srgb, rgb\(var\(--bg-surface-rgb/u);
});

test("Start Learning dialogs use neutral theme-sensitive layers", () => {
  assert.match(learningStyles, /\.learning-dialog-backdrop\s*\{[^}]*background:\s*rgba\(0, 0, 0, 0\.42\);/u);
  assert.match(learningStyles, /\.learning-privacy-backdrop\s*\{[^}]*background:\s*rgba\(0, 0, 0, 0\.58\);/u);
  assert.match(learningStyles, /body\.has-bg-image \.learning-planner-dialog\.card,\s*body\.has-bg-image \.learning-privacy-dialog\.card\s*\{\s*background:\s*color-mix/u);
});

test("Settings confirmation dialogs use neutral scrims and selected theme surfaces", () => {
  assert.match(settingsStyles, /\.settings-clear-data-backdrop\s*\{[^}]*background:\s*rgba\(0, 0, 0, 0\.48\)/u);
  assert.match(settingsStyles, /body\.dark \.confirm-modal\.settings-clear-data-dialog\s*\{[^}]*background:\s*var\(--bg\)/u);
  assert.match(settingsStyles, /body\.has-bg-image \.confirm-modal\.settings-clear-data-dialog\s*\{[^}]*color-mix\(in srgb, rgb\(var\(--bg-surface-rgb/u);
  assert.match(settingsStyles, /\.settings-academic-confirm-backdrop\s*\{[^}]*background:\s*rgba\(0, 0, 0, 0\.48\)/u);
  assert.match(settingsStyles, /body\.has-bg-image:not\(\.no-glass-cards\) \.confirm-modal\.settings-academic-confirm,[\s\S]*?color-mix\(in srgb, rgb\(var\(--bg-surface-rgb/u);
});
