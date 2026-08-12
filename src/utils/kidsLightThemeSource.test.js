import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const performanceCss = readFileSync(
  new URL("../components/kids/KidsPerformanceSettings.css", import.meta.url),
  "utf8",
);
const startLearningCss = readFileSync(
  new URL("../pages/KidsStartLearningPage.css", import.meta.url),
  "utf8",
);
const kidsLearningCss = readFileSync(
  new URL("../pages/KidsLearningPage.css", import.meta.url),
  "utf8",
);

const plainLightScope = String.raw`body:not\(\.dark\):not\(\.has-bg-image\)`;

test("kids learning settings uses application surfaces and readable controls in plain light mode", () => {
  assert.match(
    performanceCss,
    new RegExp(
      `${plainLightScope} \\.kids-performance-settings \\{[\\s\\S]*?color: var\\(--text\\);[\\s\\S]*?var\\(--surface-strong\\)[\\s\\S]*?border-color: var\\(--border\\);`,
    ),
  );
  assert.match(
    performanceCss,
    new RegExp(
      `${plainLightScope} \\.kids-performance-field input,[\\s\\S]*?color: var\\(--text\\) !important;[\\s\\S]*?background: var\\(--surface-strong\\) !important;`,
    ),
  );
  assert.match(
    performanceCss,
    new RegExp(
      `${plainLightScope} \\.kids-performance-field input\\[readonly\\] \\{[\\s\\S]*?color: var\\(--text-muted\\) !important;`,
    ),
  );
  assert.match(
    performanceCss,
    new RegExp(
      `${plainLightScope} \\.kids-performance-save \\{[\\s\\S]*?color: #fff !important;[\\s\\S]*?background: var\\(--gradient-primary\\) !important;`,
    ),
  );
});

test("kids Start Learning uses light theme copy, fields, choices, and result surfaces", () => {
  assert.match(
    startLearningCss,
    new RegExp(
      `${plainLightScope} \\.kids-start-shell \\{[\\s\\S]*?var\\(--surface-strong\\)[\\s\\S]*?box-shadow: var\\(--shadow\\);`,
    ),
  );
  assert.match(
    startLearningCss,
    new RegExp(
      `${plainLightScope} \\.kids-start-field input \\{[\\s\\S]*?color: var\\(--text\\) !important;[\\s\\S]*?background: var\\(--surface-strong\\) !important;`,
    ),
  );
  assert.match(
    startLearningCss,
    new RegExp(
      `${plainLightScope} \\.kids-start-size-options button\\.is-selected \\{[\\s\\S]*?color: var\\(--text\\) !important;[\\s\\S]*?border-color: var\\(--kids-violet\\) !important;`,
    ),
  );
  assert.match(
    startLearningCss,
    new RegExp(
      `${plainLightScope} \\.kids-start-idea \\{[\\s\\S]*?background: var\\(--surface-strong\\);[\\s\\S]*?border-color: var\\(--border\\);`,
    ),
  );
});

test("portaled Parent Corner owns a complete light palette and readable actions", () => {
  assert.match(
    kidsLearningCss,
    new RegExp(
      `${plainLightScope} \\.kids-parent-backdrop \\{[\\s\\S]*?--kids-ink: var\\(--text,[\\s\\S]*?--kids-panel-solid: #fff;[\\s\\S]*?background: rgba\\(226, 232, 240, 0\\.7\\);`,
    ),
  );
  assert.match(
    kidsLearningCss,
    new RegExp(
      `${plainLightScope} \\.kids-parent-dialog \\{[\\s\\S]*?background: var\\(--kids-panel\\);[\\s\\S]*?border-color: var\\(--kids-line\\);`,
    ),
  );
  assert.match(
    kidsLearningCss,
    new RegExp(
      `${plainLightScope} \\.kids-parent-dialog \\.kids-parent-primary \\{[\\s\\S]*?color: #fff !important;[\\s\\S]*?background: linear-gradient[\\s\\S]*?!important;`,
    ),
  );
  assert.match(
    kidsLearningCss,
    /\.kids-parent-dialog :is\(button, input, select\):focus-visible \{/,
  );
});
