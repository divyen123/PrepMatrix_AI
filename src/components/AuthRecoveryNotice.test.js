import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

async function renderNotice(busy) {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });
  try {
    const { default: AuthRecoveryNotice } = await vite.ssrLoadModule(
      "/src/components/AuthRecoveryNotice.jsx",
    );
    return renderToStaticMarkup(React.createElement(AuthRecoveryNotice, {
      busy,
      onRetry() {},
      onSignIn() {},
    }));
  } finally {
    await vite.close();
  }
}

test("keeps a temporarily unavailable saved session separate from the login form", async () => {
  const markup = await renderNotice(false);

  assert.match(markup, /Reconnecting to your session/u);
  assert.match(markup, /PrepMatrix could not confirm your sign-in/u);
  assert.match(markup, /Try again now/u);
  assert.match(markup, /Sign in instead/u);
});

test("shows a disabled retry action while recovery is running", async () => {
  const markup = await renderNotice(true);

  assert.match(markup, /Checking your saved sign-in/u);
  assert.match(markup, /<button disabled="" type="button">Reconnecting\.\.\.<\/button>/u);
  assert.match(markup, /<button class="secondary-btn" disabled="" type="button">Sign in instead<\/button>/u);
});
