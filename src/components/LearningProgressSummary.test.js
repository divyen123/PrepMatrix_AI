import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { parseFragment } from "parse5";
import { createServer } from "vite";
import {
  completeLearningSession,
  getLearningInsights,
  markLearningNodeLearned,
  normalizeLearningState,
  recordLearningAttempt,
  startLearningSession,
} from "../utils/learningMastery.js";

const NOW = "2026-08-05T12:00:00.000Z";

function descendants(node, predicate) {
  const children = node.childNodes || [];
  return children.flatMap((child) => [
    ...(predicate(child) ? [child] : []),
    ...descendants(child, predicate),
  ]);
}

function attribute(node, name) {
  return node.attrs?.find((entry) => entry.name === name)?.value;
}

function textContent(node) {
  return node.nodeName === "#text"
    ? node.value
    : (node.childNodes || []).map(textContent).join("");
}

function metricValues(markup) {
  return Object.fromEntries(descendants(parseFragment(markup), (node) => (
    node.tagName === "article"
    && attribute(node, "class")?.split(" ").includes("learning-insights-metric")
  )).map((node) => {
    const label = node.childNodes.filter((child) => child.tagName === "span").at(-1);
    const value = node.childNodes.find((child) => child.tagName === "strong");
    return [textContent(label).trim(), textContent(value).trim()];
  }));
}

function links(markup) {
  return descendants(parseFragment(markup), (node) => node.tagName === "a");
}

function notebookWithCurrentProgress() {
  const notebook = {
    id: "notebook-data",
    subjectName: "Data Structures",
    title: "Data Structures Notebook",
    chapters: [{
      id: "chapter-arrays",
      title: "Arrays",
      topics: [
        { id: "topic-traversal", title: "Array traversal", subtopics: [] },
        { id: "topic-sorting", title: "Array sorting", subtopics: [] },
        { id: "topic-search", title: "Array search", subtopics: [] },
        { id: "topic-resizing", title: "Array resizing", subtopics: [] },
      ],
    }],
  };
  let state = normalizeLearningState({}, { notebook, now: NOW });
  state = markLearningNodeLearned(state, "topic-traversal", {
    notebook,
    now: "2026-08-01T10:00:00.000Z",
  });

  for (const recall of [
    { nodeId: "topic-sorting", score: 82, confidence: 4, start: "10:00", end: "11:05" },
    { nodeId: "topic-search", score: 100, confidence: 5, start: "11:10", end: "11:26" },
  ]) {
    const startedAt = `2026-08-05T${recall.start}:00.000Z`;
    const completedAt = `2026-08-05T${recall.end}:00.000Z`;
    state = startLearningSession(state, {
      id: `recall-${recall.nodeId}`,
      notebookId: notebook.id,
      subjectName: notebook.subjectName,
      mode: "recall",
      nodeIds: [recall.nodeId],
    }, { notebook, now: startedAt });
    state = recordLearningAttempt(state, {
      nodeId: recall.nodeId,
      kind: "mastery_check",
      score: recall.score,
      correct: true,
      confidence: recall.confidence,
      responseSummary: "Recalled and compared with the notebook reference.",
    }, { notebook, now: completedAt });
    state = completeLearningSession(state, {
      nodeIds: [recall.nodeId],
    }, { notebook, now: completedAt });
  }

  // Old saved fields must not bring retired misconception/accuracy cards back.
  state.nodes["topic-traversal"].misconceptions = [{
    id: "legacy-array-mistake",
    label: "An old misconception record",
    createdAt: "2026-08-01T10:00:00.000Z",
  }];
  return { ...notebook, learningState: state };
}

