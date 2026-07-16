import api from "./apiClient.js";

const SERVICE_WORKER_PATH = "/sw.js";
const SERVICE_WORKER_READY_TIMEOUT_MS = 12000;
const RETRYABLE_SUBSCRIPTION_ERRORS = new Set(["AbortError", "InvalidStateError", "NetworkError"]);
const PUSH_DEVICE_ID_STORAGE_KEY = "prepmatrix_push_device_id";
const PUSH_SUBSCRIPTION_VERSION_STORAGE_KEY = "prepmatrix_push_subscription_version";
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUBSCRIPTION_VERSION_PATTERN = /^[0-9a-f]{64}$/;

const blockedStorageRefs = new WeakSet();
let inMemoryDeviceId = null;
let inMemorySubscriptionVersion = null;

export class PushNotificationError extends Error {
  constructor(code, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = "PushNotificationError";
    this.code = code;
  }
}

function getRuntime(overrides = {}) {
  const windowRef = overrides.windowRef || (typeof window !== "undefined" ? window : null);
  return {
    apiClient: overrides.apiClient || api,
    cryptoRef: overrides.cryptoRef || windowRef?.crypto || null,
    DateCtor: overrides.DateCtor || Date,
    NotificationRef: overrides.NotificationRef || (typeof Notification !== "undefined" ? Notification : null),
    navigatorRef: overrides.navigatorRef || (typeof navigator !== "undefined" ? navigator : null),
    storageRef: overrides.storageRef || windowRef?.localStorage || null,
    windowRef,
  };
}

function markStorageBlocked(storageRef) {
  if (storageRef && (typeof storageRef === "object" || typeof storageRef === "function")) {
    blockedStorageRefs.add(storageRef);
  }
}

function canUseStorage(runtime) {
  return Boolean(runtime.storageRef && !blockedStorageRefs.has(runtime.storageRef));
}

function readStorage(runtime, key) {
  try {
    return runtime.storageRef?.getItem(key) || null;
  } catch {
    markStorageBlocked(runtime.storageRef);
    return null;
  }
}

function writeStorage(runtime, key, value) {
  try {
    if (!canUseStorage(runtime)) return false;
    runtime.storageRef.setItem(key, value);
    return true;
  } catch {
    // Privacy modes can block storage. The in-memory binding still keeps the
    // current page safe and the server may assign the device identifier.
    markStorageBlocked(runtime.storageRef);
    return false;
  }
}

function removeStorage(runtime, key) {
  try {
    runtime.storageRef?.removeItem(key);
  } catch {
    // See writeStorage: browser cleanup should not fail because storage is blocked.
  }
}

function normalizeDeviceId(value) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return UUID_V4_PATTERN.test(normalized) ? normalized : null;
}

function normalizeSubscriptionVersion(value) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return SUBSCRIPTION_VERSION_PATTERN.test(normalized) ? normalized : null;
}

function getOrCreateDeviceId(runtime) {
  const stored = normalizeDeviceId(readStorage(runtime, PUSH_DEVICE_ID_STORAGE_KEY));
  if (stored) {
    inMemoryDeviceId = stored;
    return stored;
  }

  // When storage is available, an empty value represents a genuinely new
  // browser profile. The module fallback is only for storage-blocked runtimes.
  const remembered = canUseStorage(runtime) ? null : normalizeDeviceId(inMemoryDeviceId);
  if (remembered) return remembered;

  let generated = null;
  try {
    generated = normalizeDeviceId(runtime.cryptoRef?.randomUUID?.());
  } catch {
    generated = null;
  }

  if (generated) {
    inMemoryDeviceId = generated;
    writeStorage(runtime, PUSH_DEVICE_ID_STORAGE_KEY, generated);
  }
  return generated;
}

