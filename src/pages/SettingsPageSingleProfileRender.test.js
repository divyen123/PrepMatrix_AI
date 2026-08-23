import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { createServer } from "vite";

test("renders Settings for one profile without deletion guidance", async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map();
  const localStorage = {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
  Object.defineProperties(globalThis, {
    localStorage: { configurable: true, value: localStorage },
    window: {
      configurable: true,
      value: {
        addEventListener() {},
        clearTimeout,
        localStorage,
        matchMedia: () => ({ matches: false }),
        removeEventListener() {},
        setTimeout,
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
    const { default: SettingsPage } = await vite.ssrLoadModule(
      "/src/pages/SettingsPage.jsx",
    );
    const noop = () => {};
    const userProfile = {
      academicLevel: "Undergraduate / Bachelor''s",
      academicProfiles: [{
        academicLevel: "Undergraduate / Bachelor''s",
        academicTrack: "Engineering & Technology",
        dataId: "academic-profile:test:profile-a",
        degree: "B.Tech",
        department: "IT",
        id: "profile-a",
        label: "Profile A",
      }],
      academicTrack: "Engineering & Technology",
      activeAcademicProfileId: "profile-a",
      degree: "B.Tech",
      department: "IT",
      email: "student@example.com",
      username: "Student",
    };
    const settingsProps = {
      academicLevel: userProfile.academicLevel,
      academicTrack: userProfile.academicTrack,
      completed: [],
      darkMode: true,
      goalReminderData: { goals: [], reminders: [], tasks: [] },
      goalReminderSettings: {},
      materialBookmarks: [],
      onAcademicProfileChange: noop,
      onAutoHideTopBarChange: noop,
      onPreviewVoice: noop,
      resumeBuilder: {},
      schedule: [],
      setAcademicLevel: noop,
      setAcademicTrack: noop,
      setCompleted: noop,
      setCursorStyle: noop,
      setDarkMode: noop,
      setGoalReminderData: noop,
      setGoalReminderSettings: noop,
      setMaterialBookmarks: noop,
      setNotification: noop,
      setResumeBuilder: noop,
      setSchedule: noop,
      setSubjects: noop,
      setUserProfile: noop,
      setVoicePreferences: noop,
      subjects: [],
      userProfile,
      voicePreferences: {},
    };
    const renderSettings = (overrides = {}) => renderToStaticMarkup(React.createElement(
      MemoryRouter,
      { initialEntries: ["/settings"] },
      React.createElement(SettingsPage, { ...settingsProps, ...overrides }),
    ));
    const markup = renderSettings();

    assert.match(markup, /Profile &amp; Information/u);
    assert.match(markup, /Current: <strong>Profile A<\/strong>/u);
    assert.match(markup, /href="\/settings\/profiles"/u);
    assert.match(markup, /aria-label="Learn how Profile A and Profile B work"/u);
    assert.doesNotMatch(markup, /settings-profile-parent-guidance/u);
    assert.match(markup, /Study Goals &amp; Reminders/u);
    assert.doesNotMatch(markup, /settings-system-card dashboard-full-span/u);

    const kidsMarkup = renderSettings({ youngKidsMode: true });
    assert.doesNotMatch(kidsMarkup, /Study Goals &amp; Reminders/u);
    assert.match(kidsMarkup, /settings-system-card dashboard-full-span/u);
  } finally {
    await vite?.close();
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else delete globalThis.window;
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else delete globalThis.localStorage;
  }
});
