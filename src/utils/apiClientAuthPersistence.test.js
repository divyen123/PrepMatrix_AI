import assert from "node:assert/strict";
import test from "node:test";
import api, { responseEndsAuthSession } from "./apiClient.js";
import {
  EXPLICIT_LOGOUT_STORAGE_KEY,
  rememberExplicitLogout,
} from "./authPersistence.js";

function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

function response(payload, { ok = true, status = 200 } = {}) {
  return {
    headers: { get: () => null },
    json: async () => payload,
    ok,
    status,
  };
}

test("only a successful authentication token clears explicit logout", async (t) => {
  const previousFetch = globalThis.fetch;
  const previousLocalStorage = globalThis.localStorage;
  const storage = createMemoryStorage();
  globalThis.localStorage = storage;
  t.after(() => {
    globalThis.fetch = previousFetch;
    globalThis.localStorage = previousLocalStorage;
  });
  rememberExplicitLogout(storage);

  globalThis.fetch = async () => response(
    { error: "Email or password is incorrect." },
    { ok: false, status: 401 },
  );
  await assert.rejects(api.login({ email: "student@example.com", password: "wrong" }));
  assert.equal(storage.getItem(EXPLICIT_LOGOUT_STORAGE_KEY), "true");
  assert.equal(storage.getItem("prepmatrix_auth_token"), null);

  globalThis.fetch = async () => response({ token: "new-session" });
  await api.login({ email: "student@example.com", password: "correct" });
  assert.equal(storage.getItem(EXPLICIT_LOGOUT_STORAGE_KEY), null);
  assert.equal(storage.getItem("prepmatrix_auth_token"), "new-session");
});

test("only definitive authentication failures end a saved session", () => {
  const unauthorized = { status: 401 };

  assert.equal(
    responseEndsAuthSession("/api/auth/me", unauthorized, { error: "Login required." }),
    true,
  );
  assert.equal(
    responseEndsAuthSession("/api/auth/me", unauthorized, { error: "Temporary gateway error." }),
    false,
  );
  assert.equal(
    responseEndsAuthSession("/api/workspace", unauthorized, {
      code: "AUTH_SESSION_INVALID",
      error: "Login required.",
    }),
    true,
  );
  assert.equal(
    responseEndsAuthSession("/api/auth/profile", unauthorized, {
      code: "PASSWORD_CHANGED",
      error: "Your password was changed. Please log in again.",
    }),
    true,
  );
  assert.equal(
    responseEndsAuthSession("/api/auth/account", unauthorized, {
      error: "Incorrect password. Account was not deleted.",
    }),
    false,
  );
  assert.equal(
    responseEndsAuthSession("/api/auth/profile", unauthorized, {
      error: "Current password is incorrect.",
    }),
    false,
  );
  assert.equal(
    responseEndsAuthSession("/api/auth/login", unauthorized, {
      code: "AUTH_SESSION_INVALID",
    }),
    false,
  );
});

test("wrong-password validation does not remove a valid remembered login", async (t) => {
  const previousFetch = globalThis.fetch;
  const previousLocalStorage = globalThis.localStorage;
  const previousWindow = globalThis.window;
  const storage = createMemoryStorage({ prepmatrix_auth_token: "remembered-session" });
  globalThis.localStorage = storage;
  globalThis.window = undefined;
  t.after(() => {
    globalThis.fetch = previousFetch;
    globalThis.localStorage = previousLocalStorage;
    globalThis.window = previousWindow;
  });

  globalThis.fetch = async () => response(
    { error: "Incorrect password. Account was not deleted." },
    { ok: false, status: 401 },
  );

  await assert.rejects(api.deleteAccount("wrong-password"), { status: 401 });
  assert.equal(storage.getItem("prepmatrix_auth_token"), "remembered-session");
});

