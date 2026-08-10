import assert from "node:assert/strict";
import test from "node:test";
import {
  createPwaLifecycleController,
  createPwaSnapshot,
  isIosDevice,
  isSafariBrowser,
  isStandaloneDisplay,
  PWA_INSTALLED_STORAGE_KEY,
  selectPwaSurface,
} from "./pwaLifecycle.js";

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type, event = {}) {
    this.listeners.get(type)?.forEach((listener) => listener({
      ...event,
      target: event.target || this,
      type,
    }));
  }
}

class FakeStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

function createRuntime({ getInstalledRelatedApps = null, storageRef = new FakeStorage(), waiting = false } = {}) {
  const standaloneQuery = new FakeEventTarget();
  standaloneQuery.matches = false;

  const worker = new FakeEventTarget();
  worker.state = waiting ? "installed" : "activated";
  worker.messages = [];
  worker.postMessage = (message) => worker.messages.push(message);

  const registration = new FakeEventTarget();
  registration.installing = null;
  registration.waiting = waiting ? worker : null;
  registration.updateCount = 0;
  registration.update = async () => {
    registration.updateCount += 1;
    return registration;
  };

  const serviceWorker = new FakeEventTarget();
  serviceWorker.controller = {};
  serviceWorker.registerCalls = [];
  serviceWorker.register = async (...args) => {
    serviceWorker.registerCalls.push(args);
    return registration;
  };

  const windowRef = new FakeEventTarget();
  const mediaQueries = [];
  windowRef.matchMedia = (query) => {
    mediaQueries.push(query);
    return standaloneQuery;
  };
  windowRef.reloadCount = 0;
  windowRef.location = {
    reload: () => {
      windowRef.reloadCount += 1;
    },
  };

  const documentRef = new FakeEventTarget();
  documentRef.visibilityState = "visible";

  const navigatorRef = {
    maxTouchPoints: 0,
    onLine: true,
    platform: "Win32",
    serviceWorker,
    standalone: false,
    userAgent: "Mozilla/5.0 Chrome/140 Safari/537.36",
  };
  if (getInstalledRelatedApps) navigatorRef.getInstalledRelatedApps = getInstalledRelatedApps;

  return {
    documentRef,
    mediaQueries,
    navigatorRef,
    registration,
    serviceWorker,
    storageRef,
    standaloneQuery,
    windowRef,
    worker,
  };
}

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

test("detects standalone display and iOS/iPadOS Safari without browser globals", () => {
  const standaloneWindow = { matchMedia: () => ({ matches: true }) };
  assert.equal(isStandaloneDisplay({ navigatorRef: {}, windowRef: standaloneWindow }), true);
  assert.equal(isStandaloneDisplay({ navigatorRef: { standalone: true }, windowRef: {} }), true);
  assert.equal(isStandaloneDisplay({
    navigatorRef: { windowControlsOverlay: { visible: true } },
    windowRef: {},
  }), true);
  assert.equal(isStandaloneDisplay({
    documentRef: { referrer: "android-app://com.android.chrome/" },
    navigatorRef: {},
    windowRef: {},
  }), true);
  assert.equal(isStandaloneDisplay({ navigatorRef: {}, windowRef: {} }), false);

  const ipadNavigator = {
    maxTouchPoints: 5,
    platform: "MacIntel",
    userAgent: "Mozilla/5.0 Version/18.0 Mobile/15E148 Safari/604.1",
  };
  assert.equal(isIosDevice(ipadNavigator), true);
  assert.equal(isSafariBrowser(ipadNavigator), true);
  assert.equal(isSafariBrowser({ ...ipadNavigator, userAgent: "Mozilla/5.0 CriOS/140 Mobile Safari/604.1" }), false);
});

