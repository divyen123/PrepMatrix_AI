import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appCss = readFileSync(new URL("../App.css", import.meta.url), "utf8");
const aboutSource = readFileSync(new URL("./AboutPage.jsx", import.meta.url), "utf8");
const academicProfilesSource = readFileSync(new URL("./AcademicProfilesGuidePage.jsx", import.meta.url), "utf8");
const examAboutSource = readFileSync(new URL("./ExamAboutPage.jsx", import.meta.url), "utf8");
const notificationHistorySource = readFileSync(new URL("./NotificationHistoryPage.jsx", import.meta.url), "utf8");
const plannerSource = readFileSync(new URL("./PlannerPage.jsx", import.meta.url), "utf8");
const settingsProfileSource = readFileSync(new URL("./SettingsProfilePage.jsx", import.meta.url), "utf8");
const startLearningSource = readFileSync(new URL("./StartLearningPage.jsx", import.meta.url), "utf8");

test("page-header back controls share the compact icon-only treatment", () => {
  assert.match(plannerSource, /className="planner-subpage-back page-back-control"/u);
  assert.match(aboutSource, /className="icon-shell-btn back-nav-btn page-back-control"/u);
  assert.match(academicProfilesSource, /className="academic-profile-guide-back page-back-control"/u);
  assert.match(notificationHistorySource, /className="notification-history-back page-back-control"/u);
  assert.match(settingsProfileSource, /className="settings-profile-back page-back-control"/u);
  assert.match(examAboutSource, /className="exam-guide-back page-back-control"/u);
  assert.match(startLearningSource, /className="learning-icon-button page-back-control"/u);
});

test("page-header back controls keep accessible names and expected destinations", () => {
  assert.match(plannerSource, /aria-label="Back to Planner workspaces"[\s\S]*?title="Back to Planner workspaces"[\s\S]*?to="\/planner"/u);
  assert.match(aboutSource, /aria-label="Go back"[\s\S]*?title="Go back"/u);
  assert.match(academicProfilesSource, /aria-label="Back to Settings"[\s\S]*?navigate\("\/settings"\)[\s\S]*?title="Back to Settings"/u);
  assert.match(notificationHistorySource, /aria-label="Back to settings"[\s\S]*?navigate\("\/settings"\)[\s\S]*?title="Back to settings"/u);
  assert.match(settingsProfileSource, /aria-label="Back to Settings"[\s\S]*?navigate\("\/settings"\)[\s\S]*?title="Back to Settings"/u);
  assert.match(examAboutSource, /aria-label="Back to Exam"[\s\S]*?navigate\("\/exam"\)[\s\S]*?title="Back to Exam"/u);
  assert.match(startLearningSource, /aria-label="Back to preparation choices"[\s\S]*?returnToPreparationChoice[\s\S]*?title="Back to preparation choices"/u);
});

test("Exam guide uses only the back icon while preserving its accessible label", () => {
  assert.match(
    examAboutSource,
    /aria-label="Back to Exam"[\s\S]*?<ArrowLeft aria-hidden="true" size=\{16\} \/>[\s\S]*?<\/button>/u,
  );
  assert.doesNotMatch(examAboutSource, /<ArrowLeft[^>]*\/>\s*Back to Exam/u);
});

test("shared back styling stays transparent, compact, theme-safe, and keyboard-visible", () => {
  const baseRule = appCss.match(/body :is\(button, a\)\.page-back-control\.page-back-control \{([\s\S]*?)\n\}/u)?.[1] || "";
  const iconRule = appCss.match(/body :is\(button, a\)\.page-back-control\.page-back-control svg \{([\s\S]*?)\n\}/u)?.[1] || "";
  const hoverRule = appCss.match(/body :is\(button, a\)\.page-back-control\.page-back-control:hover \{([\s\S]*?)\n\}/u)?.[1] || "";
  const focusRule = appCss.match(/body :is\(button, a\)\.page-back-control\.page-back-control:focus-visible \{([\s\S]*?)\n\}/u)?.[1] || "";

  assert.match(baseRule, /width: 34px !important/u);
  assert.match(baseRule, /height: 34px !important/u);
  assert.match(baseRule, /margin-top: -2px !important/u);
  assert.match(baseRule, /color: var\(--text\) !important/u);
  assert.match(baseRule, /background: transparent !important/u);
  assert.match(baseRule, /border: 0 !important/u);
  assert.match(baseRule, /box-shadow: none !important/u);
  assert.match(baseRule, /backdrop-filter: none !important/u);
  assert.match(baseRule, /transform: translateY\(-3px\) !important/u);
  assert.match(iconRule, /width: 17px !important/u);
  assert.match(iconRule, /height: 17px !important/u);
  assert.match(hoverRule, /background: transparent !important/u);
  assert.match(focusRule, /outline: 2px solid/u);
  assert.match(appCss, /body\.has-bg-image[\s\S]*?color: #f8fafc !important/u);
  assert.match(appCss, /body\.has-bg-image[\s\S]*?drop-shadow\(0 1px 2px rgba\(0, 0, 0, 0\.92\)\)/u);
  assert.match(appCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?transition-duration: 0\.01ms !important/u);
});
