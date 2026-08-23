import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("renders the interactive dog companion without the legacy fox emoji", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { default: KidsPetTutor } = await vite.ssrLoadModule(
      "/src/components/kids/KidsPetTutor.jsx",
    );
    const markup = renderToStaticMarkup(React.createElement(KidsPetTutor, {
      audioEnabled: true,
      message: "Matching · Question 2/5",
      speechMessage: "Match each animal to its home.",
    }));

    assert.match(markup, /kids-pet-sprite/u);
    assert.match(markup, /aria-label="Play with your dog companion"/u);
    assert.match(markup, /aria-label="Read the question aloud"/u);
    assert.match(markup, /Matching · Question 2\/5/u);
    assert.ok(markup.indexOf("kids-pet-bubble") < markup.indexOf("kids-pet-avatar"));
    assert.doesNotMatch(markup, /🦊/u);
  } finally {
    await vite.close();
  }
});

test("keeps the page and pet surfaces transparent with audited crop offsets", async () => {
  const cssUrl = new URL("../../../src/pages/KidsLearningPage.css", import.meta.url);
  const css = await readFile(cssUrl, "utf8");

  assert.match(css, /\.kids-learning-page \{[\s\S]*?background: transparent;/u);
  assert.match(
    css,
    /body \.kids-learning-page button\.kids-pet-avatar \{[\s\S]*?background: none !important;[\s\S]*?backdrop-filter: none !important;[\s\S]*?box-shadow: none !important;/u,
  );
  assert.match(css, /button\.kids-pet-avatar::after \{[\s\S]*?content: none !important;/u);
  assert.match(css, /background-position: 0\.8929% 39\.2113%/u);
  assert.match(css, /background-position: 15\.9598% 67\.1131%/u);
  assert.match(css, /clip-path: inset\(0 0 10px\)/u);
  assert.doesNotMatch(css, /\/\* Fox tutor \*\//u);
});

test("ships the dog sprite atlas as a real RGBA PNG", async () => {
  const spriteUrl = new URL("../../../public/assets/kids/dog-companion-spritesheet.png", import.meta.url);
  const png = await readFile(spriteUrl);

  assert.equal(png.toString("hex", 0, 8), "89504e470d0a1a0a");
  assert.equal(png.toString("ascii", 12, 16), "IHDR");
  assert.equal(png.readUInt32BE(16), 1024);
  assert.equal(png.readUInt32BE(20), 1536);
  assert.equal(png[25], 6);
});
