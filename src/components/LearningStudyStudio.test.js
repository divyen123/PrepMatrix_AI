import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("renders a generated notebook in the Study Studio", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { default: LearningStudyStudio } = await vite.ssrLoadModule(
      "/src/components/LearningStudyStudio.jsx",
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
          subtopics: [],
        }],
      }],
    };
    const nodes = [
      { id: "root", title: notebook.subjectName, type: "notebook" },
      { id: "chapter-1", title: "Foundations", type: "chapter" },
      {
        id: "topic-1",
        title: "Descriptive statistics",
        type: "topic",
        summary: "Summarize and interpret a dataset.",
        keyPoints: ["Center", "Spread"],
      },
    ];
    const progressByNodeId = new Map([
      ["chapter-1", {
        status: "ready",
        misconceptions: [
          { id: "mean-median", label: "Confuses mean and median" },
          { id: "sample-population", label: "Mixes up samples and populations" },
        ],
      }],
      ["topic-1", { status: "ready" }],
    ]);

    const markup = renderToStaticMarkup(React.createElement(LearningStudyStudio, {
      coachState: { label: "Coach guidance", response: "Use a compact worked example." },
      isSavingNote: () => false,
      nodes,
      notebook,
      progressByNodeId,
      reviewQueue: [],
      selectedNode: nodes[1],
    }));

    assert.match(markup, /Adaptive session/u);
    assert.match(markup, /Foundations/u);
    assert.match(markup, /AI Coach/u);
    assert.match(markup, /Use a compact worked example\./u);
    assert.match(markup, /Save guidance/u);
    assert.match(markup, /learning-studio-coach__controls/u);
    assert.match(markup, /learning-studio-coach__body/u);
    assert.match(markup, /aria-label="Misconception radar"/u);
    assert.match(markup, /aria-label="Saved misconceptions\. Scroll horizontally to review all cards\."/u);
    assert.match(markup, /class="learning-studio-misconceptions__rail" role="region" tabindex="0"/u);
    assert.match(markup, /learning-studio-misconceptions__list/u);
    assert.match(markup, /class="learning-studio-misconceptions__list" role="list"/u);
    assert.equal((markup.match(/role="listitem"/gu) || []).length, 2);
    assert.match(markup, /<p title="Confuses mean and median">Confuses mean and median<\/p>/u);
    assert.match(markup, /aria-label="Resolve Confuses mean and median"/u);
    assert.match(markup, /aria-label="Resolve Mixes up samples and populations"/u);
    assert.ok(
      markup.indexOf("learning-studio-misconceptions") > markup.indexOf("learning-studio-coach"),
      "the misconception radar should render below the AI Coach",
    );
    assert.doesNotMatch(markup, /Focused on/u);
    assert.doesNotMatch(markup, /Review queue/u);
  } finally {
    await vite.close();
  }
});

test("uses theme-aware horizontal support panels and fixed circular radar controls", () => {
  const stylesheet = readFileSync(
    new URL("./LearningStudyStudio.css", import.meta.url),
    "utf8",
  );

  assert.match(stylesheet, /\.learning-studio-sessionbar\s*\{[\s\S]*?var\(--surface\)/u);
  assert.match(stylesheet, /\.learning-studio-coach\s*\{[\s\S]*?grid-column:\s*1\s*\/\s*-1/u);
  assert.match(stylesheet, /\.learning-studio-misconceptions\s*\{[\s\S]*?grid-column:\s*1\s*\/\s*-1/u);
  assert.match(stylesheet, /\.learning-studio-misconceptions__rail\s*\{[\s\S]*?overflow-x:\s*auto[\s\S]*?scrollbar-gutter:\s*stable/u);
  assert.match(stylesheet, /\.learning-studio-misconceptions__list\s*\{[\s\S]*?display:\s*flex[\s\S]*?width:\s*max-content/u);
  assert.match(stylesheet, /\.learning-studio-misconceptions article\s*\{[\s\S]*?aspect-ratio:\s*1\s*\/\s*1[\s\S]*?flex:\s*0\s+0\s+clamp\([\s\S]*?height:\s*clamp\([\s\S]*?overflow:\s*hidden/u);
  assert.match(stylesheet, /\.learning-studio-misconceptions article p\s*\{[\s\S]*?-webkit-line-clamp:\s*4[\s\S]*?max-height:\s*calc\(1\.45em\s*\*\s*4\)[\s\S]*?text-overflow:\s*ellipsis/u);
  assert.match(stylesheet, /\.learning-studio-misconceptions article button\s*\{[\s\S]*?border-radius:\s*50%/u);
  assert.match(stylesheet, /\.learning-studio-misconceptions form button\s*\{[\s\S]*?height:\s*32px[\s\S]*?width:\s*32px/u);
});