test("a late unauthorized request cannot clear a newer saved session", async (t) => {
  const previousFetch = globalThis.fetch;
  const previousLocalStorage = globalThis.localStorage;
  const storage = createMemoryStorage({ prepmatrix_auth_token: "old-session" });
  globalThis.localStorage = storage;
  t.after(() => {
    globalThis.fetch = previousFetch;
    globalThis.localStorage = previousLocalStorage;
  });

  let finishRequest;
  globalThis.fetch = () => new Promise((resolve) => { finishRequest = resolve; });
  const pending = api.me();
  storage.setItem("prepmatrix_auth_token", "new-session");
  finishRequest(response({ error: "Login required." }, { ok: false, status: 401 }));

  await assert.rejects(pending, { code: "STALE_AUTH_REQUEST" });
  assert.equal(storage.getItem("prepmatrix_auth_token"), "new-session");

  globalThis.fetch = async () => response({ error: "Login required." }, { ok: false, status: 401 });
  await assert.rejects(api.me(), { status: 401 });
  assert.equal(storage.getItem("prepmatrix_auth_token"), "new-session");
});

test("a password change revokes the saved sign-in", async (t) => {
  const previousFetch = globalThis.fetch;
  const previousLocalStorage = globalThis.localStorage;
  const storage = createMemoryStorage({ prepmatrix_auth_token: "old-session" });
  globalThis.localStorage = storage;
  t.after(() => {
    globalThis.fetch = previousFetch;
    globalThis.localStorage = previousLocalStorage;
  });

  globalThis.fetch = async () => response(
    { code: "PASSWORD_CHANGED", error: "Your password was changed." },
    { ok: false, status: 401 },
  );
  await assert.rejects(api.me(), { code: "PASSWORD_CHANGED" });
  assert.equal(storage.getItem("prepmatrix_auth_token"), null);
});

test("a late session recovery cannot replace a newer saved login", async (t) => {
  const previousFetch = globalThis.fetch;
  const previousLocalStorage = globalThis.localStorage;
  const storage = createMemoryStorage({ prepmatrix_auth_token: "old-session" });
  globalThis.localStorage = storage;
  t.after(() => {
    globalThis.fetch = previousFetch;
    globalThis.localStorage = previousLocalStorage;
  });

  let finishRequest;
  globalThis.fetch = () => new Promise((resolve) => { finishRequest = resolve; });
  const pending = api.me();
  storage.setItem("prepmatrix_auth_token", "new-session");
  finishRequest(response({ token: "old-session", user: { username: "Former account" } }));

  await assert.rejects(pending, { code: "STALE_AUTH_REQUEST" });
  assert.equal(storage.getItem("prepmatrix_auth_token"), "new-session");
});

test("a late cookie recovery cannot undo an explicit logout", async (t) => {
  const previousFetch = globalThis.fetch;
  const previousLocalStorage = globalThis.localStorage;
  const storage = createMemoryStorage();
  globalThis.localStorage = storage;
  t.after(() => {
    globalThis.fetch = previousFetch;
    globalThis.localStorage = previousLocalStorage;
  });

  let finishRequest;
  globalThis.fetch = () => new Promise((resolve) => { finishRequest = resolve; });
  const pending = api.me({ suppressAuthNotice: true });
  rememberExplicitLogout(storage);
  finishRequest(response({ token: "cookie-session", user: { id: "user-1" } }));

  await assert.rejects(pending, { code: "STALE_AUTH_REQUEST" });
  assert.equal(storage.getItem("prepmatrix_auth_token"), null);
  assert.equal(storage.getItem(EXPLICIT_LOGOUT_STORAGE_KEY), "true");
});

test("a late logout response cannot clear a newer saved session", async (t) => {
  const previousFetch = globalThis.fetch;
  const previousLocalStorage = globalThis.localStorage;
  const storage = createMemoryStorage({ prepmatrix_auth_token: "old-session" });
  globalThis.localStorage = storage;
  t.after(() => {
    globalThis.fetch = previousFetch;
    globalThis.localStorage = previousLocalStorage;
  });

  let finishRequest;
  globalThis.fetch = () => new Promise((resolve) => { finishRequest = resolve; });
  const pending = api.logout();
  storage.setItem("prepmatrix_auth_token", "new-session");
  finishRequest(response({ ok: true }));

  await pending;
  assert.equal(storage.getItem("prepmatrix_auth_token"), "new-session");
});
