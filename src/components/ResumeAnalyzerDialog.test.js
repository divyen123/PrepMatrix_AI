import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("Resume Builder opens an analyzer dialog instead of a sidebar page", () => {
  const appSource = readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
  const builderSource = readFileSync(new URL("../pages/ResumeBuilderPage.jsx", import.meta.url), "utf8");
  assert.match(builderSource, /<button[\s\S]*?aria-haspopup="dialog"[\s\S]*?Analyze Resume/u);
  assert.match(builderSource, /<ResumeAnalyzerDialog[\s\S]*?resumeBuilder=\{builder\}/u);
  assert.doesNotMatch(appSource, /to: "\/resume-analyzer"/u);
  assert.match(appSource, /<Navigate replace to="\/resume-builder" \/>\} path="\/resume-analyzer"/u);
});

test("analyzer dialog offers comparison inputs and uses a populated current draft", async () => {
  const vite = await createServer({ appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
  try {
    const { default: ResumeAnalyzerDialog } = await vite.ssrLoadModule("/src/components/ResumeAnalyzerDialog.jsx");
    const markup = renderToStaticMarkup(
      React.createElement(ResumeAnalyzerDialog, {
        resumeBuilder: { draft: { skills: ["React"], projects: [{ name: "Dashboard", highlights: ["Built a React dashboard."] }] } },
        userProfile: {},
      }),
    );

    assert.match(markup, /role="dialog"/u);
    assert.match(markup, /aria-modal="true"/u);
    assert.match(markup, /<h2 id="resume-analyzer-dialog-title">Analyze Resume<\/h2>/u);
    assert.match(markup, /aria-pressed="true"[^>]*>[^]*?Current draft/u);
    assert.match(markup, /Your current draft is ready/u);
    assert.match(markup, /Job description/u);
    assert.match(markup, /Check Skill Gaps/u);
  } finally {
    await vite.close();
  }
});

test("analyzer dialog prompts for an upload when the builder has no content", async () => {
  const vite = await createServer({ appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
  try {
    const { default: ResumeAnalyzerDialog } = await vite.ssrLoadModule("/src/components/ResumeAnalyzerDialog.jsx");
    const markup = renderToStaticMarkup(
      React.createElement(ResumeAnalyzerDialog, { resumeBuilder: { draft: {} }, userProfile: {} }),
    );

    assert.match(markup, /Upload resume/u);
    assert.match(markup, /aria-label="Upload resume"/u);
    assert.doesNotMatch(markup, /Your current draft is ready/u);
  } finally {
    await vite.close();
  }
});
