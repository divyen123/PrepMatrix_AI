import assert from "node:assert/strict";
import test from "node:test";
import {
  authSwitchTarget,
  buildLoginRedirect,
  safeAuthReturnTo,
} from "./authReturnTo.js";

test("preserves a private battle deep link through login and registration", () => {
  const login = buildLoginRedirect("/quiz", "?tab=battles", "#battle-invite=ABCD234EFG");
  assert.equal(
    login,
    "/login?returnTo=%2Fquiz%3Ftab%3Dbattles%23battle-invite%3DABCD234EFG",
  );
  assert.equal(
    safeAuthReturnTo(login.slice(login.indexOf("?"))),
    "/quiz?tab=battles#battle-invite=ABCD234EFG",
  );
  assert.equal(
    authSwitchTarget("/register", login.slice(login.indexOf("?"))),
    "/register?returnTo=%2Fquiz%3Ftab%3Dbattles%23battle-invite%3DABCD234EFG",
  );
});

test("rejects external, protocol-relative, and auth-loop return targets", () => {
  assert.equal(safeAuthReturnTo("?returnTo=https%3A%2F%2Fevil.example"), "");
  assert.equal(safeAuthReturnTo("?returnTo=%2F%2Fevil.example"), "");
  assert.equal(safeAuthReturnTo("?returnTo=%2Flogin"), "");
});
