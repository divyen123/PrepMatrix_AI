import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { createServer } from "vite";

test("subject exam links render prefilled setup while preserving readiness and parent gates", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });
  try {
    const { default: ExamPage } = await vite.ssrLoadModule("/src/pages/ExamPage.jsx");
    const { AiQuotaContext } = await vite.ssrLoadModule("/src/utils/aiQuota.js");
    const { BackgroundTaskContext } = await vite.ssrLoadModule("/src/utils/backgroundTaskContext.js");
    const subjects = [
      { name: "Physics", chapters: 1, chapterNames: ["Mechanics"] },
      { name: "Data Analytics", chapters: 1, chapterNames: ["Big data"], topics: ["Sampling"] },
    ];
    const schedule = [{ tasks: [
      { task: "Data Analytics - Regression", subjectName: "Data Analytics", topic: "Regression" },
    ] }];
    const renderExam = (url, overrides = {}) => renderToStaticMarkup(
      React.createElement(MemoryRouter, { initialEntries: [url] },
        React.createElement(AiQuotaContext.Provider, { value: {
          hasInsufficientCredits: () => false,
          getCost: () => 15,
        } }, React.createElement(BackgroundTaskContext.Provider, { value: { tasks: {} } },
          React.createElement(ExamPage, {
            subjects, schedule, examReadiness: 100, isExamEligible: true, ...overrides,
          }),
        )),
      ),
    );

    const prefilled = renderExam("/exam?section=attend&subject=Data%20Analytics");
    assert.match(prefilled, /<option value="Data Analytics" selected="">Data Analytics<\/option>/u);
    assert.match(prefilled, /<textarea[^>]*>Big data\nSampling\nRegression<\/textarea>/u);
    assert.match(prefilled, /Prepare a secure online exam/u);
    assert.match(prefilled, /<button class="exam-primary-btn" type="button">/u);

    const locked = renderExam("/exam?section=attend&subject=Data%20Analytics", {
      examReadiness: 40, isExamEligible: false,
    });
    assert.match(locked, /<textarea[^>]*>Big data\nSampling\nRegression<\/textarea>/u);
    assert.match(locked, /40% planner completion/u);
    assert.match(locked, /Complete at least 80%/u);
    assert.match(locked, /<button class="exam-primary-btn" disabled="" type="button">/u);

    const direct = renderExam("/exam");
    assert.match(direct, /aria-label="Exam destinations"/u);
    assert.doesNotMatch(direct, /Prepare a secure online exam/u);
    const directAttend = renderExam("/exam?section=attend");
    assert.match(directAttend, /<option value="Physics" selected="">Physics<\/option>/u);
    assert.match(directAttend, /<textarea[^>]*><\/textarea>/u);
    const unknown = renderExam("/exam?section=attend&subject=Unknown", { isExamEligible: false });
    assert.match(unknown, /aria-label="Exam destinations"/u);
    assert.doesNotMatch(unknown, /Prepare a secure online exam/u);

    const parentLocked = renderExam("/exam?section=attend&subject=Data%20Analytics", {
      youngKidsMode: true, parentAccessGranted: false,
    });
    assert.match(parentLocked, /Parent Corner access required/u);
    assert.doesNotMatch(parentLocked, /Prepare a secure online exam/u);
  } finally {
    await vite.close();
  }
});
