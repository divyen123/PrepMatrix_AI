import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
const appStyles = readFileSync(new URL("./App.css", import.meta.url), "utf8");

test("shows the logout animation over a translucent, theme-aware workspace", () => {
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
  assert.doesNotMatch(logoutSource, /logout-transition-background/u);
  assert.doesNotMatch(appStyles, /logout-transition-halo|logoutHaloPulse|logoutRingSpin|logout-transition-icon::before/u);
  assert.match(appStyles, /animation: logoutIconSlide/u);
  assert.match(appStyles, /animation: logoutProgressSweep/u);
  const overlayRule = appStyles.match(/\.logout-transition\s*\{([^}]*)\}/u)?.[1] || "";
  assert.match(overlayRule, /background: color-mix\([^;]+transparent\);/u);
  assert.match(overlayRule, /backdrop-filter: blur\(18px\) brightness\(0\.72\) saturate\(0\.84\);/u);
  assert.match(logoutSource, /--logout-theme-bg/u);
  assert.doesNotMatch(overlayRule, /background: var\(--bg\)|radial-gradient|rgba\(4, 8, 17/u);
});

test("keeps the existing workspace mounted until the logout overlay finishes", () => {
  const logoutHandler = appSource.slice(appSource.indexOf("const handleLogout"), appSource.indexOf("const handleAccountDeleted"));
  const exitStart = logoutHandler.indexOf('setLogoutTransitionPhase("exiting")');
  const exitCallback = logoutHandler.indexOf("logoutTransitionTimeoutRef.current = window.setTimeout");
  const clearProfile = logoutHandler.indexOf("setUserProfile(null)");

  assert.ok(exitStart >= 0);
  assert.ok(exitCallback > exitStart);
  assert.ok(clearProfile > exitCallback);
});
