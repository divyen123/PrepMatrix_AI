import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("stacks milestone guidance beneath its single-line title", () => {
  const styles = readFileSync(new URL("../App.css", import.meta.url), "utf8");

  assert.match(
    styles,
    /\.next-milestone-strip\s*\{[^}]*align-items: stretch;[^}]*display: flex;[^}]*flex-direction: column;[^}]*justify-content: flex-start;/u,
  );
  assert.match(styles, /\.next-milestone-strip strong\s*\{[^}]*white-space: nowrap;/u);
  assert.match(styles, /\.next-milestone-strip p\s*\{[^}]*text-align: left;/u);
});
