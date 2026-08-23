import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
    const pageSource = await readFile(new URL("./KidsLearningPage.jsx", import.meta.url), "utf8");
    const gameRunnerSource = await readFile(new URL("../components/kids/KidsGameRunner.jsx", import.meta.url), "utf8");
    assert.match(pageSource, /<KidsPetTutor[\s\S]*?revealBubble[\s\S]*?showcaseAllActions[\s\S]*?\/>/u);
    assert.doesNotMatch(gameRunnerSource, /showcaseAllActions/u);
  } finally {
    await vite.close();
  }
});

test("keeps the game timer in normal flow away from the question counter", async () => {
  const cssUrl = new URL("./KidsLearningPage.css", import.meta.url);
  const css = await readFile(cssUrl, "utf8");

  assert.match(css, /\.kids-learning-page\.is-playing \{[^}]*display: grid;/u);
  assert.match(
    css,
    /\.kids-floating-timer \{[^}]*position: static;[^}]*justify-self: end;[^}]*margin-right:/u,
  );
  const timerRule = css.match(/\.kids-floating-timer \{([^}]*)\}/u)?.[1] || "";
  assert.doesNotMatch(
    timerRule,
    /(?:^|\r?\n)\s*(?:position:\s*fixed|top:|right:)/u,
  );
});
