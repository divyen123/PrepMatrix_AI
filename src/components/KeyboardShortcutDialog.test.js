import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const appSource = readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
const aboutSource = readFileSync(new URL("../pages/AboutPage.jsx", import.meta.url), "utf8");
const dialogSource = readFileSync(new URL("./KeyboardShortcutDialog.jsx", import.meta.url), "utf8");
const dialogStyles = readFileSync(new URL("./KeyboardShortcutDialog.css", import.meta.url), "utf8");
const appStyles = readFileSync(new URL("../App.css", import.meta.url), "utf8");

test("shares the three shortcut groups between the About page and global dialog", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { default: KeyboardShortcutDialog } = await vite.ssrLoadModule(
      "/src/components/KeyboardShortcutDialog.jsx",
    );
    const markup = renderToStaticMarkup(React.createElement(KeyboardShortcutDialog, {
      onClose() {},
      open: true,
    }));

    assert.match(markup, /role="dialog"/u);
    assert.match(markup, /aria-modal="true"/u);
    assert.match(markup, /aria-labelledby="keyboard-shortcut-dialog-title"/u);
    assert.match(markup, />Shortcut keyboard guide<\/h2>/u);
    assert.match(markup, /Close keyboard shortcut guide/u);
    assert.match(markup, /aria-label="Keyboard shortcuts"[^>]*tabindex="0"/u);
    assert.match(markup, />Workspace</u);
    assert.match(markup, />Navigation</u);
    assert.match(markup, />Page actions</u);
    assert.doesNotMatch(markup, /Move through PrepMatrix faster|Workspace, navigation, and page-specific shortcuts in one place/u);
    assert.doesNotMatch(markup, /anywhere outside a text field to return to this guide/u);
  } finally {
    await vite.close();
  }
});

test("opens the shortcut dialog in place without changing the current route", () => {
  const branchStart = appSource.indexOf('if (shortcut.action === "open-shortcut-guide")');
  const branchEnd = appSource.indexOf('if (shortcut.action === "navigate")', branchStart);
  const shortcutBranch = appSource.slice(branchStart, branchEnd);

  assert.ok(branchStart >= 0 && branchEnd > branchStart);
  assert.match(shortcutBranch, /setKeyboardShortcutGuideOpen\(true\)/u);
  assert.doesNotMatch(shortcutBranch, /navigate|setTimeout|#keyboard-shortcuts|openKeyboardShortcutGuide/u);
  assert.match(appSource, /<KeyboardShortcutDialog[\s\S]*?onClose=\{\(\) => setKeyboardShortcutGuideOpen\(false\)\}[\s\S]*?open=\{keyboardShortcutGuideOpen/u);
});

test("keeps AI credits above a flat, footer-free keyboard guide on About", () => {
  const creditsIndex = aboutSource.indexOf('className="card about-credits-card"');
  const shortcutsIndex = aboutSource.indexOf('className="about-shortcuts-section"');

  assert.ok(creditsIndex >= 0 && shortcutsIndex > creditsIndex);
  assert.match(aboutSource, /<KeyboardShortcutGroups \/>/u);
  assert.doesNotMatch(aboutSource, /card about-shortcuts-card|about-shortcuts-tip/u);
  assert.doesNotMatch(aboutSource, /anywhere outside a text field to return to this guide/u);
  assert.match(appStyles, /\.about-shortcuts-section\s*\{[^}]*scroll-margin-top: 88px;[^}]*\}/u);
  assert.doesNotMatch(appStyles, /\.about-shortcuts-card|\.about-shortcuts-tip/u);
});

test("supports focus-safe dismissal and locks background scrolling", () => {
  assert.match(dialogSource, /createPortal\(content, document\.body\)/u);
  assert.match(dialogSource, /acquireDocumentScrollLock\(\)/u);
  assert.match(dialogSource, /releaseScrollLock\(\)/u);
  assert.match(dialogSource, /event\.key === "Escape"/u);
  assert.match(dialogSource, /event\.key !== "Tab"/u);
  assert.match(dialogSource, /event\.target === event\.currentTarget/u);
  assert.match(dialogSource, /closeButtonRef\.current\?\.focus\(\)/u);
  assert.match(dialogSource, /previouslyFocused\.focus\?\.\(\{ preventScroll: true \}\)/u);
});

test("uses a blurred backdrop and an opaque surface for every theme", () => {
  assert.match(
    dialogStyles,
    /\.keyboard-shortcut-dialog-backdrop\s*\{[^}]*position: fixed;[^}]*inset: 0;[^}]*background: rgba\(3, 7, 18, 0\.68\);[^}]*backdrop-filter: blur\(13px\)/u,
  );
  assert.match(
    dialogStyles,
    /\.keyboard-shortcut-dialog\s*\{[^}]*--keyboard-dialog-bg: var\(--bg-secondary, var\(--bg\)\);[^}]*background: var\(--keyboard-dialog-bg\);[^}]*backdrop-filter: none;/u,
  );
  assert.match(
    dialogStyles,
    /body\.has-bg-image:not\(\.no-glass-cards\) \.keyboard-shortcut-dialog,\s*body\.has-bg-image\.no-glass-cards \.keyboard-shortcut-dialog\s*\{[^}]*--keyboard-dialog-bg: rgb\(var\(--bg-surface-rgb, 18, 27, 45\)\);[^}]*backdrop-filter: none;/u,
  );
  assert.match(
    dialogStyles,
    /\.keyboard-shortcut-dialog-body\s*\{[^}]*overflow: auto;[^}]*overscroll-behavior: contain;/u,
  );
  assert.match(dialogStyles, /\.keyboard-shortcut-dialog-header\s*\{[^}]*min-height: 58px;[^}]*padding: 9px 14px 9px 20px;/u);
  assert.match(
    dialogStyles,
    /body \.keyboard-shortcut-dialog-close\s*\{[^}]*width: 34px;[^}]*height: 34px;[^}]*color-mix\(in srgb, var\(--danger\) 22%, transparent\)[^}]*backdrop-filter: blur\(11px\)/u,
  );
  assert.match(dialogStyles, /max-height: calc\(100dvh - 40px\);/u);
  assert.doesNotMatch(dialogStyles, /max-height: min\(780px|scrollbar-width: none|::-webkit-scrollbar/u);
  assert.match(dialogStyles, /@media \(prefers-reduced-motion: reduce\)/u);
});
