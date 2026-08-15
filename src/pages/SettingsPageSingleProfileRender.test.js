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
    const markup = renderToStaticMarkup(React.createElement(
      MemoryRouter,
      { initialEntries: ["/settings"] },
      React.createElement(SettingsPage, {
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
      }),
    ));

    assert.match(markup, /Profile &amp; Institution/u);
    assert.match(markup, /Current: <strong>Profile A<\/strong>/u);
    assert.doesNotMatch(markup, /settings-profile-parent-guidance/u);
  } finally {
    await vite?.close();
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else delete globalThis.window;
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else delete globalThis.localStorage;
  }
});
