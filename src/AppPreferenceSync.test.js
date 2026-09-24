import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
const settingsSource = readFileSync(new URL("./pages/SettingsPage.jsx", import.meta.url), "utf8");
const serverSource = readFileSync(new URL("../server/index.js", import.meta.url), "utf8");

test("hydrates account preferences before applying the restored workspace UI", () => {
  assert.match(appSource, /writeStoredAppPreferences\(nextPreferences, localStorage/u);
  assert.match(appSource, /setCursorStyleState\(nextPreferences\.cursorStyle\)/u);
  assert.match(appSource, /setAutoLockPreferences\(\{/u);
  assert.match(appSource, /applyAppearanceMode\(nextPreferences\.themeMode\)/u);
});

test("a same-account local cursor survives a stale server snapshot and is resynced", () => {
  assert.match(appSource, /preferStoredCursorStyleForOwner\([\s\S]*?serverPreferences,[\s\S]*?preferenceOwnerKey,[\s\S]*?storedPreferenceOwnerKey/u);
  assert.match(appSource, /appPreferencesEqual\(serverPreferences, nextPreferences\)/u);
  assert.match(appSource, /getPendingPreferencesStorageKey\(preferenceOwnerKey\),\s*JSON\.stringify\(nextPreferences\)/u);
});

test("saves changed preferences to the account and retains offline changes for retry", () => {
  assert.match(appSource, /prepmatrix_preferences_sync_pending:/u);
  assert.match(appSource, /localStorage\.setItem\(pendingStorageKey, serializedPreferences\)/u);
  assert.match(appSource, /getPreferenceOwnerKey\(currentUserProfileRef\.current\) === preferenceOwnerKey/u);
  assert.match(appSource, /api\.saveAppPreferences\(normalizedPreferences\)/u);
  assert.match(appSource, /window\.addEventListener\("online", savePreferences/u);
  assert.match(appSource, /window\.addEventListener\("focus", savePreferences/u);
  assert.match(appSource, /PREFERENCES_RETRY_DELAYS_MS/u);
  assert.match(settingsSource, /onPreferencesChange\?\.\(\)/u);
});

test("new accounts receive a complete clean preference snapshot", () => {
  assert.match(appSource, /newStudentPreferences = normalizeAppPreferences\(\{/u);
  assert.match(appSource, /\.\.\.NEW_STUDENT_APPEARANCE_DEFAULTS/u);
  assert.match(appSource, /preserveLocalCustomBackground: false/u);
  assert.match(appSource, /appPreferences: newStudentPreferences/u);
});

test("server exposes a normalized account-level preference endpoint", () => {
  assert.match(serverSource, /app\.put\("\/api\/auth\/preferences"/u);
  assert.match(serverSource, /appPreferences: user\.appPreferences/u);
  assert.match(serverSource, /normalizeAppPreferences\([\s\S]*?activeUser\.appPreferences/u);
});
