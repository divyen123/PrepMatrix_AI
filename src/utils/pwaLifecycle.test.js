import assert from "node:assert/strict";
import test from "node:test";
import {
  createPwaLifecycleController,
  createPwaSnapshot,
  isIosDevice,
  isSafariBrowser,
  isStandaloneDisplay,
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

function createRuntime({ waiting = false } = {}) {
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
  windowRef.matchMedia = () => standaloneQuery;
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

  return {
    documentRef,
    navigatorRef,
    registration,
    serviceWorker,
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
    installDismissed: false,
    installedNoticeDismissed: false,
    installedThisSession: false,
    iosGuideDismissed: false,
    isIos: true,
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
  assert.equal(selectPwaSurface(controller.getSnapshot()), "installed");
  controller.stop();
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
