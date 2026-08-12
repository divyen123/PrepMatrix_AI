import assert from "node:assert/strict";
import test from "node:test";
import { APPEARANCE_STORAGE_KEYS } from "./appearanceStorage.js";
import {
  CUSTOM_BACKGROUND_ACCENT_STORAGE_KEY,
  CUSTOM_BACKGROUND_DATA_STORAGE_KEY,
  CUSTOM_BACKGROUND_ID,
  CUSTOM_BACKGROUND_LAYOUT_STORAGE_KEY,
  CUSTOM_BACKGROUND_SURFACE_STORAGE_KEY,
  createCustomBackgroundPreset,
  normalizeCustomBackgroundLayout,
  readStoredCustomBackgroundPreset,
} from "./backgroundPresets.js";

const SAFE_IMAGE = "data:image/webp;base64,UklGRg==";

test("normalizes and preserves face-aware custom background framing", () => {
  const layout = normalizeCustomBackgroundLayout({
    version: 1,
    mode: "contain",
    focalX: 0.72,
    focalY: 0.24,
    faceAware: true,
    sourceAspect: 0.75,
  });
  assert.deepEqual(layout, {
    version: 1,
    mode: "contain",
    focalX: 0.72,
    focalY: 0.24,
    faceAware: true,
    sourceAspect: 0.75,
  });
  assert.deepEqual(createCustomBackgroundPreset({ file: SAFE_IMAGE, layout })?.layout, layout);
});

test("uses safe full-image framing for legacy or malformed custom metadata", () => {
  const expected = {
    version: 1,
    mode: "contain",
    focalX: 0.5,
    focalY: 0.5,
    faceAware: false,
    sourceAspect: 1,
  };
  assert.deepEqual(normalizeCustomBackgroundLayout(), expected);
  assert.deepEqual(normalizeCustomBackgroundLayout("{bad json"), expected);
  assert.deepEqual(normalizeCustomBackgroundLayout({
    version: 1,
    mode: "cover",
    focalX: 8,
    focalY: Number.NaN,
    sourceAspect: 0,
  }), expected);
});

test("round-trips saved framing and includes it in appearance transactions", () => {
  const values = new Map([
    [CUSTOM_BACKGROUND_DATA_STORAGE_KEY, SAFE_IMAGE],
    [CUSTOM_BACKGROUND_ACCENT_STORAGE_KEY, "44, 88, 132"],
    [CUSTOM_BACKGROUND_SURFACE_STORAGE_KEY, "8, 16, 24"],
    [CUSTOM_BACKGROUND_LAYOUT_STORAGE_KEY, JSON.stringify({
      version: 1,
      mode: "contain",
      focalX: 0.66,
      focalY: 0.31,
      faceAware: true,
      sourceAspect: 0.8,
    })],
  ]);
  const preset = readStoredCustomBackgroundPreset({
    getItem: (key) => values.get(key) || null,
  });

  assert.equal(preset?.id, CUSTOM_BACKGROUND_ID);
  assert.deepEqual(preset?.layout, {
    version: 1,
    mode: "contain",
    focalX: 0.66,
    focalY: 0.31,
    faceAware: true,
    sourceAspect: 0.8,
  });
  assert.ok(APPEARANCE_STORAGE_KEYS.includes(CUSTOM_BACKGROUND_LAYOUT_STORAGE_KEY));
});
