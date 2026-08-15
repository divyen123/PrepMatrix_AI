import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("renders a compact profile and study-information summary", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { default: SettingsProfileInfo } = await vite.ssrLoadModule(
      "/src/components/SettingsProfileInfo.jsx",
    );
    const markup = renderToStaticMarkup(React.createElement(SettingsProfileInfo, {
      academicProfile: {
        academicLevel: "Undergraduate / Bachelor's",
        academicTrack: "Engineering & Technology",
        degree: "B.Tech",
        department: "Information Technology",
        institutionName: "PrepMatrix University",
      },
      activeProfileLabel: "Profile A",
      completed: ["RestAPI - Unit 1"],
      schedule: [{ tasks: [{ task: "RestAPI - Unit 1" }, { task: "RestAPI - Unit 2" }] }],
      subjects: [{ name: "RestAPI" }],
      userProfile: { createdAt: "2026-01-15T00:00:00.000Z" },
    }));

    assert.match(markup, /aria-label="Show profile and study information"/u);
    assert.match(markup, /aria-expanded="false"/u);
    assert.match(markup, /User information/u);
    assert.match(markup, /Account created/u);
    assert.match(markup, /2026/u);
    assert.match(markup, /Engineering &amp; Technology/u);
    assert.match(markup, /PrepMatrix University/u);
    assert.match(markup, /1\/2 tasks · 50% complete/u);
    assert.match(markup, /This app session/u);
  } finally {
    await vite.close();
  }
});

test("keeps the profile info panel toggleable, opaque, and theme-aware", () => {
  const componentSource = readFileSync(new URL("./SettingsProfileInfo.jsx", import.meta.url), "utf8");
  const settingsSource = readFileSync(new URL("../pages/SettingsPage.jsx", import.meta.url), "utf8");
  const stylesheet = readFileSync(new URL("../pages/SettingsPage.css", import.meta.url), "utf8");

  assert.match(componentSource, /const handleToggle = \(\) =>/u);
  assert.match(componentSource, /createPortal\(panel, document\.body\)/u);
  assert.match(componentSource, /aria-expanded=\{isOpen\}/u);
  assert.match(componentSource, /document\.addEventListener\("pointerdown", handlePointerDown\)/u);
  assert.match(componentSource, /!panelRef\.current\?\.contains\(event\.target\)/u);
  assert.match(componentSource, /window\.addEventListener\("scroll", updatePanelPosition, true\)/u);
  assert.match(settingsSource, /<SettingsProfileInfo[\s\S]*?academicProfile=\{/u);
  assert.match(settingsSource, /settings-account-tag-row[\s\S]*?<SettingsProfileInfo/u);
  assert.match(stylesheet, /\.settings-profile-info-panel\s*\{[\s\S]*?background:\s*var\(--settings-profile-info-bg\) !important[\s\S]*?backdrop-filter:\s*none !important/u);
  assert.match(stylesheet, /\.settings-profile-info-panel\s*\{[\s\S]*?position:\s*fixed[\s\S]*?z-index:\s*2400/u);
  assert.match(stylesheet, /body\.dark \.settings-profile-info-panel\s*\{[\s\S]*?--settings-profile-info-bg:\s*#111a2b;/u);
  assert.match(stylesheet, /body\.has-bg-image \.settings-profile-info-panel\s*\{[\s\S]*?--settings-profile-info-bg:\s*rgb\(var\(--bg-surface-rgb, 18, 27, 45\)\);/u);
  assert.match(stylesheet, /\.settings-profile-info-panel\.is-open\s*\{[\s\S]*?opacity:\s*1[\s\S]*?visibility:\s*visible/u);
});
