import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const settingsSource = readFileSync(
  new URL("../pages/SettingsPage.jsx", import.meta.url),
  "utf8",
);

test("invalidates custom-background preparation after a newer request or unmount", () => {
  assert.match(settingsSource, /const customBackgroundRequestRef = useRef\(0\)/);
  assert.match(settingsSource, /const customBackgroundMountedRef = useRef\(true\)/);
  assert.match(
    settingsSource,
    /customBackgroundMountedRef\.current = false;\s*customBackgroundRequestRef\.current \+= 1;/,
  );
  assert.match(
    settingsSource,
    /const preparedImage = await prepareCustomBackgroundImage\(file\);\s*if \(!requestIsCurrent\(\)\) return;/,
  );
  assert.match(settingsSource, /finally \{\s*if \(requestIsCurrent\(\)\) setCustomBackgroundBusy\(false\);/);
});

test("reverts an unsaved preview to the latest successful appearance snapshot", () => {
  assert.doesNotMatch(settingsSource, /const initialSnapshot = initialSettings\.current;/);
  assert.match(
    settingsSource,
    /return \(\) => \{\s*if \(!savedRef\.current\) \{\s*const init = initialSettings\.current;/,
  );
});

test("commits Save Appearance only after a transactional storage update succeeds", () => {
  assert.match(
    settingsSource,
    /savedRef\.current = false;\s*let persistedBgImageId[\s\S]*runAppearanceStorageTransaction\(localStorage,/,
  );
  assert.match(
    settingsSource,
    /runAppearanceStorageTransaction\(localStorage,[\s\S]*initialSettings\.current = \{[\s\S]*savedRef\.current = true;/,
  );
  assert.match(
    settingsSource,
    /if \(persistCustomBackground\(\) === false\) \{\s*throw new Error\("Custom background storage failed\."\);/,
  );
  assert.match(
    settingsSource,
    /initialSettings\.current = \{[\s\S]*kidsBackgroundsEligible,[\s\S]*savedRef\.current = true;/,
  );
  assert.match(
    settingsSource,
    /catch \{\s*savedRef\.current = false;[\s\S]*previous saved settings were restored/,
  );
});
