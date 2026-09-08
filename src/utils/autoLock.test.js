import assert from "node:assert/strict";
import test from "node:test";

import {
  AUTO_LOCK_DEFAULT_MINUTES,
  AUTO_LOCK_MAX_MINUTES,
  AUTO_LOCK_MIN_MINUTES,
  normalizeAutoLockMinutes,
  readAutoLockPreferences,
  subscribeToAutoLock,
  writeAutoLockPreferences,
} from "./autoLock.js";

const AUTO_LOCK_ENABLED_STORAGE_KEY = "prepmatrix_auto_lock_enabled";
const AUTO_LOCK_MINUTES_STORAGE_KEY = "prepmatrix_auto_lock_minutes";

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

function eventTarget(initial = {}) {
  const listeners = new Map();
  return {
    ...initial,
    addEventListener(name, listener) {
      const callbacks = listeners.get(name) ?? new Set();
      callbacks.add(listener);
      listeners.set(name, callbacks);
    },
    removeEventListener(name, listener) {
      const callbacks = listeners.get(name);
      callbacks?.delete(listener);
      if (callbacks?.size === 0) listeners.delete(name);
    },
    emit(name, event = {}) {
      for (const listener of [...(listeners.get(name) ?? [])]) {
        listener({ type: name, ...event });
      }
    },
    listenerCount() {
      return [...listeners.values()].reduce((total, callbacks) => total + callbacks.size, 0);
    },
    listeners,
  };
}

function createClock(initialNow = 0) {
  let currentNow = initialNow;
  const timers = [];
  return {
    clearTimeout(timer) {
      timer.cleared = true;
    },
    now: () => currentNow,
    setNow(nextNow) {
      currentNow = nextNow;
    },
    setTimeout(callback, delay) {
      const timer = { callback, cleared: false, delay };
      timers.push(timer);
      return timer;
    },
    timers,
  };
}

function subscribe(onLock, options = {}) {
  const windowObject = options.windowObject ?? eventTarget();
  const documentObject = options.documentObject ?? eventTarget({ visibilityState: "visible" });
  const clock = options.clock ?? createClock();
  const unsubscribe = subscribeToAutoLock(onLock, {
    enabled: true,
    minutes: AUTO_LOCK_DEFAULT_MINUTES,
    windowObject,
    documentObject,
    now: clock.now,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    ...options,
  });
  return { clock, documentObject, unsubscribe, windowObject };
}

test("normalizes auto-lock minutes to supported whole-minute limits", () => {
  assert.equal(AUTO_LOCK_DEFAULT_MINUTES, 5);
  assert.equal(AUTO_LOCK_MIN_MINUTES, 2);
  assert.equal(AUTO_LOCK_MAX_MINUTES, 1440);
  assert.equal(normalizeAutoLockMinutes(), AUTO_LOCK_DEFAULT_MINUTES);
  assert.equal(normalizeAutoLockMinutes("15"), 15);
  assert.equal(normalizeAutoLockMinutes(1), AUTO_LOCK_MIN_MINUTES);
  assert.equal(normalizeAutoLockMinutes(10_000), AUTO_LOCK_MAX_MINUTES);
  assert.equal(normalizeAutoLockMinutes("not-a-number"), AUTO_LOCK_DEFAULT_MINUTES);
  assert.equal(normalizeAutoLockMinutes(null, 30), 30);
});

test("reads persisted auto-lock preferences and recovers safely from bad storage", () => {
  assert.deepEqual(readAutoLockPreferences(createStorage()), {
    enabled: false,
    minutes: AUTO_LOCK_DEFAULT_MINUTES,
  });

  assert.deepEqual(readAutoLockPreferences(createStorage({
    [AUTO_LOCK_ENABLED_STORAGE_KEY]: "true",
    [AUTO_LOCK_MINUTES_STORAGE_KEY]: "25",
  })), {
    enabled: true,
    minutes: 25,
  });

  assert.deepEqual(readAutoLockPreferences(createStorage({
    [AUTO_LOCK_ENABLED_STORAGE_KEY]: "false",
    [AUTO_LOCK_MINUTES_STORAGE_KEY]: "1",
  })), {
    enabled: false,
    minutes: AUTO_LOCK_MIN_MINUTES,
  });

  const blockedStorage = {
    getItem() {
      throw new Error("blocked");
    },
  };
  assert.deepEqual(readAutoLockPreferences(blockedStorage), {
    enabled: false,
    minutes: AUTO_LOCK_DEFAULT_MINUTES,
  });
});

