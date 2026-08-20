import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { createServer } from "vite";
import {
  getAppUsageStorageKey,
  getLocalUsageDayKey,
  resolveAppUsageIdentity,
} from "../utils/appUsage.js";

test("renders detailed user information, usage actions, and accessible activity summaries", async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map();
  const localStorage = {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
  const userProfile = {
    academicLevel: "Undergraduate / Bachelor's",
    academicProfiles: [{
      academicLevel: "Undergraduate / Bachelor's",
      academicTrack: "Engineering & Technology",
      dataId: "academic-profile:test:profile-a",
      degree: "B.Tech",
      department: "Information Technology",
      id: "profile-a",
      label: "Profile A",
    }],
    academicTrack: "Engineering & Technology",
    activeAcademicProfileId: "profile-a",
    createdAt: "2026-01-15T00:00:00.000Z",
    age: 21,
    degree: "B.Tech",
    department: "Information Technology",
    email: "student@example.com",
    institutionName: "PrepMatrix University",
    username: "Student",
  };
  const usageIdentity = resolveAppUsageIdentity(userProfile);
  localStorage.setItem(getAppUsageStorageKey(usageIdentity), JSON.stringify({
    dailyLimitMinutes: 120,
    days: { [getLocalUsageDayKey(new Date())]: 3600 },
  }));

  Object.defineProperties(globalThis, {
    localStorage: { configurable: true, value: localStorage },
    window: {
      configurable: true,
      value: {
        addEventListener() {},
        clearInterval,
        dispatchEvent() {},
        localStorage,
        removeEventListener() {},
        setInterval,
      },
    },
  });

  let vite;
  try {
    vite = await createServer({
      appType: "custom",
      logLevel: "silent",
      server: { middlewareMode: true },
    });
    const { default: SettingsProfilePage } = await vite.ssrLoadModule(
      "/src/pages/SettingsProfilePage.jsx",
    );
    const markup = renderToStaticMarkup(React.createElement(
      MemoryRouter,
      { initialEntries: ["/settings/profile"] },
      React.createElement(SettingsProfilePage, {
        academicLevel: userProfile.academicLevel,
        academicTrack: userProfile.academicTrack,
        completed: ["API Design - Unit 1"],
        onVisitAcademicProfile: () => {},
        schedule: [{ tasks: [
          { task: "API Design - Unit 1" },
          { task: "API Design - Unit 2" },
        ] }],
        scheduleStartDate: "2026-08-18T00:00:00.000Z",
        subjects: [{ name: "API Design" }],
        userProfile,
      }),
    ));

    assert.match(markup, /<h1>User information<\/h1>/u);
    assert.match(markup, /Show limit used/u);
    assert.match(markup, /Active insights/u);
    assert.match(markup, /Change profile/u);
    assert.match(markup, /Daily app usage/u);
    assert.match(markup, /Daily average/u);
    assert.match(markup, /Profile A/u);
    assert.match(markup, /PrepMatrix University/u);
    assert.match(markup, /1\/2 tasks · 50%/u);
    assert.match(markup, /<dt>Age<\/dt><dd>21<\/dd>/u);
    assert.match(markup, /1 of 2 configured/u);
    assert.match(markup, /It does not monitor other apps, websites, or idle background time\./u);
  } finally {
    await vite?.close();
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else delete globalThis.window;
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else delete globalThis.localStorage;
  }
});

test("registers the guarded route, global tracker, responsive charts, and background-theme styling", () => {
  const appSource = readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
  const pageSource = readFileSync(new URL("./SettingsProfilePage.jsx", import.meta.url), "utf8");
  const stylesheet = readFileSync(new URL("./SettingsProfilePage.css", import.meta.url), "utf8");
  const trackerSource = readFileSync(new URL("../hooks/useAppUsageTracker.js", import.meta.url), "utf8");

  assert.match(appSource, /useAppUsageTracker\(userProfile, Boolean\(userIdentity\)\)/u);
  assert.match(appSource, /<SettingsProfilePage[\s\S]*?path="\/settings\/profile"/u);
  assert.match(pageSource, /<ComposedChart[\s\S]*?<Bar[\s\S]*?<Line/u);
  assert.match(pageSource, /saveAppUsageLimit\(usageIdentity, minutes\)/u);
  assert.match(pageSource, /await onVisitAcademicProfile\(otherProfile\)/u);
  assert.match(pageSource, /getScheduleDateKey\(day, index, scheduleStartDate\)/u);
  assert.match(trackerSource, /APP_USAGE_LIMIT_REACHED_EVENT[\s\S]*?toast\.info/u);
  assert.match(stylesheet, /body\.has-bg-image \.settings-profile-surface/u);
  assert.match(stylesheet, /background: var\(--brand-gradient\) !important/u);
  assert.match(stylesheet, /@media \(max-width: 640px\)/u);
});
