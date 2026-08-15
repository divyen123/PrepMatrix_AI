import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const settingsPageSource = readFileSync(new URL("./SettingsPage.jsx", import.meta.url), "utf8");
const settingsPageStyles = readFileSync(new URL("./SettingsPage.css", import.meta.url), "utf8");
const subjectsPageSource = readFileSync(new URL("./SubjectsPage.jsx", import.meta.url), "utf8");

test("brings Subjects Manage visitors to Profile & Institution with a two-second theme-aware focus cue", () => {
  assert.match(subjectsPageSource, /state=\{\{ highlightProfileInstitution: true \}\}/);
  assert.match(settingsPageSource, /scrollIntoView\?\.\(\{ behavior: "smooth", block: "center" \}\)/);
  assert.match(settingsPageSource, /\}, 2000\);/);
  assert.match(settingsPageStyles, /animation: settings-profile-card-arrival-highlight 2s/);
  assert.match(settingsPageStyles, /border-color: var\(--settings-profile-highlight-border\) !important;/);
  assert.match(settingsPageStyles, /body\.dark[\s\S]*?--settings-profile-highlight-border: #7dd3fc;/);
  assert.match(settingsPageStyles, /body:not\(\.dark\)[\s\S]*?--settings-profile-highlight-border: #172f52;/);
  assert.match(settingsPageStyles, /transform: scale\(1\.012\);/);
});
