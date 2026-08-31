import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const pageSource = readFileSync(new URL("./ResumeBuilderPage.jsx", import.meta.url), "utf8");
const stylesheet = readFileSync(new URL("./ResumeBuilderPage.css", import.meta.url), "utf8");

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

test("uses an accessible two-column name-only template selector", () => {
  const selectorStart = pageSource.indexOf('className="resume-template-grid"');
  const selectorEnd = pageSource.indexOf("\n              </div>", selectorStart);
  const selectorSource = pageSource.slice(selectorStart, selectorEnd);
  const gridRules = [...stylesheet.matchAll(/\.resume-template-grid\s*\{([^}]*)\}/gu)]
    .map((match) => match[1]);

  assert.ok(selectorStart >= 0);
  assert.match(selectorSource, /RESUME_TEMPLATES\.map/u);
  assert.match(selectorSource, /role="group" aria-label="Resume templates"/u);
  assert.match(selectorSource, /<strong>\{template\.label\}<\/strong>/u);
  assert.match(selectorSource, /aria-pressed=\{layout\.template === template\.id\}/u);
  assert.doesNotMatch(selectorSource, /<small|template\.description|resume-template-mini/u);
  assert.ok(
    gridRules.some((rule) => /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/u.test(rule)),
  );
  assert.ok(gridRules.every((rule) => !/grid-template-columns:\s*1fr/u.test(rule)));
});

test("provides a distinct live-preview modifier for every premium template", () => {
  ["executive", "minimal", "editorial", "signature", "horizon"].forEach((template) => {
    assert.match(stylesheet, new RegExp(`\\.resume-paper--${template}\\b`, "u"));
  });
});

test("gates the workspace intro on both initial resume requests and reveals the ready page", () => {
  assert.match(pageSource, /<ResumeBuilderIntro phase=\{introState\.phase\}/u);
  assert.match(pageSource, /loadResumeHistory\(\)\.finally\([\s\S]*?history_settled/u);
  assert.match(pageSource, /getResumeBuilderStatus[\s\S]*?\.finally\(\(\) => \{[\s\S]*?quota_settled/u);
  assert.match(pageSource, /type: "minimum_elapsed"/u);
  assert.match(pageSource, /type: "exit_finished"/u);
  assert.match(pageSource, /introActive \? "is-entry-loading" : "resume-builder-page-entry"/u);
  assert.match(stylesheet, /\.resume-builder-page\.is-entry-loading\s*\{[\s\S]*?display:\s*none/u);
});
