import assert from "node:assert/strict";
import test from "node:test";
import api from "./apiClient.js";
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
