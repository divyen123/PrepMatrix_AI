import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
const authSource = readFileSync(new URL("./pages/AuthPage.jsx", import.meta.url), "utf8");
const settingsSource = readFileSync(new URL("./pages/SettingsPage.jsx", import.meta.url), "utf8");

test("initializes Greyish White light appearance only after successful registration", () => {
  assert.match(
    authSource,
    /onLogin\(result\.user, result\.workspace, result\.profileContext, \{\s*initializeDefaultAppearance: isRegister,/u,
  );
  assert.match(
    appSource,
    /if \(options\.initializeDefaultAppearance\) \{[\s\S]*?initializeNewStudentAppearance\(localStorage\);[\s\S]*?applyAppearanceMode\("light"\);[\s\S]*?setActiveBackgroundImageId\(""\);/u,
  );
  assert.match(
    settingsSource,
    /\{ name: "Greyish White", light: "100, 116, 139", dark: "226, 232, 240" \}/u,
  );
});