function getStoredSubscriptionBinding(runtime) {
  const storedDeviceId = readStorage(runtime, PUSH_DEVICE_ID_STORAGE_KEY);
  const storedVersion = readStorage(runtime, PUSH_SUBSCRIPTION_VERSION_STORAGE_KEY);
  const deviceId = normalizeDeviceId(
    storedDeviceId || (canUseStorage(runtime) ? null : inMemoryDeviceId)
  );
  const subscriptionVersion = normalizeSubscriptionVersion(
    storedVersion || (canUseStorage(runtime) ? null : inMemorySubscriptionVersion)
  );
  return { deviceId, subscriptionVersion };
}

function storeSubscriptionBinding(runtime, { deviceId, subscriptionVersion }) {
  const safeDeviceId = normalizeDeviceId(deviceId);
  const safeVersion = normalizeSubscriptionVersion(subscriptionVersion);
  if (!safeDeviceId || !safeVersion) {
    throw new PushNotificationError(
      "server-response",
      "The notification server returned an invalid connection response. Please try again later."
    );
  }

  inMemoryDeviceId = safeDeviceId;
  inMemorySubscriptionVersion = safeVersion;
  writeStorage(runtime, PUSH_DEVICE_ID_STORAGE_KEY, safeDeviceId);
  writeStorage(runtime, PUSH_SUBSCRIPTION_VERSION_STORAGE_KEY, safeVersion);
  return { deviceId: safeDeviceId, subscriptionVersion: safeVersion };
}

function clearStoredSubscriptionVersion(runtime, expectedVersion = null) {
  const safeExpected = normalizeSubscriptionVersion(expectedVersion);
  const currentVersion = getStoredSubscriptionBinding(runtime).subscriptionVersion;
  if (safeExpected && currentVersion && currentVersion !== safeExpected) {
    return false;
  }

  inMemorySubscriptionVersion = null;
  removeStorage(runtime, PUSH_SUBSCRIPTION_VERSION_STORAGE_KEY);
  return true;
}

function serializeSubscription(subscription) {
  if (!subscription) return null;
  return subscription.toJSON ? subscription.toJSON() : subscription;
}

export function isPushNotificationSupported(overrides = {}) {
  const { NotificationRef, navigatorRef, windowRef } = getRuntime(overrides);
  return Boolean(
    windowRef &&
    NotificationRef &&
    navigatorRef &&
    "serviceWorker" in navigatorRef &&
    "PushManager" in windowRef
  );
}

function urlBase64ToUint8Array(base64String, windowRef) {
  if (typeof base64String !== "string" || !base64String.trim()) {
    throw new PushNotificationError(
      "server-config",
      "Study reminders are not configured on the server yet."
    );
  }

  try {
    const normalized = base64String.trim();
    const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
    const base64 = (normalized + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = windowRef.atob(base64);
    const bytes = Uint8Array.from(rawData, (character) => character.charCodeAt(0));
    if (bytes.length !== 65 || bytes[0] !== 4) throw new Error("Invalid P-256 public key.");
    return bytes;
  } catch (error) {
    throw new PushNotificationError(
      "server-config",
      "The server returned an invalid push-notification key.",
      error
    );
  }
}

function applicationServerKeysMatch(existingKey, expectedKey) {
  if (!existingKey) return false;

  const existingBytes = new Uint8Array(existingKey);
  if (existingBytes.length !== expectedKey.length) return false;
  return existingBytes.every((value, index) => value === expectedKey[index]);
}

function withTimeout(promise, timeoutMs, timeoutError, windowRef) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = windowRef.setTimeout(() => reject(timeoutError), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => windowRef.clearTimeout(timeoutId));
}

async function getReadyServiceWorkerRegistration(runtime) {
  const { navigatorRef, windowRef } = runtime;
  try {
    await navigatorRef.serviceWorker.register(SERVICE_WORKER_PATH, { scope: "/" });
    return await withTimeout(
      navigatorRef.serviceWorker.ready,
      SERVICE_WORKER_READY_TIMEOUT_MS,
      new PushNotificationError(
        "service-worker",
        "The notification service did not become ready. Please reload and try again."
      ),
      windowRef
    );
  } catch (error) {
    if (error instanceof PushNotificationError) throw error;
    throw new PushNotificationError(
      "service-worker",
      "The notification service could not start. Please reload and try again.",
      error
    );
  }
}

