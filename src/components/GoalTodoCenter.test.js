import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("the center opens as an accessible right-side drawer with stacked goal and to-do panels", () => {
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
  assert.match(styles, /\.goal-reminder-backdrop\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?inset:\s*0;[\s\S]*?justify-content:\s*flex-end;[\s\S]*?background-color:\s*rgba\(2, 6, 16, 0\.48\);/u);
  assert.match(styles, /backdrop-filter:\s*blur\(10px\) brightness\(0\.78\) saturate\(0\.82\);/u);
  assert.match(styles, /-webkit-backdrop-filter:\s*blur\(10px\) brightness\(0\.78\) saturate\(0\.82\);/u);
  assert.match(source, /createPortal\(dialog, document\.body\)/u);
  assert.match(source, /className=\{`goal-reminder-backdrop\$\{closing \? " is-closing" : ""\}`\}/u);
  assert.match(source, /className=\{`goal-reminder-dialog\$\{closing \? " is-closing" : ""\}`\}/u);
  assert.match(source, /closeCenter\(\);[\s\S]*?event\.key !== "Tab"/u);
  assert.match(styles, /\.goal-reminder-dialog\s*\{[\s\S]*?width:\s*min\(560px, 100vw\);[\s\S]*?height:\s*100dvh;[\s\S]*?border-radius:\s*24px 0 0 24px;/u);
  assert.match(styles, /\.goal-reminder-dialog-body\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);[\s\S]*?grid-template-rows:\s*repeat\(2, minmax\(0, 1fr\)\);/u);
  assert.match(styles, /\.planner-goals-panel\s*\{[\s\S]*?grid-row:\s*1;/u);
  assert.match(styles, /\.planner-todo-panel\s*\{[\s\S]*?grid-row:\s*2;/u);
  assert.match(styles, /@keyframes goalReminderDrawerIn[\s\S]*?translateX\(100%\)[\s\S]*?translateX\(0\)/u);
  assert.match(styles, /@keyframes goalReminderDrawerOut[\s\S]*?translateX\(0\)[\s\S]*?translateX\(100%\)/u);
  assert.doesNotMatch(styles, /\.goal-reminder-backdrop\.is-closing\s*\{[^}]*pointer-events:\s*none;/u);
  assert.match(styles, /@media \(max-width: 520px\)[\s\S]*?\.goal-reminder-dialog\s*\{[\s\S]*?width:\s*100%;[\s\S]*?border-radius:\s*0;/u);
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
