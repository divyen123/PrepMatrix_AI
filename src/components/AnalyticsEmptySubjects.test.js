import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { createServer } from "vite";

test("uses subject-first guidance for empty analytics prediction and goal tracking", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { default: Prediction } = await vite.ssrLoadModule("/src/components/Prediction.jsx");
    const { default: GoalTracker } = await vite.ssrLoadModule("/src/components/GoalTracker.jsx");

    const predictionMarkup = renderToStaticMarkup(React.createElement(
      MemoryRouter,
      null,
      React.createElement(Prediction, {
        completed: [],
        schedule: [],
        subjects: [],
      }),
    ));
    const goalTrackerMarkup = renderToStaticMarkup(React.createElement(GoalTracker, {
      completed: [],
      schedule: [],
      subjects: [],
    }));

    assert.match(predictionMarkup, /Add a subject first to start tracking your study progress\./u);
    assert.doesNotMatch(predictionMarkup, /Aim to complete at least one planned task in the next session\./u);
    assert.match(predictionMarkup, /class="prediction-subjects-action-link"/u);
    assert.match(predictionMarkup, /aria-label="Add a subject"/u);
    assert.match(predictionMarkup, /href="\/subjects#add-subject"/u);
    assert.match(goalTrackerMarkup, /class="goal-subjects-empty-notice"/u);
    assert.match(goalTrackerMarkup, /role="status"/u);
    assert.match(goalTrackerMarkup, /Add subjects to track the goal/u);
  } finally {
    await vite.close();
  }
});

test("keeps the Prediction add-subject arrow background-free", () => {
  const styles = readFileSync(new URL("../App.css", import.meta.url), "utf8");

  assert.match(
    styles,
    /\.prediction-subjects-action-link\s*\{[\s\S]*?background: transparent;[\s\S]*?border: 0;[\s\S]*?box-shadow: none;/u,
  );
  assert.match(styles, /\.prediction-subjects-action-link:focus-visible\s*\{[\s\S]*?outline: 2px solid var\(--accent\);/u);
});

test("styles the empty Goal tracker notice as a compact yellow-toned card", () => {
  const styles = readFileSync(new URL("../App.css", import.meta.url), "utf8");

  assert.match(
    styles,
    /\.goal-subjects-empty-notice\s*\{[\s\S]*?padding: 10px 12px;[\s\S]*?color: var\(--warning\);[\s\S]*?background: color-mix\(in srgb, var\(--warning\) 9%, var\(--surface-muted\)\);[\s\S]*?border: 1px solid color-mix\(in srgb, var\(--warning\) 28%, var\(--border\)\);/u,
  );
});

test("uses the active accent gradient and equal sizing for the Analytics overview cards", () => {
  const analyticsSource = readFileSync(new URL("./Analytics.jsx", import.meta.url), "utf8");
  const analyticsStyles = readFileSync(new URL("../pages/AnalyticsPage.css", import.meta.url), "utf8");
  const appStyles = readFileSync(new URL("../App.css", import.meta.url), "utf8");

  assert.match(analyticsSource, /id="analytics-task-bar-gradient"/u);
  assert.match(analyticsSource, /stopColor="rgb\(var\(--accent-rgb\)\)"/u);
  assert.match(analyticsSource, /fill="url\(#analytics-task-bar-gradient\)"/u);
  assert.match(analyticsSource, /maxBarSize=\{92\}/u);
  assert.match(
    analyticsStyles,
    /\.analytics-task-gradient-bars path,[\s\S]*?fill:\s*url\(#analytics-task-bar-gradient\) !important;/u,
  );
  assert.match(
    appStyles,
    /\.primary-analytics-row\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);[\s\S]*?align-items:\s*stretch;/u,
  );
  assert.match(
    appStyles,
    /\.primary-analytics-row > \.card\s*\{[\s\S]*?width:\s*100%;[\s\S]*?height:\s*100%;/u,
  );
});