async function inspectStudyReminderState(runtime) {
  const { NotificationRef, navigatorRef, windowRef } = runtime;
  const supported = isPushNotificationSupported(runtime);
  const secure = Boolean(windowRef?.isSecureContext);
  const permission = NotificationRef?.permission || "unsupported";
  let registration = null;
  let subscription = null;

  if (supported && secure) {
    registration = await navigatorRef.serviceWorker.getRegistration("/");
    subscription = await registration?.pushManager?.getSubscription() || null;
  }

  return {
    supported,
    secure,
    permission,
    subscribed: Boolean(subscription && permission === "granted"),
    registration,
    subscription,
  };
}

export async function getStudyReminderState(overrides = {}) {
  const { registration: _registration, subscription: _subscription, ...state } = await inspectStudyReminderState(
    getRuntime(overrides)
  );
  return state;
}

async function getNotificationPermission(runtime, requestPermission) {
  const { NotificationRef } = runtime;
  if (NotificationRef.permission === "granted") return "granted";
  if (NotificationRef.permission === "denied") return "denied";
  if (!requestPermission) return "default";
  return NotificationRef.requestPermission();
}

function getNativeErrorName(error) {
  return String(error?.name || error?.cause?.name || "Error");
}

export function isRetryablePushSubscriptionError(error) {
  return RETRYABLE_SUBSCRIPTION_ERRORS.has(getNativeErrorName(error));
}

function mappedSubscriptionError(error) {
  const nativeName = getNativeErrorName(error);
  if (["NotAllowedError", "SecurityError"].includes(nativeName)) {
    return new PushNotificationError(
      "permission-denied",
      "Notifications are blocked by your browser or operating system. Allow them for this site and try again.",
      error
    );
  }
  if (["AbortError", "NetworkError"].includes(nativeName)) {
    return new PushNotificationError(
      "push-service-unavailable",
      "The browser notification service is temporarily unavailable. Check your connection, reload, and try again.",
      error
    );
  }
  if (nativeName === "InvalidStateError") {
    return new PushNotificationError(
      "subscription-state",
      "The browser notification state could not be repaired. Reload the page and try again.",
      error
    );
  }
  if (["InvalidAccessError", "TypeError"].includes(nativeName)) {
    return new PushNotificationError(
      "server-config",
      "The notification security key was rejected. Please try again later.",
      error
    );
  }
  return new PushNotificationError(
    "subscription-failed",
    "The browser could not create a notification subscription. Please reload and try again.",
    error
  );
}

function registrationUsesOwnWorker(registration, windowRef) {
  const expectedUrl = new URL(SERVICE_WORKER_PATH, windowRef.location.origin).href;
  return [registration?.active, registration?.waiting, registration?.installing]
    .filter(Boolean)
    .some((worker) => worker.scriptURL === expectedUrl);
}

async function recoverServiceWorkerRegistration(registration, runtime) {
  const existing = await registration.pushManager.getSubscription().catch(() => null);
  if (existing) await existing.unsubscribe().catch(() => false);

  if (registrationUsesOwnWorker(registration, runtime.windowRef)) {
    await registration.unregister();
  } else if (typeof registration.update === "function") {
    await registration.update();
  }

  return getReadyServiceWorkerRegistration(runtime);
}

async function subscribeWithOneRecovery(registration, applicationServerKey, runtime) {
  const options = { userVisibleOnly: true, applicationServerKey };
  try {
    return await registration.pushManager.subscribe(options);
  } catch (firstError) {
    if (!isRetryablePushSubscriptionError(firstError)) throw mappedSubscriptionError(firstError);

    let recoveredRegistration;
    try {
      recoveredRegistration = await recoverServiceWorkerRegistration(registration, runtime);
    } catch {
      throw mappedSubscriptionError(firstError);
    }

    try {
      return await recoveredRegistration.pushManager.subscribe(options);
    } catch (retryError) {
      throw mappedSubscriptionError(retryError);
    }
  }
}

