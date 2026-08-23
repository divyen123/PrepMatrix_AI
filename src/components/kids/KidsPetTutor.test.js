import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { reduceCompanionBubbleState } from "./kidsPetTutorState.js";
import { KIDS_PET_ACTION_CYCLE, KIDS_PET_ACTION_CYCLE_DURATION_MS } from "./kidsPetActionCycle.js";

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
    assert.ok(markup.indexOf("kids-pet-avatar") < markup.indexOf("kids-pet-bubble"));
    assert.doesNotMatch(markup, /🦊/u);
    assert.doesNotMatch(markup, /is-bubble-revealable/u);

    const heroMarkup = renderToStaticMarkup(React.createElement(KidsPetTutor, {
      audioEnabled: true,
      compact: true,
      message: "Which adventure shall we try today?",
      revealBubble: true,
      showcaseAllActions: true,
    }));
    const bubbleId = heroMarkup.match(/class="kids-pet-bubble" id="([^"]+)"/u)?.[1];

    assert.match(heroMarkup, /is-bubble-revealable/u);
    assert.match(heroMarkup, /is-action-showcase/u);
    assert.match(heroMarkup, /data-action-frame="idle-1"/u);
    assert.match(heroMarkup, /style="--kids-dog-clip:13px 7px 20px 7px;--kids-dog-position:1\.3393% 0%"/u);
    assert.doesNotMatch(heroMarkup, /is-bubble-visible/u);
    assert.match(heroMarkup, /aria-hidden="true"/u);
    assert.match(heroMarkup, /aria-expanded="false"/u);
    assert.match(heroMarkup, /aria-label="Show companion message and play with your dog"/u);
    assert.ok(bubbleId);
    assert.equal(heroMarkup.match(/aria-controls="([^"]+)"/u)?.[1], bubbleId);

    const unsafeShowcaseMarkup = renderToStaticMarkup(React.createElement(KidsPetTutor, {
      message: "Game companion",
      showcaseAllActions: true,
    }));
    assert.doesNotMatch(unsafeShowcaseMarkup, /is-action-showcase/u);

    let bubbleState = "idle";
    bubbleState = reduceCompanionBubbleState(bubbleState, "enter");
    assert.equal(bubbleState, "hover");
    bubbleState = reduceCompanionBubbleState(bubbleState, "leave");
    assert.equal(bubbleState, "idle");
    bubbleState = reduceCompanionBubbleState(bubbleState, "click");
    assert.equal(bubbleState, "pinned");
    bubbleState = reduceCompanionBubbleState(bubbleState, "click");
    assert.equal(bubbleState, "dismissed");
    bubbleState = reduceCompanionBubbleState(bubbleState, "leave");
    assert.equal(bubbleState, "idle");
    bubbleState = reduceCompanionBubbleState(bubbleState, "focus");
    assert.equal(bubbleState, "hover");
    bubbleState = reduceCompanionBubbleState(bubbleState, "blur");
    assert.equal(bubbleState, "idle");
  } finally {
    await vite.close();
  }
});

test("splits time across every audited dog action exactly once", () => {
  assert.equal(KIDS_PET_ACTION_CYCLE.length, 64);
  assert.equal(KIDS_PET_ACTION_CYCLE_DURATION_MS, 41620);
  assert.equal(new Set(KIDS_PET_ACTION_CYCLE.map((frame) => frame.id)).size, 64);
  assert.equal(new Set(KIDS_PET_ACTION_CYCLE.map((frame) => frame.position)).size, 64);
  assert.deepEqual(
    KIDS_PET_ACTION_CYCLE.map(({ row, column }) => `${row}:${column}`),
    Array.from({ length: 64 }, (_, index) => `${Math.floor(index / 8)}:${index % 8}`),
  );
  assert.ok(KIDS_PET_ACTION_CYCLE.every((frame) => frame.durationMs >= 340));
  assert.ok(KIDS_PET_ACTION_CYCLE.every((frame) => /^\d+px \d+px \d+px \d+px$/u.test(frame.clip)));
  assert.ok(KIDS_PET_ACTION_CYCLE.filter((frame) => frame.column === 7).every((frame) => frame.durationMs >= 1040));
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
  assert.match(
    css,
    /\.kids-pet-tutor\.is-bubble-revealable \.kids-pet-bubble \{[^}]*visibility: hidden;[^}]*opacity: 0;[^}]*pointer-events: none;[^}]*transition:/u,
  );
  assert.match(
    css,
    /\.kids-pet-tutor\.is-bubble-revealable\.is-bubble-visible \.kids-pet-bubble \{[^}]*visibility: visible;[^}]*opacity: 1;[^}]*pointer-events: auto;/u,
  );
  assert.match(css, /\.kids-pet-bubble \{[^}]*order: -1;/u);
  assert.match(
    css,
    /\.kids-pet-tutor\.is-action-showcase:not\(\.is-interacting\) \.kids-pet-sprite \{[^}]*clip-path: inset\(var\(--kids-dog-clip, 0\)\);[^}]*background-position: var\(--kids-dog-position, 1\.3393% 0%\);[^}]*kids-dog-action-arrive 180ms[^}]*kids-dog-showcase-motion 3\.6s/u,
  );
  assert.match(css, /@keyframes kids-dog-showcase-motion/u);
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.kids-pet-tutor\.is-action-showcase \.kids-pet-sprite \{[^}]*clip-path: inset\(13px 7px 20px 7px\) !important;[^}]*background-position: 1\.3393% 0% !important;/u,
  );
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
