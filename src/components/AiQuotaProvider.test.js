import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const stylesheet = readFileSync(new URL("../App.css", import.meta.url), "utf8");

function ruleFor(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return stylesheet.match(new RegExp(`${escapedSelector} \\{([\\s\\S]*?)\\n\\}`, "u"))?.[1] || "";
}

test("monthly allowance popup uses the active theme surface", () => {
  const baseRule = ruleFor(".ai-credit-popover");
  const darkRule = ruleFor("body.dark .ai-credit-popover");

  assert.match(baseRule, /border: 1px solid var\(--border\)/u);
  assert.match(baseRule, /background: var\(--surface-strong\)/u);
  assert.match(baseRule, /color: var\(--text\)/u);
  assert.match(baseRule, /backdrop-filter: blur\(22px\) saturate\(145%\)/u);
  assert.doesNotMatch(darkRule, /background\s*:/u);
  assert.doesNotMatch(stylesheet, /body\.dark \.ai-credit-popover\s*\{[^}]*#111b2d/u);
});

test("monthly allowance popup follows image themes with and without glass", () => {
  const glassRule = ruleFor("body.has-bg-image:not(.no-glass-cards) .ai-credit-popover");
  const solidRule = ruleFor("body.has-bg-image.no-glass-cards .ai-credit-popover");

  assert.match(glassRule, /var\(--bg-surface-rgb, 18, 27, 45\)/u);
  assert.match(glassRule, /var\(--glass-opacity, 0\.6\)/u);
  assert.match(glassRule, /border-color: rgba\(255, 255, 255, 0\.13\)/u);
  assert.match(glassRule, /backdrop-filter: blur\(28px\) saturate\(165%\) contrast\(1\.02\)/u);

  assert.match(solidRule, /background: rgb\(var\(--bg-surface-rgb, 18, 27, 45\)\) !important/u);
  assert.match(solidRule, /backdrop-filter: none !important/u);
  assert.match(solidRule, /-webkit-backdrop-filter: none !important/u);
});

test("monthly allowance close action inherits popup theme tokens", () => {
  const closeRule = ruleFor("body .ai-credit-popover-head button");

  assert.match(closeRule, /border-color: var\(--border\) !important/u);
  assert.match(closeRule, /background: var\(--surface-muted\) !important/u);
  assert.match(closeRule, /color: var\(--text-muted\) !important/u);
});
