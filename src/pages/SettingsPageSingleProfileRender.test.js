import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
        displayName: "Engineering",
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
    assert.match(markup, /Current:<\/span><span class="settings-profile-current-name"><strong>Engineering<\/strong>/u);
    assert.match(markup, /aria-label="Rename Engineering"/u);
    assert.match(markup, /href="\/settings\/profiles"/u);
    assert.match(markup, /aria-label="Learn how academic profiles work"/u);
    assert.doesNotMatch(markup, /settings-profile-parent-guidance/u);
    assert.doesNotMatch(markup, /Study Goals &amp; To-Do/u);
    assert.match(markup, /dashboard-full-span settings-card settings-system-card/u);

    const kidsMarkup = renderSettings({ youngKidsMode: true });
    assert.doesNotMatch(kidsMarkup, /Study Goals &amp; To-Do/u);
    assert.match(kidsMarkup, /dashboard-full-span settings-card settings-system-card/u);
  } finally {
    await vite?.close();
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else delete globalThis.window;
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else delete globalThis.localStorage;
  }
});

test("wires the inline profile-name editor to an exact, scoped rename request", () => {
  const source = readFileSync(new URL("./SettingsPage.jsx", import.meta.url), "utf8");
  const stylesheet = readFileSync(new URL("./SettingsPage.css", import.meta.url), "utf8");

  assert.match(source, /validateAcademicProfileDisplayName\(profileNameDraft\)/u);
  assert.match(source, /maxLength=\{ACADEMIC_PROFILE_DISPLAY_NAME_MAX_LENGTH\}/u);
  assert.match(
    source,
    /renameAcademicProfileId: activeAcademicProfileSlot\.id,[\s\S]*?renameAcademicProfileDataId: activeAcademicProfileSlot\.dataId,[\s\S]*?academicProfileDisplayName: validation\.value/u,
  );
  assert.match(source, /academicProfileId: activeAcademicProfileSlot\.dataId/u);
  assert.match(source, /event\.key === "Enter"[\s\S]*?saveProfileDisplayName\(\)/u);
  assert.match(source, /event\.key === "Escape"[\s\S]*?cancelProfileNameEdit\(\)/u);
  assert.match(source, /aria-label="Save profile name"/u);
  assert.match(source, /aria-label="Cancel profile name edit"/u);
  assert.match(source, /setUserProfile\(response\.user\)/u);
  assert.match(source, /metadataOnly: true/u);
  assert.match(
    source,
    /\{!editingProfileName\s*\?\s*\(\s*<Link[\s\S]*?className="settings-profile-know-more"[\s\S]*?<\/Link>\s*\)\s*:\s*null\}/u,
  );

  const editActionRule = stylesheet.match(/\.settings-profile-name-action\.is-edit\s*\{([^}]*)\}/u)?.[1] ?? "";
  assert.match(editActionRule, /color:\s*var\(--text\)\s*!important/u);
  assert.match(editActionRule, /border:\s*(?:0|none)\s*!important/u);
  assert.match(editActionRule, /background:\s*(?:none|transparent)\s*!important/u);

  const editActionInteractionRule = stylesheet.match(
    /\.settings-profile-name-action\.is-edit:hover,\s*\.settings-profile-name-action\.is-edit:focus-visible\s*\{([^}]*)\}/u,
  )?.[1] ?? "";
  assert.match(editActionInteractionRule, /color:\s*var\(--accent\)\s*!important/u);
  assert.match(editActionInteractionRule, /border:\s*(?:0|none)\s*!important/u);
  assert.match(editActionInteractionRule, /background:\s*(?:none|transparent)\s*!important/u);

  const editActionFocusRules = [
    ...stylesheet.matchAll(/(?:^|\r?\n)\.settings-profile-name-action\.is-edit:focus-visible\s*\{([^}]*)\}/gu),
  ];
  const editActionFocusRule = editActionFocusRules.at(-1)?.[1] ?? "";
  assert.match(editActionFocusRule, /outline:\s*(?!none\b)[^;]+var\(--accent-rgb\)/u);
  assert.match(editActionFocusRule, /outline-offset:\s*[1-9][\d.]*px/u);
});
