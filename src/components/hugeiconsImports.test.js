import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { basename, dirname } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const components = ["ThoughtLine.jsx", "SwipeToast.jsx", "SpringCheck.jsx"];

test("Hugeicons imports bypass the package index with exact-case icon files", async () => {
  const specifiers = new Set();
  for (const component of components) {
    const source = readFileSync(new URL(component, import.meta.url), "utf8");
    assert.doesNotMatch(source, /from ["']@hugeicons\/core-free-icons["']/u);
    for (const match of source.matchAll(/from ["'](@hugeicons\/core-free-icons\/[A-Za-z0-9]+Icon)["']/gu)) {
      specifiers.add(match[1]);
    }
  }

  assert.deepEqual([...specifiers].sort(), [
    "@hugeicons/core-free-icons/ArrowDown01Icon",
    "@hugeicons/core-free-icons/Cancel01Icon",
    "@hugeicons/core-free-icons/SparklesIcon",
    "@hugeicons/core-free-icons/Tick02Icon",
  ]);

  for (const specifier of specifiers) {
    const path = fileURLToPath(import.meta.resolve(specifier));
    assert.ok(readdirSync(dirname(path)).includes(basename(path)), `${specifier} must match the published file's case`);
    assert.ok(Array.isArray((await import(specifier)).default));
  }
});
