import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const ALERT_INFO_MESSAGE =
  "Connected securely. Only actionable alerts are sent: incomplete planner work, due goals, restored AI credits, and learning topics left unstarted.";

test("moves connected action-alert details into an accessible info tooltip", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { default: SettingsActionAlertsInfo } = await vite.ssrLoadModule(
      "/src/components/SettingsActionAlertsInfo.jsx",
    );
    const markup = renderToStaticMarkup(React.createElement(SettingsActionAlertsInfo));

    assert.match(markup, /<button[^>]*aria-describedby="settings-action-alerts-tooltip"/u);
    assert.match(markup, /aria-label="About action alerts"/u);
    assert.match(markup, /type="button"/u);
    assert.match(markup, /id="settings-action-alerts-tooltip" role="tooltip"/u);
    assert.ok(markup.includes(ALERT_INFO_MESSAGE));
  } finally {
    await vite.close();
  }
});

test("shows connected details only through the hover or focus info affordance", () => {
  const componentSource = readFileSync(
    new URL("./SettingsActionAlertsInfo.jsx", import.meta.url),
    "utf8",
  );
  const settingsSource = readFileSync(
    new URL("../pages/SettingsPage.jsx", import.meta.url),
    "utf8",
  );
  const stylesheet = readFileSync(
    new URL("../pages/SettingsPage.css", import.meta.url),
    "utf8",
  );

  assert.match(componentSource, /event\.key === "Escape"[\s\S]*?event\.currentTarget\.blur\(\)/u);
  assert.doesNotMatch(settingsSource, new RegExp(ALERT_INFO_MESSAGE.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  assert.match(settingsSource, /notificationStatus === "connected"\s*\? ""/u);
  assert.match(
    settingsSource,
    /labelAccessory=\{notificationsEnabled && notificationStatus === "connected" \? <SettingsActionAlertsInfo \/> : null\}/u,
  );
  assert.match(settingsSource, /Notifications are blocked by the browser or operating system/u);
  assert.match(settingsSource, /Action alerts are off on this browser/u);
  assert.match(stylesheet, /\.settings-action-alerts-tooltip\s*\{[\s\S]*?bottom:\s*calc\(100% \+ 7px\)[\s\S]*?opacity:\s*0[\s\S]*?visibility:\s*hidden/u);
  assert.match(stylesheet, /body\.dark \.settings-page \.settings-action-alerts-tooltip\s*\{[\s\S]*?--settings-alert-tooltip-bg:\s*#111a2b;/u);
  assert.match(stylesheet, /body\.has-bg-image \.settings-page \.settings-action-alerts-tooltip\s*\{[\s\S]*?--settings-alert-tooltip-bg:\s*rgb\(var\(--bg-surface-rgb, 18, 27, 45\)\);/u);
  assert.match(
    stylesheet,
    /\.settings-action-alerts-info:hover \.settings-action-alerts-tooltip,[\s\S]*?\.settings-action-alerts-info:focus-within \.settings-action-alerts-tooltip\s*\{[\s\S]*?opacity:\s*1[\s\S]*?visibility:\s*visible/u,
  );
});
