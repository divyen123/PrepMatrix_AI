import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  SESSION_COOKIE_MAX_AGE_MS,
  createPersistentSessionDocument,
  persistentSessionFilter,
  persistentSessionTouch,
  retireLegacySessionExpiry,
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

test("retires the old session TTL index before clearing saved session expiry fields", async () => {
  const calls = [];
  const collection = {
    listIndexes: () => ({
      toArray: async () => [
        { name: "token_1", key: { token: 1 }, unique: true },
        { name: "expiresAt_1", key: { expiresAt: 1 }, expireAfterSeconds: 0 },
      ],
    }),
    dropIndex: async (name) => { calls.push(["dropIndex", name]); },
    updateMany: async (filter, update) => {
      calls.push(["updateMany", filter, update]);
      return { modifiedCount: 2 };
    },
  };

  const result = await retireLegacySessionExpiry(collection);
  assert.equal(result.modifiedCount, 2);
  assert.deepEqual(calls, [
    ["dropIndex", "expiresAt_1"],
    ["updateMany", { expiresAt: { $exists: true } }, { $unset: { expiresAt: "" } }],
  ]);
});

test("session expiry retirement is safe to repeat and tolerates another server dropping the index", async () => {
  let updates = 0;
  const collection = {
    listIndexes: () => ({
      toArray: async () => [{ name: "expiresAt_1", key: { expiresAt: 1 }, expireAfterSeconds: 0 }],
    }),
    dropIndex: async () => { throw Object.assign(new Error("index not found"), { code: 27 }); },
    updateMany: async () => { updates += 1; return { modifiedCount: 0 }; },
  };

  await retireLegacySessionExpiry(collection);
  assert.equal(updates, 1);
});

test("session expiry retirement propagates database failures", async () => {
  const failure = new Error("database unavailable");
  await assert.rejects(retireLegacySessionExpiry({
    listIndexes: () => ({ toArray: async () => [
      { name: "expiresAt_1", key: { expiresAt: 1 }, expireAfterSeconds: 0 },
    ] }),
    dropIndex: async () => { throw failure; },
    updateMany: async () => { throw new Error("should not run"); },
  }), failure);
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
  assert.match(serverSource, /await retireLegacySessionExpiry\(sessions\)/u);
  assert.doesNotMatch(serverSource, /collection\("sessions"\)\.createIndex\(\{ expiresAt: 1 \}/u);
});

test("marks only missing or revoked authentication as an invalid session", () => {
  const requireAuthStart = serverSource.indexOf("function requireAuth");
  const requireAuthEnd = serverSource.indexOf("function requireParentGuidedFeature", requireAuthStart);
  const authMeStart = serverSource.indexOf('app.get("/api/auth/me"');
  const authMeEnd = serverSource.indexOf('app.post("/api/auth/send-otp"', authMeStart);
  const requireAuthSource = serverSource.slice(requireAuthStart, requireAuthEnd);
  const authMeSource = serverSource.slice(authMeStart, authMeEnd);

  assert.ok(requireAuthStart >= 0 && requireAuthEnd > requireAuthStart);
  assert.ok(authMeStart >= 0 && authMeEnd > authMeStart);
  assert.match(requireAuthSource, /code: "AUTH_SESSION_INVALID", error: "Login required\."/u);
  assert.match(authMeSource, /code: "AUTH_SESSION_INVALID", error: "Login required\."/u);
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
