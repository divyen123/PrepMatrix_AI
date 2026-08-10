import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const baseSnapshot = {
  canInstall: false,
  error: "",
  installBusy: false,
  installDetectionPending: false,
  installDismissed: false,
  installedThisSession: false,
  iosGuideDismissed: false,
  isIos: false,
  isIosSafari: false,
  isInstalled: false,
  isOnline: true,
  isStandalone: false,
  updateBusy: false,
  updateDismissed: false,
  updateReady: false,
};

async function renderDock(snapshot) {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { PwaStatusDock } = await vite.ssrLoadModule("/src/components/PwaManager.jsx");
    return renderToStaticMarkup(React.createElement(PwaStatusDock, { snapshot }));
  } finally {
    await vite.close();
  }
}

test("renders a persistent accessible update prompt with explicit reload and dismiss actions", async () => {
  const markup = await renderDock({ ...baseSnapshot, updateReady: true });
  assert.match(markup, /role="status"/u);
  assert.match(markup, /aria-live="polite"/u);
  assert.match(markup, /A new PrepMatrix version is ready/u);
  assert.match(markup, /Update &amp; reload/u);
  assert.match(markup, />Later</u);
});

test("renders truthful offline copy without promising cached user data", async () => {
  const markup = await renderDock({ ...baseSnapshot, isOnline: false });
  assert.match(markup, /You’re offline/u);
  assert.match(markup, /Cloud sync and AI features need an internet connection\./u);
  assert.doesNotMatch(markup, /available offline|saved offline|sync later/iu);
  assert.doesNotMatch(markup, /Install app/u);
});

test("shows the native install action only while the browser provides an install prompt", async () => {
  const installMarkup = await renderDock({ ...baseSnapshot, canInstall: true });
  const unavailableMarkup = await renderDock(baseSnapshot);
  assert.match(installMarkup, /Install PrepMatrix/u);
  assert.match(installMarkup, />Install app</u);
  assert.match(installMarkup, />Not now</u);
  assert.equal(unavailableMarkup, "");
});

test("renders no install-related dock once the app is installed", async () => {
  const detectedMarkup = await renderDock({
    ...baseSnapshot,
    canInstall: true,
    isInstalled: true,
  });
  const acceptedMarkup = await renderDock({
    ...baseSnapshot,
    canInstall: false,
    installedThisSession: true,
    isInstalled: true,
  });
  const pendingMarkup = await renderDock({
    ...baseSnapshot,
    canInstall: true,
    installDetectionPending: true,
  });

  assert.equal(detectedMarkup, "");
  assert.equal(acceptedMarkup, "");
  assert.equal(pendingMarkup, "");
});

test("uses guidance instead of a fake native install action on iOS and iPadOS", async () => {
  const safariMarkup = await renderDock({
    ...baseSnapshot,
    isIos: true,
    isIosSafari: true,
  });
  const otherBrowserMarkup = await renderDock({
    ...baseSnapshot,
    isIos: true,
    isIosSafari: false,
  });

  assert.match(safariMarkup, /In Safari, tap Share, then choose Add to Home Screen\./u);
  assert.doesNotMatch(safariMarkup, />Install app</u);
  assert.match(otherBrowserMarkup, /Open PrepMatrix in Safari/u);
  assert.match(otherBrowserMarkup, />Got it</u);
});
