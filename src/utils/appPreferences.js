import {
  AUTO_LOCK_DEFAULT_MINUTES,
  normalizeAutoLockMinutes,
} from "./autoLock.js";
import {
  DEFAULT_VOICE_PREFERENCES,
  normalizeVoicePreferences,
  VOICE_PREFERENCES_STORAGE_KEY,
} from "./voicePreferences.js";
import {
  BACKGROUND_IMAGE_BLUR_STORAGE_KEY,
  normalizeBackgroundImageBlurPx,
} from "./appearanceTheme.js";

export const APP_PREFERENCES_VERSION = 1;
export const APP_PREFERENCES_UPDATED_EVENT = "prepmatrix:app-preferences-updated";

const CUSTOM_BACKGROUND_ID = "custom-background";
const THEME_MODES = new Set(["light", "dark", "system"]);
const FONT_SIZES = new Set(["small", "medium", "large"]);
const CARD_SIZES = new Set(["compact", "cozy", "spacious"]);
const FONT_STYLES = new Set([
  "sans",
  "clean",
  "rounded",
  "geometric",
  "humanist",
  "editorial",
  "serif",
  "classic",
  "mono",
]);
const FONT_WEIGHTS = new Set(["light", "regular", "medium", "bold"]);
const CURSOR_STYLES = new Set(["default", "app-cursor", "blob-cursor"]);
const SAFE_HEX_COLOR = /^#[0-9a-f]{6}$/iu;
const SAFE_BACKGROUND_ID = /^[a-z0-9-]{0,80}$/u;

export const DEFAULT_APP_PREFERENCES = Object.freeze({
  version: APP_PREFERENCES_VERSION,
  themeMode: "light",
  fontSize: "medium",
  cardSize: "cozy",
  accentRgbLight: "7, 143, 120",
  accentRgbDark: "36, 199, 177",
  accentOpacity: 0.16,
  borderOpacity: 0.3,
  backgroundLight: "#f8fafc",
  backgroundDark: "#070b15",
  glassyPanels: true,
  glassyButtons: true,
  fontStyle: "sans",
  fontWeight: "regular",
  backgroundImageId: "",
  backgroundOverlayOpacity: 0.55,
  glassOpacity: 0.6,
  backgroundImageBlur: 0,
  cursorStyle: "app-cursor",
  autoHideTopBar: false,
  autoLockEnabled: false,
  autoLockMinutes: AUTO_LOCK_DEFAULT_MINUTES,
  soundEnabled: true,
  wakeMode: false,
  voicePreferences: DEFAULT_VOICE_PREFERENCES,
});

function enumValue(value, values, fallback) {
  const normalized = String(value || "").trim().toLowerCase();
  return values.has(normalized) ? normalized : fallback;
}

function booleanValue(value, fallback) {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return fallback;
}

function numberValue(value, fallback, min, max) {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function rgbValue(value, fallback) {
  const parts = String(value || "")
    .split(",")
    .map((part) => Number.parseInt(part.trim(), 10));
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return fallback;
  }
  return parts.join(", ");
}

function hexColor(value, fallback) {
  const normalized = String(value || "").trim();
  return SAFE_HEX_COLOR.test(normalized) ? normalized.toLowerCase() : fallback;
}

function backgroundId(value, fallback) {
  if (value === null || value === undefined) return fallback;
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === CUSTOM_BACKGROUND_ID) return "";
  return SAFE_BACKGROUND_ID.test(normalized) ? normalized : fallback;
}

function parseJson(value, fallback) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(String(value || ""));
  } catch {
    return fallback;
  }
}

