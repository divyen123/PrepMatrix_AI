import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("renders a compact accessible academic-profile confirmation", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { default: SettingsAcademicChangeDialog } = await vite.ssrLoadModule(
      "/src/components/SettingsAcademicChangeDialog.jsx",
    );
    const markup = renderToStaticMarkup(React.createElement(SettingsAcademicChangeDialog, {
      changes: [{
        key: "academicLevel",
        label: "Academic stage",
        before: "Undergraduate / Bachelor's",
        after: "Postgraduate / Master's",
      }],
      onCancel() {},
      onConfirm() {},
      open: true,
    }));

    assert.match(markup, /role="alertdialog"/u);
    assert.match(markup, /aria-modal="true"/u);
    assert.match(markup, /aria-labelledby="settings-academic-confirm-title"/u);
    assert.match(markup, /aria-describedby="settings-academic-confirm-description"/u);
    assert.match(markup, /Update academic profile\?/u);
    assert.match(markup, /Current[\s\S]*?Undergraduate \/ Bachelor&#x27;s/u);
    assert.match(markup, /New[\s\S]*?Postgraduate \/ Master&#x27;s/u);
    assert.match(markup, /<button[^>]*type="button"[^>]*>Cancel<\/button>/u);
    assert.match(markup, /<button[^>]*type="button"[^>]*>Save anyway<\/button>/u);
  } finally {
    await vite.close();
  }
});

test("keeps the confirmation portal mounted for smooth close transitions", () => {
  const componentSource = readFileSync(
    new URL("./SettingsAcademicChangeDialog.jsx", import.meta.url),
    "utf8",
  );
  const stylesheet = readFileSync(
    new URL("../pages/SettingsPage.css", import.meta.url),
    "utf8",
  );

  assert.match(componentSource, /open \? "is-open" : "is-closed"/u);
  assert.match(componentSource, /createPortal\(content, document\.body\)/u);
  assert.match(componentSource, /event\.key === "Escape"/u);
  assert.match(componentSource, /cancelButtonRef\.current\?\.focus/u);
  assert.match(stylesheet, /\.settings-academic-confirm-backdrop\s*\{[\s\S]*?transition:/u);
  assert.match(stylesheet, /\.settings-academic-confirm-backdrop\.is-closed\s*\{[\s\S]*?opacity:\s*0/u);
  assert.match(stylesheet, /width:\s*min\(420px, 100%\)/u);
  assert.match(stylesheet, /background:\s*rgba\(3, 8, 18, 0\.76\)\s*!important/u);
  assert.match(stylesheet, /backdrop-filter:\s*blur\(18px\) saturate\(72%\) brightness\(72%\)\s*!important/u);
  assert.match(stylesheet, /linear-gradient\(var\(--bg\), var\(--bg\)\) padding-box/u);
  assert.match(
    stylesheet,
    /body\.has-bg-image:not\(\.no-glass-cards\) \.confirm-modal\.settings-academic-confirm/u,
  );
  assert.match(stylesheet, /linear-gradient\(rgb\(var\(--bg-surface-rgb\)\), rgb\(var\(--bg-surface-rgb\)\)\) padding-box/u);
});

test("keeps the frozen change rows until the exit transition finishes", () => {
  const pageSource = readFileSync(
    new URL("../pages/SettingsPage.jsx", import.meta.url),
    "utf8",
  );

  assert.match(pageSource, /const ACADEMIC_CONFIRM_EXIT_MS = 180/u);
  assert.match(pageSource, /setAcademicActionDialogOpen\(false\)/u);
  assert.match(
    pageSource,
    /setPendingAcademicAction\(\(current\) => \(current === plan \? null : current\)\)/u,
  );
  assert.match(pageSource, /if \(completed\) dismissAcademicActionDialog\(confirmedPlan\)/u);
  assert.match(pageSource, /open=\{academicActionDialogOpen\}/u);
});

test("keeps academic editing in Settings and owns two-slot controls in the guide", () => {
  const pageSource = readFileSync(
    new URL("../pages/SettingsPage.jsx", import.meta.url),
    "utf8",
  );
  const guideSource = readFileSync(
    new URL("../pages/AcademicProfilesGuidePage.jsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(pageSource, /academicProfileRestore|restoreAcademicProfile|Restore old profile/u);
  assert.match(pageSource, /const activeProfileDisplayName = getAcademicProfileDisplayName\(activeAcademicProfileSlot\)/u);
  assert.match(pageSource, /<span>Current:<\/span>/u);
  assert.match(pageSource, /<strong>\{activeProfileDisplayName\}<\/strong>/u);
  assert.doesNotMatch(pageSource, /settings-profile-slot-actions/u);
  assert.doesNotMatch(pageSource, /handleVisitAcademicProfile|handleRequestDeleteAcademicProfile/u);
  assert.doesNotMatch(pageSource, /<SettingsAcademicProfileDeleteDialog/u);
  assert.doesNotMatch(
    pageSource,
    /Two academic profiles are saved\. Delete one profile before editing academic details\./u,
  );

  assert.match(guideSource, /"Visit " \+ \(getAcademicProfileDisplayName\(slots\.inactiveProfile\)/u);
  assert.match(guideSource, /await onVisitAcademicProfile\(targetProfile\)/u);
  assert.match(guideSource, /await onDeleteAcademicProfile\(selectedProfileForDeletion\)/u);
  assert.match(guideSource, /<SettingsAcademicProfileDeleteDialog/u);
  assert.match(
    guideSource,
    /const targetProfile = pendingDeletionProfile \|\| slots\.inactiveProfile;[\s\S]*?setDeleteProfileSelection\(targetProfile\.id\);[\s\S]*?setDeleteProfileSelectionDataId\(targetProfile\.dataId\);[\s\S]*?setDeleteDialogOpen\(true\)/u,
  );
  assert.match(guideSource, /error\?\.code === "KIDS_PARENT_ACCESS_REQUIRED"/u);
  assert.match(
    guideSource,
    /return to this guide to delete it\./u,
  );

  assert.match(pageSource, /disabled=\{!academicFieldsEditable\}/u);
  assert.match(pageSource, /disabled=\{profileMutationBusy\}/u);
  assert.match(
    pageSource,
    /if \(!academicFieldsEditable\) \{\s*await commitProfileSave\(identityPayload\);\s*return;/u,
  );
});
