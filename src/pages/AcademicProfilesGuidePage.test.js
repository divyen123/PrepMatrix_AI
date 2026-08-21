import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { createServer } from "vite";

test("renders an understandable two-profile catalogue with shared and separate boundaries", async () => {
  const userProfile = {
    activeAcademicProfileId: "profile-b",
    academicProfiles: [
      {
        academicLevel: "Undergraduate / Bachelor's",
        academicTrack: "Engineering & Technology",
        dataId: "academic-profile:test:profile-a",
        degree: "B.Tech",
        department: "Information Technology",
        id: "profile-a",
        label: "Profile A",
      },
      {
        academicLevel: "Postgraduate / Master's",
        academicTrack: "Management & Business",
        dataId: "academic-profile:test:profile-b",
        degree: "MBA",
        department: "Business Analytics",
        id: "profile-b",
        label: "Profile B",
      },
    ],
    email: "student@example.com",
    username: "Student",
  };
  let vite;

  try {
    vite = await createServer({
      appType: "custom",
      logLevel: "silent",
      server: { middlewareMode: true },
    });
    const { default: AcademicProfilesGuidePage } = await vite.ssrLoadModule(
      "/src/pages/AcademicProfilesGuidePage.jsx",
    );
    const markup = renderToStaticMarkup(React.createElement(
      MemoryRouter,
      { initialEntries: ["/settings/profiles"] },
      React.createElement(AcademicProfilesGuidePage, {
        onVisitAcademicProfile: () => {},
        userProfile,
      }),
    ));

    assert.match(markup, /<h1>How Profile A and Profile B work<\/h1>/u);
    assert.match(markup, /Current: Profile B/u);
    assert.match(markup, /Two profiles, one account/u);
    assert.match(markup, /Interactive profile catalogue/u);
    assert.match(markup, /role="tablist"/u);
    assert.match(markup, /aria-selected="true"/u);
    assert.match(markup, /What stays separate/u);
    assert.match(markup, /What stays shared/u);
    assert.match(markup, /Subjects, planner schedule, and completed tasks/u);
    assert.match(markup, /Account name, photo, and sign-in/u);
    assert.match(markup, /You are now in Profile B/u);
    assert.match(markup, /Can I create more than two profiles\?/u);
  } finally {
    await vite?.close();
  }
});

test("registers the permanent guide and the once-only animated Profile B intro", () => {
  const appSource = readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
  const dialogSource = readFileSync(
    new URL("../components/AcademicProfileIntroDialog.jsx", import.meta.url),
    "utf8",
  );
  const pageSource = readFileSync(new URL("./AcademicProfilesGuidePage.jsx", import.meta.url), "utf8");
  const settingsSource = readFileSync(new URL("./SettingsPage.jsx", import.meta.url), "utf8");
  const stylesheet = readFileSync(
    new URL("../components/AcademicProfilesGuide.css", import.meta.url),
    "utf8",
  );

  assert.match(appSource, /const createAcademicProfile = async \(payload\) => \{[\s\S]*?await runAcademicProfileTransition\(payload\)[\s\S]*?claimFirstProfileBGuide\(activeProfile\)[\s\S]*?setAcademicProfileIntroOpen\(true\)/u);
  assert.match(appSource, /<AcademicProfilesGuidePage[\s\S]*?path="\/settings\/profiles"/u);
  assert.match(appSource, /<AcademicProfileIntroDialog[\s\S]*?open=\{academicProfileIntroOpen\}/u);
  assert.match(settingsSource, /aria-label="Learn how Profile A and Profile B work"[\s\S]*?to=\{ACADEMIC_PROFILE_GUIDE_ROUTE\}/u);
  assert.match(pageSource, /role="tablist"[\s\S]*?role="tabpanel"/u);
  assert.match(pageSource, /Finish guide/u);

  assert.match(dialogSource, /aria-modal="true"/u);
  assert.match(dialogSource, /role="dialog"/u);
  assert.match(dialogSource, /aria-current=\{activeStep === index \? "step" : undefined\}/u);
  assert.match(dialogSource, /event\.key === "Escape"/u);
  assert.match(dialogSource, /getFocusableElements\(dialogRef\.current\)/u);
  assert.match(dialogSource, /Finish guide/u);
  assert.match(dialogSource, /is-closing/u);

  assert.match(stylesheet, /body\.has-bg-image \.academic-profile-guide-surface/u);
  assert.match(stylesheet, /body\.has-bg-image\.no-glass-cards \.academic-profile-guide-surface/u);
  assert.match(stylesheet, /@media \(max-width: 560px\)/u);
  assert.match(stylesheet, /@media \(prefers-reduced-motion: reduce\)/u);
  assert.match(stylesheet, /\.academic-profile-intro-backdrop\.is-open/u);
  assert.match(stylesheet, /transition: opacity 240ms ease, transform 240ms/u);

  const primaryGuideRule = stylesheet.match(
    /body \.academic-profiles-page \.academic-profile-guide-button\.is-primary \{([^}]*)\}/u,
  )?.[1] ?? "";
  assert.match(primaryGuideRule, /color: var\(--text\)/u);
  assert.match(primaryGuideRule, /color-mix\(in srgb, var\(--surface-strong\) 88%, var\(--accent\)\)/u);
  assert.doesNotMatch(primaryGuideRule, /var\(--brand-gradient\)/u);
  assert.match(stylesheet, /body\.has-bg-image \.academic-profiles-page \.academic-profile-guide-button\.is-primary \{[\s\S]*?rgb\(var\(--bg-surface-rgb\)\) 88%/u);
});
