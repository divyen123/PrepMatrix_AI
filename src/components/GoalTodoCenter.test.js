import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const readSource = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("the center exposes only goal and to-do interactions", () => {
  const source = readSource("./GoalReminderCenter.jsx");
  const styles = readSource("./GoalReminderCenter.css");
  const appSource = readSource("../App.jsx");

  assert.match(source, /Goal & To-Do Center/u);
  assert.match(source, />Create a goal</u);
  assert.match(source, />Quick to-do</u);
  assert.doesNotMatch(source, />Reminder<|Reminder title|Create reminder|Reminder due|Remind in/u);
  assert.doesNotMatch(source, /getDueReminders|createReminderDraft|visibleReminders/u);
  assert.match(styles, /\.goal-reminder-stats\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,/u);
  assert.match(styles, /\.planner-goals-panel\s*\{[\s\S]*?grid-column:\s*1 \/ -1;/u);
  assert.doesNotMatch(appSource, /syncStudyTargetReminders/u);
});

test("settings summarizes only active goals and open to-dos", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { default: GoalSettingsPanel } = await vite.ssrLoadModule(
      "/src/components/GoalSettingsPanel.jsx",
    );
    const markup = renderToStaticMarkup(React.createElement(GoalSettingsPanel, {
      plannerData: {
        goals: [{ id: "goal-1", title: "Finish unit", completed: false }],
        reminders: [{ id: "legacy-reminder", title: "Old reminder", completed: false }],
        todos: [{ id: "todo-1", title: "Solve examples", completed: false }],
      },
    }));

    assert.match(markup, /Study Goals &amp; To-Do/u);
    assert.match(markup, /Active goals/u);
    assert.match(markup, /Open to-dos/u);
    assert.doesNotMatch(markup, /Due today|Weekly reviews|Target-linked|Remind later|Old reminder/u);
  } finally {
    await vite.close();
  }
});
