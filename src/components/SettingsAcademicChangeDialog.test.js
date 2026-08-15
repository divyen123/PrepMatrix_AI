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

test("wires the two-slot academic profile controls without the legacy restore flow", () => {
  const pageSource = readFileSync(
    new URL("../pages/SettingsPage.jsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(pageSource, /academicProfileRestore|restoreAcademicProfile|Restore old profile/u);
  assert.match(pageSource, /Current: <strong>\{activeAcademicProfileSlot\?\.label/u);
  assert.match(pageSource, /`Visit \$\{inactiveAcademicProfileSlot\?\.label/u);
  assert.match(pageSource, /visitAcademicProfileId: targetProfile\.id/u);
  assert.match(
    pageSource,
    /const deletePayload = buildAcademicProfileDeletePayload\(selectedProfile\)/u,
  );
  assert.match(pageSource, /disabled=\{!academicFieldsEditable\}/u);
  assert.match(pageSource, /disabled=\{profileMutationBusy\}/u);
  assert.match(
    pageSource,
    /if \(!academicFieldsEditable\) \{\s*await commitProfileSave\(identityPayload\);\s*return;/u,
  );
  assert.match(
    pageSource,
    /const targetProfile = pendingDeletionProfile \|\| inactiveAcademicProfileSlot;\s*setDeleteProfileSelection\(targetProfile\.id\);\s*setDeleteProfileSelectionDataId\(getAcademicProfileDataId\(targetProfile\)\);\s*setDeleteProfileDialogOpen\(true\)/u,
  );
  assert.match(pageSource, /<SettingsAcademicProfileDeleteDialog/u);
  assert.match(pageSource, /error\?\.code === "KIDS_PARENT_ACCESS_REQUIRED"/u);
  assert.match(
    pageSource,
    /Visit \$\{guidance\.label\}, unlock Parent Corner, then return to Settings to delete it\./u,
  );
});
