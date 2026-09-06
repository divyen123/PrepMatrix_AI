import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
const appStyles = readFileSync(new URL("./App.css", import.meta.url), "utf8");

test("keeps logout content and animation without a central card surface", () => {
  assert.match(appSource, /className="logout-transition-icon"/u);
  assert.match(appSource, /className="logout-transition-copy"/u);
  assert.match(appSource, /className="logout-transition-progress"/u);

  const panelRule = appStyles.match(/\.logout-transition-panel\s*\{([^}]*)\}/u)?.[1] || "";
  assert.match(panelRule, /background: transparent;/u);
  assert.match(panelRule, /border: 0;/u);
  assert.match(panelRule, /border-radius: 0;/u);
  assert.match(panelRule, /box-shadow: none;/u);
  assert.match(panelRule, /animation: logoutPanelEnter/u);
  assert.doesNotMatch(panelRule, /surface-strong|rgba\(0, 0, 0, 0\.38\)/u);

  assert.match(appStyles, /\.logout-transition-panel:focus\s*\{\s*outline: none;/u);
  assert.match(appStyles, /\.logout-transition-icon::before\s*\{[^}]*animation: logoutRingSpin/u);
});
