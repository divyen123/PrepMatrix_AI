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

test("makes explicit logout durable before starting asynchronous logout work", () => {
  const logoutHandler = sourceBetween(
    "const handleLogout = async",
    "const handleAccountDeleted",
  );
  const rememberAt = logoutHandler.indexOf("rememberExplicitLogout()");
  const requestAt = logoutHandler.indexOf("api.logout()");
  const firstAwaitAt = logoutHandler.indexOf("await ");

  assert.ok(rememberAt >= 0);
  assert.ok(requestAt > rememberAt);
  assert.ok(firstAwaitAt > rememberAt);
});

test("an explicitly logged-out launch skips recovery and retries server logout", () => {
  const startup = sourceBetween(
    "useEffect(() => {\n    let isMounted = true;",
    "  useEffect(() => {\n    const handleSessionEnded",
  );
  const explicitLogoutCheckAt = startup.indexOf("if (wasExplicitlyLoggedOut())");
  const retryLogoutAt = startup.indexOf("api.logout().catch(() => undefined)");
  const branchReturnAt = startup.indexOf("return () =>", explicitLogoutCheckAt);
  const recoveryAt = startup.indexOf("api.me({ ...options, suppressAuthNotice: true })");

  assert.ok(explicitLogoutCheckAt >= 0);
  assert.ok(retryLogoutAt > explicitLogoutCheckAt);
  assert.ok(branchReturnAt > retryLogoutAt);
  assert.ok(recoveryAt > branchReturnAt);
  assert.match(
    startup.slice(explicitLogoutCheckAt, branchReturnAt),
    /clearStoredAuthState\(\);[\s\S]*?setAuthLoading\(false\);/u,
  );
});

test("redirects a recovered user away from login and registration", () => {
  assert.match(
    appSource,
    /const authenticatedAuthTarget = \([\s\S]*?safeAuthReturnTo\(location\.search\)[\s\S]*?\) \|\| learnerRoutePolicy\.homeRoute;/u,
  );
  assert.match(
    appSource,
    /\{authRecoveryUnavailable \? \([\s\S]*?\) : isAuthRoute \? \(\s*authLoading \? null : userProfile \? \([\s\S]*?<Navigate replace to=\{authenticatedAuthTarget\} \/>/u,
  );
});

test("keeps temporary session recovery failures on a retry screen", () => {
  const startup = sourceBetween(
    "useEffect(() => {\n    let isMounted = true;",
    "  useEffect(() => {\n    const handleSessionEnded",
  );
  assert.match(startup, /if \(error\?\.status === 401 && !hadSavedToken && error\?\.code === "AUTH_SESSION_INVALID"\) \{[\s\S]*?setAuthRecoveryUnavailable\(false\)/u);
  assert.match(startup, /retryUnauthorized: hadSavedToken/u);
  assert.match(startup, /setAuthRecoveryUnavailable\(true\)/u);
  assert.match(appSource, /\{authRecoveryUnavailable \? \(\s*<AuthRecoveryNotice/u);
  assert.match(appSource, /window\.setTimeout\(retrySavedSession, AUTH_RECOVERY_AUTO_RETRY_MS\)/u);
  assert.match(appSource, /window\.addEventListener\("online", retrySavedSession\)/u);
});
