import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const switchCss = readFileSync(new URL("./SquishSwitch.css", import.meta.url), "utf8");
const switchSource = readFileSync(new URL("./SquishSwitch.jsx", import.meta.url), "utf8");
const settingsSource = readFileSync(new URL("../pages/SettingsPage.jsx", import.meta.url), "utf8");
const examSource = readFileSync(new URL("../pages/ExamPage.jsx", import.meta.url), "utf8");
const kidsPerformanceSource = readFileSync(
  new URL("./kids/KidsPerformanceSettings.jsx", import.meta.url),
  "utf8",
);
const kidsParentSource = readFileSync(
  new URL("./kids/KidsParentCorner.jsx", import.meta.url),
  "utf8",
);

test("SquishSwitch exposes controlled state, labels, sizing, and native disabled semantics", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { default: SquishSwitch } = await vite.ssrLoadModule(
      "/src/components/SquishSwitch.jsx",
    );
    const enabledMarkup = renderToStaticMarkup(React.createElement(SquishSwitch, {
      checked: true,
      id: "alerts-switch",
      label: "Action alerts",
      onChange: () => {},
      trackOnColor: "#6558d9",
      width: 48,
      height: 28,
    }));
    const disabledMarkup = renderToStaticMarkup(React.createElement(SquishSwitch, {
      ariaLabel: "Wake mode",
      checked: false,
      disabled: true,
      onChange: () => {},
    }));

    assert.match(
      enabledMarkup,
      /<button(?=[^>]*aria-checked="true")(?=[^>]*class="squish-switch")(?=[^>]*id="alerts-switch")(?=[^>]*role="switch")[^>]*>/u,
    );
    assert.match(enabledMarkup, /--ss-w:48px/u);
    assert.match(enabledMarkup, /--ss-h:28px/u);
    assert.match(enabledMarkup, /--ss-track-on:#6558d9/u);
    assert.match(enabledMarkup, /<label class="squish-switch__label" for="alerts-switch">Action alerts/u);
    assert.match(
      disabledMarkup,
      /<button(?=[^>]*aria-checked="false")(?=[^>]*aria-label="Wake mode")(?=[^>]*disabled="")(?=[^>]*role="switch")[^>]*>/u,
    );
  } finally {
    await vite.close();
  }
});

test("SquishSwitch keeps the squish interaction isolated from global button styles", () => {
  assert.match(switchCss, /body button\.squish-switch[\s\S]*?background:\s*transparent !important;/u);
  assert.match(switchCss, /body button\.squish-switch:hover[\s\S]*?box-shadow:\s*none !important;/u);
  assert.match(switchCss, /\.squish-switch__thumb[\s\S]*?will-change:\s*transform;/u);
  assert.match(
    switchCss,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?transition-duration:\s*1ms;/u,
  );
});

test("SquishSwitch processes the first drag movement instead of treating a quick swipe as a tap", () => {
  assert.match(switchSource, /const pointerX = localX\(event\.clientX\);[\s\S]*?grab: pointerX - x\.get\(\)/u);
  assert.doesNotMatch(switchSource, /currentGrip\.grab === null/u);
});

test("SquishSwitch preserves controlled clicks and reduced-motion behavior", () => {
  assert.match(switchSource, /commit\(!current, \{ force: isControlled \}\)/u);
  assert.match(switchSource, /if \(reduce\) swell\.jump\(1\)/u);
  assert.match(
    switchSource,
    /event\.pointerType === "mouse" && !disabled && !reduce/u,
  );
});

test("all track-style on/off controls use the shared SquishSwitch", () => {
  assert.match(settingsSource, /function ToggleSwitch[\s\S]*?<SquishSwitch/u);
  assert.equal((settingsSource.match(/<ToggleSwitch\b/gu) || []).length, 6);

  assert.match(examSource, /import SquishSwitch from "\.\.\/components\/SquishSwitch";/u);
  assert.equal((examSource.match(/<SquishSwitch\b/gu) || []).length, 3);
  for (const label of ["Allow internal choices", "Shuffle questions", "Include answer key"]) {
    assert.match(examSource, new RegExp(`ariaLabel="${label}"`, "u"));
  }

  assert.match(kidsPerformanceSource, /function KidsExperienceSwitch[\s\S]*?<SquishSwitch/u);
  assert.equal((kidsPerformanceSource.match(/<KidsExperienceSwitch\b/gu) || []).length, 2);

  assert.equal((kidsParentSource.match(/<SquishSwitch\b/gu) || []).length, 2);
  assert.match(kidsParentSource, /audioEnabled:\s*next/u);
  assert.match(kidsParentSource, /timerVisible:\s*next/u);
});