export function normalizeAppPreferences(value = {}, fallbackValue = DEFAULT_APP_PREFERENCES) {
  const fallbackSource = fallbackValue && typeof fallbackValue === "object"
    ? fallbackValue
    : DEFAULT_APP_PREFERENCES;
  const fallback = fallbackSource === DEFAULT_APP_PREFERENCES
    ? DEFAULT_APP_PREFERENCES
    : normalizeAppPreferences(fallbackSource, DEFAULT_APP_PREFERENCES);
  const source = value && typeof value === "object" ? value : {};

  return {
    version: APP_PREFERENCES_VERSION,
    themeMode: enumValue(source.themeMode, THEME_MODES, fallback.themeMode),
    fontSize: enumValue(source.fontSize, FONT_SIZES, fallback.fontSize),
    cardSize: enumValue(source.cardSize, CARD_SIZES, fallback.cardSize),
    accentRgbLight: rgbValue(source.accentRgbLight, fallback.accentRgbLight),
    accentRgbDark: rgbValue(source.accentRgbDark, fallback.accentRgbDark),
    accentOpacity: numberValue(source.accentOpacity, fallback.accentOpacity, 0.02, 1),
    borderOpacity: numberValue(source.borderOpacity, fallback.borderOpacity, 0.02, 1),
    backgroundLight: hexColor(source.backgroundLight, fallback.backgroundLight),
    backgroundDark: hexColor(source.backgroundDark, fallback.backgroundDark),
    glassyPanels: booleanValue(source.glassyPanels, fallback.glassyPanels),
    glassyButtons: booleanValue(source.glassyButtons, fallback.glassyButtons),
    fontStyle: enumValue(source.fontStyle, FONT_STYLES, fallback.fontStyle),
    fontWeight: enumValue(source.fontWeight, FONT_WEIGHTS, fallback.fontWeight),
    backgroundImageId: backgroundId(source.backgroundImageId, fallback.backgroundImageId),
    backgroundOverlayOpacity: numberValue(
      source.backgroundOverlayOpacity,
      fallback.backgroundOverlayOpacity,
      0,
      1,
    ),
    glassOpacity: numberValue(source.glassOpacity, fallback.glassOpacity, 0, 1),
    backgroundImageBlur: normalizeBackgroundImageBlurPx(
      source.backgroundImageBlur ?? fallback.backgroundImageBlur,
    ),
    cursorStyle: enumValue(source.cursorStyle, CURSOR_STYLES, fallback.cursorStyle),
    autoHideTopBar: booleanValue(source.autoHideTopBar, fallback.autoHideTopBar),
    autoLockEnabled: booleanValue(source.autoLockEnabled, fallback.autoLockEnabled),
    autoLockMinutes: normalizeAutoLockMinutes(
      source.autoLockMinutes,
      fallback.autoLockMinutes,
    ),
    soundEnabled: booleanValue(source.soundEnabled, fallback.soundEnabled),
    wakeMode: booleanValue(source.wakeMode, fallback.wakeMode),
    voicePreferences: normalizeVoicePreferences(
      source.voicePreferences || fallback.voicePreferences,
    ),
  };
}

