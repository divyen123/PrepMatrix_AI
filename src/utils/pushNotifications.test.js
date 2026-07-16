import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import {
  PushNotificationError,
  disableStudyReminders,
  enableStudyReminders,
  getPushNotificationErrorMessage,
  getStudyReminderState,
  reconcileStudyReminders,
  sendTestStudyReminder,
} from "./pushNotifications.js";

const DEVICE_ID = "11111111-1111-4111-8111-111111111111";
const SERVER_ASSIGNED_DEVICE_ID = "22222222-2222-4222-8222-222222222222";
const SUBSCRIPTION_VERSION = "a".repeat(64);
const DEVICE_KEY = "prepmatrix_push_device_id";
const VERSION_KEY = "prepmatrix_push_subscription_version";
const publicKeyBytes = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 3)]);
const publicKey = publicKeyBytes.toString("base64url");
const serviceWorkerSource = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");

function arrayBufferFrom(bytes) {
  return Uint8Array.from(bytes).buffer;
}

function createSubscription(applicationServerKey = arrayBufferFrom(publicKeyBytes), { onUnsubscribe } = {}) {
  return {
    options: { applicationServerKey },
    unsubscribe: async () => {
      onUnsubscribe?.();
      return true;
    },
    toJSON: () => ({
      endpoint: "https://fcm.googleapis.com/wp/test",
      expirationTime: null,
      keys: { p256dh: "client-key", auth: "client-auth" },
    }),
  };
}

function createStorage(entries = {}) {
  const values = new Map(Object.entries(entries));
  return {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
    values,
  };
}

function createRuntime({
  permission = "granted",
  existingSubscription = null,
  subscribeImpl = async () => createSubscription(),
  cryptoRandomUUID = () => DEVICE_ID,
  deleteImpl = async () => ({ success: true }),
  postImpl = null,
  serverDeviceId = SERVER_ASSIGNED_DEVICE_ID,
  storageEntries = {},
} = {}) {
  const calls = {
    apiGet: 0,
    apiPost: [],
    apiDelete: [],
    getSubscription: 0,
    order: [],
    register: 0,
    subscribe: 0,
    unregister: 0,
  };
  const storage = createStorage(storageEntries);
  let currentSubscription = existingSubscription;
  const registration = {
    active: { scriptURL: "https://prep-matrix-ai.vercel.app/sw.js" },
    pushManager: {
      getSubscription: async () => {
        calls.getSubscription += 1;
        return currentSubscription;
      },
      subscribe: async (options) => {
        calls.subscribe += 1;
        currentSubscription = await subscribeImpl(options, calls.subscribe);
        return currentSubscription;
      },
    },
    unregister: async () => {
      calls.unregister += 1;
      return true;
    },
    update: async () => {},
  };
  const serviceWorker = {
    getRegistration: async () => registration,
    register: async () => {
      calls.register += 1;
      return registration;
    },
    ready: Promise.resolve(registration),
  };
  const runtime = {
    apiClient: {
      get: async () => {
        calls.apiGet += 1;
        return { publicKey };
      },
      post: async (path, body) => {
        calls.apiPost.push({ path, body });
        if (postImpl) return postImpl(path, body, calls);
        if (path === "/api/notifications/subscribe") {
          return {
            success: true,
            deviceId: body.deviceId || serverDeviceId,
            subscriptionVersion: SUBSCRIPTION_VERSION,
          };
        }
        return { success: true };
      },
      delete: async (path, options) => {
        calls.apiDelete.push({ path, options });
        calls.order.push("server-delete");
        return deleteImpl(path, options, calls);
      },
    },
    cryptoRef: { randomUUID: cryptoRandomUUID },
    DateCtor: class {
      getTimezoneOffset() {
        return -330;
      }
    },
    NotificationRef: {
      permission,
      requestPermission: async () => permission,
    },
    navigatorRef: { serviceWorker },
    storageRef: storage,
    windowRef: {
      PushManager: function PushManager() {},
      atob: (value) => Buffer.from(value, "base64").toString("binary"),
      clearTimeout,
      isSecureContext: true,
      location: { origin: "https://prep-matrix-ai.vercel.app" },
      setTimeout,
    },
  };

  return { calls, registration, runtime, storage };
}

