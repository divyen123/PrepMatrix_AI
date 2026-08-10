import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const baseProps = {
  canManageSchedule: true,
  completed: [],
  schedule: [],
  scheduleStartDate: null,
  setCompleted: () => {},
  setSchedule: () => {},
  setScheduleStartDate: () => {},
};

function findGenerateButton(markup) {
  return markup.match(
    /<button class="action-btn"[^>]*>[\s\S]*?Generate schedule[\s\S]*?<\/button>/u,
  )?.[0] || "";
}

test("requires a subject before enabling schedule generation", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { default: Timetable } = await vite.ssrLoadModule(
      "/src/components/Timetable.jsx",
    );
    const emptyMarkup = renderToStaticMarkup(React.createElement(Timetable, {
      ...baseProps,
      subjects: [],
      // Deliberately omit onOpenSubjects to cover optional consumers.
    }));
    const configuredMarkup = renderToStaticMarkup(React.createElement(Timetable, {
      ...baseProps,
      subjects: [{ name: "Maths", chapters: 4, difficulty: "easy" }],
    }));

    assert.match(emptyMarkup, /Add a subject first/u);
    assert.match(emptyMarkup, />Open Subjects</u);
    assert.match(findGenerateButton(emptyMarkup), /disabled=""/u);

    assert.doesNotMatch(configuredMarkup, /Add a subject first|>Open Subjects/u);
    assert.doesNotMatch(findGenerateButton(configuredMarkup), /disabled=/u);
  } finally {
    await vite.close();
  }
});
