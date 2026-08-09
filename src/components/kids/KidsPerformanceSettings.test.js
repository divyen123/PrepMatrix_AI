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
