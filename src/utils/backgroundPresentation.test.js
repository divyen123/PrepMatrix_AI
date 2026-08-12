import assert from "node:assert/strict";
import test from "node:test";
import {
  BACKGROUND_PRESENTATION_CSS_PROPERTIES,
  applyBackgroundPresentation,
  clearBackgroundPresentation,
  getBackgroundPresentation,
  getBackgroundPresentationVariables,
  getBackgroundThumbnailPresentationVariables,
  normalizeCustomBackgroundLayout,
} from "./backgroundPresentation.js";

function createStyleTarget() {
  const values = new Map();
  return {
    style: {
      setProperty: (property, value) => values.set(property, value),
      removeProperty: (property) => values.delete(property),
    },
    values,
  };
}

test("normalizes detected custom framing and clamps focal coordinates", () => {
  assert.deepEqual(
    normalizeCustomBackgroundLayout({
      mode: "cover",
      focalPoint: { x: -0.4, y: 1.4 },
      facesDetected: true,
    }),
    { version: 1, fit: "cover", focalX: 0, focalY: 1, faceAware: true },
  );
});

test("uses a safe full-image fallback for old custom presets without layout metadata", () => {
  const presentation = getBackgroundPresentation({ custom: true });
  assert.equal(presentation.fit, "contain");
  assert.equal(presentation.foreground, true);
  assert.equal(presentation.position, "50% 50%");
});

test("renders contained custom images over an independently filled backdrop", () => {
  const variables = getBackgroundPresentationVariables({
    custom: true,
    layout: { fit: "contain", focalX: 0.72, focalY: 0.2, faceAware: true },
  });
  assert.equal(variables["--bg-image-position"], "72% 20%");
  assert.equal(variables["--bg-image-foreground"], "var(--bg-image)");
  assert.equal(variables["--bg-image-foreground-size"], "contain");
  assert.equal(variables["--bg-image-backdrop-blur-extra"], "18px");
  assert.equal(variables["--bg-image-backdrop-inset-extra"], "-28px");
});

test("uses focal cover rendering without a duplicate foreground when requested", () => {
  const preset = {
    custom: true,
    layout: { fit: "cover", focalX: 0.33333, focalY: 0.66666 },
  };
  const variables = getBackgroundPresentationVariables(preset);
  assert.equal(variables["--bg-image-position"], "33.33% 66.67%");
  assert.equal(variables["--bg-image-foreground"], "none");
  assert.equal(variables["--bg-image-backdrop-blur-extra"], "0px");
  assert.deepEqual(getBackgroundThumbnailPresentationVariables(preset), {
    "--background-thumbnail-size": "cover",
    "--background-thumbnail-position": "33.33% 66.67%",
  });
});

test("built-in presets always reset to centered cover rendering", () => {
  const variables = getBackgroundPresentationVariables({
    custom: false,
    layout: { fit: "contain", focalX: 0, focalY: 0 },
  });
  assert.equal(variables["--bg-image-position"], "50% 50%");
  assert.equal(variables["--bg-image-foreground"], "none");
  assert.equal(variables["--bg-image-foreground-size"], "cover");
});

test("applies to one or many targets and clears stale presentation state", () => {
  const first = createStyleTarget();
  const second = createStyleTarget();
  applyBackgroundPresentation([first, second], { custom: true });
  assert.equal(first.values.size, BACKGROUND_PRESENTATION_CSS_PROPERTIES.length);
  assert.equal(second.values.get("--bg-image-foreground"), "var(--bg-image)");

  applyBackgroundPresentation(first, { custom: false });
  assert.equal(first.values.get("--bg-image-foreground"), "none");
  assert.equal(first.values.get("--bg-image-backdrop-inset-extra"), "0px");

  clearBackgroundPresentation([first, second]);
  assert.equal(first.values.size, 0);
  assert.equal(second.values.size, 0);
});