async function fetchApplicationServerKey(runtime) {
  let publicKey;
  try {
    ({ publicKey } = await runtime.apiClient.get("/api/notifications/vapid-key"));
  } catch (error) {
    if (error?.status === 503 || error?.code === "PUSH_NOT_CONFIGURED") {
      throw new PushNotificationError(
        "server-config",
        "Study reminders are temporarily unavailable. Please try again later.",
        error
      );
    }
    throw error;
  }
  return urlBase64ToUint8Array(publicKey, runtime.windowRef);
}

async function syncSubscriptionToServer(subscription, runtime) {
  const requestedDeviceId = getOrCreateDeviceId(runtime);
  const response = await runtime.apiClient.post("/api/notifications/subscribe", {
    deviceId: requestedDeviceId || undefined,
    subscription: serializeSubscription(subscription),
    timezoneOffset: new runtime.DateCtor().getTimezoneOffset(),
  });
  return storeSubscriptionBinding(runtime, {
    deviceId: response?.deviceId || requestedDeviceId,
    subscriptionVersion: response?.subscriptionVersion,
  });
}

export async function enableStudyReminders({ requestPermission = true } = {}, overrides = {}) {
  const runtime = getRuntime(overrides);
  if (!isPushNotificationSupported(runtime)) {
    throw new PushNotificationError(
      "unsupported",
      "Push notifications are not supported by this browser."
    );
  }

  if (!runtime.windowRef.isSecureContext) {
    throw new PushNotificationError(
      "insecure-context",
      "Push notifications require a secure HTTPS connection."
    );
  }

  const permission = await getNotificationPermission(runtime, requestPermission);
  if (permission !== "granted") {
    if (!requestPermission && permission === "default") return null;
    throw new PushNotificationError(
      "permission-denied",
      "Notifications are blocked. Allow them in your browser site settings and try again."
    );
  }

  const applicationServerKey = await fetchApplicationServerKey(runtime);
  const registration = await getReadyServiceWorkerRegistration(runtime);
  let subscription = await registration.pushManager.getSubscription();

  if (
    subscription &&
    !applicationServerKeysMatch(subscription.options?.applicationServerKey, applicationServerKey)
  ) {
    const removed = await subscription.unsubscribe();
    if (!removed) {
      throw new PushNotificationError(
        "subscription-refresh",
        "The previous notification subscription could not be refreshed. Reset this site's notification permission and try again."
      );
    }
    subscription = null;
  }

  if (!subscription) {
    subscription = await subscribeWithOneRecovery(registration, applicationServerKey, runtime);
  }

  await syncSubscriptionToServer(subscription, runtime);
  return subscription;
}

export async function reconcileStudyReminders(overrides = {}) {
  const runtime = getRuntime(overrides);
  const inspected = await inspectStudyReminderState(runtime);
  const publicState = {
    supported: inspected.supported,
    secure: inspected.secure,
    permission: inspected.permission,
    subscribed: inspected.subscribed,
  };

  if (!inspected.subscribed || !inspected.subscription) {
    return { ...publicState, deviceId: null, subscriptionVersion: null };
  }

  const applicationServerKey = await fetchApplicationServerKey(runtime);
  let subscription = inspected.subscription;
  if (!applicationServerKeysMatch(inspected.subscription.options?.applicationServerKey, applicationServerKey)) {
    const removed = await inspected.subscription.unsubscribe().catch(() => false);
    if (!removed) {
      throw new PushNotificationError(
        "subscription-refresh",
        "The previous notification subscription could not be refreshed. Reset this site's notification permission and try again."
      );
    }
    subscription = await subscribeWithOneRecovery(inspected.registration, applicationServerKey, runtime);
  }

  const binding = await syncSubscriptionToServer(subscription, runtime);
  return { ...publicState, subscribed: true, ...binding };
}

