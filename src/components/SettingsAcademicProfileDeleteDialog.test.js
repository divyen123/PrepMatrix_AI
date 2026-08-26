import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const profiles = [
  {
    id: "profile-a",
    label: "Profile A",
    displayName: "Engineering",
    academicLevel: "Undergraduate / Bachelor's",
    academicTrack: "Engineering & Technology",
    schoolType: "college",
    degree: "B.Tech",
  },
  {
    id: "profile-b",
    label: "Profile B",
    displayName: "Medical Studies",
    academicLevel: "Postgraduate / Master's",
    academicTrack: "Engineering & Technology",
    schoolType: "college",
    degree: "M.Tech",
  },
];

test("renders both deletable profiles with a current marker and exact actions", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { default: Dialog } = await vite.ssrLoadModule(
      "/src/components/SettingsAcademicProfileDeleteDialog.jsx",
    );
    const markup = renderToStaticMarkup(React.createElement(Dialog, {
      activeProfileId: "profile-a",
      onCancel() {},
      onConfirm() {},
      onSelectionChange() {},
      open: true,
      profiles,
      selectedProfileId: "profile-b",
    }));

    assert.match(markup, /role="alertdialog"/u);
    assert.match(markup, /aria-modal="true"/u);
    assert.match(markup, /Delete an academic profile\?/u);
    assert.match(markup, /Engineering[\s\S]*?Current/u);
    assert.match(markup, /Medical Studies/u);
    assert.match(markup, /checked=""[^>]*value="profile-b"/u);
    assert.match(markup, />Cancel<\/button>/u);
    assert.match(markup, />Delete profile<\/button>/u);
  } finally {
    await vite.close();
  }
});

test("keeps the delete dialog mounted for transition, focus return, and keyboard safety", () => {
  const source = readFileSync(
    new URL("./SettingsAcademicProfileDeleteDialog.jsx", import.meta.url),
    "utf8",
  );
  const stylesheet = readFileSync(
    new URL("./SettingsAcademicProfileDeleteDialog.css", import.meta.url),
    "utf8",
  );

  assert.match(source, /SettingsAcademicProfileDeleteDialog\.css/u);
  assert.match(source, /id="settings-profile-delete-dialog"/u);
  assert.match(source, /createPortal\(content, document\.body\)/u);
  assert.match(source, /event\.key === "Escape"/u);
  assert.match(source, /cancelButtonRef\.current\?\.focus/u);
  assert.match(source, /returnFocusTarget\?\.isConnected/u);
  assert.match(source, /fallbackFocusTarget\?\.isConnected/u);
  assert.match(source, /previousFocus\?\.isConnected/u);
  assert.match(source, /busy \|\| !selectedProfileId/u);
  assert.match(stylesheet, /\.settings-profile-delete-backdrop\.is-open/u);
  assert.match(
    stylesheet,
    /\.settings-profile-delete-dialog\s*\{[\s\S]*?width: min\(420px, 100%\)/u,
  );
  assert.match(stylesheet, /body\.has-bg-image \.confirm-modal\.settings-profile-delete-dialog/u);
});

test("marks an incomplete server deletion as retryable", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { default: Dialog } = await vite.ssrLoadModule(
      "/src/components/SettingsAcademicProfileDeleteDialog.jsx",
    );
    const markup = renderToStaticMarkup(React.createElement(Dialog, {
      activeProfileId: "profile-a",
      onCancel() {},
      onConfirm() {},
      onSelectionChange() {},
      open: true,
      profiles: [profiles[0], {
        ...profiles[1],
        deletionPending: { operationId: "profile-delete:operation-1" },
      }],
      selectedProfileId: "profile-b",
    }));

    assert.match(markup, /Medical Studies[\s\S]*?Retry deletion/u);
    assert.match(markup, /Medical Studies still needs deletion cleanup/u);
    assert.match(markup, /disabled=""[^>]*value="profile-a"/u);
  } finally {
    await vite.close();
  }
});