function createServiceWorkerHarness(windowClients = []) {
  const listeners = new Map();
  const notifications = [];
  const openedWindows = [];
  const workerSelf = {
    addEventListener: (type, handler) => listeners.set(type, handler),
    clients: {
      matchAll: async () => windowClients,
      openWindow: async (path) => {
        openedWindows.push(path);
        return null;
      },
    },
    location: { origin: "https://prep-matrix-ai.vercel.app" },
    registration: {
      showNotification: async (title, options) => {
        notifications.push({ options, title });
      },
    },
  };
  vm.runInNewContext(serviceWorkerSource, { self: workerSelf, URL });
  return { listeners, notifications, openedWindows };
}

test("inspects actual browser subscription state without creating one", async () => {
  const { calls, runtime } = createRuntime();
  const state = await getStudyReminderState(runtime);
  assert.equal(state.subscribed, false);
  assert.equal(state.permission, "granted");
  assert.equal(calls.register, 0);
  assert.equal(calls.subscribe, 0);
  assert.equal(calls.apiGet, 0);
});

test("reuses a matching subscription and persists its device/version binding", async () => {
  const existing = createSubscription();
  const { calls, runtime, storage } = createRuntime({ existingSubscription: existing });
  const result = await enableStudyReminders({}, runtime);
  assert.equal(result, existing);
  assert.equal(calls.subscribe, 0);
  assert.equal(calls.apiPost.length, 1);
  assert.equal(calls.apiPost[0].path, "/api/notifications/subscribe");
  assert.equal(calls.apiPost[0].body.deviceId, DEVICE_ID);
  assert.equal(calls.apiPost[0].body.timezoneOffset, -330);
  assert.equal(storage.getItem(DEVICE_KEY), DEVICE_ID);
  assert.equal(storage.getItem(VERSION_KEY), SUBSCRIPTION_VERSION);
});

test("accepts and stores a server-assigned device identifier when UUID generation is unavailable", async () => {
  const { calls, runtime, storage } = createRuntime({
    cryptoRandomUUID: null,
    existingSubscription: createSubscription(),
  });
  await enableStudyReminders({}, runtime);
  assert.equal(calls.apiPost[0].body.deviceId, undefined);
  assert.equal(storage.getItem(DEVICE_KEY), SERVER_ASSIGNED_DEVICE_ID);
  assert.equal(storage.getItem(VERSION_KEY), SUBSCRIPTION_VERSION);
});

test("replaces a subscription created with an old VAPID key", async () => {
  const oldKey = Uint8Array.from(publicKeyBytes);
  oldKey[1] = 99;
  let unsubscribed = 0;
  const oldSubscription = {
    ...createSubscription(arrayBufferFrom(oldKey)),
    unsubscribe: async () => {
      unsubscribed += 1;
      return true;
    },
  };
  const { calls, runtime } = createRuntime({ existingSubscription: oldSubscription });
  await enableStudyReminders({}, runtime);
  assert.equal(unsubscribed, 1);
  assert.equal(calls.subscribe, 1);
  assert.equal(calls.apiPost.length, 1);
});

test("reconciliation repairs a VAPID mismatch and syncs the replacement with the same device", async () => {
  const oldKey = Uint8Array.from(publicKeyBytes);
  oldKey[1] = 77;
  const oldSubscription = createSubscription(arrayBufferFrom(oldKey));
  const { calls, runtime } = createRuntime({
    existingSubscription: oldSubscription,
    storageEntries: { [DEVICE_KEY]: DEVICE_ID, [VERSION_KEY]: "b".repeat(64) },
  });
  const state = await reconcileStudyReminders(runtime);
  assert.equal(state.subscribed, true);
  assert.equal(state.deviceId, DEVICE_ID);
  assert.equal(state.subscriptionVersion, SUBSCRIPTION_VERSION);
  assert.equal(calls.subscribe, 1);
  assert.equal(calls.apiPost[0].body.deviceId, DEVICE_ID);
});

