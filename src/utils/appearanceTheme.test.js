import assert from "node:assert/strict";
import test from "node:test";
import { resolveEffectiveDarkMode } from "./appearanceTheme.js";

test("uses the saved preference when no background image is active", () => {
  assert.equal(resolveEffectiveDarkMode(false, false), false);
  assert.equal(resolveEffectiveDarkMode(true, false), true);
});

test("forces dark components whenever a background image is active", () => {
  assert.equal(resolveEffectiveDarkMode(false, true), true);
  assert.equal(resolveEffectiveDarkMode(true, true), true);
});