test("selects one status surface in update, offline, install, and iOS priority order", () => {
  const base = {
    canInstall: true,
    installDetectionPending: false,
    installDismissed: false,
    installedThisSession: false,
    iosGuideDismissed: false,
    isIos: true,
    isInstalled: false,
    isOnline: false,
    isStandalone: false,
    updateDismissed: false,
    updateReady: true,
  };

  assert.equal(selectPwaSurface(base), "update");
  assert.equal(selectPwaSurface({ ...base, updateDismissed: true }), "offline");
  assert.equal(selectPwaSurface({ ...base, updateReady: false, isOnline: true }), "install");
  assert.equal(selectPwaSurface({ ...base, updateReady: false, isOnline: true, canInstall: false }), "ios");
  assert.equal(selectPwaSurface({ ...base, updateReady: false, isOnline: true, isStandalone: true }), null);
});

test("captures the native install event and records an accepted installation", async () => {
  const runtime = createRuntime();
  const controller = createPwaLifecycleController(runtime);
  await controller.start();

  let prevented = false;
  let promptCount = 0;
  runtime.windowRef.emit("beforeinstallprompt", {
    preventDefault: () => {
      prevented = true;
    },
    prompt: async () => {
      promptCount += 1;
    },
    userChoice: Promise.resolve({ outcome: "accepted", platform: "web" }),
  });

  assert.equal(prevented, true);
  assert.equal(controller.getSnapshot().canInstall, true);
  assert.equal(selectPwaSurface(controller.getSnapshot()), "install");

  const choice = await controller.install();
  assert.deepEqual(choice, { outcome: "accepted", platform: "web" });
  assert.equal(promptCount, 1);
  assert.equal(controller.getSnapshot().canInstall, false);
  assert.equal(controller.getSnapshot().installedThisSession, true);
  assert.equal(controller.getSnapshot().isInstalled, true);
  assert.equal(runtime.storageRef.getItem(PWA_INSTALLED_STORAGE_KEY), null);
  assert.equal(selectPwaSurface(controller.getSnapshot()), null);

  runtime.windowRef.emit("appinstalled");
  assert.equal(runtime.storageRef.getItem(PWA_INSTALLED_STORAGE_KEY), "1");
  controller.stop();
});

test("accepted install choice is not persisted until appinstalled confirms completion", async () => {
  const storageRef = new FakeStorage();
  const runtime = createRuntime({ storageRef });
  const controller = createPwaLifecycleController(runtime);
  await controller.start();
  runtime.windowRef.emit("beforeinstallprompt", {
    preventDefault: () => undefined,
    prompt: async () => undefined,
    userChoice: Promise.resolve({ outcome: "accepted", platform: "web" }),
  });
  assert.equal((await controller.install()).outcome, "accepted");
  assert.equal(storageRef.getItem(PWA_INSTALLED_STORAGE_KEY), null);
  runtime.windowRef.emit("focus");
  await flushPromises();
  assert.equal(storageRef.getItem(PWA_INSTALLED_STORAGE_KEY), null);
  controller.stop();

  const laterRuntime = createRuntime({ storageRef });
  const laterController = createPwaLifecycleController(laterRuntime);
  await laterController.start();
  laterRuntime.windowRef.emit("beforeinstallprompt", {
    preventDefault: () => undefined,
    prompt: async () => undefined,
    userChoice: Promise.resolve({ outcome: "dismissed" }),
  });
  assert.equal(laterController.getSnapshot().isInstalled, false);
  assert.equal(selectPwaSurface(laterController.getSnapshot()), "install");
  laterController.stop();
});

test("waits for installed-related-app detection before exposing a captured install prompt", async () => {
  let resolveInstalledApps;
  const installedApps = new Promise((resolve) => {
    resolveInstalledApps = resolve;
  });
  const runtime = createRuntime({
    getInstalledRelatedApps: () => installedApps,
  });
  const controller = createPwaLifecycleController(runtime);
  const startPromise = controller.start();

  runtime.windowRef.emit("beforeinstallprompt", {
    preventDefault: () => undefined,
    prompt: async () => undefined,
    userChoice: Promise.resolve({ outcome: "dismissed" }),
  });
  assert.equal(controller.getSnapshot().installDetectionPending, true);
  assert.equal(controller.getSnapshot().canInstall, false);
  assert.equal(selectPwaSurface(controller.getSnapshot()), null);
  await flushPromises();
  assert.equal(runtime.serviceWorker.registerCalls.length, 1);

  resolveInstalledApps([]);
  await startPromise;
  assert.equal(controller.getSnapshot().installDetectionPending, false);
  assert.equal(controller.getSnapshot().canInstall, true);
  assert.equal(selectPwaSurface(controller.getSnapshot()), "install");
  controller.stop();
});

