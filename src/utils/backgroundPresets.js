// Background image presets with curated theme metadata.
// Each preset defines the image path, a display name, and
// colour values derived from the dominant tones of the image
// so the sidebar, topbar, cards and text adapt automatically.

export const CUSTOM_BACKGROUND_ID = "custom-background";
export const CUSTOM_BACKGROUND_DATA_STORAGE_KEY = "prepmatrix_custom_bg_data";
export const CUSTOM_BACKGROUND_ACCENT_STORAGE_KEY = "prepmatrix_custom_bg_accent_rgb";
export const CUSTOM_BACKGROUND_SURFACE_STORAGE_KEY = "prepmatrix_custom_bg_surface_rgb";
export const CUSTOM_BACKGROUND_LAYOUT_STORAGE_KEY = "prepmatrix_custom_bg_layout_v1";
export const CUSTOM_BACKGROUND_MAX_DATA_URL_LENGTH = 2_400_000;

const DEFAULT_CUSTOM_ACCENT_RGB = "120, 160, 210";
const DEFAULT_CUSTOM_SURFACE_RGB = "12, 18, 32";
const SAFE_DATA_IMAGE_PREFIX = /^data:image\/(?:jpeg|png|webp);base64,/i;
const SAFE_RGB_VALUE = /^(?:\d{1,3},\s*){2}\d{1,3}$/;
const DEFAULT_CUSTOM_BACKGROUND_LAYOUT = Object.freeze({
  version: 1,
  mode: "contain",
  focalX: 0.5,
  focalY: 0.5,
  faceAware: false,
  sourceAspect: 1,
});

const BACKGROUND_PRESETS = [
  {
    id: "sunset-valley",
    name: "Sunset Valley",
    file: "/backgrounds/pexels-israelpinapol-11991514.jpg",
    accentRgb: "168, 140, 190",
    surfaceRgb: "18, 22, 42",
  },
  {
    id: "crescent-moon",
    name: "Crescent Moon",
    file: "/backgrounds/pexels-mag-photography-1501456-5266990.jpg",
    accentRgb: "175, 175, 195",
    surfaceRgb: "6, 6, 14",
  },
  {
    id: "rain-droplets",
    name: "Rain Droplets",
    file: "/backgrounds/pexels-matheusnatan-3394939.jpg",
    accentRgb: "32, 190, 170",
    surfaceRgb: "8, 38, 36",
  },
  {
    id: "morning-dew",
    name: "Morning Dew",
    file: "/backgrounds/pexels-nikola-tomasic-58494762-24712964.jpg",
    accentRgb: "130, 155, 172",
    surfaceRgb: "18, 26, 38",
  },
  {
    id: "code-screen",
    name: "Code Screen",
    file: "/backgrounds/pexels-simonptr-33607952.jpg",
    accentRgb: "52, 176, 228",
    surfaceRgb: "5, 10, 20",
  },
];

export const KIDS_BACKGROUND_PRESETS = Object.freeze([
  {
    id: "kids-storybook-garden",
    name: "Storybook Garden",
    file: "/backgrounds/kids-storybook-garden.jpg",
    accentRgb: "255, 186, 64",
    surfaceRgb: "52, 35, 18",
  },
  {
    id: "kids-sky-adventure",
    name: "Sky Adventure",
    file: "/backgrounds/kids-sky-adventure.jpg",
    accentRgb: "58, 177, 238",
    surfaceRgb: "10, 47, 82",
  },
  {
    id: "kids-sunny-meadow",
    name: "Sunny Meadow",
    file: "/backgrounds/kids-sunny-meadow.jpg",
    accentRgb: "105, 196, 78",
    surfaceRgb: "31, 63, 22",
  },
  {
    id: "kids-winter-walk",
    name: "Winter Walk",
    file: "/backgrounds/kids-winter-walk.jpg",
    accentRgb: "116, 150, 224",
    surfaceRgb: "20, 32, 68",
  },
  {
    id: "kids-night-hero",
    name: "Night Hero",
    file: "/backgrounds/kids-night-hero.jpg",
    accentRgb: "205, 210, 224",
    surfaceRgb: "4, 5, 9",
  },
]);

const ALL_BACKGROUND_PRESETS = Object.freeze([
  ...BACKGROUND_PRESETS,
  ...KIDS_BACKGROUND_PRESETS,
]);

const KIDS_BACKGROUND_PRESET_IDS = new Set(
  KIDS_BACKGROUND_PRESETS.map(({ id }) => id),
);

