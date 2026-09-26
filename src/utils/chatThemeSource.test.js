import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const stylesheet = readFileSync(new URL("../App.css", import.meta.url), "utf8");

test("Study Assistant scrim follows palette mode and stays neutral over image themes", () => {
  assert.match(
    stylesheet,
    /\.chat-modal-backdrop\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--bg\) 12%, rgba\(0, 0, 0, 0\.58\)\) !important;/u,
  );
  assert.match(
    stylesheet,
    /body\.has-bg-image \.chat-modal-backdrop\s*\{[^}]*background:\s*rgba\(0, 0, 0, 0\.38\) !important;/u,
  );
});

test("Study Assistant image-theme surfaces do not inherit the default blue surface", () => {
  assert.match(
    stylesheet,
    /body\.has-bg-image:not\(\.no-glass-cards\) \.sidebar-chatbot-portal \.chat-box\s*\{[^}]*background:\s*rgba\(0, 0, 0, var\(--glass-opacity, 0\.6\)\) !important;/u,
  );
  assert.match(
    stylesheet,
    /body\.has-bg-image\.no-glass-cards \.sidebar-chatbot-portal \.chat-box\s*\{[^}]*background:\s*rgba\(0, 0, 0, 0\.92\) !important;/u,
  );
  assert.match(
    stylesheet,
    /body\.has-bg-image \.sidebar-chatbot-portal \.chat-history-sidebar\s*\{[^}]*background:\s*rgba\(0, 0, 0, 0\.35\) !important;/u,
  );
});