test("notebook progress summary reflects current preparation and preserves older snapshots", async (t) => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { default: LearningProgressSummary } = await vite.ssrLoadModule(
      "/src/components/LearningProgressSummary.jsx",
    );
    const render = (props) => renderToStaticMarkup(React.createElement(
      MemoryRouter,
      null,
      React.createElement(LearningProgressSummary, {
        title: "Notebook preparation progress",
        ...props,
      }),
    ));

    await t.test("shows notebook coverage, durable progress, reviews, and completed study time", () => {
      const insights = getLearningInsights([notebookWithCurrentProgress()], { now: NOW });
      assert.equal(insights.unresolvedMisconceptionCount, 1);
      assert.equal(insights.accuracy, 100);
      const markup = render({ insights });

      assert.deepEqual(metricValues(markup), {
        Notebooks: "1",
        "Topics learned": "3/4",
        "Learning coverage": "75%",
        "Topics mastered": "1",
        "Review due": "1",
        "Study time": "1h 21m",
      });
      assert.match(markup, /Notebook preparation progress/u);
      assert.doesNotMatch(markup, /Practice accuracy|Open misconceptions|Guided learning|verified mastery/iu);
      const notebookLink = links(markup).find((node) => textContent(node).includes("Open notebook preparation"));
      assert.ok(notebookLink);
      assert.equal(attribute(notebookLink, "href"), "/learn#notebook-preparation");
    });

    await t.test("keeps a saved notebook with no generated topics visible at zero coverage", () => {
      const insights = getLearningInsights([{ id: "notebook-empty", title: "New notebook", chapters: [] }], { now: NOW });
      assert.deepEqual(metricValues(render({ insights })), {
        Notebooks: "1",
        "Topics learned": "0/0",
        "Learning coverage": "0%",
        "Topics mastered": "0",
        "Review due": "0",
        "Study time": "0m",
      });
    });

    await t.test("preserves learned counts in an older archive without inventing a denominator", () => {
      const markup = render({
        historical: true,
        insights: {
          notebookCount: 2,
          learnedTopicCount: 3,
          masteredTopicCount: 1,
          reviewDueCount: 1,
          studyMinutes: 60,
          accuracy: 84,
          unresolvedMisconceptionCount: 5,
        },
      });
      assert.deepEqual(metricValues(markup), {
        Notebooks: "2",
        "Topics learned": "3",
        "Learning coverage": "—",
        "Topics mastered": "1",
        "Review due": "1",
        "Study time": "1h",
      });
      assert.equal(links(markup).length, 0);
      assert.doesNotMatch(markup, /Practice accuracy|Open misconceptions/u);
    });

    await t.test("loading describes notebook and recall progress instead of showing stale metrics", () => {
      const markup = render({ loading: true, insights: { notebookCount: 2, learnedTopicCount: 8 } });
      assert.match(markup, /role="status"/u);
      assert.match(markup, /aria-live="polite"/u);
      assert.match(textContent(parseFragment(markup)), /notebook/iu);
      assert.match(textContent(parseFragment(markup)), /recall/iu);
      assert.deepEqual(metricValues(markup), {});
      assert.doesNotMatch(markup, /mastery checks|guided topic/iu);
    });

    await t.test("an unavailable notebook request exposes its error and a retry action", () => {
      const markup = render({
        error: "Saved notebooks could not be loaded.",
        onRetry() {},
        insights: { notebookCount: 2 },
      });
      assert.match(markup, /role="alert"/u);
      assert.match(markup, /Saved notebooks could not be loaded\./u);
      const retry = descendants(parseFragment(markup), (node) => node.tagName === "button");
      assert.equal(retry.length, 1);
      assert.equal(attribute(retry[0], "type"), "button");
      assert.match(textContent(retry[0]), /Retry/iu);
      assert.deepEqual(metricValues(markup), {});
    });

    await t.test("empty current and historical views explain notebook preparation with appropriate actions", () => {
      const current = render({ insights: getLearningInsights([], { now: NOW }) });
      const archived = render({ historical: true, insights: { notebookCount: 0 } });
      assert.deepEqual(metricValues(current), {});
      assert.deepEqual(metricValues(archived), {});
      assert.match(textContent(parseFragment(current)), /notebook/iu);
      assert.match(textContent(parseFragment(archived)), /no .*notebook|no saved notebook/iu);
      assert.ok(links(current).length > 0);
      assert.ok(links(current).every((node) => attribute(node, "href") === "/learn#notebook-preparation"));
      assert.equal(links(archived).length, 0);
      assert.doesNotMatch(current, /guided topic|pass a mastery check/iu);
    });
  } finally {
    await vite.close();
  }
});