test("repairs its own service worker and retries subscription only once", async () => {
  const { calls, runtime } = createRuntime({
    subscribeImpl: async (_options, attempt) => {
      if (attempt === 1) throw Object.assign(new Error("push service unavailable"), { name: "AbortError" });
      return createSubscription();
    },
  });

  await enableStudyReminders({}, runtime);
  assert.equal(calls.subscribe, 2);
  assert.equal(calls.unregister, 1);
  assert.equal(calls.register, 2);
});

test("stops after the single recovery retry fails", async () => {
  const { calls, runtime } = createRuntime({
    subscribeImpl: async () => {
      throw Object.assign(new Error("provider unavailable with SECRET_ENDPOINT"), { name: "NetworkError" });
    },
  });

  await assert.rejects(
    () => enableStudyReminders({}, runtime),
    (error) => {
      assert.equal(error instanceof PushNotificationError, true);
      assert.equal(error.code, "push-service-unavailable");
      assert.equal(getPushNotificationErrorMessage(error).includes("SECRET_ENDPOINT"), false);
      return true;
    },
  );
  assert.equal(calls.subscribe, 2);
  assert.equal(calls.unregister, 1);
  assert.equal(calls.register, 2);
});

test("does not retry blocked permission errors or expose native messages", async () => {
  const secretMessage = "SECRET_ENDPOINT=https://private.invalid";
  const { calls, runtime } = createRuntime({
    subscribeImpl: async () => {
      throw Object.assign(new Error(secretMessage), { name: "NotAllowedError" });
    },
  });

  await assert.rejects(
    () => enableStudyReminders({}, runtime),
    (error) => {
      assert.equal(error instanceof PushNotificationError, true);
      assert.equal(error.code, "permission-denied");
      assert.equal(getPushNotificationErrorMessage(error).includes(secretMessage), false);
      return true;
    },
  );
  assert.equal(calls.subscribe, 1);
  assert.equal(calls.unregister, 0);
});

test("reconciliation is inspect-only when no browser subscription exists", async () => {
  const { calls, runtime } = createRuntime();
  const state = await reconcileStudyReminders(runtime);
  assert.equal(state.subscribed, false);
  assert.equal(calls.register, 0);
  assert.equal(calls.subscribe, 0);
  assert.equal(calls.apiPost.length, 0);
});

test("disable uses a targeted server-first delete and preserves the stable device id", async () => {
  let order = [];
  const subscription = createSubscription(arrayBufferFrom(publicKeyBytes), {
    onUnsubscribe: () => order.push("browser-unsubscribe"),
  });
  const { calls, runtime, storage } = createRuntime({
    existingSubscription: subscription,
    storageEntries: { [DEVICE_KEY]: DEVICE_ID, [VERSION_KEY]: SUBSCRIPTION_VERSION },
  });
  order = calls.order;

  await disableStudyReminders(runtime);

  assert.deepEqual(calls.order, ["server-delete", "browser-unsubscribe"]);
  assert.equal(calls.apiDelete.length, 1);
  assert.equal(calls.apiDelete[0].path, "/api/notifications/subscribe");
  assert.deepEqual(JSON.parse(calls.apiDelete[0].options.body), {
    deviceId: DEVICE_ID,
    subscriptionVersion: SUBSCRIPTION_VERSION,
    subscription: subscription.toJSON(),
  });
  assert.equal(storage.getItem(DEVICE_KEY), DEVICE_ID);
  assert.equal(storage.getItem(VERSION_KEY), null);
});

test("disable safely removes a stored binding even when the browser subscription is already gone", async () => {
  const { calls, runtime, storage } = createRuntime({
    storageEntries: { [DEVICE_KEY]: DEVICE_ID, [VERSION_KEY]: SUBSCRIPTION_VERSION },
  });

  await disableStudyReminders(runtime);

  assert.equal(calls.apiDelete.length, 1);
  assert.deepEqual(JSON.parse(calls.apiDelete[0].options.body), {
    deviceId: DEVICE_ID,
    subscriptionVersion: SUBSCRIPTION_VERSION,
    subscription: null,
  });
  assert.equal(calls.subscribe, 0);
  assert.equal(storage.getItem(DEVICE_KEY), DEVICE_ID);
  assert.equal(storage.getItem(VERSION_KEY), null);
});