test("writes normalized auto-lock preferences and tolerates blocked storage", () => {
  const storage = createStorage();
  writeAutoLockPreferences({ enabled: true, minutes: 1 }, storage);
  assert.equal(storage.values.get(AUTO_LOCK_ENABLED_STORAGE_KEY), "true");
  assert.equal(storage.values.get(AUTO_LOCK_MINUTES_STORAGE_KEY), String(AUTO_LOCK_MIN_MINUTES));

  writeAutoLockPreferences({ enabled: false, minutes: 10_000 }, storage);
  assert.equal(storage.values.get(AUTO_LOCK_ENABLED_STORAGE_KEY), "false");
  assert.equal(storage.values.get(AUTO_LOCK_MINUTES_STORAGE_KEY), String(AUTO_LOCK_MAX_MINUTES));

  const blockedStorage = {
    setItem() {
      throw new Error("blocked");
    },
  };
  assert.doesNotThrow(() => writeAutoLockPreferences({ enabled: true, minutes: 5 }, blockedStorage));
});

test("schedules a five-minute lock and extends the deadline on activity", () => {
  let lockCount = 0;
  const runtime = subscribe(() => {
    lockCount += 1;
  });

  assert.equal(runtime.clock.timers.length, 1);
  assert.equal(runtime.clock.timers[0].delay, 5 * 60 * 1000);

  runtime.clock.setNow(2 * 60 * 1000);
  runtime.documentObject.emit("pointerdown");
  assert.equal(runtime.clock.timers.length, 1, "activity should update the deadline without timer churn");

  runtime.clock.setNow(5 * 60 * 1000);
  runtime.clock.timers[0].callback();
  assert.equal(lockCount, 0, "the original callback must not lock before the extended deadline");
  assert.equal(runtime.clock.timers.at(-1).delay, 2 * 60 * 1000);

  runtime.clock.setNow(7 * 60 * 1000);
  runtime.clock.timers.at(-1).callback();
  runtime.clock.timers.at(-1).callback();
  assert.equal(lockCount, 1, "auto-lock should be one-shot");
  runtime.unsubscribe();
});

test("removes activity listeners and clears the pending timer on cleanup", () => {
  let lockCount = 0;
  const runtime = subscribe(() => {
    lockCount += 1;
  });
  const pendingTimer = runtime.clock.timers[0];

  assert.ok(runtime.windowObject.listenerCount() > 0);
  assert.ok(runtime.documentObject.listenerCount() > 0);
  runtime.unsubscribe();

  assert.equal(runtime.windowObject.listenerCount(), 0);
  assert.equal(runtime.documentObject.listenerCount(), 0);
  assert.equal(pendingTimer.cleared, true);
  runtime.windowObject.emit("keydown");
  pendingTimer.callback();
  assert.equal(lockCount, 0);
});

test("locks on foreground visibility after the background deadline expires", () => {
  let lockCount = 0;
  const documentObject = eventTarget({ visibilityState: "visible" });
  const clock = createClock();
  const runtime = subscribe(() => {
    lockCount += 1;
  }, {
    clock,
    documentObject,
    minutes: AUTO_LOCK_MIN_MINUTES,
  });

  clock.setNow(30_000);
  documentObject.visibilityState = "hidden";
  documentObject.emit("visibilitychange");
  assert.equal(lockCount, 0);
  assert.equal(clock.timers.length, 1, "going into the background must not extend inactivity");

  clock.setNow((AUTO_LOCK_MIN_MINUTES * 60 * 1000) + 1);
  documentObject.visibilityState = "visible";
  documentObject.emit("visibilitychange");
  assert.equal(lockCount, 1);
  runtime.unsubscribe();
});

test("does not install listeners or timers when auto-lock is disabled", () => {
  const windowObject = eventTarget();
  const documentObject = eventTarget({ visibilityState: "visible" });
  const clock = createClock();
  const unsubscribe = subscribeToAutoLock(() => {
    assert.fail("disabled auto-lock must not fire");
  }, {
    enabled: false,
    minutes: AUTO_LOCK_DEFAULT_MINUTES,
    windowObject,
    documentObject,
    now: clock.now,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
  });

  assert.equal(clock.timers.length, 0);
  assert.equal(windowObject.listenerCount(), 0);
  assert.equal(documentObject.listenerCount(), 0);
  assert.doesNotThrow(() => unsubscribe());
});
