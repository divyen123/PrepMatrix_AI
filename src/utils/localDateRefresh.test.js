import test from "node:test";
import assert from "node:assert/strict";
import {
  getNextLocalDateRefreshDelay,
  subscribeToLocalDateChanges,
} from "./localDateRefresh.js";

function eventTarget(initial = {}) {
  const listeners = new Map();
  return {
    ...initial,
    addEventListener(name, listener) {
      listeners.set(name, listener);
    },
    removeEventListener(name, listener) {
      if (listeners.get(name) === listener) listeners.delete(name);
    },
    emit(name) {
      listeners.get(name)?.();
    },
    listeners,
  };
}

test("schedules just after the next local midnight", () => {
  assert.equal(
    getNextLocalDateRefreshDelay(new Date(2026, 6, 4, 23, 59, 50, 0)),
    11_000,
  );
  assert.equal(
    getNextLocalDateRefreshDelay(new Date(2026, 6, 4, 0, 0, 0, 0)),
    86_401_000,
  );
});

test("refreshes once when focus crosses midnight and cleans up listeners", () => {
  let current = new Date(2026, 6, 4, 23, 59, 50, 0);
  const windowObject = eventTarget();
  const documentObject = eventTarget({ visibilityState: "visible" });
  const timers = [];
  const cleared = [];
  const dates = [];
  const unsubscribe = subscribeToLocalDateChanges((date) => dates.push(date), {
    windowObject,
    documentObject,
    now: () => current,
    setTimeout: (callback, delay) => {
      const timer = { callback, delay };
      timers.push(timer);
      return timer;
    },
    clearTimeout: (timer) => cleared.push(timer),
  });

  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 11_000);
  current = new Date(2026, 6, 5, 0, 1, 0, 0);
  windowObject.emit("focus");
  windowObject.emit("focus");
  assert.equal(dates.length, 1);
  assert.equal(dates[0].getDate(), 5);

  unsubscribe();
  assert.equal(windowObject.listeners.size, 0);
  assert.equal(documentObject.listeners.size, 0);
  assert.equal(cleared.length, 1);
});

test("ignores hidden visibility changes and re-arms after midnight timeout", () => {
  let current = new Date(2026, 6, 4, 23, 59, 50, 0);
  const windowObject = eventTarget();
  const documentObject = eventTarget({ visibilityState: "hidden" });
  const timers = [];
  const dates = [];
  const unsubscribe = subscribeToLocalDateChanges((date) => dates.push(date), {
    windowObject,
    documentObject,
    now: () => current,
    setTimeout: (callback, delay) => {
      const timer = { callback, delay };
      timers.push(timer);
      return timer;
    },
    clearTimeout: () => {},
  });

  current = new Date(2026, 6, 5, 0, 0, 1, 0);
  documentObject.emit("visibilitychange");
  assert.equal(dates.length, 0);
  documentObject.visibilityState = "visible";
  documentObject.emit("visibilitychange");
  assert.equal(dates.length, 1);

  timers[0].callback();
  assert.equal(timers.length, 2);
  assert.ok(timers[1].delay > 86_000_000);
  unsubscribe();
});
