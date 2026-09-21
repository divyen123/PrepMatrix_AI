export const EXPLICIT_LOGOUT_STORAGE_KEY = "prepmatrix_explicitly_logged_out";

function resolveStorage(storage) {
  if (storage !== undefined) return storage;
  return typeof globalThis !== "undefined" ? globalThis.localStorage : null;
}

export function wasExplicitlyLoggedOut(storage) {
  try {
    return resolveStorage(storage)?.getItem(EXPLICIT_LOGOUT_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function rememberExplicitLogout(storage) {
  try {
    resolveStorage(storage)?.setItem(EXPLICIT_LOGOUT_STORAGE_KEY, "true");
  } catch {
    // The in-memory logout still completes when browser storage is unavailable.
  }
}

export function clearExplicitLogout(storage) {
  try {
    resolveStorage(storage)?.removeItem(EXPLICIT_LOGOUT_STORAGE_KEY);
  } catch {
    // A successful login still continues when browser storage is unavailable.
  }
}
