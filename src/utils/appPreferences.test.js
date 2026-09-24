import assert from "node:assert/strict";
import test from "node:test";

import {
  appPreferencesEqual,
  normalizeAppPreferences,
  preferStoredCursorStyleForOwner,
  readStoredAppPreferences,
  writeStoredAppPreferences,
} from "./appPreferences.js";

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test("normalizes account preferences into a bounded, server-safe shape", () => {
  const preferences = normalizeAppPreferences({
    themeMode: "SYSTEM",
    accentRgbDark: "300, -2, 9",
    accentOpacity: 9,
    backgroundDark: "javascript:alert(1)",
    backgroundImageId: "../../unsafe",
    cursorStyle: "neon-cursor",
    autoLockMinutes: 99_999,
    voicePreferences: { voiceStyle: "male", rate: 20, pitch: -4, volume: 0.4 },
  });

  assert.equal(preferences.themeMode, "system");
  assert.equal(preferences.accentRgbDark, "36, 199, 177");
  assert.equal(preferences.accentOpacity, 1);
  assert.equal(preferences.backgroundDark, "#070b15");
  assert.equal(preferences.backgroundImageId, "");
  assert.equal(preferences.cursorStyle, "app-cursor");
  assert.equal(preferences.autoLockMinutes, 1_440);
  assert.deepEqual(preferences.voicePreferences, {
    voiceStyle: "male",
    rate: 1.5,
    pitch: 0.6,
    volume: 0.4,
  });
});

test("round-trips appearance and system preferences through browser storage", () => {
  const storage = createStorage();
  const expected = normalizeAppPreferences({
    themeMode: "dark",
    fontSize: "large",
    accentRgbDark: "226,232,240",
    backgroundImageId: "crescent-moon",
    cursorStyle: "blob-cursor",
    autoHideTopBar: true,
    autoLockEnabled: true,
    autoLockMinutes: 12,
    soundEnabled: false,
    wakeMode: true,
    voicePreferences: { voiceStyle: "male", rate: 1.1, pitch: 0.9, volume: 0.8 },
  });

  writeStoredAppPreferences(expected, storage);
  const restored = readStoredAppPreferences(storage);
  assert.equal(appPreferencesEqual(restored, expected), true);
});

test("keeps uploaded backgrounds device-local while restoring synced settings", () => {
  const storage = createStorage({ prepmatrix_bg_image_id: "custom-background" });

  writeStoredAppPreferences(
    normalizeAppPreferences({ backgroundImageId: "crescent-moon", themeMode: "dark" }),
    storage,
    { preserveLocalCustomBackground: true },
  );

  assert.equal(storage.getItem("prepmatrix_bg_image_id"), "custom-background");
  assert.equal(storage.getItem("prepmatrix_theme_mode"), "dark");
  assert.equal(readStoredAppPreferences(storage).backgroundImageId, "");
});

test("keeps this account's local system cursor when the server preference is stale", () => {
  const storage = createStorage({ prepmatrix_cursor_style: "default" });
  const serverPreferences = normalizeAppPreferences({
    cursorStyle: "app-cursor",
    fontSize: "large",
  });

  const restored = preferStoredCursorStyleForOwner(
    serverPreferences,
    storage,
    "account-a",
    "account-a",
  );

  assert.equal(restored.cursorStyle, "default");
  assert.equal(restored.fontSize, "large");
  assert.equal(serverPreferences.cursorStyle, "app-cursor");
});

test("does not inherit another account's locally selected cursor", () => {
  const storage = createStorage({ prepmatrix_cursor_style: "default" });
  const serverPreferences = normalizeAppPreferences({ cursorStyle: "blob-cursor" });

  assert.equal(preferStoredCursorStyleForOwner(
    serverPreferences,
    storage,
    "account-b",
    "account-a",
  ).cursorStyle, "blob-cursor");
  assert.equal(preferStoredCursorStyleForOwner(
    serverPreferences,
    storage,
    "account-b",
    "",
  ).cursorStyle, "blob-cursor");
});

test("ignores invalid local cursor values", () => {
  const storage = createStorage({ prepmatrix_cursor_style: "unknown-cursor" });
  const restored = preferStoredCursorStyleForOwner(
    normalizeAppPreferences({ cursorStyle: "blob-cursor" }),
    storage,
    "account-a",
    "account-a",
  );
  assert.equal(restored.cursorStyle, "blob-cursor");
});
