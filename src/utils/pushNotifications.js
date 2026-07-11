import api from "./apiClient";

const SERVICE_WORKER_PATH = "/sw.js";
const SERVICE_WORKER_READY_TIMEOUT_MS = 12000;

export class PushNotificationError extends Error {
  constructor(code, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = "PushNotificationError";
    this.code = code;
  }
}

export function isPushNotificationSupported() {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

function urlBase64ToUint8Array(base64String) {
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
    const rawData = window.atob(base64);
    return Uint8Array.from(rawData, (character) => character.charCodeAt(0));
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

function withTimeout(promise, timeoutMs, timeoutError) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(timeoutError), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
}

async function getReadyServiceWorkerRegistration() {
  try {
    await navigator.serviceWorker.register(SERVICE_WORKER_PATH, { scope: "/" });
    return await withTimeout(
      navigator.serviceWorker.ready,
      SERVICE_WORKER_READY_TIMEOUT_MS,
      new PushNotificationError(
        "service-worker",
        "The notification service did not become ready. Please reload and try again."
      )
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

async function getNotificationPermission(requestPermission) {
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  if (!requestPermission) return "default";
  return Notification.requestPermission();
}

export async function enableStudyReminders({ requestPermission = true } = {}) {
  if (!isPushNotificationSupported()) {
    throw new PushNotificationError(
      "unsupported",
      "Push notifications are not supported by this browser."
    );
  }

  if (!window.isSecureContext) {
    throw new PushNotificationError(
      "insecure-context",
      "Push notifications require a secure HTTPS connection."
    );
  }

  const permission = await getNotificationPermission(requestPermission);
  if (permission !== "granted") {
    if (!requestPermission && permission === "default") return null;
    throw new PushNotificationError(
      "permission-denied",
      "Notifications are blocked. Allow them in your browser site settings and try again."
    );
  }

  let publicKey;
  try {
    ({ publicKey } = await api.get("/api/notifications/vapid-key"));
  } catch (error) {
    if (error?.status === 503 || error?.code === "PUSH_NOT_CONFIGURED") {
      throw new PushNotificationError(
        "server-config",
        error.message || "Study reminders are not configured on the server yet.",
        error
      );
    }
    throw error;
  }

  const applicationServerKey = urlBase64ToUint8Array(publicKey);
  const registration = await getReadyServiceWorkerRegistration();
  let subscription = await registration.pushManager.getSubscription();

  if (
    subscription &&
    !applicationServerKeysMatch(
      subscription.options?.applicationServerKey,
      applicationServerKey
    )
  ) {
    const removed = await subscription.unsubscribe();
    if (!removed) {
      throw new PushNotificationError(
        "subscription-refresh",
        "The previous notification subscription could not be refreshed. Clear this site's notification permission and try again."
      );
    }
    subscription = null;
  }

  if (!subscription) {
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    } catch (error) {
      throw new PushNotificationError(
        "subscription-failed",
        "The browser could not create a notification subscription. Please reload and try again.",
        error
      );
    }
  }

  await api.post("/api/notifications/subscribe", {
    subscription: subscription.toJSON ? subscription.toJSON() : subscription,
    timezoneOffset: new Date().getTimezoneOffset(),
  });

  return subscription;
}

export async function reconcileStudyReminders() {
  if (!isPushNotificationSupported() || Notification.permission !== "granted") {
    return null;
  }

  return enableStudyReminders({ requestPermission: false });
}

export async function disableStudyReminders() {
  let browserError = null;

  if (isPushNotificationSupported()) {
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager?.getSubscription();
      if (subscription) await subscription.unsubscribe();
    } catch (error) {
      browserError = error;
    }
  }

  try {
    await api.delete("/api/notifications/subscribe");
  } catch (error) {
    throw new PushNotificationError(
      "unsubscribe-failed",
      "Study reminders were disabled here, but server cleanup could not be confirmed.",
      error
    );
  }

  if (browserError) {
    throw new PushNotificationError(
      "unsubscribe-failed",
      "Server reminders were disabled, but the browser subscription could not be removed.",
      browserError
    );
  }
}

export function getPushNotificationErrorMessage(error) {
  if (error instanceof PushNotificationError) return error.message;
  if (error?.status === 401) return "Your session expired. Please sign in again to enable reminders.";
  if (error?.name === "AbortError") return "The notification service took too long to respond. Please try again.";
  if (typeof error?.message === "string" && error.message.trim()) return error.message;
  return "Study reminders could not be updated. Please try again.";
}
