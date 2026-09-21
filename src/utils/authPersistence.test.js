import assert from "node:assert/strict";
import test from "node:test";
import {
  EXPLICIT_LOGOUT_STORAGE_KEY,
  clearExplicitLogout,
  rememberExplicitLogout,
  wasExplicitlyLoggedOut,
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

test("remembers explicit logout until a later successful authentication clears it", () => {
  const storage = createMemoryStorage({ unrelated: "preserved" });

  assert.equal(wasExplicitlyLoggedOut(storage), false);
  rememberExplicitLogout(storage);
  assert.equal(storage.getItem(EXPLICIT_LOGOUT_STORAGE_KEY), "true");
  assert.equal(wasExplicitlyLoggedOut(storage), true);

  clearExplicitLogout(storage);
  assert.equal(storage.getItem(EXPLICIT_LOGOUT_STORAGE_KEY), null);
  assert.equal(storage.getItem("unrelated"), "preserved");
  assert.equal(wasExplicitlyLoggedOut(storage), false);
});

test("treats malformed marker values as not explicitly logged out and tolerates blocked storage", () => {
  const storage = createMemoryStorage({
    [EXPLICIT_LOGOUT_STORAGE_KEY]: "false",
  });
  assert.equal(wasExplicitlyLoggedOut(storage), false);

  const blockedStorage = {
    getItem() {
      throw new Error("blocked");
    },
    removeItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };

  assert.doesNotThrow(() => rememberExplicitLogout(blockedStorage));
  assert.doesNotThrow(() => clearExplicitLogout(blockedStorage));
  assert.equal(wasExplicitlyLoggedOut(blockedStorage), false);
});
