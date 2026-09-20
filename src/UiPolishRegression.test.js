import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appStyles = readFileSync(new URL("./App.css", import.meta.url), "utf8");
const codeMatrixStyles = readFileSync(new URL("./pages/CodeMatrixPage.css", import.meta.url), "utf8");
const cursorSource = readFileSync(new URL("./components/CustomCursor.jsx", import.meta.url), "utf8");
const resourcesSource = readFileSync(new URL("./components/ResourcesHub.jsx", import.meta.url), "utf8");

test("CodeMatrix primary actions keep deterministic dark-mode contrast", () => {
  assert.match(codeMatrixStyles, /body\.dark \.cmx-page \.cmx-button\.cmx-primary[\s\S]*?background: var\(--text\) !important;[\s\S]*?color: var\(--bg\) !important;/u);
});

test("material titles use the app typography system instead of a global strong tag", () => {
  assert.match(resourcesSource, /className="resource-subject-card__title"/u);
  assert.match(appStyles, /\.resource-subject-card__title\s*\{[\s\S]*?font-family: var\(--font-family-base/u);
  assert.match(appStyles, /\.resource-subject-card__title\s*\{[\s\S]*?overflow-wrap: anywhere;/u);
});

test("desktop density and custom cursor top-layer support stay wired", () => {
  assert.match(appStyles, /--app-ui-scale: 0\.9;/u);
  assert.match(appStyles, /body\s*\{\s*zoom: var\(--app-ui-scale\);/u);
  assert.match(appStyles, /--app-scaled-dynamic-viewport-height: 111\.111111dvh;/u);
  assert.match(appStyles, /\.auth-page--isolated\s*\{[\s\S]*?height: var\(--app-scaled-dynamic-viewport-height\) !important;/u);
  assert.match(appStyles, /\.voice-overlay-backdrop,[\s\S]*?width: var\(--app-scaled-viewport-width\) !important;/u);
  assert.match(cursorSource, /popover="manual"/u);
  assert.match(cursorSource, /window\.addEventListener\("pointermove", onPointerMove, \{ capture: true/u);
});

test("desktop content keeps one centered width across sidebar states", () => {
  assert.match(
    appStyles,
    /\.app-shell-layout\.has-sidebar \.app-main-content\s*\{[\s\S]*?width: calc\(var\(--app-scaled-viewport-width, 100vw\) - 280px\) !important;[\s\S]*?max-width: calc\(var\(--app-scaled-viewport-width, 100vw\) - 280px\) !important;/u,
  );
  assert.match(
    appStyles,
    /\.app-shell-layout\.has-sidebar\.is-sidebar-collapsed \.app-main-content\s*\{[\s\S]*?margin-left: 180px !important;[\s\S]*?width: calc\(var\(--app-scaled-viewport-width, 100vw\) - 280px\) !important;/u,
  );
});
