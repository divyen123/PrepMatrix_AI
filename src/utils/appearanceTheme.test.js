import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeBackgroundImageBlurPx,
  resolveBackgroundImageBlurPx,
  resolveEffectiveDarkMode,
} from "./appearanceTheme.js";

test("uses the saved preference when no background image is active", () => {
  assert.equal(resolveEffectiveDarkMode(false, false), false);
  assert.equal(resolveEffectiveDarkMode(true, false), true);
});

test("forces dark components whenever a background image is active", () => {
  assert.equal(resolveEffectiveDarkMode(false, true), true);
  assert.equal(resolveEffectiveDarkMode(true, true), true);
});

test("normalizes background image blur values", () => {
  assert.equal(normalizeBackgroundImageBlurPx(8), 8);
  assert.equal(normalizeBackgroundImageBlurPx("12"), 12);
  assert.equal(normalizeBackgroundImageBlurPx("7.5"), 7.5);
});

test("defaults invalid background image blur values to zero", () => {
  for (const value of [undefined, null, "", "   ", "blur", "12px", NaN, Infinity, -Infinity]) {
    assert.equal(normalizeBackgroundImageBlurPx(value), 0);
  }
});

test("clamps background image blur between zero and twenty pixels", () => {
  assert.equal(normalizeBackgroundImageBlurPx(-1), 0);
  assert.equal(normalizeBackgroundImageBlurPx(0), 0);
  assert.equal(normalizeBackgroundImageBlurPx(20), 20);
  assert.equal(normalizeBackgroundImageBlurPx(21), 20);
});

test("disables background blur when no image is active", () => {
  assert.equal(resolveBackgroundImageBlurPx(14, false), 0);
  assert.equal(resolveBackgroundImageBlurPx(14, true), 14);
  assert.equal(resolveBackgroundImageBlurPx(99, true), 20);
});
