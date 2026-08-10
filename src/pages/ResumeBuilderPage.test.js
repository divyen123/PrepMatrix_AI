import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("renders New beside the full-screen preview control", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { default: ResumeBuilderPage } = await vite.ssrLoadModule(
      "/src/pages/ResumeBuilderPage.jsx",
    );
    const markup = renderToStaticMarkup(React.createElement(ResumeBuilderPage, {
      academicProfile: { academicTrack: "Engineering & Technology" },
      resumeBuilder: {},
      userProfile: { email: "learner@example.com", username: "Learner" },
    }));
    const toolbar = markup.match(
      /<div class="resume-preview-panel__tools">([\s\S]*?)<\/div>/u,
    )?.[1] || "";

    assert.match(toolbar, /aria-label="Start a new resume"/u);
    assert.match(toolbar, />New<\/span>/u);
    assert.match(toolbar, /aria-label="Open full screen resume preview"/u);
    assert.ok(
      toolbar.indexOf("Start a new resume") < toolbar.indexOf("Open full screen resume preview"),
      "New should appear immediately before the full-screen control",
    );
  } finally {
    await vite.close();
  }
});
