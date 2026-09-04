import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("the center exposes two panels and discloses goal creation from Goals", () => {
  const source = readSource("./GoalReminderCenter.jsx");
  const styles = readSource("./GoalReminderCenter.css");
  const appSource = readSource("../App.jsx");

  assert.match(source, /Goal & To-Do Center/u);
  assert.match(source, />Quick to-do</u);
  assert.match(source, /aria-label="Add a new goal"/u);
  assert.match(source, /aria-controls="planner-goal-composer"/u);
  assert.match(source, /aria-expanded=\{goalComposerOpen\}/u);
  assert.match(source, /className="planner-goal-composer-popover"/u);
  assert.match(source, /role="dialog"/u);
  assert.match(source, /goalTitleInputRef\.current\?\.focus/u);
  assert.doesNotMatch(source, /className="planner-composer-panel"/u);
  assert.match(source, /planner-goals-panel[\s\S]*planner-todo-panel/u);
  assert.doesNotMatch(source, />Reminder<|Reminder title|Create reminder|Reminder due|Remind in/u);
  assert.doesNotMatch(source, /getDueReminders|createReminderDraft|visibleReminders/u);
  assert.doesNotMatch(source, /A quick guide to dated outcomes, small next actions, and completed-item controls\./u);
  assert.doesNotMatch(source, /goal-reminder-about-description/u);
  assert.match(styles, /\.goal-reminder-stats\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,/u);
  assert.match(styles, /\.goal-reminder-backdrop\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?inset:\s*0;[\s\S]*?background-color:\s*rgba\(2, 6, 16, 0\.58\);/u);
  assert.match(styles, /backdrop-filter:\s*blur\(18px\) brightness\(0\.72\) saturate\(0\.78\);/u);
  assert.match(styles, /-webkit-backdrop-filter:\s*blur\(18px\) brightness\(0\.72\) saturate\(0\.78\);/u);
  assert.match(source, /createPortal\(dialog, document\.body\)/u);
  assert.match(styles, /@media \(min-width: 901px\)[\s\S]*?\.goal-reminder-dialog\s*\{[\s\S]*?width:\s*min\(900px,[\s\S]*?height:\s*min\(500px,/u);
  assert.match(styles, /@media \(min-width: 901px\)[\s\S]*?\.planner-goals-panel\s*\{[\s\S]*?grid-column:\s*1 \/ 6;/u);
  assert.match(styles, /\.planner-todo-panel\s*\{[\s\S]*?grid-column:\s*6 \/ -1;/u);
  assert.match(styles, /@media \(max-width: 900px\)[\s\S]*?\.goal-reminder-dialog-body\s*\{[\s\S]*?grid-template-columns:\s*1fr;/u);
  assert.match(styles, /\.planner-goal-composer-popover\s*\{[\s\S]*?background:\s*var\(--bg\);/u);
  assert.match(styles, /body\.has-bg-image \.goal-reminder-about-dialog,[\s\S]*?background:\s*rgb\(var\(--bg-surface-rgb, 18, 27, 45\)\);/u);
  assert.doesNotMatch(appSource, /syncStudyTargetReminders/u);
});

test("settings removes the goals card and expands System Preferences", () => {
  const source = readSource("../pages/SettingsPage.jsx");
  const styles = readSource("../pages/SettingsPage.css");

  assert.doesNotMatch(source, /GoalSettingsPanel|Study Goals &(?:amp;|) To-Do/u);
  assert.match(source, /className="card dashboard-full-span settings-card settings-system-card"/u);
  assert.match(styles, /\.settings-page \.settings-system-card\s*\{[\s\S]*?grid-column:\s*1 \/ -1;[\s\S]*?width:\s*100%;/u);
});
