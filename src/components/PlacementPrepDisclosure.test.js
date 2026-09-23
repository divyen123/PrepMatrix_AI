import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("renders independent Placement Prep rows as closed accessible disclosures", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { default: PlacementPrepDisclosure } = await vite.ssrLoadModule(
      "/src/components/PlacementPrepDisclosure.jsx",
    );
    const markup = renderToStaticMarkup(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(
          PlacementPrepDisclosure,
          { label: "Explain queue complexity" },
          React.createElement("button", null, "Save"),
        ),
        React.createElement(
          PlacementPrepDisclosure,
          { label: "Implement a queue" },
          React.createElement("button", null, "Ask AI"),
        ),
      ),
    );

    assert.equal((markup.match(/aria-expanded="false"/gu) || []).length, 2);
    assert.equal((markup.match(/aria-hidden="true" class="learning-career-item-panel"/gu) || []).length, 2);
    assert.equal((markup.match(/inert=""/gu) || []).length, 2);
    assert.match(markup, /Explain queue complexity/u);
    assert.match(markup, /Implement a queue/u);

    const controlledPanels = [...markup.matchAll(/aria-controls="([^"]+)"/gu)]
      .map((match) => match[1]);
    assert.equal(controlledPanels.length, 2);
    assert.notEqual(controlledPanels[0], controlledPanels[1]);
    controlledPanels.forEach((panelId) => {
      assert.match(markup, new RegExp(`id="${panelId}"`, "u"));
    });
  } finally {
    await vite.close();
  }
});

test("toggles local disclosure state and animates content without a fixed height", () => {
  const componentSource = readFileSync(
    new URL("./PlacementPrepDisclosure.jsx", import.meta.url),
    "utf8",
  );
  const pageSource = readFileSync(
    new URL("../pages/StartLearningPage.jsx", import.meta.url),
    "utf8",
  );
  const cardSource = readFileSync(new URL("./PlacementPrepTopicCard.jsx", import.meta.url), "utf8");
  const stylesheet = readFileSync(
    new URL("../pages/StartLearningPage.css", import.meta.url),
    "utf8",
  );

  assert.match(componentSource, /setIsOpen\(\(current\) => !current\)/u);
  assert.match(componentSource, /aria-controls=\{panelId\}/u);
  assert.match(componentSource, /inert=\{!isOpen\}/u);
  assert.match(pageSource, /<PlacementPrepTopicCard/u);
  assert.equal((cardSource.match(/<PlacementPrepDisclosure/gu) || []).length, 2);
  assert.match(cardSource, /<h5>Interview checks<\/h5>[\s\S]*?<PlacementPrepDisclosure/u);
  assert.match(cardSource, /<h5>Practice next<\/h5>[\s\S]*?<PlacementPrepDisclosure/u);
  assert.doesNotMatch(pageSource, /<details className="learning-career-item-details"/u);

  assert.match(stylesheet, /\.learning-career-item-panel\s*\{[\s\S]*?grid-template-rows:\s*0fr[\s\S]*?opacity:\s*0[\s\S]*?grid-template-rows 300ms/u);
  assert.match(stylesheet, /\.learning-career-item-details\.is-open \.learning-career-item-panel\s*\{[\s\S]*?grid-template-rows:\s*1fr[\s\S]*?opacity:\s*1/u);
  assert.match(stylesheet, /\.learning-career-item-content\s*\{[\s\S]*?min-height:\s*0[\s\S]*?overflow:\s*hidden/u);
  assert.match(stylesheet, /\.learning-career-item-details\.is-open \.learning-career-item-chevron\s*\{[\s\S]*?transform:\s*rotate\(90deg\)/u);
  assert.match(stylesheet, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.learning-page \*[\s\S]*?transition-duration:\s*0\.01ms/u);
  assert.doesNotMatch(stylesheet, /\.learning-career-item-panel\s*\{[\s\S]*?max-height/u);
});

test("PlacementPrepTopicCard does not render Add to planner inside interview checks", async () => {
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
      id: "tcp-ip",
      title: "TCP/IP Network model",
      explanation: "TCP/IP layers and protocol concepts.",
      whyItMatters: "Full stack networking essentials.",
      interviewQuestions: [
        { question: "What are the four layers of the TCP/IP model?" },
      ],
      practiceSteps: [
        { text: "Review the four layers of the TCP/IP suite." },
      ],
    };

    const markup = renderToStaticMarkup(
      React.createElement(PlacementPrepTopicCard, {
        codingRelevant: false,
        codeMatrixAvailable: false,
        topic,
        index: 0,
        getActionTarget: (_topic, item, kind, index) => ({
          id: `placement:${topic.id}:${kind}:${index}`,
          kind,
          title: String(item?.question || item?.text || item),
          explanation: "Answer details here.",
        }),
        getNoteOptions: () => ({}),
        isSaving: () => false,
        onSave: () => {},
        onAskAI: () => {},
        onAddToPlanner: () => {},
      }),
    );

    // Interview checks section should have Save and Ask AI, but NOT Add to planner
    const interviewSection = markup.slice(
      markup.indexOf('aria-label="Interview checks"'),
      markup.indexOf('aria-label="Practice next"'),
    );
    assert.match(interviewSection, /Save/u);
    assert.match(interviewSection, /Ask AI/u);
    assert.doesNotMatch(interviewSection, /Add to planner/u);

    // Practice next section DOES still offer Add to planner
    const practiceSection = markup.slice(markup.indexOf('aria-label="Practice next"'));
    assert.match(practiceSection, /Save/u);
    assert.match(practiceSection, /Ask AI/u);
    assert.match(practiceSection, /Add to planner/u);
  } finally {
    await vite.close();
  }
});

