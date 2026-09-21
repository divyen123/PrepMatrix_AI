import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const componentSource = readFileSync(
  new URL("./DashboardSetupChecklist.jsx", import.meta.url),
  "utf8",
);
const stylesheet = readFileSync(new URL("./DashboardSetupChecklist.css", import.meta.url), "utf8");

test("animates the Complete actions panel while preserving its accessibility state", () => {
  assert.match(componentSource, /const \[collapsed, setCollapsed\] = useState\(true\)/u);
  assert.match(componentSource, /className=\{`dashboard-setup\$\{collapsed \? " is-collapsed" : ""\}`\}/u);
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
  assert.match(stylesheet, /\.dashboard-setup\s*\{[\s\S]*?overflow:\s*auto;/u);
  assert.match(stylesheet, /\.dashboard-setup\.is-collapsed\s*\{\s*overflow:\s*hidden;\s*\}/u);
});

test("uses theme-aware SpringCheck progress and unboxed action arrows", () => {
  assert.match(componentSource, /<SpringCheck[\s\S]*?checked=\{step\.complete\}[\s\S]*?readOnly[\s\S]*?animateOnMount/u);
  assert.match(componentSource, /key=\{`\$\{step\.id\}-\$\{collapsed \? "closed" : "open"\}`\}/u);
  assert.match(componentSource, /<Link aria-label=\{button\} className="dashboard-setup-action"/u);
  assert.match(stylesheet, /body\.has-bg-image \.dashboard-setup\s*\{[\s\S]*?background:\s*rgb\(var\(--bg-surface-rgb/u);
  assert.match(stylesheet, /a\.dashboard-setup-action\s*\{[\s\S]*?border:\s*0;[\s\S]*?background:\s*transparent;/u);
});
