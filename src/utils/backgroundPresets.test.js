import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import BACKGROUND_PRESETS, {
  CUSTOM_BACKGROUND_ACCENT_STORAGE_KEY,
  CUSTOM_BACKGROUND_DATA_STORAGE_KEY,
  CUSTOM_BACKGROUND_ID,
  CUSTOM_BACKGROUND_MAX_DATA_URL_LENGTH,
  CUSTOM_BACKGROUND_SURFACE_STORAGE_KEY,
  DEFAULT_KIDS_GAMEPAD_ICON,
  KIDS_BACKGROUND_PRESETS,
  createCustomBackgroundPreset,
  isKidsBackgroundGalleryEligible,
  isSafeCustomBackgroundDataUrl,
  readStoredCustomBackgroundPreset,
  resolveBackgroundPreset,
  resolveBackgroundPresetForProfile,
  resolveKidsGamepadIcon,
  isKidsBackgroundPresetId,
} from "./backgroundPresets.js";

const SAFE_IMAGE = "data:image/webp;base64,UklGRg==";

test("exposes a separate five-theme kids gallery", () => {
  assert.equal(BACKGROUND_PRESETS.length, 5);
  assert.equal(KIDS_BACKGROUND_PRESETS.length, 5);
  assert.ok(KIDS_BACKGROUND_PRESETS.every(({ id }) => id.startsWith("kids-")));
  assert.equal(resolveBackgroundPreset("kids-sunny-meadow")?.name, "Sunny Meadow");
});

test("maps each kids background to its matching gamepad palette", () => {
  const expectedIcons = {
    "kids-storybook-garden": "/kids/gamepads/gamepad4.png",
    "kids-sky-adventure": "/kids/gamepads/gamepad5.png",
    "kids-sunny-meadow": "/kids/gamepads/gamepad2.png",
    "kids-winter-walk": "/kids/gamepads/gamepad3.png",
    "kids-night-hero": "/kids/gamepads/gamepad1.png",
  };

  assert.deepEqual(
    Object.fromEntries(KIDS_BACKGROUND_PRESETS.map(({ id, gamepadFile }) => [id, gamepadFile])),
    expectedIcons,
  );
  for (const [id, gamepadFile] of Object.entries(expectedIcons)) {
    assert.equal(resolveKidsGamepadIcon(id), gamepadFile);
    assert.equal(existsSync(new URL(`../../public${gamepadFile}`, import.meta.url)), true);
  }
  assert.equal(resolveKidsGamepadIcon("sunset-valley"), DEFAULT_KIDS_GAMEPAD_ICON);
  assert.equal(resolveKidsGamepadIcon(""), DEFAULT_KIDS_GAMEPAD_ICON);
});

test("shows the kids gallery only from early years through Class 5", () => {
  assert.equal(isKidsBackgroundGalleryEligible({ band: "early" }), true);
  assert.equal(isKidsBackgroundGalleryEligible({ classNumber: 1 }), true);
  assert.equal(isKidsBackgroundGalleryEligible({ classNumber: 5 }), true);
  assert.equal(isKidsBackgroundGalleryEligible({ classNumber: 6 }), false);
  assert.equal(isKidsBackgroundGalleryEligible({ band: "primary" }), false);
  assert.equal(isKidsBackgroundGalleryEligible({}, true), true);
});

test("applies saved kids themes only to eligible profiles without mutating the choice", () => {
  const savedId = "kids-sunny-meadow";

  assert.equal(isKidsBackgroundPresetId(savedId), true);
  assert.equal(
    resolveBackgroundPresetForProfile(savedId, { profile: { classNumber: 5 } })?.id,
    savedId,
  );
  assert.equal(
    resolveBackgroundPresetForProfile(savedId, { profile: { classNumber: 6 } }),
    undefined,
  );
  assert.equal(
    resolveBackgroundPresetForProfile("sunset-valley", { profile: { classNumber: 6 } })?.id,
    "sunset-valley",
  );
  assert.equal(savedId, "kids-sunny-meadow");
});

test("accepts only bounded raster image data URLs for custom backgrounds", () => {
  assert.equal(isSafeCustomBackgroundDataUrl(SAFE_IMAGE), true);
  assert.equal(isSafeCustomBackgroundDataUrl("https://example.com/image.jpg"), false);
  assert.equal(isSafeCustomBackgroundDataUrl("data:image/svg+xml;base64,PHN2Zz4="), false);
  assert.equal(isSafeCustomBackgroundDataUrl("data:image/png;base64,not safe!"), false);
  assert.equal(
    isSafeCustomBackgroundDataUrl(`data:image/png;base64,${"A".repeat(CUSTOM_BACKGROUND_MAX_DATA_URL_LENGTH)}`),
    false,
  );
});

test("resolves a validated custom background with normalized colors", () => {
  const customPreset = createCustomBackgroundPreset({
    file: SAFE_IMAGE,
    accentRgb: "12,34, 56",
    surfaceRgb: "999, 2, 3",
  });

  assert.equal(customPreset?.accentRgb, "12, 34, 56");
  assert.equal(customPreset?.surfaceRgb, "12, 18, 32");
  assert.equal(resolveBackgroundPreset(CUSTOM_BACKGROUND_ID, customPreset), customPreset);
});

test("reads a persisted custom background without trusting malformed values", () => {
  const values = new Map([
    [CUSTOM_BACKGROUND_DATA_STORAGE_KEY, SAFE_IMAGE],
    [CUSTOM_BACKGROUND_ACCENT_STORAGE_KEY, "44, 88, 132"],
    [CUSTOM_BACKGROUND_SURFACE_STORAGE_KEY, "8, 16, 24"],
  ]);
  const storage = { getItem: (key) => values.get(key) || null };

  assert.deepEqual(readStoredCustomBackgroundPreset(storage), {
    id: CUSTOM_BACKGROUND_ID,
    name: "My Background",
    file: SAFE_IMAGE,
    accentRgb: "44, 88, 132",
    surfaceRgb: "8, 16, 24",
    custom: true,
    layout: {
      version: 1,
      mode: "contain",
      focalX: 0.5,
      focalY: 0.5,
      faceAware: false,
      sourceAspect: 1,
    },
  });
});
