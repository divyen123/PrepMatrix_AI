import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const analyticsPageSource = readFileSync(
  new URL("../pages/AnalyticsPage.jsx", import.meta.url),
  "utf8"
);
const appSource = readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
const subjectListSource = readFileSync(
  new URL("./SubjectList.jsx", import.meta.url),
  "utf8"
);
const goalTrackerSource = readFileSync(
  new URL("./GoalTracker.jsx", import.meta.url),
  "utf8"
);
const stylesheet = readFileSync(new URL("../App.css", import.meta.url), "utf8");

test("removes GoalTracker from AnalyticsPage", () => {
  assert.doesNotMatch(analyticsPageSource, /import GoalTracker from/u);
  assert.doesNotMatch(analyticsPageSource, /<GoalTracker/u);
});

test("places Track goals button in SubjectList near Open materials when subjects exist", () => {
  assert.match(
    subjectListSource,
    /\{subjects\.length > 0 && \(\s*<button[\s\S]*?Track goals/u
  );
  assert.match(
    subjectListSource,
    /className="primary-btn track-goals-btn"/u
  );
  assert.match(
    subjectListSource,
    /className="subject-library-actions"[\s\S]*?Track goals[\s\S]*?Open materials/u
  );
  assert.match(subjectListSource, /<GoalTracker/u);
});

test("forwards the active plan and completion data into the Subjects goal tracker", () => {
  assert.match(
    appSource,
    /<SubjectsPage[\s\S]*?completed=\{completed\}[\s\S]*?schedule=\{schedule\}/u,
  );
});

test("GoalTracker supports searchable typing input with interactive list suggestions", () => {
  assert.match(goalTrackerSource, /filteredSubjects/u);
  assert.match(goalTrackerSource, /className="goal-subject-suggestions-dropdown"/u);
  assert.match(goalTrackerSource, /className=\{`goal-subject-suggestion-btn/u);
  assert.match(goalTrackerSource, /className="goal-subject-dropdown-toggle"/u);
  assert.match(goalTrackerSource, /role="combobox"/u);
  assert.match(goalTrackerSource, /aria-haspopup="listbox"/u);
  assert.doesNotMatch(goalTrackerSource, /<datalist/u);
  assert.match(goalTrackerSource, /onClose/u);
  assert.match(goalTrackerSource, /Escape/u);
});

test("GoalTracker popup follows palette and image themes and stays viewport-scrollable", () => {
  assert.match(stylesheet, /\.goal-tracker-popup\s*\{[\s\S]*?--goal-popup-surface:\s*color-mix\(in srgb, var\(--bg\)/u);
  assert.match(stylesheet, /\.goal-tracker-popup\s*\{[\s\S]*?--goal-popup-text:\s*var\(--text\);/u);
  assert.match(stylesheet, /\.goal-tracker-popup\s*\{[\s\S]*?--goal-popup-border:\s*color-mix\(in srgb, var\(--border\)/u);
  assert.match(stylesheet, /\.goal-tracker-popup\s*\{[\s\S]*?position:\s*fixed;/u);
  assert.match(stylesheet, /\.goal-tracker-popup\s*\{[\s\S]*?max-height:\s*calc\(100dvh - 32px\);/u);
  assert.match(stylesheet, /\.goal-tracker-popup\s*\{[\s\S]*?overflow-y:\s*auto !important;/u);
  assert.match(stylesheet, /body\.dark \.goal-tracker-popup\s*\{[\s\S]*?var\(--bg\)[\s\S]*?var\(--accent\)/u);
  assert.match(stylesheet, /body\.no-glass-cards:not\(\.has-bg-image\) \.goal-tracker-popup\s*\{[\s\S]*?--goal-popup-surface:\s*var\(--surface\);/u);
  assert.match(stylesheet, /body\.has-bg-image \.goal-tracker-popup\s*\{[\s\S]*?--goal-popup-surface:\s*rgba\(var\(--bg-surface-rgb[^;]*var\(--glass-opacity, 0\.6\)\);/u);
  assert.match(stylesheet, /body\.has-bg-image \.goal-tracker-popup\s*\{[\s\S]*?--goal-popup-text:\s*#f0f0f5;/u);
  assert.match(stylesheet, /body\.has-bg-image\.no-glass-cards \.goal-tracker-popup\s*\{[\s\S]*?0\.92/u);
  assert.match(goalTrackerSource, /createPortal\(content, document\.body\)/u);
  assert.match(goalTrackerSource, /resolvePopupPosition\(anchorRef\?\.current\)/u);
  assert.doesNotMatch(
    stylesheet,
    /\.goal-tracker-popup \.goal-tracker-header\s*\{[^}]*position:\s*sticky;/u,
  );
});

test("GoalTracker applies its local theme tokens to nested surfaces and scrollbars", () => {
  assert.match(stylesheet, /\.goal-tracker-popup \.goal-tracker-header\s*\{[\s\S]*?background:\s*var\(--goal-popup-surface\);[\s\S]*?var\(--goal-popup-border\)/u);
  assert.match(stylesheet, /body \.goal-tracker-popup \.goal-subject-text-input,[\s\S]*?color:\s*var\(--goal-popup-text\) !important;/u);
  assert.match(stylesheet, /\.goal-tracker-popup \.goal-progress-panel\s*\{[\s\S]*?background:\s*var\(--goal-popup-muted\);[\s\S]*?var\(--goal-popup-border\)/u);
  assert.match(stylesheet, /\.goal-tracker-popup \.goal-metric-card\s*\{[\s\S]*?background:\s*var\(--goal-popup-raised\);[\s\S]*?var\(--goal-popup-border\)/u);
  assert.match(stylesheet, /\.goal-tracker-popup,[\s\S]*?scrollbar-color:\s*var\(--goal-popup-scroll-thumb\) var\(--goal-popup-scroll-track\);/u);
  assert.match(stylesheet, /\.goal-tracker-popup\s*\{[\s\S]*?--goal-popup-scroll-thumb:\s*var\(--accent\);/u);
  assert.match(stylesheet, /\.goal-tracker-popup\s*\{[\s\S]*?--goal-popup-scroll-track:\s*transparent;/u);
  assert.match(stylesheet, /body\.has-bg-image \.goal-tracker-popup\s*\{[\s\S]*?--goal-popup-scroll-thumb:\s*rgb\(var\(--accent-rgb\)\);/u);
  assert.match(stylesheet, /body \.goal-tracker-popup::-webkit-scrollbar-thumb,[\s\S]*?background:\s*var\(--goal-popup-scroll-thumb\) !important;/u);
  assert.match(stylesheet, /body \.goal-tracker-popup::-webkit-scrollbar,[\s\S]*?width:\s*6px !important;[\s\S]*?background:\s*transparent !important;/u);
  assert.match(stylesheet, /body \.goal-tracker-popup::-webkit-scrollbar-track,[\s\S]*?background:\s*transparent !important;/u);
  assert.match(stylesheet, /body \.goal-tracker-popup::-webkit-scrollbar-button,[\s\S]*?display:\s*none !important;[\s\S]*?height:\s*0 !important;/u);
});

test("GoalTracker popup controls stay neutral instead of inheriting global green button containers", () => {
  assert.match(stylesheet, /body \.goal-tracker-popup \.goal-subject-dropdown-toggle[\s\S]*?background:\s*transparent !important;/u);
  assert.match(stylesheet, /body \.goal-tracker-popup \.goal-subject-dropdown-toggle[\s\S]*?box-shadow:\s*none !important;/u);
  assert.match(stylesheet, /body \.goal-tracker-popup \.goal-subject-suggestion-btn[\s\S]*?background:\s*transparent !important;/u);
  assert.match(stylesheet, /body \.goal-tracker-popup \.goal-subject-suggestion-btn:hover[\s\S]*?background:\s*transparent !important;/u);
  assert.match(stylesheet, /\.goal-tracker-close-btn\s*\{[\s\S]*?background:\s*transparent !important;/u);
  assert.match(stylesheet, /\.goal-tracker-close-btn\s*\{[\s\S]*?justify-content:\s*center !important;/u);
});

test("GoalTracker retains an exit phase for smooth fade-in and fade-out motion", () => {
  assert.match(subjectListSource, /goalPopupClosing/u);
  assert.match(subjectListSource, /GOAL_TRACKER_EXIT_MS = 180/u);
  assert.match(subjectListSource, /setGoalPopupClosing\(true\)/u);
  assert.match(goalTrackerSource, /goal-tracker-popup\$\{closing \? " is-closing" : ""\}/u);
  assert.match(stylesheet, /\.goal-tracker-popup\.is-closing[\s\S]*?animation:\s*goalTrackerPopupOut 180ms/u);
  assert.match(stylesheet, /@keyframes goalTrackerPopupIn/u);
  assert.match(stylesheet, /@keyframes goalTrackerPopupOut/u);
  assert.match(stylesheet, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.goal-tracker-popup/u);
});

test("renders GoalTracker with mock subjects and calculates metrics", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { default: GoalTracker } = await vite.ssrLoadModule("/src/components/GoalTracker.jsx");

    const markup = renderToStaticMarkup(
      React.createElement(GoalTracker, {
        completed: ["RestAPI - Chapter 1"],
        schedule: [
          {
            date: "2026-09-23",
            tasks: [
              { task: "RestAPI - Chapter 1", subjectName: "RestAPI" },
              { task: "RestAPI - Chapter 2", subjectName: "RestAPI" },
            ],
          },
        ],
        subjects: [
          { name: "RestAPI", chapters: 4, difficulty: "medium" },
          { name: "Data analytics", chapters: 4, difficulty: "medium" },
        ],
      })
    );

    assert.match(markup, /Goal tracker/u);
    assert.match(markup, /50%/u);
    assert.match(markup, /RestAPI/u);
    assert.match(markup, /role="dialog"/u);
    assert.match(markup, /role="combobox"/u);
  } finally {
    await vite.close();
  }
});
