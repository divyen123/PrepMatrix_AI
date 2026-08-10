import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("renders a fully locked, accessible mastery map with fullscreen access", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const {
      default: LearningMasteryMap,
    } = await vite.ssrLoadModule(
      "/src/components/LearningMasteryMap.jsx",
    );
    const {
      getMasteryMapInteractionProps,
      MASTERY_STATUS_META,
    } = await vite.ssrLoadModule(
      "/src/components/LearningMasteryMap.config.js",
    );
    const notebook = {
      id: "generated-notebook",
      title: "Data Analytics",
      subjectName: "Data Analytics",
      chapters: [{
        id: "chapter-1",
        title: "Foundations",
        topics: [{ id: "topic-1", title: "Descriptive statistics", subtopics: [] }],
      }],
    };

    const markup = renderToStaticMarkup(React.createElement(LearningMasteryMap, {
      notebook,
      plannerByNodeId: new Map(),
      progressByNodeId: new Map(),
      selectedNodeId: "chapter-1",
    }));

    assert.match(markup, /mastery-flow-shell is-locked/u);
    assert.match(markup, /Mastery map interaction controls/u);
    assert.match(markup, /Unlock mastery map interactions/u);
    assert.match(markup, /Open mastery map fullscreen/u);
    assert.doesNotMatch(markup, /Zoom In/u);
    assert.doesNotMatch(markup, /Zoom Out/u);
    assert.doesNotMatch(markup, /react-flow__node[^"]*\bdraggable\b/u);
    assert.doesNotMatch(markup, /react-flow__minimap/u);
    assert.doesNotMatch(markup, /mastery-flow-hint/u);

    assert.deepEqual(Object.keys(MASTERY_STATUS_META), [
      "new",
      "ready",
      "learning",
      "learned",
      "review_due",
      "mastered",
    ]);
    assert.equal(new Set(
      Object.values(MASTERY_STATUS_META).map((status) => status.color),
    ).size, 6);

    const locked = getMasteryMapInteractionProps(false);
    [
      "autoPanOnNodeDrag",
      "autoPanOnNodeFocus",
      "autoPanOnSelection",
      "edgesFocusable",
      "elementsSelectable",
      "nodesDraggable",
      "nodesFocusable",
      "panOnDrag",
      "panOnScroll",
      "preventScrolling",
      "selectionOnDrag",
      "zoomOnDoubleClick",
      "zoomOnPinch",
      "zoomOnScroll",
    ].forEach((key) => assert.equal(locked[key], false, `${key} should be disabled while locked`));
    assert.equal(locked.disableKeyboardA11y, true);
    assert.equal(locked.panActivationKeyCode, null);
    assert.equal(locked.selectionKeyCode, null);
    assert.equal(locked.zoomActivationKeyCode, null);

    const unlocked = getMasteryMapInteractionProps(true);
    assert.equal(unlocked.nodesDraggable, true);
    assert.equal(unlocked.nodesFocusable, true);
    assert.equal(unlocked.panOnDrag, true);
    assert.equal(unlocked.zoomOnPinch, true);
    assert.equal(unlocked.zoomOnScroll, true);
    assert.equal(unlocked.disableKeyboardA11y, false);
  } finally {
    await vite.close();
  }
});

test("uses six restrained status tones and a dark glass notebook node", async () => {
  const css = await readFile(new URL("./LearningMasteryMap.css", import.meta.url), "utf8");
  const tones = Array.from(css.matchAll(
    /--mastery-tone-(?:new|ready|learning|learned|review|mastered):\s*([^;]+);/gu,
  )).map((match) => match[1].trim());

  assert.equal(tones.length, 6);
  assert.equal(new Set(tones).size, 6);
  assert.match(css, /\.mastery-flow-node\.is-notebook\s*\{[\s\S]*?var\(--surface-strong\)/u);
  assert.doesNotMatch(
    css,
    /\.mastery-flow-node\.is-notebook\s*\{[\s\S]*?linear-gradient\(145deg,\s*var\(--accent\)/u,
  );
  assert.match(css, /\.mastery-flow-shell\.is-fullscreen/u);
  assert.match(css, /\.mastery-flow-shell\.is-locked \.react-flow__node\s*\{\s*pointer-events:\s*none;/u);
});
