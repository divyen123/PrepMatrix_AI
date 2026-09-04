export const PREPMATRIX_CACHE_PREFIXES = Object.freeze([
  "prepmatrix-pwa-shell-",
  "prepmatrix-pwa-runtime-",
  "prepmatrix-offline-",
]);

export function isPrepMatrixCacheName(value) {
  const name = String(value || "");
  return PREPMATRIX_CACHE_PREFIXES.some((prefix) => name.startsWith(prefix));
}

export async function clearPrepMatrixAppCaches(cacheStorage = globalThis.caches) {
  if (!cacheStorage?.keys || !cacheStorage?.delete) {
    return { cleared: 0, supported: false };
  }

  const names = await cacheStorage.keys();
  const ownedNames = names.filter(isPrepMatrixCacheName);
  const results = await Promise.all(ownedNames.map((name) => cacheStorage.delete(name)));

  return {
    cleared: results.filter(Boolean).length,
    supported: true,
  };
}