test("treats a successful related-app check as authoritative over a stale marker", async () => {
  const storageRef = new FakeStorage();
  storageRef.setItem(PWA_INSTALLED_STORAGE_KEY, "1");
  const runtime = createRuntime({
    getInstalledRelatedApps: async () => [],
    storageRef,
  });
  const controller = createPwaLifecycleController(runtime);
  const startPromise = controller.start();

  runtime.windowRef.emit("beforeinstallprompt", {
    preventDefault: () => undefined,
    prompt: async () => undefined,
    userChoice: Promise.resolve({ outcome: "dismissed" }),
  });
  assert.equal(selectPwaSurface(controller.getSnapshot()), null);

  await startPromise;
  assert.equal(storageRef.getItem(PWA_INSTALLED_STORAGE_KEY), null);
  assert.equal(controller.getSnapshot().isInstalled, false);
  assert.equal(controller.getSnapshot().canInstall, true);
  assert.equal(selectPwaSurface(controller.getSnapshot()), "install");
  controller.stop();
});

test("keeps a dismissed install prompt hidden across focus rechecks", async () => {
  const runtime = createRuntime({
    getInstalledRelatedApps: async () => [],
  });
  const controller = createPwaLifecycleController(runtime);
  await controller.start();

  runtime.windowRef.emit("beforeinstallprompt", {
    preventDefault: () => undefined,
    prompt: async () => undefined,
    userChoice: Promise.resolve({ outcome: "dismissed" }),
  });
  assert.equal(selectPwaSurface(controller.getSnapshot()), "install");

  controller.dismissInstall();
  assert.equal(controller.getSnapshot().installDismissed, true);
  assert.equal(selectPwaSurface(controller.getSnapshot()), null);

  runtime.windowRef.emit("focus");
  await flushPromises();
  assert.equal(controller.getSnapshot().canInstall, true);
  assert.equal(controller.getSnapshot().installDismissed, true);
  assert.equal(selectPwaSurface(controller.getSnapshot()), null);
  controller.stop();
});

test("uses the durable marker after a detection error until a native install event disproves it", async () => {
  const storageRef = new FakeStorage();
  storageRef.setItem(PWA_INSTALLED_STORAGE_KEY, "1");
  const errors = [];
  const runtime = createRuntime({
    getInstalledRelatedApps: async () => {
      throw new Error("API unavailable");
    },
    storageRef,
  });
  const controller = createPwaLifecycleController({
    ...runtime,
    onError: (error) => errors.push(error),
  });
  await controller.start();

  assert.equal(errors.length, 1);
  assert.equal(storageRef.getItem(PWA_INSTALLED_STORAGE_KEY), "1");
  assert.equal(controller.getSnapshot().isInstalled, true);
  assert.equal(selectPwaSurface(controller.getSnapshot()), null);

  runtime.windowRef.emit("beforeinstallprompt", {
    preventDefault: () => undefined,
    prompt: async () => undefined,
    userChoice: Promise.resolve({ outcome: "dismissed" }),
  });
  assert.equal(storageRef.getItem(PWA_INSTALLED_STORAGE_KEY), null);
  assert.equal(controller.getSnapshot().isInstalled, false);
  assert.equal(controller.getSnapshot().canInstall, true);
  assert.equal(selectPwaSurface(controller.getSnapshot()), "install");
  controller.stop();
});

