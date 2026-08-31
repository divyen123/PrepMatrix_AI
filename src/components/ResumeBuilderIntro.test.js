import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("renders an accessible, non-blocking Resume Builder status intro", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { default: ResumeBuilderIntro } = await vite.ssrLoadModule(
      "/src/components/ResumeBuilderIntro.jsx",
    );
    const markup = renderToStaticMarkup(React.createElement(ResumeBuilderIntro, {
      phase: "playing",
    }));

    assert.match(markup, /role="status"/u);
    assert.match(markup, /aria-live="polite"/u);
    assert.match(markup, /aria-busy="true"/u);
    assert.match(markup, /aria-labelledby="resume-builder-intro-title"/u);
    assert.match(markup, /aria-describedby="resume-builder-intro-description"/u);
    assert.match(markup, /Career workspace/u);
    assert.match(markup, /Build your story\. Present it with confidence\./u);
    assert.match(markup, /Preparing Resume Builder/u);
    assert.doesNotMatch(markup, /role="dialog"|autofocus|<button/u);
  } finally {
    await vite.close();
  }
});

test("provides the same staged choreography, responsive layout, and reduced-motion fallback", () => {
  const stylesheet = readFileSync(
    new URL("../pages/ResumeBuilderPage.css", import.meta.url),
    "utf8",
  );

  assert.match(stylesheet, /\.resume-builder-intro\s*\{[\s\S]*?min-height:/u);
  assert.match(stylesheet, /resume-builder-intro-mark-in/u);
  assert.match(stylesheet, /resume-builder-intro-copy-in/u);
  assert.match(
    stylesheet,
    /\.resume-builder-intro__eyebrow > span\s*\{[\s\S]*?animation-delay:\s*520ms/u,
  );
  assert.match(
    stylesheet,
    /\.resume-builder-intro h1 > span\s*\{[\s\S]*?animation-delay:\s*700ms/u,
  );
  assert.match(stylesheet, /\.resume-builder-page-entry\s*\{[\s\S]*?resume-builder-content-in/u);
  assert.match(stylesheet, /body\.has-bg-image \.resume-builder-intro__mark/u);
  assert.match(stylesheet, /@media \(max-width: 640px\)[\s\S]*?\.resume-builder-intro__mark/u);
  assert.match(
    stylesheet,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.resume-builder-intro__orbit[\s\S]*?animation:\s*none !important/u,
  );
});
