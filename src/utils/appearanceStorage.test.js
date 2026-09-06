import assert from "node:assert/strict";
import test from "node:test";
import {
  APPEARANCE_STORAGE_KEYS,
  captureAppearanceStorage,
  initializeNewStudentAppearance,
  NEW_STUDENT_APPEARANCE_DEFAULTS,
  restoreAppearanceStorage,
  runAppearanceStorageTransaction,
} from "./appearanceStorage.js";
import {
  CUSTOM_BACKGROUND_ACCENT_STORAGE_KEY,
  CUSTOM_BACKGROUND_DATA_STORAGE_KEY,
  CUSTOM_BACKGROUND_SURFACE_STORAGE_KEY,
} from "./backgroundPresets.js";
import { BACKGROUND_IMAGE_BLUR_STORAGE_KEY } from "./appearanceTheme.js";

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
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

test("tracks every appearance and custom-background key touched by Save Appearance", () => {
  for (const key of [
    "prepmatrix_theme_mode",
    "prepmatrix_default_theme",
    "prepmatrix_bg_image_id",
    "prepmatrix_glass_opacity",
    BACKGROUND_IMAGE_BLUR_STORAGE_KEY,
    CUSTOM_BACKGROUND_DATA_STORAGE_KEY,
    CUSTOM_BACKGROUND_ACCENT_STORAGE_KEY,
    CUSTOM_BACKGROUND_SURFACE_STORAGE_KEY,
  ]) {
    assert.ok(APPEARANCE_STORAGE_KEYS.includes(key), `missing ${key}`);
  }
  assert.equal(new Set(APPEARANCE_STORAGE_KEYS).size, APPEARANCE_STORAGE_KEYS.length);
});

test("starts a newly registered student in light mode with the Greyish White palette", () => {
  const storage = createStorage({
    prepmatrix_accent_rgb_dark: "36, 199, 177",
    prepmatrix_accent_rgb_light: "7, 143, 120",
    prepmatrix_bg_image_id: "sunset-valley",
    prepmatrix_default_theme: "dark",
    prepmatrix_theme_mode: "system",
    unrelated_preference: "preserved",
  });

  const defaults = initializeNewStudentAppearance(storage);

  assert.equal(defaults, NEW_STUDENT_APPEARANCE_DEFAULTS);
  assert.equal(storage.getItem("prepmatrix_theme_mode"), "light");
  assert.equal(storage.getItem("prepmatrix_default_theme"), "light");
  assert.equal(storage.getItem("prepmatrix_accent_rgb_light"), "100, 116, 139");
  assert.equal(storage.getItem("prepmatrix_accent_rgb_dark"), "226, 232, 240");
  assert.equal(storage.getItem("prepmatrix_bg_image_id"), null);
  assert.equal(storage.getItem("unrelated_preference"), "preserved");
});

test("restores the previous appearance if a new-student default cannot be fully stored", () => {
  const storage = createStorage({
    prepmatrix_accent_rgb_dark: "36, 199, 177",
    prepmatrix_accent_rgb_light: "7, 143, 120",
    prepmatrix_bg_image_id: "sunset-valley",
    prepmatrix_default_theme: "dark",
    prepmatrix_theme_mode: "system",
  });
  const originalSetItem = storage.setItem;
  let shouldFail = true;
  storage.setItem = (key, value) => {
    if (key === "prepmatrix_accent_rgb_light" && shouldFail) {
      shouldFail = false;
      throw new Error("quota");
    }
    originalSetItem.call(storage, key, value);
  };

  assert.throws(() => initializeNewStudentAppearance(storage), /quota/);
  assert.equal(storage.getItem("prepmatrix_theme_mode"), "system");
  assert.equal(storage.getItem("prepmatrix_default_theme"), "dark");
  assert.equal(storage.getItem("prepmatrix_accent_rgb_light"), "7, 143, 120");
  assert.equal(storage.getItem("prepmatrix_accent_rgb_dark"), "36, 199, 177");
  assert.equal(storage.getItem("prepmatrix_bg_image_id"), "sunset-valley");
});

test("keeps all writes when an appearance transaction succeeds", () => {
  const storage = createStorage({ prepmatrix_font_size: "medium" });
  const result = runAppearanceStorageTransaction(storage, () => {
    storage.setItem("prepmatrix_font_size", "large");
    storage.setItem("prepmatrix_bg_image_id", "sunset-valley");
    return "saved";
  });

  assert.equal(result, "saved");
  assert.equal(storage.getItem("prepmatrix_font_size"), "large");
  assert.equal(storage.getItem("prepmatrix_bg_image_id"), "sunset-valley");
});

test("restores existing values and removes newly written keys after a failed save", () => {
  const storage = createStorage({
    prepmatrix_font_size: "medium",
    [CUSTOM_BACKGROUND_DATA_STORAGE_KEY]: "old-image",
  });

  assert.throws(() => runAppearanceStorageTransaction(storage, () => {
    storage.setItem("prepmatrix_font_size", "large");
    storage.setItem("prepmatrix_bg_image_id", "custom-background");
    storage.setItem(CUSTOM_BACKGROUND_DATA_STORAGE_KEY, "new-image");
    throw new Error("quota");
  }), /quota/);

  assert.equal(storage.getItem("prepmatrix_font_size"), "medium");
  assert.equal(storage.getItem("prepmatrix_bg_image_id"), null);
  assert.equal(storage.getItem(CUSTOM_BACKGROUND_DATA_STORAGE_KEY), "old-image");
});

test("attempts every rollback entry even if restoring one key fails", () => {
  const storage = createStorage({ prepmatrix_font_size: "medium" });
  const snapshot = captureAppearanceStorage(storage);
  storage.setItem("prepmatrix_font_size", "large");
  storage.setItem("prepmatrix_bg_image_id", "sunset-valley");
  const originalSetItem = storage.setItem;
  storage.setItem = (key, value) => {
    if (key === "prepmatrix_font_size") throw new Error("blocked restore");
    originalSetItem.call(storage, key, value);
  };

  assert.throws(() => restoreAppearanceStorage(storage, snapshot), /blocked restore/);
  assert.equal(storage.getItem("prepmatrix_bg_image_id"), null);
});
