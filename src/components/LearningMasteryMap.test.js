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
        topics: [{
          id: "topic-1",
          title: "Descriptive statistics",
          subtopics: [
            { id: "subtopic-covered", title: "Measures of center" },
            { id: "subtopic-completed", title: "Planner completed concept" },
            { id: "subtopic-assessed", title: "Measures of spread" },
            { id: "subtopic-percentage", title: "Percentage-only evidence" },
          ],
        }, {
          id: "topic-2",
          title: "Probability foundations",
          subtopics: [{ id: "subtopic-pending", title: "Sample spaces" }],
        }, {
          id: "topic-failed",
          title: "Failed review topic",
          subtopics: [{ id: "subtopic-failed", title: "Failed topic detail" }],
        }],
      }],
    };

    const markup = renderToStaticMarkup(React.createElement(LearningMasteryMap, {
      notebook,
      plannerByNodeId: new Map([
        ["topic-1", { isCompleted: true, isScheduled: true }],
        ["subtopic-completed", { isCompleted: true, isScheduled: true }],
      ]),
      progressByNodeId: new Map([
        ["topic-1", {
          learnedAt: "2026-08-08T08:00:00.000Z",
          masteryScore: 79,
          status: "learning",
        }],
        ["subtopic-covered", {
          attempts: [],
          masteryScore: 0,
          status: "ready",
        }],
        ["subtopic-assessed", {
          attempts: [{ score: 0 }],
          masteryScore: 0,
          status: "learning",
        }],
        ["subtopic-percentage", {
          percentage: 82,
          status: "learned",
        }],
        ["topic-2", {
          attempts: [],
          masteryScore: 0,
          status: "ready",
        }],
        ["subtopic-pending", {
          attempts: [],
          masteryScore: 0,
          status: "new",
        }],
        ["topic-failed", {
          attempts: [{ score: 0 }],
          masteryScore: 0,
          status: "review_due",
        }],
        ["subtopic-failed", {
          attempts: [],
          masteryScore: 0,
          status: "ready",
        }],
      ]),
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
    assert.match(markup, /is-topic has-status-learned has-mastery-score/u);
    assert.match(markup, /Completed in planner/u);
    const nodeArticles = Array.from(markup.matchAll(
      /<article class="[^"]*mastery-flow-node[^"]*"[\s\S]*?<\/article>/gu,
    )).map((match) => match[0]);
    const nodeByTitle = (title) => nodeArticles.find((article) => (
      article.includes(`<strong title="${title}">`)
    )) || "";
    const coveredNode = nodeByTitle("Measures of center");
    const completedNode = nodeByTitle("Planner completed concept");
    const assessedNode = nodeByTitle("Measures of spread");
    const percentageNode = nodeByTitle("Percentage-only evidence");
    const pendingNode = nodeByTitle("Sample spaces");
    const failedTopicDetailNode = nodeByTitle("Failed topic detail");
    assert.match(coveredNode, /Measures of center/u);
    assert.match(coveredNode, /has-coverage-only/u);
    assert.match(coveredNode, /has-visual-status-learned/u);
    assert.match(coveredNode, /has-coverage-covered/u);
    assert.match(coveredNode, /--mastery-node-tone:var\(--mastery-tone-learned\)/u);
    assert.match(coveredNode, /Covered by the completed topic; not assessed separately/u);
    assert.match(coveredNode, />Covered<\/b>/u);
    assert.doesNotMatch(coveredNode, /0%/u);
    assert.doesNotMatch(coveredNode, /mastery-flow-node__meter/u);
    assert.match(completedNode, /has-status-learned has-coverage-only/u);
    assert.match(completedNode, /has-visual-status-learned/u);
    assert.match(completedNode, /has-coverage-covered/u);
    assert.match(completedNode, /Completed without a separate mastery assessment/u);
    assert.match(completedNode, />Completed<\/b>/u);
    assert.doesNotMatch(completedNode, /0%/u);
    assert.match(assessedNode, /Measures of spread/u);
    assert.match(assessedNode, /has-mastery-score/u);
    assert.match(assessedNode, /<b>0%<\/b>/u);
    assert.match(assessedNode, /mastery-flow-node__meter/u);
    assert.match(percentageNode, /has-mastery-score/u);
    assert.match(percentageNode, /<b>82%<\/b>/u);
    assert.match(percentageNode, /style="width:82%"/u);
    assert.match(pendingNode, /has-coverage-only/u);
    assert.match(pendingNode, /has-visual-status-ready/u);
    assert.match(pendingNode, /has-coverage-ready/u);
    assert.match(pendingNode, /--mastery-node-tone:var\(--mastery-tone-ready\)/u);
    assert.match(pendingNode, /No separate subtopic assessment yet/u);
    assert.match(pendingNode, />Not assessed<\/b>/u);
    assert.doesNotMatch(pendingNode, /0%/u);
    assert.match(failedTopicDetailNode, />Not assessed<\/b>/u);
    assert.match(failedTopicDetailNode, /has-visual-status-ready/u);
    assert.doesNotMatch(failedTopicDetailNode, />Covered<\/b>/u);

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
  assert.match(css, /\.mastery-flow-node__coverage\s*\{/u);
  assert.match(
    css,
    /\.mastery-flow-node\.has-coverage-only \.mastery-flow-node__coverage\s*\{[\s\S]*?color:\s*var\(--mastery-node-tone\);/u,
  );
});
