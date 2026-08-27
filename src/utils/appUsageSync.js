import api from "./apiClient.js";
import {
  APP_USAGE_RECORD_VERSION,
  ensureAppUsageSource,
  getCurrentAppUsageTimeZone,
  mergeSyncedAppUsageRecord,
  readAppUsageRecord,
} from "./appUsage.js";

export const APP_USAGE_SYNC_INTERVAL_MS = 60_000;
export const APP_USAGE_SYNC_TIMEOUT_MS = 12_000;
export const APP_USAGE_FLUSH_REQUEST_EVENT = "prepmatrix:app-usage-flush-request";

export function requestAppUsageFlush() {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") {
    return Promise.resolve();
  }
  let flushPromise = null;
  try {
    window.dispatchEvent(new CustomEvent(APP_USAGE_FLUSH_REQUEST_EVENT, {
      detail: {
        waitUntil(value) {
          flushPromise = Promise.resolve(value);
        },
      },
    }));
  } catch {
    return Promise.resolve();
  }
  return flushPromise || Promise.resolve();
}

async function withAppUsageStorageLock(identity, operation) {
  const lockManager = globalThis.navigator?.locks;
  if (!identity || typeof lockManager?.request !== "function") return operation();
  return lockManager.request(
    `prepmatrix-app-usage:${identity}`,
    { mode: "exclusive" },
    operation,
  );
}

export async function syncAppUsageRecord(identity, {
  keepalive = false,
  request = api.syncAppUsage,
  storage,
} = {}) {
  if (!identity || typeof request !== "function") {
    return readAppUsageRecord(identity, storage);
  }

  const snapshot = () => {
    const localRecord = ensureAppUsageSource(identity, storage);
    return {
      sourceId: localRecord.sourceId,
      days: { ...localRecord.sourceDays },
      localTimeZone: localRecord.usageTimeZone || getCurrentAppUsageTimeZone(),
    };
  };
  const localRecord = keepalive
    ? snapshot()
    : await withAppUsageStorageLock(identity, snapshot);
  const payload = await request({
    version: APP_USAGE_RECORD_VERSION,
    sourceId: localRecord.sourceId,
    days: localRecord.days,
    localTimeZone: localRecord.localTimeZone,
  }, {
    academicProfileId: null,
    keepalive,
    timeoutMs: APP_USAGE_SYNC_TIMEOUT_MS,
  });

  const merge = () => mergeSyncedAppUsageRecord(identity, payload, { storage });
  return keepalive ? merge() : withAppUsageStorageLock(identity, merge);
}
