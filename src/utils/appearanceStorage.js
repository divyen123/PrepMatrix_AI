import {
  CUSTOM_BACKGROUND_ACCENT_STORAGE_KEY,
  CUSTOM_BACKGROUND_DATA_STORAGE_KEY,
  CUSTOM_BACKGROUND_SURFACE_STORAGE_KEY,
} from "./backgroundPresets.js";
import { BACKGROUND_IMAGE_BLUR_STORAGE_KEY } from "./appearanceTheme.js";

export const APPEARANCE_STORAGE_KEYS = Object.freeze([
  "prepmatrix_default_theme",
  "prepmatrix_font_size",
  "prepmatrix_card_size",
  "prepmatrix_accent_rgb_light",
  "prepmatrix_accent_rgb_dark",
  "prepmatrix_accent_opacity",
  "prepmatrix_border_opacity",
  "prepmatrix_bg_light",
  "prepmatrix_bg_dark",
  "prepmatrix_glassy_panels",
  "prepmatrix_glassy_buttons",
  "prepmatrix_font_style",
  "prepmatrix_font_weight",
  "prepmatrix_bg_image_id",
  "prepmatrix_bg_overlay_opacity",
  "prepmatrix_glass_opacity",
  BACKGROUND_IMAGE_BLUR_STORAGE_KEY,
  CUSTOM_BACKGROUND_DATA_STORAGE_KEY,
  CUSTOM_BACKGROUND_ACCENT_STORAGE_KEY,
  CUSTOM_BACKGROUND_SURFACE_STORAGE_KEY,
]);

export function captureAppearanceStorage(storage) {
  if (!storage?.getItem) throw new Error("Appearance storage is unavailable.");
  return new Map(
    APPEARANCE_STORAGE_KEYS.map((key) => [key, storage.getItem(key)]),
  );
}

export function restoreAppearanceStorage(storage, snapshot) {
  if (!storage?.setItem || !storage?.removeItem || !(snapshot instanceof Map)) {
    throw new Error("Appearance storage cannot be restored.");
  }

  let firstError = null;
  for (const [key, value] of snapshot) {
    try {
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, value);
    } catch (error) {
      firstError ||= error;
    }
  }
  if (firstError) throw firstError;
}

export function runAppearanceStorageTransaction(storage, update) {
  if (typeof update !== "function") throw new TypeError("Appearance update must be a function.");
  const snapshot = captureAppearanceStorage(storage);

  try {
    return update();
  } catch (saveError) {
    try {
      restoreAppearanceStorage(storage, snapshot);
    } catch (rollbackError) {
      const transactionError = new Error("Appearance storage could not be saved or fully restored.");
      transactionError.cause = saveError;
      transactionError.rollbackError = rollbackError;
      throw transactionError;
    }
    throw saveError;
  }
}
