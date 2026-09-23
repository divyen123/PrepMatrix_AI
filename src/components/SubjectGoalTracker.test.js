import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { createServer } from "vite";

const analyticsPageSource = readFileSync(
  new URL("../pages/AnalyticsPage.jsx", import.meta.url),
  "utf8"
);
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
    /className="secondary-btn track-goals-btn"/u
  );
  assert.match(
    subjectListSource,
    /className="subject-library-actions"[\s\S]*?Track goals[\s\S]*?Open materials/u
  );
  assert.match(subjectListSource, /<GoalTracker/u);
});

test("GoalTracker supports searchable typing input with interactive list suggestions", () => {
  assert.match(goalTrackerSource, /filteredSubjects/u);
  assert.match(goalTrackerSource, /className="goal-subject-suggestions-dropdown"/u);
  assert.match(goalTrackerSource, /className=\{`goal-subject-suggestion-btn/u);
  assert.match(goalTrackerSource, /className="goal-subject-dropdown-toggle"/u);
  assert.match(goalTrackerSource, /datalist id="goal-subject-datalist"/u);
  assert.match(goalTrackerSource, /onClose/u);
  assert.match(goalTrackerSource, /Escape/u);
});

test("GoalTracker popup is completely opaque and styled across all background themes", () => {
  assert.match(stylesheet, /\.goal-tracker-popup\s*\{[\s\S]*?background:\s*#ffffff !important;/u);
  assert.match(stylesheet, /\.goal-tracker-popup\s*\{[\s\S]*?opacity:\s*1 !important;/u);
  assert.match(stylesheet, /\.goal-tracker-popup\s*\{[\s\S]*?backdrop-filter:\s*none !important;/u);
  assert.match(stylesheet, /body\.dark \.goal-tracker-popup\s*\{[\s\S]*?background:\s*#121c26 !important;/u);
  assert.match(stylesheet, /body\.has-bg-image:not\(\.dark\) \.goal-tracker-popup\s*\{[\s\S]*?background:\s*#ffffff !important;/u);
  assert.match(stylesheet, /body\.has-bg-image\.dark \.goal-tracker-popup\s*\{[\s\S]*?background:\s*#111a24 !important;/u);
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
    assert.match(markup, /Data analytics/u);
  } finally {
    await vite.close();
  }
});
