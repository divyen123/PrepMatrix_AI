import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("renders an accessible per-notebook subject mastery comparison", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { default: LearningSubjectMasteryDialog } = await vite.ssrLoadModule(
      "/src/components/LearningSubjectMasteryDialog.jsx",
    );
    const notebook = {
      id: "notebook-data",
      title: "Data Analytics Notebook",
      subjectName: "Data Analytics",
      chapters: [{
        id: "chapter-foundations",
        title: "Foundations",
        topics: [
          { id: "topic-statistics", title: "Descriptive statistics", subtopics: [] },
          { id: "topic-regression", title: "Regression basics", subtopics: [] },
        ],
      }],
      learningState: {
        nodes: {
          "topic-statistics": {
            nodeId: "topic-statistics",
            nodeType: "topic",
            status: "learning",
            title: "Descriptive statistics",
            learnedAt: "2026-08-08T08:00:00.000Z",
          },
          "topic-regression": {
            nodeId: "topic-regression",
            nodeType: "topic",
            status: "ready",
            title: "Regression basics",
          },
        },
      },
    };

    const markup = renderToStaticMarkup(React.createElement(LearningSubjectMasteryDialog, {
      notebooks: [notebook],
      now: "2026-08-08T10:00:00.000Z",
      open: true,
    }));

    assert.match(markup, /role="dialog"/u);
    assert.match(markup, /aria-modal="true"/u);
    assert.match(markup, /id="learning-subject-mastery-dialog"/u);
    assert.match(markup, /Subject mastery/u);
    assert.match(markup, /Learned topics compared with each notebook(?:&#x27;|')s complete topic set\./u);
    assert.match(markup, /Data Analytics Notebook/u);
    assert.match(markup, /1 of 2 learned/u);
    assert.match(markup, /50%/u);
    assert.match(markup, /Descriptive statistics/u);
    assert.match(markup, /Close subject mastery/u);
  } finally {
    await vite.close();
  }
});

test("does not render the subject mastery dialog while closed", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { default: LearningSubjectMasteryDialog } = await vite.ssrLoadModule(
      "/src/components/LearningSubjectMasteryDialog.jsx",
    );
    const markup = renderToStaticMarkup(React.createElement(LearningSubjectMasteryDialog, {
      open: false,
    }));

    assert.equal(markup, "");
  } finally {
    await vite.close();
  }
});
