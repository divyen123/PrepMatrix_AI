import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const cardSource = readFileSync(
  new URL("./components/PlacementPrepTopicCard.jsx", import.meta.url),
  "utf8",
);
const learningPageSource = readFileSync(
  new URL("./pages/StartLearningPage.jsx", import.meta.url),
  "utf8",
);
const learningStyles = readFileSync(
  new URL("./pages/StartLearningPage.css", import.meta.url),
  "utf8",
);
const codeMatrixPageSource = readFileSync(
  new URL("./pages/CodeMatrixPage.jsx", import.meta.url),
  "utf8",
);
const codeMatrixStyles = readFileSync(
  new URL("./pages/CodeMatrixPage.css", import.meta.url),
  "utf8",
);

function cardProps(topic, overrides = {}) {
  return {
    codeMatrixAvailable: true,
    codingRelevant: true,
    getActionTarget: (_topic, item, kind, index) => ({
      explanation: "Try it, test it, and explain the result.",
      id: `${kind}-${index}`,
      metadata: { codingRelevant: true },
      title: String(item?.title || item?.question || item || "Practice"),
    }),
    getNoteOptions: () => ({}),
    index: 0,
    isSaving: () => false,
    onAddToPlanner: () => {},
    onAskAI: () => {},
    onCode: () => {},
    onSave: () => {},
    topic,
    ...overrides,
  };
}

test("shows one CodeMatrix action for a coding topic and hides it when unavailable", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { default: PlacementPrepTopicCard } = await vite.ssrLoadModule(
      "/src/components/PlacementPrepTopicCard.jsx",
    );
    const topic = {
      id: "queues",
      title: "Queues",
      explanation: "Implement the queue data structure and analyze its complexity.",
      practiceSteps: [{ id: "queue-java", title: "Implement a queue in Java" }],
    };
    const visibleMarkup = renderToStaticMarkup(
      React.createElement(PlacementPrepTopicCard, cardProps(topic)),
    );
    const unavailableMarkup = renderToStaticMarkup(
      React.createElement(PlacementPrepTopicCard, cardProps(topic, { codeMatrixAvailable: false })),
    );
    const nonCodingMarkup = renderToStaticMarkup(
      React.createElement(PlacementPrepTopicCard, cardProps({
        id: "communication",
        title: "Professional communication",
        explanation: "Explain your experience clearly.",
      }, { codingRelevant: false })),
    );

    assert.equal((visibleMarkup.match(/>Code it yourself</gu) || []).length, 1);
    assert.match(visibleMarkup, /class="learning-career-code-action"/u);
    assert.match(visibleMarkup, /Code Queues yourself in CodeMatrix/u);
    assert.doesNotMatch(unavailableMarkup, /Code it yourself/u);
    assert.doesNotMatch(nonCodingMarkup, /Code it yourself/u);
  } finally {
    await vite.close();
  }
});

test("opens placement code in the shared popup and keeps the controls compact and theme-readable", () => {
  const renderActionsStart = cardSource.indexOf("const renderActions =");
  const renderActionsEnd = cardSource.indexOf("const questions =", renderActionsStart);
  const sharedActions = cardSource.slice(renderActionsStart, renderActionsEnd);
  const handoffEffectStart = codeMatrixPageSource.indexOf("if (!ready || !activeLaunch) return;");
  const handoffEffectEnd = codeMatrixPageSource.indexOf("const run = useCallback", handoffEffectStart);
  const handoffEffect = codeMatrixPageSource.slice(handoffEffectStart, handoffEffectEnd);

  assert.ok(renderActionsStart >= 0 && renderActionsEnd > renderActionsStart);
  assert.doesNotMatch(sharedActions, /Code it yourself/u);
  assert.match(cardSource, /className="learning-career-code-action"/u);
  assert.match(learningPageSource, /buildPlacementCodeMatrixHandoff\(/u);
  assert.match(
    learningPageSource,
    /onOpenCodeMatrix\(handoff\)/u,
  );
  assert.doesNotMatch(learningPageSource, /navigate\(CODE_MATRIX_PATH, \{ state: \{ placementCodeMatrix: handoff \} \}\)/u);
  assert.match(learningPageSource, /onCode=\{openPlacementItemInCodeMatrix\}/u);

  assert.ok(handoffEffectStart >= 0 && handoffEffectEnd > handoffEffectStart);
  assert.match(handoffEffect, /if \(sessionMode\) \{[\s\S]*?setSessionDrafts\(\{[\s\S]*?\[activeLaunch\.language\]: activeLaunch\.code/u);
  assert.match(handoffEffect, /else if \(workspace\.language !== activeLaunch\.language\) \{[\s\S]*?update\(\{ language: activeLaunch\.language \}\)/u);
  assert.doesNotMatch(handoffEffect, /run\(/u);
  assert.match(
    codeMatrixPageSource,
    /const setupVisible = !embedded && \(showSetup \|\| \([\s\S]*?!activeLaunch/u,
  );
  assert.match(codeMatrixPageSource, /className="cmx-placement-handoff"/u);
  assert.match(codeMatrixPageSource, /\{!embedded && <footer className="cmx-footnote"/u);

  assert.match(
    learningStyles,
    /body \.learning-career-code-action\s*\{[\s\S]*?min-height:\s*32px;[\s\S]*?color:\s*var\(--text\) !important;[\s\S]*?box-shadow:\s*none !important;[\s\S]*?-webkit-text-fill-color:\s*currentColor !important;/u,
  );
  assert.match(
    learningStyles,
    /body \.learning-career-code-action::after\s*\{[\s\S]*?content:\s*none !important;/u,
  );
  assert.match(
    learningStyles,
    /body\.has-bg-image \.learning-page \.learning-career-code-action,[\s\S]*?background:\s*#111a24 !important;[\s\S]*?-webkit-text-fill-color:\s*#f7fafc !important;/u,
  );
  assert.match(
    learningStyles,
    /body \.learning-career-item-actions button\s*\{[\s\S]*?min-height:\s*32px;[\s\S]*?box-shadow:\s*none !important;[\s\S]*?-webkit-text-fill-color:\s*currentColor !important;/u,
  );
  assert.match(
    codeMatrixStyles,
    /\.cmx-placement-handoff\s*\{[\s\S]*?box-shadow:\s*none;/u,
  );
  assert.match(
    codeMatrixStyles,
    /body\.has-bg-image \.cmx-page\s*\{[\s\S]*?--cmx-panel-surface:\s*#111a24;[\s\S]*?--cmx-text:\s*#f7fafc;/u,
  );
});
