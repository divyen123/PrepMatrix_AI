import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("renders an accessible loading state without exposing parent PIN fields", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { default: KidsPerformanceSettings } = await vite.ssrLoadModule(
      "/src/components/kids/KidsPerformanceSettings.jsx",
    );
    const markup = renderToStaticMarkup(React.createElement(KidsPerformanceSettings, {
      userProfile: { academicLevel: "Primary School", grade: "Class 2" },
    }));

    assert.match(markup, /aria-busy="true"/u);
    assert.match(markup, /role="status"/u);
    assert.match(markup, /Loading parent controls/u);
    assert.doesNotMatch(markup, /type="password"/u);
    assert.doesNotMatch(markup, /pinHash/u);
  } finally {
    await vite.close();
  }
});

test("renders child experience choices as accessible on and off switches", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { KidsExperienceSwitch } = await vite.ssrLoadModule(
      "/src/components/kids/KidsPerformanceSettings.jsx",
    );
    const enabledMarkup = renderToStaticMarkup(React.createElement(KidsExperienceSwitch, {
      checked: true,
      label: "Read questions aloud",
      onChange: () => {},
    }));
    const disabledMarkup = renderToStaticMarkup(React.createElement(KidsExperienceSwitch, {
      checked: false,
      label: "Show countdown to child",
      onChange: () => {},
    }));

    assert.match(enabledMarkup, /role="switch"/u);
    assert.match(enabledMarkup, /aria-label="Read questions aloud"/u);
    assert.match(enabledMarkup, /checked=""/u);
    assert.match(enabledMarkup, />On</u);
    assert.match(disabledMarkup, /role="switch"/u);
    assert.match(disabledMarkup, /aria-label="Show countdown to child"/u);
    assert.doesNotMatch(disabledMarkup, /checked=""/u);
    assert.match(disabledMarkup, />Off</u);
  } finally {
    await vite.close();
  }
});
