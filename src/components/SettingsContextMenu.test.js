import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { createServer } from "vite";

const ACTION_LABELS = [
  "Open Settings",
  "Refresh app data",
  "Appearance",
  "Check for updates",
  "Lock app",
  "Switch academic profile",
  "Restart voice assistant",
  "View alert history",
  "Log out",
];

test("renders the settings trigger with mouse and keyboard context-menu affordances", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { default: SettingsContextMenu } = await vite.ssrLoadModule(
      "/src/components/SettingsContextMenu.jsx",
    );
    const markup = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        { initialEntries: ["/dashboard"] },
        React.createElement(SettingsContextMenu),
      ),
    );

    assert.match(markup, /aria-label="Settings\. Right-click for quick actions\."/u);
    assert.match(markup, /aria-haspopup="menu"/u);
    assert.match(markup, /Settings \(right-click for quick actions\)/u);
  } finally {
    await vite.close();
  }
});

test("keeps every requested quick action, theme choice, and opaque menu treatment", () => {
  const source = readFileSync(new URL("./SettingsContextMenu.jsx", import.meta.url), "utf8");
  const stylesheet = readFileSync(new URL("./SettingsContextMenu.css", import.meta.url), "utf8");

  ACTION_LABELS.forEach((label) => assert.ok(source.includes(label), `Missing ${label}`));
  assert.match(source, /id: "light"[\s\S]*?id: "dark"[\s\S]*?id: "system"/u);
  assert.match(source, /event\.key === "ContextMenu"/u);
  assert.match(source, /event\.shiftKey && event\.key === "F10"/u);
  assert.match(source, /createPortal\(/u);
  assert.match(source, /role="menuitemradio"/u);
  assert.match(source, /const handleRootMenuKeyDown = \(event\) => \{\s*if \(event\.defaultPrevented\) return;/u);
  assert.match(source, /const handleThemeMenuKeyDown = \(event\) => \{[\s\S]*?event\.stopPropagation\(\)/u);
  assert.match(stylesheet, /--settings-menu-bg: #ffffff/u);
  assert.match(stylesheet, /--settings-menu-bg: #111722/u);
  assert.match(stylesheet, /backdrop-filter: none !important/u);
  assert.match(stylesheet, /opacity: 1 !important/u);
  assert.match(stylesheet, /\.settings-context-danger[\s\S]*?color: #dc334f !important/u);
});
