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
