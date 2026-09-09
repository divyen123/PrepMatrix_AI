import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
const stylesheet = readFileSync(new URL("../App.css", import.meta.url), "utf8");

function ruleFor(selector) {
  const start = stylesheet.lastIndexOf(`${selector} {`);
  const end = stylesheet.indexOf("}", start);
  assert.ok(start >= 0 && end > start, `Missing CSS rule for ${selector}`);
  return stylesheet.slice(start, end + 1);
}

test("owns the selected app background outside the keyed route tree", () => {
  const componentStart = appSource.indexOf("function AppBackground");
  const componentEnd = appSource.indexOf("\nfunction ", componentStart + 1);
  assert.ok(componentStart >= 0 && componentEnd > componentStart);

  const componentSource = appSource.slice(componentStart, componentEnd);
  assert.match(componentSource, /className="app-background-layer"/u);
  assert.match(componentSource, /className="app-background-backdrop"/u);
  assert.match(componentSource, /className="app-background-foreground"/u);
  assert.match(componentSource, /className="app-background-overlay"/u);

  assert.match(
    appSource,
    /return\s*\(\s*<>\s*\{hasActiveBackgroundImage\s*&&\s*!appLocked\s*&&\s*<AppBackground\s*\/>\}\s*<div\s+className=\{`app-container/u,
  );
});

test("anchors every selected-background layer to one clipped viewport host", () => {
  const hostRule = ruleFor(".app-background-layer");
  const backdropRule = ruleFor(".app-background-backdrop");
  const foregroundRule = ruleFor(".app-background-foreground");
  const overlayRule = ruleFor(".app-background-overlay");
  const layerRules = [hostRule, backdropRule, foregroundRule, overlayRule].join("\n");

  assert.match(hostRule, /position:\s*fixed;/u);
  assert.match(hostRule, /top:\s*0;/u);
  assert.match(hostRule, /left:\s*0;/u);
  assert.match(hostRule, /height:\s*100lvh;/u);
  assert.match(hostRule, /width:\s*100vw;/u);
  assert.match(hostRule, /overflow:\s*hidden;/u);
  assert.match(hostRule, /pointer-events:\s*none;/u);

  assert.match(backdropRule, /background-image:\s*var\(--bg-image\);/u);
  assert.match(backdropRule, /background-position:\s*var\(--bg-image-position,\s*center\);/u);
  assert.match(foregroundRule, /background-image:\s*var\(--bg-image-foreground,\s*none\);/u);
  assert.match(foregroundRule, /background-size:\s*var\(--bg-image-foreground-size,\s*cover\);/u);
  assert.match(overlayRule, /var\(--bg-overlay-opacity,\s*0\.55\)/u);
  assert.doesNotMatch(layerRules, /background-attachment:\s*fixed/u);

  assert.match(
    stylesheet,
    /html:has\(body\.has-bg-image\),\s*body\.has-bg-image\s*\{[^}]*overscroll-behavior-y:\s*none;/u,
  );
  assert.match(stylesheet, /\.app-container\s*\{[^}]*z-index:\s*1;/u);
  assert.match(
    stylesheet,
    /body\.has-bg-image::before,\s*body\.has-bg-image::after\s*\{\s*content:\s*none;/u,
  );
  assert.doesNotMatch(
    stylesheet,
    /body\.has-bg-image::(?:before|after)\s*\{[^}]*background-image:/u,
  );
  assert.match(
    stylesheet,
    /body\.has-bg-image \.app-container::before,\s*body\.has-bg-image \.app-container::after,[\s\S]*?display:\s*none !important;/u,
  );
});
