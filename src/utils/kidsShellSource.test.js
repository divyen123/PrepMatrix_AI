import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
const appStyles = readFileSync(new URL("../App.css", import.meta.url), "utf8");
const subjectsPageSource = readFileSync(new URL("../pages/SubjectsPage.jsx", import.meta.url), "utf8");
const subjectListSource = readFileSync(new URL("../components/SubjectList.jsx", import.meta.url), "utf8");

test("keeps the AI credit indicator in the kids top bar on mobile without a duplicate drawer control", () => {
  assert.match(
    appStyles,
    /\.app-container\.is-kids-mode\s+\.topbar-right\s*>\s*\.ai-credit-indicator\s*\{\s*display:\s*block\s*!important;/,
  );
  assert.doesNotMatch(appSource, /Kids workspace actions/);
});

test("keeps the kids Subjects route usable while the registered class remains locked", () => {
  assert.match(appSource, /kidsMode=\{learnerRoutePolicy\.isYoungKidsLearner\}/);
  assert.doesNotMatch(appSource, /standardOnlyRoute\(\s*<SubjectsPage/);
  assert.match(subjectsPageSource, /registered class, learning stage, and curriculum are fixed/i);
  assert.match(subjectListSource, /kidsMode \? "\/planner" : "\/resources"/);
});

test("moves focus into the Parent Corner exit confirmation and restores the trigger", () => {
  assert.match(appSource, /const parentLockTriggerRef = useRef\(null\)/);
  assert.match(appSource, /const parentLockDialogRef = useRef\(null\)/);
  assert.match(appSource, /parentLockDialogRef\.current\?\.focus\(\)/);
  assert.match(appSource, /parentLockTriggerRef\.current\?\.focus\(\)/);
  assert.match(appSource, /ref=\{parentLockTriggerRef\}/);
  assert.match(appSource, /ref=\{parentLockDialogRef\}[\s\S]*?role="dialog"[\s\S]*?tabIndex=\{-1\}/);
  assert.match(appSource, /event\.key === "Escape"[\s\S]*?setParentLockConfirmOpen\(false\)/);
});