function resolveStorage(storage) {
  if (storage !== undefined) return storage;
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function readStoredAppPreferences(storage) {
  const target = resolveStorage(storage);
  if (!target?.getItem) return normalizeAppPreferences();

  try {
    const storedThemeMode = target.getItem("prepmatrix_theme_mode");
    const legacyTheme = target.getItem("prepmatrix_default_theme");
    const storedBackgroundId = target.getItem("prepmatrix_bg_image_id") || "";
    return normalizeAppPreferences({
      themeMode: storedThemeMode || legacyTheme,
      fontSize: target.getItem("prepmatrix_font_size"),
      cardSize: target.getItem("prepmatrix_card_size"),
      accentRgbLight: target.getItem("prepmatrix_accent_rgb_light"),
      accentRgbDark: target.getItem("prepmatrix_accent_rgb_dark"),
      accentOpacity: target.getItem("prepmatrix_accent_opacity"),
      borderOpacity: target.getItem("prepmatrix_border_opacity"),
      backgroundLight: target.getItem("prepmatrix_bg_light"),
      backgroundDark: target.getItem("prepmatrix_bg_dark"),
      glassyPanels: target.getItem("prepmatrix_glassy_panels"),
      glassyButtons: target.getItem("prepmatrix_glassy_buttons"),
      fontStyle: target.getItem("prepmatrix_font_style"),
      fontWeight: target.getItem("prepmatrix_font_weight"),
      backgroundImageId: storedBackgroundId === CUSTOM_BACKGROUND_ID ? "" : storedBackgroundId,
      backgroundOverlayOpacity: target.getItem("prepmatrix_bg_overlay_opacity"),
      glassOpacity: target.getItem("prepmatrix_glass_opacity"),
      backgroundImageBlur: target.getItem(BACKGROUND_IMAGE_BLUR_STORAGE_KEY),
      cursorStyle: target.getItem("prepmatrix_cursor_style"),
      autoHideTopBar: target.getItem("prepmatrix_topbar_auto_hide"),
      autoLockEnabled: target.getItem("prepmatrix_auto_lock_enabled"),
      autoLockMinutes: target.getItem("prepmatrix_auto_lock_minutes"),
      soundEnabled: target.getItem("prepmatrix_sound_enabled"),
      wakeMode: target.getItem("prepmatrix_wake_mode"),
      voicePreferences: parseJson(
        target.getItem(VOICE_PREFERENCES_STORAGE_KEY),
        DEFAULT_VOICE_PREFERENCES,
      ),
    });
  } catch {
    return normalizeAppPreferences();
  }
}

// The selected pointer is a device preference. A server snapshot can lag behind
// a recent local selection (for example when the API was asleep during save),
// but a preference from another account must never be applied here.
export function preferStoredCursorStyleForOwner(preferences, storage, ownerKey, storedOwnerKey) {
  const normalized = normalizeAppPreferences(preferences);
  if (!ownerKey || String(ownerKey) !== String(storedOwnerKey || "") || !storage?.getItem) {
    return normalized;
  }

  try {
    const storedStyle = storage.getItem("prepmatrix_cursor_style");
    return CURSOR_STYLES.has(storedStyle)
      ? { ...normalized, cursorStyle: storedStyle }
      : normalized;
  } catch {
    return normalized;
  }
}

export function writeStoredAppPreferences(preferences, storage, options = {}) {
  const target = resolveStorage(storage);
  const normalized = normalizeAppPreferences(preferences);
  if (!target?.setItem) return normalized;

  const preserveLocalCustomBackground = options.preserveLocalCustomBackground !== false;
  try {
    const currentBackgroundId = target.getItem("prepmatrix_bg_image_id") || "";
    target.setItem("prepmatrix_theme_mode", normalized.themeMode);
    target.setItem(
      "prepmatrix_default_theme",
      normalized.themeMode === "dark" ? "dark" : "light",
    );
    target.setItem("prepmatrix_font_size", normalized.fontSize);
    target.setItem("prepmatrix_card_size", normalized.cardSize);
    target.setItem("prepmatrix_accent_rgb_light", normalized.accentRgbLight);
    target.setItem("prepmatrix_accent_rgb_dark", normalized.accentRgbDark);
    target.setItem("prepmatrix_accent_opacity", String(normalized.accentOpacity));
    target.setItem("prepmatrix_border_opacity", String(normalized.borderOpacity));
    target.setItem("prepmatrix_bg_light", normalized.backgroundLight);
    target.setItem("prepmatrix_bg_dark", normalized.backgroundDark);
    target.setItem("prepmatrix_glassy_panels", String(normalized.glassyPanels));
    target.setItem("prepmatrix_glassy_buttons", String(normalized.glassyButtons));
    target.setItem("prepmatrix_font_style", normalized.fontStyle);
    target.setItem("prepmatrix_font_weight", normalized.fontWeight);
    if (!(preserveLocalCustomBackground && currentBackgroundId === CUSTOM_BACKGROUND_ID)) {
      target.setItem("prepmatrix_bg_image_id", normalized.backgroundImageId);
    }
    target.setItem(
      "prepmatrix_bg_overlay_opacity",
      String(normalized.backgroundOverlayOpacity),
    );
    target.setItem("prepmatrix_glass_opacity", String(normalized.glassOpacity));
    target.setItem(BACKGROUND_IMAGE_BLUR_STORAGE_KEY, String(normalized.backgroundImageBlur));
    target.setItem("prepmatrix_cursor_style", normalized.cursorStyle);
    target.setItem("prepmatrix_topbar_auto_hide", String(normalized.autoHideTopBar));
    target.setItem("prepmatrix_auto_lock_enabled", String(normalized.autoLockEnabled));
    target.setItem("prepmatrix_auto_lock_minutes", String(normalized.autoLockMinutes));
    target.setItem("prepmatrix_sound_enabled", String(normalized.soundEnabled));
    target.setItem("prepmatrix_wake_mode", String(normalized.wakeMode));
    target.setItem(VOICE_PREFERENCES_STORAGE_KEY, JSON.stringify(normalized.voicePreferences));
  } catch {
    // Live preferences remain usable if browser storage is temporarily unavailable.
  }
  return normalized;
}

export function appPreferencesEqual(left, right) {
  return JSON.stringify(normalizeAppPreferences(left))
    === JSON.stringify(normalizeAppPreferences(right));
}

export function notifyAppPreferencesUpdated(windowObject = globalThis?.window) {
  windowObject?.dispatchEvent?.(new CustomEvent(APP_PREFERENCES_UPDATED_EVENT));
}
