import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("keeps language controls behind Parent Corner in the Play and Learn hero", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { KidsLearningHeroToolbar } = await vite.ssrLoadModule(
      "/src/pages/KidsLearningPage.jsx",
    );
    const markup = renderToStaticMarkup(React.createElement(KidsLearningHeroToolbar, {
      copy: {
        loading: "Syncing progress",
        offline: "Offline",
        parentCorner: "Parent Corner",
        synced: "Progress synced",
      },
      onOpenParentCorner: () => {},
      syncStatus: "synced",
    }));

    assert.match(markup, /Progress synced/u);
    assert.match(markup, /aria-label="Parent Corner"/u);
    assert.match(markup, />Parent Corner</u);
    assert.doesNotMatch(markup, /kids-language-switch/u);
    assert.doesNotMatch(markup, /aria-pressed/u);
    assert.doesNotMatch(markup, />EN</u);
  } finally {
    await vite.close();
  }
});
