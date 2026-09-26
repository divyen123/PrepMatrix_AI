import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const settingsSource = readFileSync(new URL("./SettingsPage.jsx", import.meta.url), "utf8");
const settingsStyles = readFileSync(new URL("./SettingsPage.css", import.meta.url), "utf8");

test("dark mode keeps the delete-account trigger text bright", () => {
  assert.match(settingsSource, /className="confirm-danger-btn delete-account-trigger-btn"/u);
  assert.match(
    settingsStyles,
    /body\.dark \.settings-page \.delete-account-trigger-btn,[\s\S]*?color: #ffe3e8 !important;/u,
  );
});

test("dark mode keeps both delete popover actions readable, including disabled confirmation", () => {
  assert.match(settingsSource, /className="delete-confirm-popover"/u);
  assert.match(
    settingsStyles,
    /body\.dark \.settings-page \.delete-confirm-popover \.confirm-danger-btn \{\s*color: #ffe3e8 !important;/u,
  );
  assert.match(
    settingsStyles,
    /body\.dark \.settings-page \.delete-confirm-popover \.secondary-btn \{\s*color: #f3f6fb !important;/u,
  );
  assert.match(
    settingsStyles,
    /body\.dark \.settings-page \.delete-confirm-popover \.confirm-danger-btn:disabled,[\s\S]*?opacity: 0\.78;/u,
  );
});
