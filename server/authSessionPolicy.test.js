import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  SESSION_COOKIE_MAX_AGE_MS,
  createPersistentSessionDocument,
  persistentSessionFilter,
  persistentSessionTouch,
} from "./authSessionPolicy.js";

const serverSource = readFileSync(new URL("./index.js", import.meta.url), "utf8");

test("creates persistent sessions without a database expiry", () => {
  const now = new Date("2026-09-21T08:30:00.000Z");

  assert.deepEqual(
    createPersistentSessionDocument({ token: "session-token", userId: "user-1", now }),
    {
      token: "session-token",
      userId: "user-1",
      createdAt: now,
      lastSeenAt: now,
    },
  );
  assert.equal(
    Object.hasOwn(createPersistentSessionDocument({ token: "token", userId: "user", now }), "expiresAt"),
    false,
  );
});

test("finds saved sessions by token without rejecting legacy expiry fields", () => {
  assert.deepEqual(persistentSessionFilter("remembered-token"), {
    token: "remembered-token",
  });
});

test("touching a saved session records activity and removes its legacy expiry", () => {
  const now = new Date("2026-09-21T09:45:00.000Z");

  assert.deepEqual(persistentSessionTouch(now), {
    $set: { lastSeenAt: now },
    $unset: { expiresAt: "" },
  });
});

test("keeps the browser session cookie for a practical remembered-login window", () => {
  const dayMs = 24 * 60 * 60 * 1000;

  assert.equal(SESSION_COOKIE_MAX_AGE_MS, 30 * dayMs);
  assert.ok(Number.isSafeInteger(SESSION_COOKIE_MAX_AGE_MS));
});

test("wires the persistent policy into session creation and recovery", () => {
  const createSessionStart = serverSource.indexOf("async function createSession");
  const requestTokenStart = serverSource.indexOf("function getRequestToken", createSessionStart);
  const authenticationStart = serverSource.indexOf("async function getAuthenticatedSession", requestTokenStart);
  const authenticationEnd = serverSource.indexOf("async function _getAuthenticatedUser", authenticationStart);
  const createSessionSource = serverSource.slice(createSessionStart, requestTokenStart);
  const authenticationSource = serverSource.slice(authenticationStart, authenticationEnd);

  assert.ok(createSessionStart >= 0 && requestTokenStart > createSessionStart);
  assert.ok(authenticationStart >= 0 && authenticationEnd > authenticationStart);
  assert.match(createSessionSource, /createPersistentSessionDocument\(\{ token, userId \}\)/u);
  assert.doesNotMatch(createSessionSource, /expiresAt/u);
  assert.match(authenticationSource, /findOne\(persistentSessionFilter\(token\)\)/u);
  assert.match(authenticationSource, /persistentSessionTouch\(now\)/u);
});

test("password changes revoke durable sessions before issuing the replacement", () => {
  const profileRouteStart = serverSource.indexOf('app.put("/api/auth/profile"');
  const preferencesRouteStart = serverSource.indexOf('app.put("/api/auth/preferences"', profileRouteStart);
  const profileRouteSource = serverSource.slice(profileRouteStart, preferencesRouteStart);
  const passwordChangedAt = profileRouteSource.indexOf("update.passwordChangedAt = new Date()");
  const revokeSessions = profileRouteSource.indexOf('collection("sessions").deleteMany');
  const createReplacement = profileRouteSource.indexOf("createSession(req.user._id)", revokeSessions);

  assert.ok(profileRouteStart >= 0 && preferencesRouteStart > profileRouteStart);
  assert.ok(passwordChangedAt >= 0);
  assert.ok(revokeSessions > passwordChangedAt);
  assert.ok(createReplacement > revokeSessions);
});
