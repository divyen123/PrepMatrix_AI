import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const componentSource = readFileSync(new URL("./WorktreeMapper.jsx", import.meta.url), "utf8");
const stylesheet = readFileSync(new URL("../App.css", import.meta.url), "utf8");

test("saved Worktree cards expose an accessible delete-only icon", () => {
  assert.match(
    componentSource,
    /aria-label=\{`Delete \$\{wt\.name\} from saved history`\}[\s\S]*?className="delete-history-btn"[\s\S]*?onClick=\{\(e\) => handleDeleteHistory\(e, wt\.id\)\}[\s\S]*?type="button"[\s\S]*?<Trash2 aria-hidden="true" size=\{14\} \/>/u,
  );
  assert.match(componentSource, /const handleDeleteHistory = async \(e, wtId\) => \{[\s\S]*?e\.stopPropagation\(\);[\s\S]*?setDeleteConfirmId\(wtId\);/u);
});

test("saved Worktree delete icons have no visible background container", () => {
  const baseRule = stylesheet.match(/body button\.delete-history-btn \{([\s\S]*?)\n\}/u)?.[1] || "";
  const interactionRule = stylesheet.match(
    /body button\.delete-history-btn:hover,[\s\S]*?body button\.delete-history-btn:focus-visible \{([\s\S]*?)\n\}/u,
  )?.[1] || "";

  assert.match(baseRule, /background: transparent !important/u);
  assert.match(baseRule, /border: 0 !important/u);
  assert.match(baseRule, /box-shadow: none !important/u);
  assert.match(baseRule, /width: 28px !important/u);
  assert.match(baseRule, /height: 28px !important/u);
  assert.match(baseRule, /color: color-mix\(in srgb, var\(--danger\) 78%, var\(--text-muted\)\) !important/u);
  assert.match(interactionRule, /background: transparent !important/u);
  assert.match(interactionRule, /color: var\(--danger\) !important/u);
  assert.match(stylesheet, /body button\.delete-history-btn::after \{[\s\S]*?content: none !important/u);
  assert.match(stylesheet, /body button\.delete-history-btn:focus-visible \{[\s\S]*?outline: 2px solid color-mix\(in srgb, var\(--danger\) 48%, transparent\) !important/u);
});
