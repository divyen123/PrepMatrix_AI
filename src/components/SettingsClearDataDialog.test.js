import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("renders an accessible destructive workspace-data confirmation", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { default: SettingsClearDataDialog } = await vite.ssrLoadModule(
      "/src/components/SettingsClearDataDialog.jsx",
    );
    const markup = renderToStaticMarkup(React.createElement(SettingsClearDataDialog, {
      onCancel() {},
      onConfirm() {},
      open: true,
    }));

    assert.match(markup, /role="alertdialog"/u);
    assert.match(markup, /aria-modal="true"/u);
    assert.match(markup, /Clear workspace data\?/u);
    assert.match(markup, /This action cannot be undone/u);
    assert.match(markup, /Will be cleared/u);
    assert.match(markup, /Will stay/u);
    assert.match(markup, />Cancel</u);
    assert.match(markup, />Clear Data</u);
  } finally {
    await vite.close();
  }
});

test("supports modal dismissal, focus containment, and an opaque theme-aware surface", () => {
  const source = readFileSync(new URL("./SettingsClearDataDialog.jsx", import.meta.url), "utf8");
  const stylesheet = readFileSync(new URL("../pages/SettingsPage.css", import.meta.url), "utf8");

  assert.match(source, /createPortal\(content, document\.body\)/u);
  assert.match(source, /event\.key === "Escape"/u);
  assert.match(source, /event\.target === event\.currentTarget/u);
  assert.match(source, /querySelectorAll\("button:not\(\[disabled\]\)"\)/u);
  assert.match(source, /cancelButtonRef\.current\?\.focus/u);
  assert.match(stylesheet, /\.settings-clear-data-backdrop\s*\{[\s\S]*?backdrop-filter:\s*blur\(14px\)/u);
  assert.match(stylesheet, /body \.confirm-modal\.settings-clear-data-dialog[\s\S]*?width:\s*min\(470px, 100%\)/u);
  assert.match(stylesheet, /body:not\(\.dark\) \.confirm-modal\.settings-clear-data-dialog[\s\S]*?background:\s*#ffffff/u);
  assert.match(stylesheet, /body\.dark \.confirm-modal\.settings-clear-data-dialog[\s\S]*?background:\s*#111722/u);
});
