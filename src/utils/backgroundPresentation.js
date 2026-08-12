export const BACKGROUND_LAYOUT_VERSION = 1;
export const BACKGROUND_FIT_COVER = "cover";
export const BACKGROUND_FIT_CONTAIN = "contain";

const DEFAULT_FOCAL_POINT = 0.5;
const CONTAIN_BACKDROP_BLUR_PX = 18;
const CONTAIN_BACKDROP_INSET_PX = -28;

export const BACKGROUND_PRESENTATION_CSS_PROPERTIES = Object.freeze([
  "--bg-image-position",
  "--bg-image-foreground",
  "--bg-image-foreground-size",
  "--bg-image-foreground-position",
  "--bg-image-backdrop-blur-extra",
  "--bg-image-backdrop-inset-extra",
  "--bg-image-foreground-brightness",
]);

function clampUnitInterval(value, fallback = DEFAULT_FOCAL_POINT) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(1, Math.max(0, parsed));
}

function resolveFocalCoordinate(layout, axis) {
  const directValue = layout?.[`focal${axis.toUpperCase()}`];
  const nestedValue = layout?.focalPoint?.[axis];
  return clampUnitInterval(directValue ?? nestedValue);
}

function toPercentage(value) {
  return `${Number((clampUnitInterval(value) * 100).toFixed(2))}%`;
}

/**
 * Converts persisted or freshly detected framing metadata into one stable shape.
 * Missing custom-image metadata intentionally falls back to `contain`, ensuring
 * older uploaded portraits are not cropped before they are analysed again.
 */
export function normalizeCustomBackgroundLayout(layout) {
  const requestedFit = String(layout?.fit ?? layout?.mode ?? "").toLowerCase();
  const fit = requestedFit === BACKGROUND_FIT_COVER
    ? BACKGROUND_FIT_COVER
    : BACKGROUND_FIT_CONTAIN;

  return {
    version: BACKGROUND_LAYOUT_VERSION,
    fit,
    focalX: resolveFocalCoordinate(layout, "x"),
    focalY: resolveFocalCoordinate(layout, "y"),
    faceAware: Boolean(layout?.faceAware ?? layout?.facesDetected),
  };
}

/** Returns rendering instructions that can also be used by transition layers. */
export function getBackgroundPresentation(preset) {
  const layout = preset?.custom
    ? normalizeCustomBackgroundLayout(preset.layout)
    : {
        fit: BACKGROUND_FIT_COVER,
        focalX: DEFAULT_FOCAL_POINT,
        focalY: DEFAULT_FOCAL_POINT,
        faceAware: false,
      };
  const foreground = Boolean(preset?.custom && layout.fit === BACKGROUND_FIT_CONTAIN);

  return {
    ...layout,
    position: `${toPercentage(layout.focalX)} ${toPercentage(layout.focalY)}`,
    foreground,
    backgroundSize: BACKGROUND_FIT_COVER,
    foregroundSize: foreground ? BACKGROUND_FIT_CONTAIN : BACKGROUND_FIT_COVER,
    foregroundPosition: "center",
    backdropBlurExtra: foreground ? `${CONTAIN_BACKDROP_BLUR_PX}px` : "0px",
    backdropInsetExtra: foreground ? `${CONTAIN_BACKDROP_INSET_PX}px` : "0px",
  };
}

export function getBackgroundPresentationVariables(preset) {
  const presentation = getBackgroundPresentation(preset);
  return {
    "--bg-image-position": presentation.position,
    "--bg-image-foreground": presentation.foreground ? "var(--bg-image)" : "none",
    "--bg-image-foreground-size": presentation.foregroundSize,
    "--bg-image-foreground-position": presentation.foregroundPosition,
    "--bg-image-backdrop-blur-extra": presentation.backdropBlurExtra,
    "--bg-image-backdrop-inset-extra": presentation.backdropInsetExtra,
    "--bg-image-foreground-brightness": presentation.foreground
      ? "var(--bg-brightness, 1)"
      : "1",
  };
}

export function getBackgroundThumbnailPresentationVariables(preset) {
  const presentation = getBackgroundPresentation(preset);
  return {
    "--background-thumbnail-size": presentation.foregroundSize,
    "--background-thumbnail-position": presentation.foreground
      ? presentation.foregroundPosition
      : presentation.position,
  };
}

function normalizeTargets(targetOrTargets) {
  if (!targetOrTargets) return [];
  if (typeof targetOrTargets.style?.setProperty === "function") return [targetOrTargets];
  if (typeof targetOrTargets[Symbol.iterator] === "function") {
    return [...targetOrTargets].filter((target) => typeof target?.style?.setProperty === "function");
  }
  return [];
}

export function applyBackgroundPresentation(targetOrTargets, preset) {
  const variables = getBackgroundPresentationVariables(preset);
  for (const target of normalizeTargets(targetOrTargets)) {
    for (const [property, value] of Object.entries(variables)) {
      target.style.setProperty(property, value);
    }
  }
  return variables;
}

export function clearBackgroundPresentation(targetOrTargets) {
  for (const target of normalizeTargets(targetOrTargets)) {
    for (const property of BACKGROUND_PRESENTATION_CSS_PROPERTIES) {
      target.style.removeProperty(property);
    }
  }
}
