import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
const settingsSource = readFileSync(new URL("./pages/SettingsPage.jsx", import.meta.url), "utf8");

test("wires settings quick actions to real app workflows", () => {
  assert.match(appSource, /<SettingsContextMenu/u);
  assert.match(appSource, /onOpenSettings=\{\(\) => \{[\s\S]*?navigate\("\/settings"\)/u);
  assert.match(appSource, /onSwitchAcademicProfile=\{\(\) => \{[\s\S]*?navigate\("\/settings\/profiles"\)/u);
  assert.match(appSource, /onOpenAlertHistory=\{\(\) => \{[\s\S]*?navigate\("\/notification-history"\)/u);
  assert.match(appSource, /const handleRefreshAppData = async \(\) => \{[\s\S]*?api\.saveWorkspace[\s\S]*?api\.me[\s\S]*?api\.getAiQuota/u);
  assert.match(appSource, /const handleCheckForUpdates = async \(\) => \{[\s\S]*?registration\.update\(\)/u);
  assert.match(appSource, /const handleRestartVoiceAssistant = \(\) => \{[\s\S]*?pauseWakeMode[\s\S]*?setWakeMode/u);
  assert.match(appSource, /onLogout=\{\(\) => \{[\s\S]*?setLogoutReturnsToLock\(false\)[\s\S]*?setLogoutConfirmOpen\(true\)/u);
});

test("supports persistent Light, Dark, and System appearance choices", () => {
  assert.match(appSource, /THEME_MODES = new Set\(\["light", "dark", "system"\]\)/u);
  assert.match(appSource, /localStorage\.setItem\(THEME_MODE_STORAGE_KEY, nextMode\)/u);
  assert.match(appSource, /matchMedia\("\(prefers-color-scheme: dark\)"\)/u);
  assert.match(appSource, /addEventListener\?\.\("change", syncSystemTheme\)/u);
  assert.match(appSource, /options\.preservePreference && themeModeRef\.current === "system"\) \{[\s\S]*?systemPrefersDarkMode\(\)/u);
  assert.match(settingsSource, /const restoredDarkMode = setDarkMode\(init\.darkMode, \{ preservePreference: true \}\)/u);
  assert.match(settingsSource, /setDarkMode\(init\.darkMode, \{ preservePreference: true \}\)/u);
});

test("places Clear Cache and confirmed Clear Data inside data management", () => {
  assert.match(settingsSource, /settings-data-action-grid/u);
  assert.match(settingsSource, />Clear Cache</u);
  assert.match(settingsSource, /clearPrepMatrixAppCaches\(\)/u);
  assert.ok(settingsSource.includes("Clear Data"));
  assert.match(settingsSource, /Confirm Clear Data/u);
  assert.match(settingsSource, /const handleResetWorkspace = async \(\) => \{/u);
  assert.match(settingsSource, /await onImportActiveProfileWorkspace\(resetWorkspace\)/u);
});
