import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { createServer } from "vite";

test("study schedule preview fades in and out and keeps its completion accents scoped", () => {
  const source = readFileSync(new URL("./StudyPlanPreviewDialog.jsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("./StudyPlanPreviewDialog.css", import.meta.url), "utf8");

  assert.match(source, /className="study-plan-preview-heading"[\s\S]*?<h2 id="study-plan-preview-title">Study schedule<\/h2>[\s\S]*?<p id="study-plan-preview-summary">/u);
  assert.match(css, /\.study-plan-preview-heading\s*\{[\s\S]*?display:\s*flex;[\s\S]*?align-items:\s*baseline;/u);
  assert.match(source, /const \[isClosing, setIsClosing\] = useState\(false\);/u);
  assert.match(source, /window\.setTimeout\(onClose, 220\)/u);
  assert.match(source, /onClick=\{\(event\) => \{\s*if \(event\.target !== event\.currentTarget\) return;\s*const bounds = event\.currentTarget\.getBoundingClientRect\(\);[\s\S]*?requestClose\(\);/u);
  assert.match(css, /\.study-plan-preview-dialog\[open\]\.is-closing\s*\{\s*animation:\s*study-plan-preview-exit/u);
  assert.match(css, /\.study-plan-preview-dialog\[open\]\.is-closing::backdrop\s*\{\s*animation:\s*study-plan-preview-backdrop-exit/u);
  assert.match(css, /\.study-plan-preview-day\.is-complete\s*\{/u);
  assert.match(css, /\.study-plan-preview-day li\.is-complete \.study-plan-preview-status\s*\{/u);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/u);
});

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

test("prediction recommends finishable subjects and opens the right planner state", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { default: Prediction } = await vite.ssrLoadModule("/src/components/Prediction.jsx");
    const { StudyPlanPreviewContent } = await vite.ssrLoadModule(
      "/src/components/StudyPlanPreviewDialog.jsx",
    );
    const subjects = [
      { name: "RestAPI" },
      { name: "Data analytics" },
      { name: "Machine Learning" },
    ];
    const renderPrediction = (schedule, completed = []) => renderToStaticMarkup(React.createElement(
      MemoryRouter,
      null,
      React.createElement(Prediction, { completed, schedule, subjects }),
    ));
    const schedule = [{
      day: 1,
      tasks: [
        { task: "RestAPI - 1", subjectName: "RestAPI" },
        { task: "RestAPI - 2", subjectName: "RestAPI" },
        { task: "Data analytics - 1", subjectName: "Data analytics" },
        { task: "Data analytics - 2", subjectName: "Data analytics" },
        { task: "Data analytics - 3", subjectName: "Data analytics" },
        { task: "Machine Learning - 1", subjectName: "Machine Learning" },
      ],
    }];
    const completed = ["RestAPI - 1", "Data analytics - 1", "Machine Learning - 1"];

    const activeMarkup = renderPrediction(schedule, completed);
    assert.match(activeMarkup, /Finish RestAPI \(1 left\), then Data analytics \(2 left\)\./u);
    assert.match(activeMarkup, /<button[^>]*aria-haspopup="dialog"[^>]*>\s*<span>View plan<\/span>/u);
    assert.doesNotMatch(activeMarkup, /href="\/planner\/schedule"/u);
    assert.doesNotMatch(activeMarkup, /A little more consistency will move you into a safer range\./u);

    const previewMarkup = renderToStaticMarkup(React.createElement(StudyPlanPreviewContent, {
      completed,
      schedule,
      scheduleStartDate: "2026-09-24",
    }));
    assert.match(previewMarkup, /Study schedule/u);
    assert.match(previewMarkup, /3 of 6 tasks complete/u);
    assert.match(previewMarkup, /Day 1 - 24\/09\/2026/u);
    assert.match(previewMarkup, /RestAPI - 2/u);
    assert.match(previewMarkup, /aria-label="Completed"/u);
    assert.match(previewMarkup, /aria-label="Pending"/u);

    const mixedDaysMarkup = renderToStaticMarkup(React.createElement(StudyPlanPreviewContent, {
      completed: ["Finished", "Needs recheck"],
      schedule: [
        { day: 1, tasks: [{ task: "Finished" }] },
        { day: 2, tasks: [{ task: "Needs recheck", recheckPending: true }] },
        { day: 3, tasks: [] },
      ],
    }));
    assert.equal((mixedDaysMarkup.match(/class="study-plan-preview-day is-complete"/gu) || []).length, 1);
    assert.equal((mixedDaysMarkup.match(/class="study-plan-preview-day"/gu) || []).length, 2);

    const unplannedMarkup = renderPrediction([]);
    assert.match(unplannedMarkup, /Create a plan to see which subjects to study first\./u);
    assert.match(unplannedMarkup, /href="\/planner\/schedule"[^>]*>\s*<span>Create plan<\/span>/u);
    assert.match(renderPrediction([{ day: 1, tasks: [] }]), /<span>Create plan<\/span>/u);

    const completeMarkup = renderPrediction(schedule, schedule[0].tasks.map((task) => task.task));
    assert.match(completeMarkup, /Your plan is complete\./u);
    assert.doesNotMatch(completeMarkup, /Finish RestAPI/u);
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
  assert.match(styles, /body \.prediction-plan-link\s*\{[\s\S]*?background: transparent !important;[\s\S]*?border: 0 !important;[\s\S]*?box-shadow: none !important;/u);
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
