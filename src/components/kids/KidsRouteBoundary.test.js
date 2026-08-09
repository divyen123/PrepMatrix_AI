import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("renders a recoverable Kids screen after a child route failure", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { default: KidsRouteBoundary } = await vite.ssrLoadModule(
      "/src/components/kids/KidsRouteBoundary.jsx",
    );
    const boundary = new KidsRouteBoundary({
      children: React.createElement("p", null, "Adventure"),
    });
    boundary.state = { failed: true, retryKey: 0 };
    const markup = renderToStaticMarkup(boundary.render());

    assert.match(markup, /role="alert"/u);
    assert.match(markup, /Your adventure is safe/u);
    assert.match(markup, /Return to the adventure map/u);
    assert.equal(KidsRouteBoundary.getDerivedStateFromError().failed, true);
  } finally {
    await vite.close();
  }
});
