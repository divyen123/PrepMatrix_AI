import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { createServer } from "vite";

test("resume analyzer offers comparison inputs and uses a populated current draft", async () => {
  const vite = await createServer({ appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
  try {
    const { default: ResumeAnalyzerPage } = await vite.ssrLoadModule("/src/pages/ResumeAnalyzerPage.jsx");
    const markup = renderToStaticMarkup(
      React.createElement(MemoryRouter, null,
        React.createElement(ResumeAnalyzerPage, {
          resumeBuilder: { draft: { skills: ["React"], projects: [{ name: "Dashboard", highlights: ["Built a React dashboard."] }] } },
          userProfile: {},
        }),
      ),
    );

    assert.match(markup, /<h1>Resume Analyzer<\/h1>/u);
    assert.match(markup, /aria-pressed="true"[^>]*>[^]*?Current draft/u);
    assert.match(markup, /Your current draft is ready/u);
    assert.match(markup, /Job description/u);
    assert.match(markup, /Check Skill Gaps/u);
  } finally {
    await vite.close();
  }
});

test("resume analyzer prompts for an upload when the builder has no content", async () => {
  const vite = await createServer({ appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
  try {
    const { default: ResumeAnalyzerPage } = await vite.ssrLoadModule("/src/pages/ResumeAnalyzerPage.jsx");
    const markup = renderToStaticMarkup(
      React.createElement(MemoryRouter, null,
        React.createElement(ResumeAnalyzerPage, { resumeBuilder: { draft: {} }, userProfile: {} }),
      ),
    );

    assert.match(markup, /Upload resume/u);
    assert.match(markup, /aria-label="Upload resume"/u);
    assert.doesNotMatch(markup, /Your current draft is ready/u);
  } finally {
    await vite.close();
  }
});
