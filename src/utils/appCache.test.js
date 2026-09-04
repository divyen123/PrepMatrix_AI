import assert from "node:assert/strict";
import test from "node:test";
import {
  clearPrepMatrixAppCaches,
  isPrepMatrixCacheName,
} from "./appCache.js";

test("identifies only PrepMatrix-owned browser caches", () => {
  assert.equal(isPrepMatrixCacheName("prepmatrix-pwa-shell-v4"), true);
  assert.equal(isPrepMatrixCacheName("prepmatrix-pwa-runtime-v4"), true);
  assert.equal(isPrepMatrixCacheName("prepmatrix-offline-v1"), true);
  assert.equal(isPrepMatrixCacheName("another-app-cache"), false);
});

test("clears PrepMatrix caches without touching unrelated caches", async () => {
  const deleted = [];
  const result = await clearPrepMatrixAppCaches({
    keys: async () => [
      "prepmatrix-pwa-shell-v4",
      "another-app-cache",
      "prepmatrix-pwa-runtime-v4",
    ],
    delete: async (name) => {
      deleted.push(name);
      return true;
    },
  });

  assert.deepEqual(deleted, [
    "prepmatrix-pwa-shell-v4",
    "prepmatrix-pwa-runtime-v4",
  ]);
  assert.deepEqual(result, { cleared: 2, supported: true });
});

test("reports unsupported cache storage without failing", async () => {
  assert.deepEqual(
    await clearPrepMatrixAppCaches(null),
    { cleared: 0, supported: false },
  );
});