test("a fresh native install event clears a non-authoritative marker on unsupported browsers", async () => {
  const storageRef = new FakeStorage();
  storageRef.setItem(PWA_INSTALLED_STORAGE_KEY, "1");
  const runtime = createRuntime({ storageRef });
  const controller = createPwaLifecycleController(runtime);
  await controller.start();
  assert.equal(controller.getSnapshot().isInstalled, true);

  runtime.windowRef.emit("beforeinstallprompt", {
    preventDefault: () => undefined,
    prompt: async () => undefined,
    userChoice: Promise.resolve({ outcome: "dismissed" }),
  });
  assert.equal(storageRef.getItem(PWA_INSTALLED_STORAGE_KEY), null);
  assert.equal(controller.getSnapshot().isInstalled, false);
  assert.equal(controller.getSnapshot().canInstall, true);
  assert.equal(selectPwaSurface(controller.getSnapshot()), "install");
  controller.stop();
});

test("a stopped controller cannot publish or persist an in-flight installed-app result", async () => {
  let resolveInstalledApps;
  const installedApps = new Promise((resolve) => {
    resolveInstalledApps = resolve;
  });
  const storageRef = new FakeStorage();
  const runtime = createRuntime({
    getInstalledRelatedApps: () => installedApps,
    storageRef,
  });
  const controller = createPwaLifecycleController(runtime);
  const startPromise = controller.start();
  await flushPromises();

  const snapshotAtStop = controller.getSnapshot();
  const postStopSnapshots = [];
  const unsubscribe = controller.subscribe((snapshot) => postStopSnapshots.push(snapshot));
  controller.stop();
  resolveInstalledApps([{
    id: "https://prep-matrix-ai.vercel.app/",
    platform: "webapp",
    url: "/manifest.webmanifest",
  }]);
  await startPromise;

  assert.equal(storageRef.getItem(PWA_INSTALLED_STORAGE_KEY), null);
  assert.equal(controller.getSnapshot(), snapshotAtStop);
  assert.deepEqual(postStopSnapshots, []);
  unsubscribe();
});

test("suppresses every install surface when the same-origin PWA is already installed", async () => {
  const runtime = createRuntime({
    getInstalledRelatedApps: async () => [{
      id: "https://prep-matrix-ai.vercel.app/",
      platform: "webapp",
      url: "/manifest.webmanifest",
    }],
  });
  const controller = createPwaLifecycleController(runtime);
  await controller.start();

  assert.equal(controller.getSnapshot().isInstalled, true);
  assert.equal(controller.getSnapshot().canInstall, false);
  assert.equal(runtime.storageRef.getItem(PWA_INSTALLED_STORAGE_KEY), "1");

  runtime.windowRef.emit("beforeinstallprompt", {
    preventDefault: () => undefined,
    prompt: async () => undefined,
  });
  assert.equal(controller.getSnapshot().canInstall, false);
  assert.equal(selectPwaSurface(controller.getSnapshot()), null);
  controller.stop();
});

test("uses the durable installation marker on later visits and across open tabs", async () => {
  const storageRef = new FakeStorage();
  const firstRuntime = createRuntime({ storageRef });
  const firstController = createPwaLifecycleController(firstRuntime);
  await firstController.start();
  firstRuntime.windowRef.emit("appinstalled");

  assert.equal(storageRef.getItem(PWA_INSTALLED_STORAGE_KEY), "1");
  assert.equal(selectPwaSurface(firstController.getSnapshot()), null);
  firstController.stop();

  const laterRuntime = createRuntime({ storageRef });
  const laterController = createPwaLifecycleController(laterRuntime);
  await laterController.start();
  assert.equal(laterController.getSnapshot().isInstalled, true);
  assert.equal(laterController.getSnapshot().canInstall, false);
  assert.equal(selectPwaSurface(laterController.getSnapshot()), null);
  laterController.stop();

  const otherTabRuntime = createRuntime();
  const otherTabController = createPwaLifecycleController(otherTabRuntime);
  await otherTabController.start();
  otherTabRuntime.windowRef.emit("storage", {
    key: PWA_INSTALLED_STORAGE_KEY,
    newValue: "1",
  });
  assert.equal(otherTabController.getSnapshot().isInstalled, true);
  assert.equal(selectPwaSurface(otherTabController.getSnapshot()), null);
  otherTabController.stop();
});

