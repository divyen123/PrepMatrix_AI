import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { createServer } from "vite";

test("opens the dedicated user-information page instead of a popup", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { default: SettingsProfileInfo } = await vite.ssrLoadModule(
      "/src/components/SettingsProfileInfo.jsx",
    );
    const markup = renderToStaticMarkup(React.createElement(
      MemoryRouter,
      { initialEntries: ["/settings"] },
      React.createElement(SettingsProfileInfo),
    ));

    assert.match(markup, /aria-label="Open user information page"/u);
    assert.match(markup, /href="\/settings\/profile"/u);
    assert.doesNotMatch(markup, /role="dialog"/u);
    assert.doesNotMatch(markup, /aria-expanded/u);
  } finally {
    await vite.close();
  }
});

test("keeps the icon beside the Profile and Information title and removes popup contracts", () => {
  const componentSource = readFileSync(new URL("./SettingsProfileInfo.jsx", import.meta.url), "utf8");
  const settingsSource = readFileSync(new URL("../pages/SettingsPage.jsx", import.meta.url), "utf8");
  const stylesheet = readFileSync(new URL("../pages/SettingsPage.css", import.meta.url), "utf8");

  assert.match(componentSource, /to="\/settings\/profile"/u);
  assert.match(componentSource, /className="settings-profile-info-trigger"/u);
  assert.doesNotMatch(componentSource, /createPortal|useState|role="dialog"/u);
  assert.match(settingsSource, /Profile & Information[\s\S]*?<SettingsProfileInfo/u);
  assert.match(stylesheet, /\.settings-account-title-row\s*\{/u);
  assert.match(stylesheet, /\.settings-profile-info-trigger:hover/u);
  assert.doesNotMatch(stylesheet, /\.settings-profile-info-panel/u);
});