function normalizeRgb(value, fallback) {
  if (!SAFE_RGB_VALUE.test(String(value || "").trim())) return fallback;
  const channels = String(value).split(",").map((channel) => Number(channel.trim()));
  if (channels.some((channel) => !Number.isInteger(channel) || channel < 0 || channel > 255)) {
    return fallback;
  }
  return channels.join(", ");
}

export function isSafeCustomBackgroundDataUrl(value) {
  if (typeof value !== "string" || value.length > CUSTOM_BACKGROUND_MAX_DATA_URL_LENGTH) {
    return false;
  }
  const prefixMatch = value.match(SAFE_DATA_IMAGE_PREFIX);
  if (!prefixMatch) return false;
  const payload = value.slice(prefixMatch[0].length);
  return payload.length > 0 && !/[^a-z\d+/=]/i.test(payload);
}

export function normalizeCustomBackgroundLayout(value) {
  let layout = value;
  if (typeof layout === "string") {
    try {
      layout = JSON.parse(layout);
    } catch {
      return { ...DEFAULT_CUSTOM_BACKGROUND_LAYOUT };
    }
  }
  if (!layout || typeof layout !== "object" || layout.version !== 1) {
    return { ...DEFAULT_CUSTOM_BACKGROUND_LAYOUT };
  }

  const focalX = Number(layout.focalX);
  const focalY = Number(layout.focalY);
  const sourceAspect = Number(layout.sourceAspect);
  if (
    !["cover", "contain"].includes(layout.mode)
    || !Number.isFinite(focalX) || focalX < 0 || focalX > 1
    || !Number.isFinite(focalY) || focalY < 0 || focalY > 1
    || !Number.isFinite(sourceAspect) || sourceAspect < 0.05 || sourceAspect > 20
  ) {
    return { ...DEFAULT_CUSTOM_BACKGROUND_LAYOUT };
  }

  return {
    version: 1,
    mode: layout.mode,
    focalX,
    focalY,
    faceAware: layout.faceAware === true,
    sourceAspect,
  };
}

export function createCustomBackgroundPreset({
  file,
  accentRgb,
  surfaceRgb,
  layout,
} = {}) {
  if (!isSafeCustomBackgroundDataUrl(file)) return undefined;
  return {
    id: CUSTOM_BACKGROUND_ID,
    name: "My Background",
    file,
    accentRgb: normalizeRgb(accentRgb, DEFAULT_CUSTOM_ACCENT_RGB),
    surfaceRgb: normalizeRgb(surfaceRgb, DEFAULT_CUSTOM_SURFACE_RGB),
    custom: true,
    layout: normalizeCustomBackgroundLayout(layout),
  };
}

export function readStoredCustomBackgroundPreset(storage = globalThis?.localStorage) {
  if (!storage?.getItem) return undefined;
  try {
    return createCustomBackgroundPreset({
      file: storage.getItem(CUSTOM_BACKGROUND_DATA_STORAGE_KEY) || "",
      accentRgb: storage.getItem(CUSTOM_BACKGROUND_ACCENT_STORAGE_KEY) || "",
      surfaceRgb: storage.getItem(CUSTOM_BACKGROUND_SURFACE_STORAGE_KEY) || "",
      layout: storage.getItem(CUSTOM_BACKGROUND_LAYOUT_STORAGE_KEY) || undefined,
    });
  } catch {
    return undefined;
  }
}

export function isKidsBackgroundGalleryEligible(profile = {}, youngKidsMode = false) {
  if (youngKidsMode || profile?.band === "early") return true;
  const classNumber = Number(profile?.classNumber);
  return Number.isInteger(classNumber) && classNumber >= 1 && classNumber <= 5;
}

export function isKidsBackgroundPresetId(id) {
  return KIDS_BACKGROUND_PRESET_IDS.has(String(id || "").trim());
}

export function resolveBackgroundPreset(id, customPreset) {
  const normalizedId = String(id || "").trim();
  if (normalizedId === CUSTOM_BACKGROUND_ID) {
    return customPreset || readStoredCustomBackgroundPreset();
  }
  return ALL_BACKGROUND_PRESETS.find((preset) => preset.id === normalizedId);
}

export function resolveBackgroundPresetForProfile(
  id,
  {
    customPreset,
    kidsBackgroundsEligible,
    profile = {},
    youngKidsMode = false,
  } = {},
) {
  const kidsThemeAllowed = typeof kidsBackgroundsEligible === "boolean"
    ? kidsBackgroundsEligible
    : isKidsBackgroundGalleryEligible(profile, youngKidsMode);
  if (isKidsBackgroundPresetId(id) && !kidsThemeAllowed) {
    return undefined;
  }

  return resolveBackgroundPreset(id, customPreset);
}

export default BACKGROUND_PRESETS;