test("only reloads once after Update is clicked and the worker controls the page", async () => {
  const runtime = createRuntime({ waiting: true });
  const controller = createPwaLifecycleController(runtime);
  await controller.start();

  assert.equal(runtime.serviceWorker.registerCalls.length, 1);
  assert.deepEqual(runtime.serviceWorker.registerCalls[0], [
    "/sw.js",
    { scope: "/", updateViaCache: "none" },
  ]);
  assert.equal(controller.getSnapshot().updateReady, true);

  runtime.serviceWorker.emit("controllerchange");
  assert.equal(runtime.windowRef.reloadCount, 0);

  assert.equal(await controller.applyUpdate(), true);
  assert.deepEqual(runtime.worker.messages, [{ type: "SKIP_WAITING" }]);
  runtime.serviceWorker.emit("controllerchange");
  runtime.serviceWorker.emit("controllerchange");
  assert.equal(runtime.windowRef.reloadCount, 1);
  controller.stop();
});

test("promotes an updatefound worker only after it is installed over a controlled page", async () => {
  const runtime = createRuntime();
  const controller = createPwaLifecycleController(runtime);
  await controller.start();
  assert.equal(controller.getSnapshot().updateReady, false);

  const nextWorker = new FakeEventTarget();
  nextWorker.state = "installing";
  nextWorker.messages = [];
  nextWorker.postMessage = (message) => nextWorker.messages.push(message);
  runtime.registration.installing = nextWorker;
  runtime.registration.emit("updatefound");
  assert.equal(controller.getSnapshot().updateReady, false);

  nextWorker.state = "installed";
  runtime.registration.waiting = nextWorker;
  nextWorker.emit("statechange");
  assert.equal(controller.getSnapshot().updateReady, true);
  assert.equal(selectPwaSurface(controller.getSnapshot()), "update");

  controller.dismissUpdate();
  assert.equal(controller.getSnapshot().updateDismissed, true);
  assert.equal(selectPwaSurface(controller.getSnapshot()), null);
  controller.stop();
});

test("checks for worker updates on startup and throttled visibility and reconnect events", async () => {
  const runtime = createRuntime();
  let currentTime = 0;
  const controller = createPwaLifecycleController({
    ...runtime,
    now: () => currentTime,
    updateThrottleMs: 60_000,
  });
  await controller.start();
  assert.equal(runtime.registration.updateCount, 1);
  assert.deepEqual(
    new Set(runtime.mediaQueries),
    new Set([
      "(display-mode: standalone)",
      "(display-mode: minimal-ui)",
      "(display-mode: fullscreen)",
      "(display-mode: window-controls-overlay)",
    ]),
  );

  currentTime = 10_000;
  runtime.documentRef.emit("visibilitychange");
  await flushPromises();
  assert.equal(runtime.registration.updateCount, 1);

  runtime.windowRef.emit("offline");
  assert.equal(controller.getSnapshot().isOnline, false);

  currentTime = 61_000;
  runtime.windowRef.emit("online");
  await flushPromises();
  assert.equal(controller.getSnapshot().isOnline, true);
  assert.equal(runtime.registration.updateCount, 2);

  currentTime = 122_000;
  runtime.documentRef.emit("visibilitychange");
  await flushPromises();
  assert.equal(runtime.registration.updateCount, 3);
  controller.stop();
});

test("creates an offline snapshot without claiming offline data availability", () => {
  const snapshot = createPwaSnapshot({
    navigatorRef: { onLine: false },
    windowRef: { matchMedia: () => ({ matches: false }) },
  });
  assert.equal(snapshot.isOnline, false);
  assert.equal(selectPwaSurface(snapshot), "offline");
});
