import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");

function sourceBetween(startMarker, endMarker) {
  const start = appSource.indexOf(startMarker);
  const end = appSource.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `Missing source marker: ${startMarker}`);
  assert.ok(end > start, `Missing source marker after ${startMarker}: ${endMarker}`);
  return appSource.slice(start, end);
}

test("renders only the dedicated lock scene while the session lock is active", () => {
  assert.match(
    appSource,
    /\{hasActiveBackgroundImage\s*&&\s*!appLocked\s*&&\s*<AppBackground\s*\/>\}/u,
  );
  assert.match(
    appSource,
    /\{entrySplash\s*&&\s*!appLocked\s*&&\s*<EntrySplash\s+loading=\{authLoading\}\s*\/>\}/u,
  );

  const lockHandler = sourceBetween(
    "const handleLockApp = useCallback",
    "const autoLockActionRef",
  );
  assert.match(lockHandler, /setAppLocked\(true\)/u);
  assert.doesNotMatch(
    lockHandler,
    /setActiveBackgroundImageId|setLiveCustomBackgroundImageActive/u,
  );
});

test("restores the saved workspace background when a successful unlock exits lock state", () => {
  const unlockHandler = sourceBetween(
    "const handleUnlockApp = async",
    "const handleLockedLogout",
  );

  assert.match(
    unlockHandler,
    /sessionStorage\.removeItem\(APP_LOCK_STORAGE_KEY\);\s*setAppLocked\(false\);/u,
  );
  assert.match(unlockHandler, /setEntrySplash\(false\)/u);
  assert.doesNotMatch(
    unlockHandler,
    /setActiveBackgroundImageId|setLiveCustomBackgroundImageActive/u,
  );
});
