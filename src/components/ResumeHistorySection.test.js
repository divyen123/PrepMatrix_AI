import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const entries = [
  {
    id: "resume-ada",
    name: "Ada Lovelace",
    generatedAt: "2026-08-08T09:00:00.000Z",
    draft: {
      personal: {
        fullName: "Ada Lovelace",
        headline: "Computing pioneer",
        email: "ada@example.com",
      },
    },
    layout: { template: "modern" },
  },
  {
    id: "resume-grace",
    name: "Grace Hopper",
    headline: "Compiler pioneer",
    generatedAt: "2026-08-07T09:00:00.000Z",
    layout: { template: "classic" },
  },
];

test("renders an accessible horizontal resume history with selection and delete controls", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { default: ResumeHistorySection } = await vite.ssrLoadModule(
      "/src/components/ResumeHistorySection.jsx",
    );
    const markup = renderToStaticMarkup(React.createElement(ResumeHistorySection, {
      entries,
      selectedId: "resume-ada",
    }));

    assert.match(markup, /aria-labelledby="resume-history-title"/u);
    assert.match(markup, /id="resume-history-title">Resume history/u);
    assert.match(markup, /aria-label="2 saved resumes"/u);
    assert.match(markup, /Search resume history/u);
    assert.match(markup, /aria-label="Delete all resume history"/u);
    assert.match(markup, /id="resume-history-list"/u);
    assert.match(markup, /Load Ada Lovelace from resume history/u);
    assert.match(markup, /Delete Ada Lovelace from resume history/u);
    assert.match(markup, /aria-pressed="true"/u);
    assert.match(markup, /Computing pioneer/u);
    assert.match(markup, /Modern/u);
    assert.match(markup, /Grace Hopper/u);
    assert.match(markup, /Compiler pioneer/u);
  } finally {
    await vite.close();
  }
});

test("renders loading, error, and empty history states", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { default: ResumeHistorySection } = await vite.ssrLoadModule(
      "/src/components/ResumeHistorySection.jsx",
    );
    const loadingMarkup = renderToStaticMarkup(React.createElement(ResumeHistorySection, {
      loading: true,
    }));
    const errorMarkup = renderToStaticMarkup(React.createElement(ResumeHistorySection, {
      error: "Please try again.",
      onRetry: () => undefined,
    }));
    const emptyMarkup = renderToStaticMarkup(React.createElement(ResumeHistorySection));

    assert.match(loadingMarkup, /Loading resume history/u);
    assert.match(loadingMarkup, /role="status"/u);
    assert.match(errorMarkup, /Resume history is unavailable/u);
    assert.match(errorMarkup, /Please try again\./u);
    assert.match(errorMarkup, /> Retry</u);
    assert.match(emptyMarkup, /No generated resumes yet/u);
    assert.match(emptyMarkup, /Generate a PDF to save your first editable resume version here\./u);
  } finally {
    await vite.close();
  }
});
