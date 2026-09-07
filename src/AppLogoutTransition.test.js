import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
const appStyles = readFileSync(new URL("./App.css", import.meta.url), "utf8");

test("keeps only logout text and animation without decorative glows or rings", () => {
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
  assert.doesNotMatch(appSource, /Closing your session securely|logout-transition-halo/u);
  const logoutSource = appSource.slice(appSource.indexOf("function LogoutTransition"), appSource.indexOf("function RouteLoading"));
  assert.match(logoutSource, /<h2>Logging out\.\.\.<\/h2>/u);
  assert.doesNotMatch(logoutSource, /<span>PrepMatrix<\/span>/u);
  assert.doesNotMatch(appStyles, /logout-transition-halo|logoutHaloPulse|logoutRingSpin|logout-transition-icon::before/u);
  assert.match(appStyles, /animation: logoutIconSlide/u);
  assert.match(appStyles, /animation: logoutProgressSweep/u);
  const overlayRule = appStyles.match(/\.logout-transition\s*\{([^}]*)\}/u)?.[1] || "";
  assert.match(overlayRule, /background: var\(--bg\);/u);
  assert.doesNotMatch(overlayRule, /radial-gradient|rgba\(4, 8, 17|backdrop-filter/u);
});
