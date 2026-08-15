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
  assert.match(subjectsPageSource, /aria-label="Manage academic profile in Settings"/);
  assert.match(subjectListSource, /kidsMode \? "\/planner" : "\/resources"/);
});

test("keeps the registered academic profile read-only on Subjects", () => {
  assert.doesNotMatch(subjectsPageSource, /profile-select-grid academic-profile-grid/);
  assert.doesNotMatch(subjectsPageSource, /<select/);
  assert.match(subjectsPageSource, /className="academic-manage-btn"/);
  assert.doesNotMatch(subjectsPageSource, /registered academic profile is read-only/i);
  assert.doesNotMatch(subjectsPageSource, /still add, edit, and organise all subjects/i);
});

test("waits for server Parent Corner state before guarding Settings", () => {
  assert.match(
    appSource,
    /parentGuidedKidsRoute\(\s*<SettingsPage[\s\S]*?"\/settings",\s*"settings"/,
  );
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

test("moves the Parent Corner exit launcher only when the sidebar is expanded", () => {
  assert.match(
    appSource,
    /kidsParentAccess\.unlocked && !sidebarCollapsed[\s\S]*?parent-corner-lock-control--expanded/,
  );
  assert.match(
    appSource,
    /kidsParentAccess\.unlocked && sidebarCollapsed[\s\S]*?parent-corner-lock-control--collapsed/,
  );
  assert.match(
    appStyles,
    /\.parent-corner-lock-control--expanded\s*\{[\s\S]*?margin-left:\s*auto;/,
  );
  assert.match(
    appStyles,
    /\.is-sidebar-collapsed\s+\.parent-corner-lock-control--collapsed\s+\.parent-corner-lock-confirmation\s*\{[\s\S]*?left:\s*calc\(100% \+ 12px\);/,
  );
});

test("keeps the Parent Corner exit confirmation fully opaque in every theme", () => {
  assert.match(
    appStyles,
    /\.parent-corner-lock-confirmation\s*\{[\s\S]*?opacity:\s*1\s*!important;[\s\S]*?background:\s*var\(--parent-lock-popover-bg\)\s*!important;[\s\S]*?backdrop-filter:\s*none\s*!important;/,
  );
  assert.match(
    appStyles,
    /body\.dark\s+\.parent-corner-lock-confirmation\s*\{[\s\S]*?--parent-lock-popover-bg:\s*#111a2b;/,
  );
  assert.match(
    appStyles,
    /body\.has-bg-image\s+\.parent-corner-lock-confirmation\s*\{[\s\S]*?--parent-lock-popover-bg:\s*rgb\(var\(--bg-surface-rgb, 18, 27, 45\)\);/,
  );
});
