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
        displayName: "Engineering",
      },
      {
        academicLevel: "Postgraduate / Master's",
        academicTrack: "Management & Business",
        dataId: "academic-profile:test:profile-b",
        degree: "MBA",
        department: "Business Analytics",
        id: "profile-b",
        label: "Profile B",
        displayName: "Medical Studies",
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
        onDeleteAcademicProfile: () => {},
        onVisitAcademicProfile: () => {},
        userProfile,
      }),
    ));

    assert.match(markup, /<h1>How Profile A and Profile B work<\/h1>/u);
    assert.doesNotMatch(markup, /<h1>How Engineering and Medical Studies work<\/h1>/u);
    assert.match(markup, /Current: Medical Studies/u);
    assert.match(markup, /Two profiles, one account/u);
    assert.match(markup, /Interactive profile catalogue/u);
    assert.match(markup, /role="tablist"/u);
    assert.match(markup, /aria-selected="true"/u);
    assert.match(markup, /What stays separate/u);
    assert.match(markup, /What stays shared/u);
    assert.match(markup, /Subjects, planner schedule, and completed tasks/u);
    assert.match(markup, /Account name, photo, and sign-in/u);
    assert.match(markup, /You are now in Medical Studies/u);
    assert.match(markup, /Engineering and Medical Studies are separate workspaces/u);
    assert.match(markup, /Can I create more than two profiles\?/u);
    assert.match(
      markup,
      /academic-profiles-management-actions[\s\S]*?Visit Engineering[\s\S]*?Delete profile/u,
    );
    assert.match(
      markup,
      /Two academic profiles are saved\. Delete one profile before editing academic details\./u,
    );
    assert.match(markup, /aria-controls="settings-profile-delete-dialog"/u);

    const singleProfileMarkup = renderToStaticMarkup(React.createElement(
      MemoryRouter,
      { initialEntries: ["/settings/profiles"] },
      React.createElement(AcademicProfilesGuidePage, {
        onCreateAcademicProfile: () => {},
        onDeleteAcademicProfile: () => {},
        onVisitAcademicProfile: () => {},
        userProfile: {
          ...userProfile,
          activeAcademicProfileId: "profile-a",
          academicProfiles: [userProfile.academicProfiles[0]],
          institutionName: "PrepMatrix University",
        },
      }),
    ));
    assert.equal((singleProfileMarkup.match(/Create Profile B/gu) || []).length, 3);
    assert.doesNotMatch(singleProfileMarkup, /Manage profiles/u);
    assert.doesNotMatch(singleProfileMarkup, /academic-profiles-management-actions/u);
    assert.doesNotMatch(
      singleProfileMarkup,
      /Two academic profiles are saved\. Delete one profile before editing academic details\./u,
    );
    assert.equal((singleProfileMarkup.match(/aria-controls="academic-profile-create-dialog"/gu) || []).length, 2);
    assert.equal((singleProfileMarkup.match(/aria-haspopup="dialog"/gu) || []).length, 2);

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
  const createDialogSource = readFileSync(
    new URL("../components/AcademicProfileCreateDialog.jsx", import.meta.url),
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
  assert.match(appSource, /<AcademicProfilesGuidePage[\s\S]*?onCreateAcademicProfile=\{createAcademicProfile\}/u);
  assert.match(appSource, /<AcademicProfilesGuidePage[\s\S]*?onDeleteAcademicProfile=\{deleteAcademicProfile\}/u);
  assert.match(appSource, /<AcademicProfilesGuidePage[\s\S]*?academicProfileDeletionRetryTarget=\{academicProfileDeletionRetryRef\.current\}/u);
  assert.match(appSource, /<SettingsProfilePage[\s\S]*?onCreateAcademicProfile=\{createAcademicProfile\}/u);
  assert.match(appSource, /<AcademicProfileIntroDialog[\s\S]*?open=\{academicProfileIntroOpen\}/u);
  assert.match(settingsSource, /aria-label="Learn how academic profiles work"[\s\S]*?to=\{ACADEMIC_PROFILE_GUIDE_ROUTE\}/u);
  assert.match(pageSource, /getAcademicProfileDisplayName\(slots\.activeProfile\)/u);
  assert.match(pageSource, /getAcademicProfileDisplayName\(slots\.inactiveProfile\)/u);
  assert.match(appSource, /activeProfileLabel: getAcademicProfileDisplayName\(activeProfile, 1\)/u);
  assert.match(appSource, /otherProfileLabel: getAcademicProfileDisplayName\(otherProfile/u);
  assert.match(pageSource, /role="tablist"[\s\S]*?role="tabpanel"/u);
  assert.match(pageSource, /Finish guide/u);
  assert.match(pageSource, /openCreateProfileDialog\(event\)/u);
  assert.match(pageSource, /<AcademicProfileCreateDialog[\s\S]*?onCreateAcademicProfile=\{onCreateAcademicProfile\}/u);
  assert.match(pageSource, /<SettingsAcademicProfileDeleteDialog[\s\S]*?onConfirm=\{handleDeleteAcademicProfile\}/u);
  assert.match(pageSource, /await onVisitAcademicProfile\(targetProfile\)/u);
  assert.match(pageSource, /await onDeleteAcademicProfile\(selectedProfileForDeletion, currentPassword\)/u);
  assert.match(pageSource, /setDeleteConfirmationStep\("password"\)/u);
  assert.match(pageSource, /confirmationStep=\{deleteConfirmationStep\}/u);
  assert.match(pageSource, /password=\{deleteProfilePassword\}/u);
  assert.match(pageSource, /ACADEMIC_PROFILE_PASSWORD_INCORRECT/u);
  assert.match(
    pageSource,
    /Two academic profiles are saved\. Delete one profile before editing academic details\./u,
  );
  assert.doesNotMatch(settingsSource, /settings-profile-slot-actions/u);
  assert.doesNotMatch(settingsSource, />\s*Delete profile\s*</u);
  assert.doesNotMatch(
    settingsSource,
    /Two academic profiles are saved\. Delete one profile before editing academic details\./u,
  );
  assert.doesNotMatch(settingsSource, /<SettingsAcademicProfileDeleteDialog/u);
  assert.match(createDialogSource, /await onCreateAcademicProfile\(buildAcademicProfileCreationPayload\(draft\)\)/u);

  assert.match(dialogSource, /aria-modal="true"/u);
  assert.match(dialogSource, /role="dialog"/u);
  assert.match(dialogSource, /aria-current=\{activeStep === index \? "step" : undefined\}/u);
  assert.match(dialogSource, /event\.key === "Escape"/u);
  assert.match(dialogSource, /getFocusableElements\(dialogRef\.current\)/u);
  assert.match(dialogSource, /Finish guide/u);
  assert.match(dialogSource, /is-closing/u);

  assert.match(
    stylesheet,
    /body\.has-bg-image:not\(\.no-glass-cards\) \.academic-profile-guide-surface \{[\s\S]*?var\(--glass-opacity, 0\.6\)/u,
  );
  assert.doesNotMatch(
    stylesheet,
    /body\.has-bg-image:not\(\.no-glass-cards\) \.academic-profile-guide-surface,\s*body\.has-bg-image:not\(\.no-glass-cards\) \.academic-profile-intro-dialog/u,
  );
  assert.doesNotMatch(stylesheet, /rgba\(var\(--bg-surface-rgb\), 0\.9\)/u);
  assert.match(stylesheet, /body\.has-bg-image\.no-glass-cards \.academic-profile-guide-surface/u);

  const introRule = stylesheet.match(/\.academic-profile-intro-dialog \{([^}]*)\}/u)?.[1] ?? "";
  assert.match(introRule, /var\(--bg\)/u);
  assert.match(introRule, /backdrop-filter: none/u);
  assert.doesNotMatch(introRule, /var\(--surface-strong\)|--glass-opacity/u);
  assert.match(
    stylesheet,
    /body\.has-bg-image \.academic-profile-intro-dialog \{[\s\S]*?rgb\(var\(--bg-surface-rgb, 18, 27, 45\)\) !important;[\s\S]*?backdrop-filter: none !important;[\s\S]*?-webkit-backdrop-filter: none !important;/u,
  );
  assert.match(stylesheet, /@media \(max-width: 560px\)/u);
  assert.match(stylesheet, /@media \(prefers-reduced-motion: reduce\)/u);
  assert.match(stylesheet, /\.academic-profile-intro-backdrop\.is-open/u);
  assert.match(stylesheet, /transition: opacity 480ms ease, transform 480ms/u);
  assert.match(appSource, /setAcademicProfileIntroOpen\(true\);[\s\S]*?\}, 650\);/u);
  assert.match(
    stylesheet,
    /\.academic-profiles-page-header h1 \{[\s\S]*?white-space: nowrap !important;/u,
  );

  const primaryGuideRule = stylesheet.match(
    /body \.academic-profiles-page \.academic-profile-guide-button\.is-primary \{([^}]*)\}/u,
  )?.[1] ?? "";
  assert.match(primaryGuideRule, /color: var\(--text\)/u);
  assert.match(primaryGuideRule, /color-mix\(in srgb, var\(--surface-strong\) 88%, var\(--accent\)\)/u);
  assert.doesNotMatch(primaryGuideRule, /var\(--brand-gradient\)/u);
  assert.match(stylesheet, /body\.has-bg-image \.academic-profiles-page \.academic-profile-guide-button\.is-primary \{[\s\S]*?rgb\(var\(--bg-surface-rgb\)\) 88%/u);
});
