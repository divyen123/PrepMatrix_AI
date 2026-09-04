import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("renders an accessible password-gated app lock dialog", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { default: AppLockOverlay } = await vite.ssrLoadModule(
      "/src/components/AppLockOverlay.jsx",
    );
    const markup = renderToStaticMarkup(React.createElement(AppLockOverlay, {
      errorMessage: "That password is incorrect. Try again.",
      onLogout() {},
      onUnlock() {},
      userLabel: "student@example.com",
    }));

    assert.match(markup, /role="dialog"/u);
    assert.match(markup, /aria-modal="true"/u);
    assert.match(markup, /PrepMatrix is locked/u);
    assert.match(markup, /autoComplete="current-password"/u);
    assert.match(markup, /type="password"/u);
    assert.match(markup, /That password is incorrect\. Try again\./u);
    assert.match(markup, /Log out instead/u);
  } finally {
    await vite.close();
  }
});

test("persists lock state per browser session and verifies the account password", () => {
  const appSource = readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
  const stylesheet = readFileSync(new URL("./AppLockOverlay.css", import.meta.url), "utf8");

  assert.match(appSource, /APP_LOCK_STORAGE_KEY = "prepmatrix_app_locked"/u);
  assert.match(appSource, /sessionStorage\.setItem\(APP_LOCK_STORAGE_KEY, "true"\)/u);
  assert.match(appSource, /api\.post\("\/api\/auth\/check-password", \{ password \}\)/u);
  assert.match(appSource, /sessionStorage\.removeItem\(APP_LOCK_STORAGE_KEY\)/u);
  assert.match(appSource, /disabled: authLoading \|\| !userProfile \|\| appLocked/u);
  assert.match(appSource, /const handleCancelLogout = \(\) => \{[\s\S]*?setAppLocked\(true\)/u);
  assert.match(appSource, /inert=\{appLocked \|\| logoutConfirmOpen \|\| logoutTransitionPhase !== "idle" \? true : undefined\}/u);
  assert.match(appSource, /appLocked && userProfile && !\(logoutConfirmOpen && logoutReturnsToLock\)/u);
  assert.match(stylesheet, /backdrop-filter: blur\(13px\) saturate\(0\.72\)/u);
  assert.match(stylesheet, /background: #ffffff/u);
  assert.match(stylesheet, /body\.dark \.app-lock-panel[\s\S]*?background: #101621/u);
});
