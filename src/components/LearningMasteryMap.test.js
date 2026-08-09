import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("renders a locked, accessible mastery map without a minimap", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { default: LearningMasteryMap } = await vite.ssrLoadModule(
      "/src/components/LearningMasteryMap.jsx",
    );
    const notebook = {
      id: "generated-notebook",
      title: "Data Analytics",
      subjectName: "Data Analytics",
      chapters: [{
        id: "chapter-1",
        title: "Foundations",
        topics: [{ id: "topic-1", title: "Descriptive statistics", subtopics: [] }],
      }],
    };

    const markup = renderToStaticMarkup(React.createElement(LearningMasteryMap, {
      notebook,
      plannerByNodeId: new Map(),
      progressByNodeId: new Map(),
      selectedNodeId: "chapter-1",
    }));

    assert.match(markup, /Mastery map zoom and node lock controls/u);
    assert.match(markup, /Unlock mastery map node positions/u);
    assert.match(markup, /Zoom In/u);
    assert.match(markup, /Zoom Out/u);
    assert.doesNotMatch(markup, /react-flow__node[^"]*\bdraggable\b/u);
    assert.doesNotMatch(markup, /react-flow__minimap/u);
    assert.doesNotMatch(markup, /mastery-flow-hint/u);
  } finally {
    await vite.close();
  }
});
