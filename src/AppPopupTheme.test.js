import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const styles = readFileSync(new URL("./App.css", import.meta.url), "utf8");

test("shared popup backdrops dim the active background without a navy wash", () => {
  for (const selector of [
    ".confirm-modal-backdrop",
    ".profile-preview-backdrop",
    ".trend-modal-backdrop",
    ".subject-modal-overlay",
    ".subject-ai-dialog-backdrop",
    ".guide-dialog-backdrop",
  ]) {
    assert.match(styles, new RegExp(`${selector.replaceAll(".", "\\.")}\\s*\\{[^}]*background: rgba\\(0, 0, 0,`, "u"));
  }
});

test("image-theme popup cards use neutral glass or solid surfaces", () => {
  for (const selector of [
    "confirm-modal",
    "subject-progress-modal",
    "subject-ai-dialog",
    "trend-modal-content",
  ]) {
    assert.match(styles, new RegExp(`body\\.has-bg-image:not\\(\\.no-glass-cards\\) \\.${selector}\\s*\\{[^}]*background: rgba\\(0, 0, 0,`, "u"));
    assert.match(styles, new RegExp(`body\\.has-bg-image\\.no-glass-cards \\.${selector}\\s*\\{[^}]*background: rgba\\(0, 0, 0,`, "u"));
  }
});
