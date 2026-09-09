import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");

function sourceBetween(startMarker, endMarker, source = appSource) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `Missing source marker: ${startMarker}`);
  assert.ok(end > start, `Missing source marker after ${startMarker}: ${endMarker}`);
  return source.slice(start, end);
}

test("stores an explicit lock until a later app launch restores it", () => {
  assert.match(appSource, /const APP_LOCK_STORAGE_KEY = "prepmatrix_app_locked";/u);
  assert.match(
    appSource,
    /const \[appLocked, setAppLocked\] = useState\(\s*\(\) => localStorage\.getItem\(APP_LOCK_STORAGE_KEY\) === "true",\s*\);/u,
  );

  const lockHandler = sourceBetween(
    "const handleLockApp = useCallback",
    "const autoLockActionRef",
  );
  const persistLock = lockHandler.indexOf(
    'localStorage.setItem(APP_LOCK_STORAGE_KEY, "true")',
  );
  const showLock = lockHandler.indexOf("setAppLocked(true)");

  assert.ok(persistLock >= 0, "Lock action must persist the locked state");
  assert.ok(showLock > persistLock, "Persist the lock before showing the lock scene");
  assert.doesNotMatch(
    appSource,
    /sessionStorage\.(?:getItem|setItem|removeItem)\(APP_LOCK_STORAGE_KEY/u,
  );
});

test("finishes the restored intro before revealing the persisted lock scene", () => {
  assert.match(appSource, /const \[authLoading, setAuthLoading\] = useState\(true\);/u);
  assert.match(appSource, /const \[entrySplash, setEntrySplash\] = useState\(true\);/u);
  assert.match(
    appSource,
    /\{entrySplash\s*&&\s*<EntrySplash loading=\{authLoading\} \/>\}/u,
  );
  assert.match(
    appSource,
    /\{appLocked\s*&&\s*!entrySplash\s*&&\s*userProfile\s*&&[\s\S]*?<AppLockOverlay/u,
  );

  const renderStart = appSource.indexOf("return (", appSource.indexOf("function App()"));
  const introRender = appSource.indexOf("{entrySplash && <EntrySplash", renderStart);
  const lockRender = appSource.indexOf("{appLocked && !entrySplash", renderStart);
  assert.ok(introRender >= renderStart && lockRender > introRender);

  const recovery = sourceBetween("api.me()", ".catch((error) => {");
  const startIntro = recovery.indexOf("setEntrySplash(true)");
  const finishIntro = recovery.indexOf("setEntrySplash(false)", startIntro);
  assert.ok(startIntro >= 0 && finishIntro > startIntro);
  assert.match(recovery, /getEntrySplashDuration\(\)/u);
  assert.doesNotMatch(recovery, /removeItem\(APP_LOCK_STORAGE_KEY\)/u);
});

test("clears the persistent lock as soon as confirmed logout starts", () => {
  const logoutHandler = sourceBetween(
    "const handleLogout = async",
    "const handleAccountDeleted",
  );
  const firstAwait = logoutHandler.indexOf("await ");
  const clearAuth = logoutHandler.indexOf("clearStoredAuthState()");
  const requestLogout = logoutHandler.indexOf("api.logout()");
  const clearLock = logoutHandler.indexOf(
    "localStorage.removeItem(APP_LOCK_STORAGE_KEY)",
  );
  const clearLockUi = logoutHandler.indexOf("setAppLocked(false)");

  assert.ok(firstAwait >= 0, "Logout should still wait for its asynchronous work");
  assert.ok(requestLogout >= 0 && requestLogout < clearAuth, "Start server logout before clearing its token");
  assert.ok(clearAuth >= 0 && clearAuth < firstAwait, "Clear local auth before waiting");
  assert.ok(clearLock >= 0 && clearLock < firstAwait, "Clear the persisted lock before waiting");
  assert.ok(clearLockUi > clearLock && clearLockUi < firstAwait);
});

test("terminal auth failures and an unlock 401 cannot leave a stale lock", () => {
  const recoveryCatch = sourceBetween(
    ".catch((error) => {",
    ".finally(() => {",
    appSource.slice(appSource.indexOf("api.me()")),
  );
  const passwordChanged = sourceBetween(
    'if (error?.code === "PASSWORD_CHANGED")',
    "if (error?.status === 401)",
    recoveryCatch,
  );
  const unauthorized = sourceBetween(
    "if (error?.status === 401)",
    "setNotification(HAS_CONFIGURED_API",
    recoveryCatch,
  );

  for (const branch of [passwordChanged, unauthorized]) {
    assert.match(branch, /localStorage\.removeItem\(APP_LOCK_STORAGE_KEY\)/u);
    assert.match(branch, /setAppLocked\(false\)/u);
    assert.match(branch, /setAppLockError\(""\)/u);
  }

  const unlockHandler = sourceBetween(
    "const handleUnlockApp = async",
    "const handleLockedLogout",
  );
  assert.match(
    unlockHandler,
    /catch \(error\) \{[\s\S]*?if \(error\?\.status === 401\) \{[\s\S]*?clearAuthenticatedUi\(/u,
  );
});