test("a stale disable does not clear a newer locally re-enabled subscription version", async () => {
  const newerVersion = "c".repeat(64);
  let storage;
  const created = createRuntime({
    deleteImpl: async () => {
      storage.setItem(VERSION_KEY, newerVersion);
      return { success: true };
    },
    existingSubscription: createSubscription(),
    storageEntries: { [DEVICE_KEY]: DEVICE_ID, [VERSION_KEY]: SUBSCRIPTION_VERSION },
  });
  storage = created.storage;

  await disableStudyReminders(created.runtime);

  assert.equal(created.calls.apiDelete.length, 1);
  assert.equal(
    JSON.parse(created.calls.apiDelete[0].options.body).subscriptionVersion,
    SUBSCRIPTION_VERSION,
  );
  assert.equal(storage.getItem(VERSION_KEY), newerVersion);
});

test("disable leaves the browser subscription and version intact when targeted server delete fails", async () => {
  let unsubscribeCalls = 0;
  const subscription = createSubscription(arrayBufferFrom(publicKeyBytes), {
    onUnsubscribe: () => {
      unsubscribeCalls += 1;
    },
  });
  const { runtime, storage } = createRuntime({
    deleteImpl: async () => {
      throw Object.assign(new Error("secret server failure"), { status: 503 });
    },
    existingSubscription: subscription,
    storageEntries: { [DEVICE_KEY]: DEVICE_ID, [VERSION_KEY]: SUBSCRIPTION_VERSION },
  });

  await assert.rejects(
    () => disableStudyReminders(runtime),
    (error) => error instanceof PushNotificationError && error.code === "unsubscribe-failed",
  );
  assert.equal(unsubscribeCalls, 0);
  assert.equal(storage.getItem(VERSION_KEY), SUBSCRIPTION_VERSION);
});

test("test notifications use the device/version returned by the just-synced subscription", async () => {
  const disconnected = createRuntime();
  await assert.rejects(
    () => sendTestStudyReminder(disconnected.runtime),
    (error) => error instanceof PushNotificationError && error.code === "not-subscribed",
  );
  assert.equal(disconnected.calls.apiPost.length, 0);

  const connected = createRuntime({ existingSubscription: createSubscription() });
  await sendTestStudyReminder(connected.runtime);
  assert.deepEqual(
    connected.calls.apiPost.map(({ path }) => path),
    ["/api/notifications/subscribe", "/api/notifications/test"],
  );
  assert.deepEqual(connected.calls.apiPost[1].body, {
    deviceId: DEVICE_ID,
    subscriptionVersion: SUBSCRIPTION_VERSION,
  });
});

test("service worker rejects cross-origin backslash navigation and avoids substring URL matches", async () => {
  let focused = 0;
  const deceptiveClient = {
    focus: async () => {
      focused += 1;
    },
    url: "https://prep-matrix-ai.vercel.app/not-planner?return=/planner",
    visibilityState: "hidden",
  };
  const pushHarness = createServiceWorkerHarness([]);
  let pushWork;
  pushHarness.listeners.get("push")({
    data: { json: () => ({ body: "test", url: "/\\evil.example" }) },
    waitUntil: (promise) => {
      pushWork = promise;
    },
  });
  await pushWork;
  assert.equal(pushHarness.notifications[0].options.data.url, "/planner");

  const clickHarness = createServiceWorkerHarness([deceptiveClient]);
  let clickWork;
  clickHarness.listeners.get("notificationclick")({
    notification: { close: () => {}, data: { url: "/planner" } },
    waitUntil: (promise) => {
      clickWork = promise;
    },
  });
  await clickWork;
  assert.equal(focused, 0);
  assert.deepEqual(clickHarness.openedWindows, ["/planner"]);
});

test("unknown errors map to a stable message without reflecting details", () => {
  const message = getPushNotificationErrorMessage(new Error("database-uri-secret"));
  assert.equal(message, "Study reminders could not be updated. Please try again.");
});
