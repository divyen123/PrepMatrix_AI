import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { normalizeResumeDraft, normalizeResumeLayout } from "../utils/resumeBuilder.js";

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

test("offers accessible two-column font choices and shares the chosen font with PDF export", () => {
  const selectorStart = pageSource.indexOf('className="resume-font-grid"');
  const selectorEnd = pageSource.indexOf('\n                </div>', selectorStart);
  const selectorSource = pageSource.slice(selectorStart, selectorEnd);
  const paperStyles = stylesheet.slice(
    stylesheet.indexOf(".resume-paper {"),
    stylesheet.indexOf(".resume-preview-actions"),
  );

  assert.ok(selectorStart >= 0);
  assert.match(selectorSource, /role="radiogroup" aria-label="Resume font style"/u);
  assert.match(selectorSource, /RESUME_FONTS\.map/u);
  assert.match(selectorSource, /type="radio"/u);
  assert.match(selectorSource, /updateLayout\(\{ fontFamily: fontOption\.id \}\)/u);
  assert.match(stylesheet, /\.resume-font-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/u);
  assert.match(paperStyles, /font-family:\s*var\(--resume-font-family/u);
  assert.match(paperStyles, /box-sizing:\s*border-box/u);
  assert.match(pageSource, /resume-paper--font-\$\{layout\.fontFamily\}/u);
  assert.match(paperStyles, /\.resume-paper:not\(\.resume-paper--font-template\)\s*\{[\s\S]*?--font-family-base:\s*var\(--resume-font-family\)[\s\S]*?--font-family-display:\s*var\(--resume-font-family\)/u);
  assert.match(paperStyles, /\.resume-paper:not\(\.resume-paper--font-template\)[\s\S]*?font-family:\s*inherit/u);
  assert.doesNotMatch(paperStyles, /color-mix\(in srgb, var\(--resume-accent\)/u);
  assert.match(pageSource, /createResumePdfFromElement\(previewPaperRef\.current/u);
  assert.match(pageSource, /className="resume-pdf-export-surface"/u);
  assert.match(pageSource, /target=\{href\.startsWith\("http"\) \? "_blank"/u);
  assert.match(pageSource, /rel="noopener noreferrer" target="_blank"/u);
});

test("renders Skills and Tools as wrapping columns in the same row", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { ResumePreview } = await vite.ssrLoadModule("/src/pages/ResumeBuilderPage.jsx");
    const markup = renderToStaticMarkup(React.createElement(ResumePreview, {
      draft: normalizeResumeDraft({
        personal: { fullName: "Avery Sharma" },
        skills: ["React", "Accessibility"],
        tools: ["VS Code", "Git", "GitHub"],
      }),
      layout: normalizeResumeLayout(),
    }));
    const skillsHeading = markup.indexOf("<h2>Skills</h2>");
    const toolsHeading = markup.indexOf("<h2>Tools</h2>");
    const experienceHeading = markup.indexOf("<h2>Experience</h2>");

    assert.ok(skillsHeading >= 0);
    assert.ok(toolsHeading > skillsHeading);
    assert.ok(experienceHeading < 0 || toolsHeading < experienceHeading);
    assert.match(markup, /class="resume-paper__skills-tools-row"[\s\S]*?<h2>Skills<\/h2>[\s\S]*?<h2>Tools<\/h2>/u);
    assert.match(markup, />VS Code<\/span>/u);
    assert.match(markup, />GitHub<\/span>/u);
    assert.match(stylesheet, /\.resume-paper__skills-tools-row\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/u);
    assert.match(stylesheet, /\.resume-paper__skills\s*\{[\s\S]*?flex-wrap:\s*wrap/u);
    assert.match(stylesheet, /\.resume-paper__skills span\s*\{[\s\S]*?overflow-wrap:\s*anywhere/u);
    assert.match(pageSource, /label="Tools"[\s\S]*?optional[\s\S]*?tools:\s*parseSkillsInput/u);
    assert.match(pageSource, /placeholder=\{curriculumExamples\.resumeToolsPlaceholder\}/u);
  } finally {
    await vite.close();
  }
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
