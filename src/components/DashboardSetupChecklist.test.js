import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const componentSource = readFileSync(
  new URL("./DashboardSetupChecklist.jsx", import.meta.url),
  "utf8",
);
const stylesheet = readFileSync(new URL("./DashboardSetupChecklist.css", import.meta.url), "utf8");

test("animates the Complete actions panel while preserving its accessibility state", () => {
  assert.doesNotMatch(componentSource, /(?:^|\s)hidden=\{collapsed\}/u);
  assert.match(componentSource, /aria-hidden=\{collapsed\}/u);
  assert.match(componentSource, /inert=\{collapsed \? "" : undefined\}/u);
  assert.match(componentSource, /dashboard-setup-content\$\{collapsed \? " is-collapsed" : ""\}/u);

  assert.match(
    stylesheet,
    /\.dashboard-setup-content\s*\{[\s\S]*?grid-template-rows:\s*1fr;[\s\S]*?transition:\s*grid-template-rows 260ms/u,
  );
  assert.match(
    stylesheet,
    /\.dashboard-setup-content\.is-collapsed\s*\{[\s\S]*?grid-template-rows:\s*0fr;[\s\S]*?opacity:\s*0;/u,
  );
  assert.match(
    stylesheet,
    /\.dashboard-setup-content-inner\s*\{[\s\S]*?min-height:\s*0;[\s\S]*?overflow:\s*hidden;[\s\S]*?transform:/u,
  );
  assert.match(
    stylesheet,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.dashboard-setup-content,[\s\S]*?transition-duration:\s*0\.01ms;/u,
  );
});
