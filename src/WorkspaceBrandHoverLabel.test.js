import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
const appCss = readFileSync(new URL("./App.css", import.meta.url), "utf8");

test("reveals only the PrepMatrix name beside the workspace logo", () => {
  assert.match(
    appSource,
    /<h1 className="workspace-logo-title">PrepMatrix<\/h1>/u,
  );
  assert.match(
    appCss,
    /\.workspace-logo-title \{[\s\S]*?background: transparent;[\s\S]*?border: 0;[\s\S]*?border-radius: 0;[\s\S]*?box-shadow: none;[\s\S]*?padding: 0;/u,
  );
  assert.match(
    appCss,
    /\.workspace-logo-title::before \{\s*content: none;\s*\}/u,
  );
  assert.match(
    appCss,
    /\.workspace-logo-wrap:hover \.workspace-logo-title,[\s\S]*?opacity: 1;/u,
  );
});
