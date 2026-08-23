import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
const appStyles = readFileSync(new URL("../App.css", import.meta.url), "utf8");
const notesPageSource = readFileSync(new URL("../pages/NotesPage.jsx", import.meta.url), "utf8");
const settingsPageSource = readFileSync(new URL("../pages/SettingsPage.jsx", import.meta.url), "utf8");
const subjectsPageSource = readFileSync(new URL("../pages/SubjectsPage.jsx", import.meta.url), "utf8");
const subjectListSource = readFileSync(new URL("../components/SubjectList.jsx", import.meta.url), "utf8");

test("keeps the AI credit indicator in the kids top bar on mobile without a duplicate drawer control", () => {
  assert.match(
    appStyles,
    /\.app-container\.is-kids-mode\s+\.topbar-right\s*>\s*\.ai-credit-indicator\s*\{\s*display:\s*block\s*!important;/,
  );
  assert.doesNotMatch(appSource, /Kids workspace actions/);
});

test("keeps the Game Town icon synchronized with live kids background previews", () => {
  assert.match(appSource, /const kidsGamepadIcon = resolveKidsGamepadIcon\(activeBackgroundImageId\)/);
  assert.match(appSource, /<img alt="" aria-hidden="true" src=\{kidsGamepadIcon\} \/>/);
  assert.match(appSource, /onBackgroundThemeChange=\{setActiveBackgroundImageId\}/);
  assert.doesNotMatch(appSource, /src="\/kids\/game-town-gamepad\.png"/);
  assert.match(settingsPageSource, /onBackgroundThemeChange\?\.\(resolvedId\)/);
  assert.match(settingsPageSource, /onBackgroundThemeChange\?\.\(init\.bgImageId\)/);
  assert.match(settingsPageSource, /onBackgroundThemeChange\?\.\(persistedBgImageId\)/);
});

test("keeps the kids Subjects route usable while the registered class remains locked", () => {
  assert.match(appSource, /kidsMode=\{learnerRoutePolicy\.isYoungKidsLearner\}/);
  assert.doesNotMatch(appSource, /standardOnlyRoute\(\s*<SubjectsPage/);
  assert.match(subjectsPageSource, /aria-label="Manage academic profile in Settings"/);
  assert.match(subjectListSource, /kidsMode \? "\/planner" : "\/resources"/);
});

test("keeps the Notes page visible and directly usable in kids accounts", () => {
  assert.match(
    appSource,
    /<NotesPage[\s\S]*?kidsMode=\{learnerRoutePolicy\.isYoungKidsLearner\}[\s\S]*?parentAccessGranted=\{kidsParentAccess\.unlocked\}[\s\S]*?path="\/notes"/,
  );
  assert.doesNotMatch(appSource, /standardOnlyRoute\(\s*<NotesPage/);
  assert.match(notesPageSource, /const canManageSchedule = !kidsMode \|\| parentAccessGranted/);
  assert.match(
    notesPageSource,
    /state: \{ parentAccess: "planner", returnTo: "\/notes" \}/,
  );
  assert.equal(
    (notesPageSource.match(/!canManageSchedule && hasPlannerLinks/g) || []).length,
    2,
  );
  assert.match(notesPageSource, /const planNoteForDate[\s\S]*?if \(!canManageSchedule\)/);
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

test("keeps Notification History behind Parent Corner for kids instead of redirecting them home", () => {
  assert.match(
    appSource,
    /parentGuidedKidsRoute\(\s*<NotificationHistoryPage \/>,\s*"\/notification-history",\s*"settings"/,
  );
  assert.doesNotMatch(appSource, /standardOnlyRoute\(\s*<NotificationHistoryPage \/>/);
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
