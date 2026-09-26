import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const modalSource = readFileSync(new URL("./SubjectProgressModal.jsx", import.meta.url), "utf8");
const stylesheet = readFileSync(new URL("../App.css", import.meta.url), "utf8");

test("subject exam outlook uses a read-only CometDial for completion", () => {
  assert.match(modalSource, /import CometDial from "\.\/CometDial";/u);
  assert.match(modalSource, /<CometDial[\s\S]*?readOnly[\s\S]*?value=\{completionPercentage\}/u);
  assert.doesNotMatch(modalSource, /className="readiness-gauge"/u);
  assert.match(stylesheet, /\.subject-progress-modal \.subject-readiness-dial\s*\{/u);
});

test("completed timeline badges and compact close button have their own tones", () => {
  assert.match(stylesheet, /\.subject-task-status\.done\s*\{[^}]*color:\s*#397b56;[^}]*background:\s*rgba\(55, 145, 92, 0\.11\);/u);
  assert.match(stylesheet, /body \.subject-modal-close\s*\{[^}]*--app-icon-button-size:\s*30px;[^}]*--app-action-button-radius:\s*999px;/u);
  assert.match(stylesheet, /body \.subject-modal-close\s*\{[^}]*background:\s*rgba\(184, 95, 105, 0\.09\);/u);
});
