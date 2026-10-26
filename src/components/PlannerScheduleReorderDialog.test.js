import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("renders safe order-wise and priority-wise reorder choices", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { default: Dialog } = await vite.ssrLoadModule(
      "/src/components/PlannerScheduleReorderDialog.jsx",
    );
    const markup = renderToStaticMarkup(React.createElement(Dialog, {
      onApply() {},
      onClose() {},
      open: true,
    }));

    assert.match(markup, /role="dialog"/u);
    assert.match(markup, /aria-modal="true"/u);
    assert.match(markup, /Reorder unfinished tasks/u);
    assert.doesNotMatch(markup, /Completed tasks, recall sessions, notes, learning tasks, dates, and time slots stay unchanged./u);
    assert.match(markup, /Order-wise/u);
    assert.match(markup, /Priority-wise/u);
    assert.match(markup, /name="planner-reorder-mode"/u);
    assert.match(markup, /checked=""[^>]*value="sequence"/u);
    assert.match(markup, />Apply reorder<\/button>/u);
  } finally {
    await vite.close();
  }
});

test("uses an opaque themed surface with a fading, keyboard-dismissible backdrop", () => {
  const source = readFileSync(
    new URL("./PlannerScheduleReorderDialog.jsx", import.meta.url),
    "utf8",
  );
  const stylesheet = readFileSync(
    new URL("./PlannerScheduleReorderDialog.css", import.meta.url),
    "utf8",
  );

  assert.match(source, /event\.key === "Escape" && !busy/u);
  assert.match(source, /event\.target === event\.currentTarget/u);
  assert.match(source, /aria-hidden=\{!open\}/u);
  assert.match(source, /inert=\{!open\}/u);

  assert.match(
    stylesheet,
    /\.confirm-modal-backdrop\.planner-reorder-backdrop\s*\{[\s\S]*?background: rgba\(0, 0, 0, 0\.68\) !important;[\s\S]*?opacity: 0;[\s\S]*?visibility: hidden;[\s\S]*?transition:/u,
  );
  assert.match(stylesheet, /\.confirm-modal-backdrop\.planner-reorder-backdrop\.is-open\s*\{[\s\S]*?opacity: 1;[\s\S]*?pointer-events: auto;/u);
  assert.doesNotMatch(stylesheet, /\.confirm-modal-backdrop\.planner-reorder-backdrop\.is-closed\s*\{\s*display:\s*none;/u);
  assert.match(
    stylesheet,
    /\.confirm-modal\.planner-reorder-dialog\s*\{[\s\S]*?background-color: var\(--bg\) !important;[\s\S]*?linear-gradient\(var\(--planner-reorder-surface\), var\(--planner-reorder-surface\)\) padding-box,[\s\S]*?backdrop-filter: none !important;/u,
  );
  assert.match(stylesheet, /body\.has-bg-image:not\(\.no-glass-cards\) \.confirm-modal\.planner-reorder-dialog/u);
  assert.match(stylesheet, /rgb\(var\(--bg-surface-rgb, 16, 21, 26\)\) 20%,\s*#101010 80%/u);
  assert.match(stylesheet, /@media \(prefers-reduced-motion: reduce\)/u);
});
