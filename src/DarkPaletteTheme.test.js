import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
const stylesheet = readFileSync(new URL("./App.css", import.meta.url), "utf8");
const settingsSource = readFileSync(new URL("./pages/SettingsPage.jsx", import.meta.url), "utf8");

test("keeps the dark Color Palette deeper without affecting image backgrounds", () => {
  const darkPaletteRule = stylesheet.match(
    /body\.dark:not\(\.has-bg-image\)\s*\{([\s\S]*?)\n\}/u,
  )?.[1] || "";

  assert.match(darkPaletteRule, /--palette-dark-canvas:\s*color-mix\(in srgb, var\(--bg\) 62%, #020617\);/u);
  assert.match(darkPaletteRule, /--palette-dark-depth:\s*color-mix\(in srgb, var\(--bg\) 44%, #020617\);/u);
  assert.match(darkPaletteRule, /--surface-strong:\s*rgba\(11, 19, 34, 0\.97\);/u);
  assert.match(darkPaletteRule, /linear-gradient\(135deg, var\(--palette-dark-canvas\), var\(--palette-dark-depth\)\);/u);
  assert.match(
    stylesheet,
    /body\.dark:not\(\.has-bg-image\) \.app-sidebar,[\s\S]*?var\(--palette-dark-canvas\)[\s\S]*?var\(--palette-dark-depth\)/u,
  );
  assert.match(settingsSource, /prepmatrix_bg_dark"\) \|\| "#070b15"/u);
  assert.match(appSource, /prepmatrix_bg_dark"\) \|\| "#070b15"/u);
});