export async function disableStudyReminders(overrides = {}) {
  const runtime = getRuntime(overrides);
  let subscription = null;
  if (isPushNotificationSupported(runtime)) {
    try {
      const registration = await runtime.navigatorRef.serviceWorker.getRegistration("/");
      subscription = await registration?.pushManager?.getSubscription() || null;
    } catch (error) {
      throw new PushNotificationError(
        "browser-cleanup-failed",
        "The browser notification connection could not be inspected. Please reload and try again.",
        error
      );
    }
  }

  let binding = getStoredSubscriptionBinding(runtime);
  if (subscription && (!binding.deviceId || !binding.subscriptionVersion)) {
    binding = await syncSubscriptionToServer(subscription, runtime);
  }

  if (!binding.deviceId || !binding.subscriptionVersion) {
    if (!subscription) return;
    throw new PushNotificationError(
      "unsubscribe-state",
      "The notification connection could not be identified safely. Please reload and try again."
    );
  }

  try {
    await runtime.apiClient.delete("/api/notifications/subscribe", {
      body: JSON.stringify({
        deviceId: binding.deviceId,
        subscriptionVersion: binding.subscriptionVersion,
        subscription: serializeSubscription(subscription),
      }),
    });
  } catch (error) {
    throw new PushNotificationError(
      "unsubscribe-failed",
      "Study reminders could not be disabled on the server. Please try again.",
      error
    );
  }

  clearStoredSubscriptionVersion(runtime, binding.subscriptionVersion);
  if (subscription) {
    try {
      const removed = await subscription.unsubscribe();
      if (!removed) throw new Error("Browser declined subscription removal.");
    } catch (error) {
      throw new PushNotificationError(
        "browser-cleanup-failed",
        "Server reminders were disabled, but the browser subscription could not be removed. Reset this site's notification permission.",
        error
      );
    }
  }
}

export async function sendTestStudyReminder(overrides = {}) {
  const runtime = getRuntime(overrides);
  const state = await reconcileStudyReminders(runtime);
  if (!state.subscribed) {
    throw new PushNotificationError(
      "not-subscribed",
      "Enable study reminders before sending a test notification."
    );
  }

  try {
    return await runtime.apiClient.post("/api/notifications/test", {
      deviceId: state.deviceId,
      subscriptionVersion: state.subscriptionVersion,
    });
  } catch (error) {
    if (error?.status === 409 || error?.code === "PUSH_NOT_SUBSCRIBED") {
      clearStoredSubscriptionVersion(runtime, state.subscriptionVersion);
      throw new PushNotificationError(
        "not-subscribed",
        "This browser is not connected for notifications. Turn reminders off and enable them again.",
        error
      );
    }
    if (error?.status === 410 || error?.code === "PUSH_SUBSCRIPTION_EXPIRED") {
      const registration = await runtime.navigatorRef.serviceWorker.getRegistration("/").catch(() => null);
      const subscription = await registration?.pushManager?.getSubscription().catch(() => null);
      await subscription?.unsubscribe().catch(() => false);
      clearStoredSubscriptionVersion(runtime, state.subscriptionVersion);
      throw new PushNotificationError(
        "subscription-expired",
        "The browser subscription expired. Enable study reminders again to reconnect.",
        error
      );
    }
    throw error;
  }
}

export function getPushNotificationDiagnostic(error) {
  return {
    code: error?.code || "unknown",
    status: Number(error?.status || error?.cause?.status || 0),
    nativeName: getNativeErrorName(error?.cause || error),
  };
}

export function getPushNotificationErrorMessage(error) {
  if (error instanceof PushNotificationError) return error.message;
  if (error?.status === 401) return "Your session expired. Please sign in again to enable reminders.";
  if (error?.status === 429) return "Please wait a moment before sending another test notification.";
  if (error?.status === 503) return "Study reminders are temporarily unavailable. Please try again later.";
  return "Study reminders could not be updated. Please try again.";
}
