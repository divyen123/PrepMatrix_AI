import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { createServer } from "vite";

const stylesheet = readFileSync(new URL("./SettingsPage.css", import.meta.url), "utf8");
const componentSource = readFileSync(new URL("./SettingsPage.jsx", import.meta.url), "utf8");

test("keeps the three horizontal Appearance gauges equal on one desktop row", () => {
  assert.match(
    stylesheet,
    /\.settings-page \.settings-glass-controls\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/u,
  );
  assert.match(
    stylesheet,
    /\.settings-page \.settings-background-image-controls\s*\{\s*display:\s*contents;\s*\}/u,
  );
  assert.match(
    componentSource,
    /Preset Accent Color Palette[\s\S]*?className="settings-glass-controls settings-glass-controls--full"[\s\S]*?label="Glass Panel Opacity"[\s\S]*?label="Background Image Blur"[\s\S]*?label="Background Brightness"/u,
  );
  assert.match(componentSource, /ariaValueText=\{\(nextLevel\) => formatValue\?\.\(levelToValue\(nextLevel\)\) \|\| displayValue\}/u);
  assert.match(
    stylesheet,
    /\.settings-page \.settings-glass-controls--full\s*\{[\s\S]*?grid-column:\s*1 \/ -1;[\s\S]*?width:\s*100%;/u,
  );
  assert.match(
    stylesheet,
    /\.settings-page \.settings-slosh-control \.settings-appearance-gauge\s*\{\s*width:\s*min\(84%, 360px\);/u,
  );
  assert.match(stylesheet, /\.settings-page \.settings-slosh-control \.settings-appearance-gauge\s*\{[^}]*height:\s*28px;/u);
  assert.match(
    stylesheet,
    /@media \(max-width: 700px\)[\s\S]*?\.settings-page \.settings-glass-controls\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);[\s\S]*?\.settings-page \.settings-background-image-controls\s*\{[\s\S]*?display:\s*grid;/u,
  );
});

test("keeps Custom in the background gallery and strengthens wake-slider contrast", () => {
  assert.match(
    componentSource,
    /displayedBackgroundPresets\.map\(\(preset\)[\s\S]*?bg-custom-background-card/u,
  );
  assert.doesNotMatch(componentSource, /galleryBackgroundPresets/u);
  assert.match(
    componentSource,
    /aria-label=\{customBackgroundPreset \? "Change custom background image" : "Choose a custom background image"\}/u,
  );
  assert.match(componentSource, /function SettingsSloshControl\([\s\S]*?<SloshGauge[\s\S]*?height=\{28\}[\s\S]*?interactive[\s\S]*?radius=\{14\}[\s\S]*?showValue=\{false\}/u);
  assert.match(
    stylesheet,
    /\.settings-page \.settings-bg-presets-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(7, minmax\(0, 1fr\)\);/u,
  );
  assert.match(
    stylesheet,
    /\.settings-page \.settings-bg-presets-grid\.is-kids-gallery\s*\{[\s\S]*?grid-template-columns:\s*repeat\(6, minmax\(0, 1fr\)\);/u,
  );
  assert.match(
    stylesheet,
    /button\.bg-custom-background-card:not\(\.is-empty\) > span\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?bottom:\s*0;[\s\S]*?color:\s*#fff;[\s\S]*?text-align:\s*left;/u,
  );
  assert.match(stylesheet, /--settings-wake-track:\s*rgba\(255, 255, 255, 0\.17\);/u);
  assert.match(
    stylesheet,
    /--settings-wake-fill:\s*color-mix\(in srgb, var\(--accent\) 70%, white 30%\);/u,
  );
  assert.match(stylesheet, /--settings-slosh-glass:\s*rgb\(var\(--bg-surface-rgb, 18, 27, 45\)\);/u);
  assert.match(stylesheet, /--settings-slosh-liquid:\s*color-mix\(in srgb, var\(--accent\) 76%, white 24%\);/u);
});

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
        matchMedia: () => ({
          matches: false,
          addEventListener() {},
          removeEventListener() {},
        }),
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
      autoLockEnabled: true,
      autoLockMinutes: 5,
      completed: [],
      darkMode: true,
      goalReminderData: { goals: [], reminders: [], tasks: [] },
      goalReminderSettings: {},
      materialBookmarks: [],
      onAcademicProfileChange: noop,
      onAutoLockEnabledChange: noop,
      onAutoHideTopBarChange: noop,
      onAutoLockMinutesChange: noop,
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
    assert.match(
      markup,
      /aria-label="Choose a custom background image" aria-pressed="false" class="bg-palette-thumbnail-btn is-empty bg-custom-background-card"/u,
    );
    for (const label of ["Speed", "Pitch", "Volume"]) {
      assert.match(
        markup,
        new RegExp(`<button(?=[^>]*aria-label="${label}")(?=[^>]*role="slider")[^>]*>`, "u"),
      );
    }
    for (const label of ["Glass Panel Opacity", "Background Image Blur"]) {
      assert.match(
        markup,
        new RegExp(`<div(?=[^>]*aria-label="${label}")(?=[^>]*aria-orientation="horizontal")(?=[^>]*role="slider")[^>]*>`, "u"),
      );
    }
    assert.doesNotMatch(markup, /<span>Transparent<\/span>|<span>Opaque<\/span>|<span>Sharp<\/span>|<span>Blurred<\/span>|<span>Dim<\/span>|<span>Bright<\/span>/u);
    assert.doesNotMatch(markup, /aria-label="Background Brightness"/u);
    values.set("prepmatrix_bg_image_id", "crescent-moon");
    const imageBackgroundMarkup = renderSettings();
    assert.match(
      imageBackgroundMarkup,
      /class="settings-background-image-controls"[\s\S]*?aria-label="Background Image Blur"[\s\S]*?aria-label="Background Brightness"/u,
    );
    assert.match(imageBackgroundMarkup, /<div(?=[^>]*aria-label="Background Brightness")(?=[^>]*aria-orientation="horizontal")(?=[^>]*role="slider")[^>]*>/u);
    assert.doesNotMatch(imageBackgroundMarkup, /<span>Transparent<\/span>|<span>Opaque<\/span>|<span>Sharp<\/span>|<span>Blurred<\/span>|<span>Dim<\/span>|<span>Bright<\/span>/u);
    values.delete("prepmatrix_bg_image_id");
    values.set("prepmatrix_bg_image_id", "custom-background");
    values.set("prepmatrix_custom_bg_data", "data:image/png;base64,AAAA");
    values.set("prepmatrix_custom_bg_accent_rgb", "120, 160, 210");
    values.set("prepmatrix_custom_bg_surface_rgb", "12, 18, 32");
    const customBackgroundMarkup = renderSettings();
    assert.match(customBackgroundMarkup, /aria-label="Change custom background image"/u);
    assert.match(customBackgroundMarkup, />My Background<\/span>/u);
    values.delete("prepmatrix_bg_image_id");
    values.delete("prepmatrix_custom_bg_data");
    values.delete("prepmatrix_custom_bg_accent_rgb");
    values.delete("prepmatrix_custom_bg_surface_rgb");
    assert.match(markup, /aria-label="Auto-lock app"/u);
    assert.match(
      markup,
      /<button(?=[^>]*aria-checked="true")(?=[^>]*aria-label="Auto-lock app")(?=[^>]*role="switch")[^>]*>/u,
    );
    assert.match(markup, /Keyboard, mouse, or touch activity restarts the countdown\./u);
    assert.doesNotMatch(markup, /settings-auto-lock-delay/u);
    assert.doesNotMatch(markup, /Choose 2 to 1440 minutes\./u);
    assert.match(markup, /aria-label="Auto-lock duration in minutes"/u);
    assert.match(markup, />mins<\/span>/u);
    assert.match(
      markup,
      /<input(?=[^>]*id="settings-auto-lock-minutes")(?=[^>]*min="2")(?=[^>]*max="1440")(?=[^>]*value="5")[^>]*>/u,
    );
    assert.doesNotMatch(
      markup,
      /<input(?=[^>]*id="settings-auto-lock-minutes")(?=[^>]*disabled="")[^>]*>/u,
    );

    const autoLockDisabledMarkup = renderSettings({ autoLockEnabled: false });
    assert.doesNotMatch(
      autoLockDisabledMarkup,
      /<button(?=[^>]*aria-checked="true")(?=[^>]*aria-label="Auto-lock app")(?=[^>]*role="switch")[^>]*>/u,
    );
    assert.match(
      autoLockDisabledMarkup,
      /<button(?=[^>]*aria-checked="false")(?=[^>]*aria-label="Auto-lock app")(?=[^>]*role="switch")[^>]*>/u,
    );
    assert.doesNotMatch(autoLockDisabledMarkup, /id="settings-auto-lock-minutes"/u);

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

test("keeps the notification test action beside its switch", () => {
  assert.match(
    componentSource,
    /label="Action Alerts \(Push Notifications\)"[\s\S]*?trailingControl=\{notificationsEnabled && notificationStatus === "connected" \? \([\s\S]*?className="secondary-btn notification-test-btn"/u,
  );
  assert.match(
    componentSource,
    /<div className="toggle-row-actions">\s*\{trailingControl\}\s*<SquishSwitch/u,
  );
  assert.doesNotMatch(componentSource, /notification-test-row/u);
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
    /body \.settings-page button\.settings-profile-name-action\.is-edit:hover,\s*body \.settings-page button\.settings-profile-name-action\.is-edit:focus-visible\s*\{([^}]*)\}/u,
  )?.[1] ?? "";
  assert.match(editActionInteractionRule, /color:\s*var\(--accent\)\s*!important/u);
  assert.doesNotMatch(editActionInteractionRule, /box-shadow|filter|text-shadow/u);

  const editActionFocusRules = [
    ...stylesheet.matchAll(/(?:^|\r?\n)body \.settings-page button\.settings-profile-name-action\.is-edit:focus-visible\s*\{([^}]*)\}/gu),
  ];
  const editActionFocusRule = editActionFocusRules.at(-1)?.[1] ?? "";
  assert.match(editActionFocusRule, /outline:\s*(?!none\b)[^;]+var\(--accent-rgb\)/u);
  assert.match(editActionFocusRule, /outline-offset:\s*[1-9][\d.]*px/u);
});
