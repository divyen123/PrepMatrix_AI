import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("renders a generated notebook in the Study Studio", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { default: LearningStudyStudio } = await vite.ssrLoadModule(
      "/src/components/LearningStudyStudio.jsx",
    );
    const notebook = {
      id: "generated-notebook",
      title: "Data Analytics",
      subjectName: "Data Analytics",
      chapters: [{
        id: "chapter-1",
        title: "Foundations",
        topics: [{
          id: "topic-1",
          title: "Descriptive statistics",
          subtopics: [],
        }],
      }],
    };
    const nodes = [
      { id: "root", title: notebook.subjectName, type: "notebook" },
      { id: "chapter-1", title: "Foundations", type: "chapter" },
      {
        id: "topic-1",
        title: "Descriptive statistics",
        type: "topic",
        summary: "Summarize and interpret a dataset.",
        keyPoints: ["Center", "Spread"],
      },
    ];
    const progressByNodeId = new Map([
      ["chapter-1", { status: "ready" }],
      ["topic-1", { status: "ready" }],
    ]);

    const markup = renderToStaticMarkup(React.createElement(LearningStudyStudio, {
      coachState: { label: "Coach guidance", response: "Use a compact worked example." },
      isSavingNote: () => false,
      nodes,
      notebook,
      progressByNodeId,
      reviewQueue: [],
      selectedNode: nodes[1],
    }));

    assert.match(markup, /Adaptive session/u);
    assert.match(markup, /Foundations/u);
    assert.match(markup, /AI Coach/u);
    assert.match(markup, /Use a compact worked example\./u);
    assert.match(markup, /Save guidance/u);
    assert.doesNotMatch(markup, /Focused on/u);
    assert.doesNotMatch(markup, /Review queue/u);
  } finally {
    await vite.close();
  }
});
