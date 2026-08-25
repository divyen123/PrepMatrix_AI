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
        onCreateAcademicProfile: () => {},
        onVisitAcademicProfile: () => {},
        schedule: [{ day: 1, date: "2026-08-18", tasks: [
          { task: "API Design - Unit 1" },
          { task: "API Design - Unit 2" },
        ] }],
        scheduleStartDate: null,
        subjects: [{ name: "API Design" }],
        userProfile,
      }),
    ));

    assert.match(markup, /<h1>User information<\/h1>/u);
    assert.match(markup, /Active limit/u);
    assert.match(markup, /Active insights/u);
    assert.match(markup, /Create Profile B/u);
    assert.match(markup, /Daily app usage/u);
    assert.match(markup, /Daily average/u);
    assert.match(markup, /Profile A/u);
    assert.match(markup, /PrepMatrix University/u);
    assert.match(markup, /1\/2 tasks · 50%/u);
    assert.match(markup, /<dt>Age<\/dt><dd>21<\/dd>/u);
    assert.match(markup, /1 of 2 configured/u);
    assert.match(markup, /It does not monitor other apps, websites, or idle background time\./u);

    const twoProfileMarkup = renderToStaticMarkup(React.createElement(
      MemoryRouter,
      { initialEntries: ["/settings/profile"] },
      React.createElement(SettingsProfilePage, {
        academicLevel: userProfile.academicLevel,
        academicTrack: userProfile.academicTrack,
        onCreateAcademicProfile: () => {},
        onVisitAcademicProfile: () => {},
        userProfile: {
          ...userProfile,
          academicProfiles: [
            ...userProfile.academicProfiles,
            {
              academicLevel: "Postgraduate / Master's",
              academicTrack: "Business & Management",
              dataId: "academic-profile:test:profile-b",
              degree: "MBA",
              department: "Management",
              id: "profile-b",
              label: "Profile B",
            },
          ],
        },
      }),
    ));
    assert.match(twoProfileMarkup, /Change profile/u);
    assert.doesNotMatch(twoProfileMarkup, /Create Profile B/u);

    const planStart = markup.match(/<dt>Plan start<\/dt><dd>([^<]+)<\/dd>/u);
    assert.ok(planStart);
    assert.match(planStart[1], /2026/u);
    assert.doesNotMatch(planStart[1], /1970/u);

    for (const staleStartDate of [null, "2026-08-18"]) {
      const emptyPlanMarkup = renderToStaticMarkup(React.createElement(
        MemoryRouter,
        { initialEntries: ["/settings/profile"] },
        React.createElement(SettingsProfilePage, {
          schedule: [],
          scheduleStartDate: staleStartDate,
          subjects: [{ name: "API Design" }],
          userProfile,
        }),
      ));

      assert.match(emptyPlanMarkup, /<dt>Plan start<\/dt><dd>Not scheduled<\/dd>/u);
      assert.doesNotMatch(emptyPlanMarkup, /1970/u);
    }
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
  assert.match(pageSource, /<AcademicProfileCreateDialog[\s\S]*?onCreateAcademicProfile=\{onCreateAcademicProfile\}/u);
  assert.match(appSource, /<SettingsProfilePage[\s\S]*?onCreateAcademicProfile=\{createAcademicProfile\}/u);
  assert.equal((pageSource.match(/aria-controls="settings-profile-usage-dialog"/gu) || []).length, 2);
  assert.equal((pageSource.match(/<UsageDetailDialog\b/gu) || []).length, 1);
  assert.match(pageSource, /const \[activeUsageDialog, setActiveUsageDialog\] = useState\(\{ kind: null, open: false \}\)/u);
  assert.doesNotMatch(pageSource, /limitPanelOpen|insightsOpen|setLimitPanelOpen|setInsightsOpen/u);
  assert.match(pageSource, /setActiveUsageDialog\(\{ kind: "limit", open: true \}\)/u);
  assert.match(pageSource, /setActiveUsageDialog\(\{ kind: "insights", open: true \}\)/u);
  assert.match(pageSource, /<h2 id="usage-limit-heading">Active time<\/h2>/u);
  assert.match(pageSource, /Open Active limit to set a personal reminder\./u);
  assert.doesNotMatch(pageSource, /Show limit used/u);
  assert.match(pageSource, /onClose=\{\(\) => setActiveUsageDialog\(\(current\) => \(\{ \.\.\.current, open: false \}\)\)\}/u);
  assert.match(pageSource, /if \(closeTimerRef\.current\) window\.clearTimeout\(closeTimerRef\.current\);[\s\S]*?focusReturnRef\.current = returnFocusRef\?\.current[\s\S]*?if \(!bodyLockedRef\.current\)[\s\S]*?bodyOverflowRef\.current/u);
  assert.match(pageSource, /createPortal\([\s\S]*?aria-modal="true"[\s\S]*?role="dialog"/u);
  assert.match(pageSource, /event\.key === "Escape"[\s\S]*?event\.key !== "Tab"/u);
  assert.match(pageSource, /document\.body\.style\.overflow = "hidden"/u);
  assert.match(pageSource, /const focusTarget = focusReturnRef\.current;[\s\S]*?focusTarget\.focus\(\)/u);
  assert.match(pageSource, /inert=\{!open\}/u);
  assert.match(pageSource, /getScheduleDateKey\(day, index, scheduleStartDate\)/u);
  assert.match(trackerSource, /APP_USAGE_LIMIT_REACHED_EVENT[\s\S]*?toast\.info/u);
  assert.match(stylesheet, /body\.has-bg-image:not\(\.no-glass-cards\) \.settings-profile-surface,[\s\S]*?var\(--glass-opacity, 0\.6\)/u);
  assert.match(stylesheet, /body\.has-bg-image\.no-glass-cards \.settings-profile-surface,[\s\S]*?background: rgb\(var\(--bg-surface-rgb, 18, 27, 45\)\) !important/u);
  assert.doesNotMatch(stylesheet, /rgba\(var\(--bg-surface-rgb, 18, 27, 45\), 0\.88\)/u);
  assert.match(stylesheet, /\.settings-profile-avatar[\s\S]*?border: 0;[\s\S]*?background: transparent;[\s\S]*?box-shadow: none;/u);
  assert.match(stylesheet, /\.settings-profile-action\.is-profile-switch[\s\S]*?background: rgba\(var\(--accent-rgb\), 0\.09\) !important/u);
  assert.match(stylesheet, /\.settings-profile-dialog-layer[\s\S]*?pointer-events: none;[\s\S]*?transition: opacity 220ms ease/u);
  assert.match(stylesheet, /\.settings-profile-dialog-layer\.is-visible[\s\S]*?pointer-events: auto/u);
  assert.match(stylesheet, /body\.has-bg-image \.settings-profile-dialog[\s\S]*?rgb\(var\(--bg-surface-rgb, 18, 27, 45\)\)/u);
  assert.match(stylesheet, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?settings-profile-dialog-layer/u);
  assert.match(stylesheet, /@media \(max-width: 640px\)/u);
});
