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

test("analyzer backdrop and cards use the active background theme", () => {
  const css = readFileSync(new URL("./ResumeAnalyzerDialog.css", import.meta.url), "utf8");
  assert.match(css, /\.resume-analyzer-dialog-backdrop\s*\{[^}]*background: rgba\(0, 0, 0, 0\.38\);/u);
  assert.match(css, /body\.has-bg-image \.resume-analyzer-dialog-backdrop\s*\{[^}]*background: rgba\(0, 0, 0, 0\.58\);/u);
  assert.match(css, /\.resume-analyzer-page\s*\{[^}]*--ra-panel: color-mix\(in srgb, var\(--bg, #ffffff\)[^}]*background: var\(--bg, #ffffff\);/u);
  assert.match(css, /body\.has-bg-image:not\(\.no-glass-cards\) \.resume-analyzer-page\s*\{[^}]*--ra-panel: rgba\(var\(--bg-surface-rgb[^}]*background: color-mix\([^}]*backdrop-filter: blur\(20px\);/u);
  assert.match(css, /body\.has-bg-image\.no-glass-cards \.resume-analyzer-page\s*\{[^}]*--bg-surface-rgb[^}]*backdrop-filter: none;/u);
  assert.doesNotMatch(css, /\.resume-analyzer-dialog-backdrop\s*\{[^}]*background: rgba\(3, 8, 17,/u);
});

test("formatResumeReviewNote and getResumeReviewPriority format notes accurately", async () => {
  const vite = await createServer({ appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
  try {
    const { formatResumeReviewNote, getResumeReviewPriority } = await vite.ssrLoadModule("/src/components/ResumeAnalyzerDialog.jsx");
    const mockFindings = [
      { id: "1", priority: "high", title: "Add measurable impact", suggestion: "Include metrics", evidence: "No metrics found", example: "Increased sales by 20%" },
      { id: "2", priority: "low", title: "Check formatting", suggestion: "Keep fonts consistent" },
    ];
    assert.equal(getResumeReviewPriority(mockFindings), "High");
    assert.equal(getResumeReviewPriority([{ priority: "medium" }]), "Medium");
    assert.equal(getResumeReviewPriority([]), "Low");

    const noteText = formatResumeReviewNote(
      {
        targetRole: "Full stack web developer",
        notShown: [{ skill: "Docker", action: "Add Docker to project highlights" }],
        needsEvidence: [{ skill: "React", action: "Mention where you used React" }],
        matched: [{ skill: "JavaScript" }],
      },
      mockFindings,
    );

    assert.match(noteText, /Target Role: Full stack web developer/u);
    assert.match(noteText, /\[HIGH\] Add measurable impact/u);
    assert.match(noteText, /Suggestion: Include metrics/u);
    assert.match(noteText, /Found: No metrics found/u);
    assert.match(noteText, /Example: Increased sales by 20%/u);
    assert.match(noteText, /Skills to add \/ develop:/u);
    assert.match(noteText, /• Docker - Add Docker to project highlights/u);
    assert.match(noteText, /Skills needing evidence:/u);
    assert.match(noteText, /• React - Mention where you used React/u);
    assert.match(noteText, /Matched skills:/u);
    assert.match(noteText, /• JavaScript/u);
    assert.match(noteText, /Saved from Resume Analyzer\./u);
  } finally {
    await vite.close();
  }
});

test("analyzer dialog renders Save button alongside review results", async () => {
  const vite = await createServer({ appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
  try {
    const { default: ResumeAnalyzerDialog } = await vite.ssrLoadModule("/src/components/ResumeAnalyzerDialog.jsx");
    const markup = renderToStaticMarkup(
      React.createElement(ResumeAnalyzerDialog, {
        initialResults: {
          targetRole: "Full stack web developer",
          findings: [
            { id: "1", priority: "high", title: "Quantify achievements", suggestion: "Add numbers", category: "impact" },
          ],
          requestedSkills: [{ skill: "React" }],
          notShown: [],
          needsEvidence: [],
          matched: [{ skill: "React", action: "Supported" }],
        },
        resumeBuilder: { draft: {} },
        source: "builder",
        userProfile: {},
      }),
    );

    assert.match(markup, /resume-analyzer-save-button/u);
    assert.match(markup, /aria-label="Save review to notes"/u);
    assert.match(markup, /<span>Save<\/span><\/button>/u);
    assert.match(markup, /Where your resume can improve/u);
  } finally {
    await vite.close();
  }
});

test("analyzer dialog has save to notes handler and styling contracts", () => {
  const source = readFileSync(new URL("./ResumeAnalyzerDialog.jsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("./ResumeAnalyzerDialog.css", import.meta.url), "utf8");

  assert.match(source, /handleSaveToNotes/u);
  assert.match(source, /onSaveToNotes/u);
  assert.match(source, /api\.createNote/u);
  assert.match(source, /api\.saveNotes/u);
  assert.match(source, /resume-analyzer-save-button/u);
  assert.match(css, /\.resume-analyzer-results-actions/u);
  assert.match(css, /\.resume-analyzer-save-button/u);
  assert.match(css, /\.resume-analyzer-save-button\.is-saved/u);
});
