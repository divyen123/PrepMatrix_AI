import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const componentSource = readFileSync(
  new URL("./SmartSuggestion.jsx", import.meta.url),
  "utf8",
);
const stylesheet = readFileSync(new URL("../App.css", import.meta.url), "utf8");

test("shows prompt to add subjects when no subjects are configured", () => {
  assert.match(componentSource, /safeSubjects\.length === 0/u);
  assert.match(
    componentSource,
    /to="\/subjects"/u,
  );
  assert.match(
    componentSource,
    /Add your subjects and generate a plan/u,
  );
  assert.match(
    componentSource,
    /className="smart-suggestion-cta is-empty"/u,
  );
  assert.match(componentSource, /<ArrowRight aria-hidden="true" size=\{16\} \/>/u);
});

test("shows prompt to generate a schedule when subjects exist but schedule does not", () => {
  assert.match(componentSource, /!metrics\.hasScheduledPlanner/u);
  assert.match(
    componentSource,
    /to="\/planner\/schedule"/u,
  );
  assert.match(
    componentSource,
    /Generate a schedule/u,
  );
});

test("keeps the no-subjects prompt text-only and the schedule CTA yellow-toned", () => {
  assert.match(
    stylesheet,
    /\.smart-suggestion-cta\.is-empty\s*\{[\s\S]*?width:\s*fit-content;[\s\S]*?border:\s*0;[\s\S]*?background:\s*transparent;[\s\S]*?box-shadow:\s*none;/u,
  );
  assert.match(stylesheet, /\.smart-suggestion-cta\.is-yellow\s*\{[\s\S]*?background:\s*rgba\(234,\s*179,\s*8/u);
  assert.match(stylesheet, /\.smart-suggestion-cta\.is-yellow:hover\s*\{/u);
  assert.match(stylesheet, /\.smart-suggestion-cta:hover svg\s*\{[\s\S]*?transform:\s*translateX\(4px\)/u);
});

test("removes suggestion badges and reveals populated cards one by one", () => {
  assert.doesNotMatch(componentSource, /<span className="panel-label">/u);
  assert.match(componentSource, /suggestions\.map\(\(suggestion, index\) =>/u);
  assert.match(componentSource, /"--suggestion-delay": `\$\{index \* 110\}ms`/u);
  assert.match(stylesheet, /@keyframes db-suggestion-card-enter/u);
  assert.match(
    stylesheet,
    /\.db-panel-content--visible \.db-panel-inner--suggestions \.suggestion-mini-card\s*\{[\s\S]*?animation:\s*db-suggestion-card-enter[\s\S]*?var\(--suggestion-delay, 0ms\) backwards;/u,
  );
  assert.match(
    stylesheet,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.db-panel-content--visible \.db-panel-inner--suggestions \.suggestion-mini-card\s*\{[\s\S]*?animation:\s*none;/u,
  );
});
