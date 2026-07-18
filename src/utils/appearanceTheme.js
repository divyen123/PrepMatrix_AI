export const BACKGROUND_IMAGE_BLUR_STORAGE_KEY = "prepmatrix_bg_image_blur";
export const BACKGROUND_IMAGE_BLUR_MIN_PX = 0;
export const BACKGROUND_IMAGE_BLUR_MAX_PX = 20;
export const DEFAULT_BACKGROUND_IMAGE_BLUR_PX = 0;

export function normalizeBackgroundImageBlurPx(value) {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim() !== ""
      ? Number(value)
      : Number.NaN;

  if (!Number.isFinite(parsed)) return DEFAULT_BACKGROUND_IMAGE_BLUR_PX;
  return Math.min(
    BACKGROUND_IMAGE_BLUR_MAX_PX,
    Math.max(BACKGROUND_IMAGE_BLUR_MIN_PX, parsed),
  );
}

export function resolveBackgroundImageBlurPx(value, hasBackgroundImage = false) {
  return hasBackgroundImage
    ? normalizeBackgroundImageBlurPx(value)
    : DEFAULT_BACKGROUND_IMAGE_BLUR_PX;
}

export function resolveEffectiveDarkMode(preferredDarkMode, hasBackgroundImage = false) {
  return Boolean(preferredDarkMode || hasBackgroundImage);
}
