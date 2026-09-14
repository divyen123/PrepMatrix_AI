import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("all seven guide scenes render useful, accessible controls without browser or network work", async () => {
  const vite = await createServer({ appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
  try {
    const { default: PrepMatrixGuideDemo } = await vite.ssrLoadModule("/src/components/PrepMatrixGuideDemo.jsx");
    const examples = { subject: "Chemistry", chapter: "Atomic structure", topic: "Electron shells", additionalChapters: ["Bonding", "Reactions"] };
    const expected = {
      profile: ["Class 11 · Science", "Subjects", "Materials", "AI"],
      subjects: ["Subject name", "Chapters", "Difficulty", "Add to preview", "Subject library"],
      plan: ["Exam date", "Strategy", "Generate preview", "Day 1", "Day 3"],
      learn: ["Use example source", "Build preview outline", "Add to planner", "Mark as completed"],
      follow: ["Missed yesterday", "Recover backlog", "Sample task completion"],
      revise: ["Notes", "Quiz", "Materials", "Save preview note", "Electron shells"],
      review: ["Atomic structure", "Bonding", "Reactions", "Next focus", "25%"],
    };
    for (const [stepId, labels] of Object.entries(expected)) {
      const markup = renderToStaticMarkup(React.createElement(PrepMatrixGuideDemo, { stepId, examples, profileLabel: "Class 11 · Science" }));
      assert.match(markup, /Watch demo/u, stepId);
      assert.match(markup, /aria-label="Replay demo"/u, stepId);
      assert.match(markup, /role="status"/u, stepId);
      assert.match(markup, /Practice only/u, stepId);
      for (const label of labels) assert.ok(markup.includes(label), `${stepId}: ${label}`);
      assert.doesNotMatch(markup, /<video|<iframe/u, "previews do not require external media");
    }
  } finally {
    await vite.close();
  }
});
