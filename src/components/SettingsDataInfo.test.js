import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("renders accessible compact workspace-backup help", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { default: SettingsDataInfo } = await vite.ssrLoadModule(
      "/src/components/SettingsDataInfo.jsx",
    );
    const markup = renderToStaticMarkup(React.createElement(SettingsDataInfo));

    assert.match(markup, /<button[^>]*aria-describedby="settings-data-backup-tooltip"/u);
    assert.match(markup, /aria-label="About workspace backup and data controls"/u);
    assert.match(markup, /type="button"/u);
    assert.match(markup, /id="settings-data-backup-tooltip" role="tooltip"/u);
    assert.match(markup, /Export.*JSON file/u);
    assert.match(markup, /Import.*PrepMatrix backup/u);
    assert.match(markup, /login details and registered academic profile are not changed/u);
  } finally {
    await vite.close();
  }
});

test("opens smoothly on hover or focus without styling the icon as a container", () => {
  const componentSource = readFileSync(
    new URL("./SettingsDataInfo.jsx", import.meta.url),
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
  assert.match(settingsSource, /Data Management & Danger Zone[\s\S]*?<SettingsDataInfo \/>/u);
  assert.match(stylesheet, /\.settings-data-info-trigger\s*\{[\s\S]*?background:\s*transparent !important/u);
  assert.match(stylesheet, /\.settings-data-info-tooltip\s*\{[\s\S]*?opacity:\s*0[\s\S]*?transform:\s*translateY\(-6px\) scale\(0\.98\)[\s\S]*?transition:/u);
  assert.match(stylesheet, /\.settings-data-info-tooltip\s*\{[\s\S]*?background:\s*var\(--settings-data-tooltip-bg\) !important[\s\S]*?backdrop-filter:\s*none !important/u);
  assert.match(stylesheet, /body\.dark \.settings-data-info-tooltip\s*\{[\s\S]*?--settings-data-tooltip-bg:\s*#111a2b;/u);
  assert.match(stylesheet, /body\.has-bg-image \.settings-data-info-tooltip\s*\{[\s\S]*?--settings-data-tooltip-bg:\s*rgb\(var\(--bg-surface-rgb, 18, 27, 45\)\);/u);
  assert.match(stylesheet, /\.settings-data-info:hover \.settings-data-info-tooltip,[\s\S]*?\.settings-data-info:focus-within \.settings-data-info-tooltip\s*\{[\s\S]*?opacity:\s*1[\s\S]*?visibility:\s*visible/u);
  assert.match(stylesheet, /width:\s*min\(300px, calc\(100vw - 48px\)\)/u);
});
