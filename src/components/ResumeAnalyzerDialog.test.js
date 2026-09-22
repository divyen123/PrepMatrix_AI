import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("Resume Builder opens an analyzer dialog instead of a sidebar page", () => {
  const appSource = readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
  const builderSource = readFileSync(new URL("../pages/ResumeBuilderPage.jsx", import.meta.url), "utf8");
  assert.match(builderSource, /<button[\s\S]*?aria-haspopup="dialog"[\s\S]*?resume-preview-analyze-button[\s\S]*?<span>Analyze<\/span>/u);
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
        resumeBuilder: { draft: { personal: { fullName: "Alex Example", headline: "Frontend Engineer" }, skills: ["React"], projects: [{ name: "Dashboard", highlights: ["Built a React dashboard."] }] } },
        userProfile: {},
      }),
    );

    assert.match(markup, /role="dialog"/u);
    assert.match(markup, /aria-modal="true"/u);
    assert.match(markup, /<h2 id="resume-analyzer-dialog-title">Review your resume for a role<\/h2>/u);
    assert.match(markup, /aria-pressed="true"[^>]*>[^]*?Current draft/u);
    assert.match(markup, /Alex Example/u);
    assert.match(markup, /Frontend Engineer/u);
    assert.doesNotMatch(markup, /The comparison uses its skills/u);
    assert.match(markup, /id="resume-analyzer-job-title">Enter a job title or paste its requirements\./u);
    assert.match(markup, /aria-label="Job role or description"/u);
    assert.doesNotMatch(markup, /Resume Builder \/ Resume Analyzer/u);
    assert.match(markup, />\s*Review\s*<\/button>/u);
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
    assert.doesNotMatch(markup, /Alex Example/u);
  } finally {
    await vite.close();
  }
});

test("analyzer stays mounted during its fade-out before closing", () => {
  const source = readFileSync(new URL("./ResumeAnalyzerDialog.jsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("./ResumeAnalyzerDialog.css", import.meta.url), "utf8");
  assert.match(source, /setIsClosing\(true\)/u);
  assert.match(source, /afterClose\?\.\(\);\s*\}, reducedMotion \? 0 : DIALOG_EXIT_MS\)/u);
  assert.match(source, /resume-analyzer-dialog-backdrop\$\{isClosing \? " is-closing"/u);
  assert.match(css, /\.resume-analyzer-dialog-backdrop\.is-closing/u);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/u);
});
