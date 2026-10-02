import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

const HOOKS = `
  let slots = [], cursor = 0, dirty = false, layouts = [], effects = [];
  const changed = (previous, next) => !previous || previous.length !== next.length || next.some((value, index) => !Object.is(value, previous[index]));
  export function useState(initial) {
    const index = cursor++;
    slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
    return [slots[index].value, (next) => {
      if (!slots[index]) return;
      const value = typeof next === 'function' ? next(slots[index].value) : next;
      if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true; }
    }];
  }
  export function useRef(initial) {
    const index = cursor++;
    slots[index] ??= { value: { current: initial } };
    return slots[index].value;
  }
  export function useMemo(create, dependencies) {
    const index = cursor++;
    if (!slots[index] || changed(slots[index].dependencies, dependencies)) slots[index] = { value: create(), dependencies };
    return slots[index].value;
  }
  export const useCallback = (callback, dependencies) => useMemo(() => callback, dependencies);
  function effect(callback, dependencies, queue) {
    const index = cursor++;
    if (slots[index] && !changed(slots[index].dependencies, dependencies)) return;
    const previous = slots[index];
    slots[index] = { dependencies, cleanup: previous?.cleanup };
    queue.push(() => { previous?.cleanup?.(); slots[index].cleanup = callback(); });
  }
  export const useEffect = (callback, dependencies) => effect(callback, dependencies, effects);
  export const useLayoutEffect = (callback, dependencies) => effect(callback, dependencies, layouts);
  export function render(callback, observe) {
    let result, renders = 0;
    do {
      dirty = false; cursor = 0;
      result = callback(); observe?.(result);
      const layoutQueue = layouts; layouts = []; layoutQueue.forEach((run) => run());
      const effectQueue = effects; effects = []; effectQueue.forEach((run) => run());
      if (++renders > 10) throw Error('Unexpected render loop');
    } while (dirty);
    return result;
  }
  export function unmount() { slots.forEach((slot) => slot?.cleanup?.()); slots = []; layouts = []; effects = []; }
`;
const API = `
  let handler = async () => ({ attempts: [] });
  export const requests = [];
  export const setHandler = (value) => { handler = value; };
  export default { async getQuizzes(options) { requests.push(options); return handler(options); } };
`;

async function fixture() {
  const modules = { "virtual:solo-history-hooks": HOOKS, "virtual:solo-history-api": API };
  const vite = await createServer({
    configFile: false, appType: "custom", logLevel: "silent", server: { middlewareMode: true },
    plugins: [{
      name: "solo-history-hook-fixtures", enforce: "pre",
      resolveId(id) { return Object.hasOwn(modules, id) ? `\0${id}` : null; },
      load(id) { return modules[id.slice(1)] ?? null; },
      transform(source, id) {
        if (!id.replaceAll("\\", "/").endsWith("/src/hooks/useSoloQuizHistory.js")) return null;
        return source.replace('from "react"', 'from "virtual:solo-history-hooks"')
          .replace('from "../utils/apiClient"', 'from "virtual:solo-history-api"');
      },
    }],
  });
  try {
    const [{ default: useHistory }, hooks, api] = await Promise.all([
      vite.ssrLoadModule("/src/hooks/useSoloQuizHistory.js"),
      vite.ssrLoadModule("virtual:solo-history-hooks"),
      vite.ssrLoadModule("virtual:solo-history-api"),
    ]);
    return {
      ...api,
      render(enabled = false, academicProfileDataId = "profile-a", observe) {
        return hooks.render(() => useHistory({ enabled, academicProfileDataId }), observe);
      },
      unmount: hooks.unmount,
      async close() { hooks.unmount(); await vite.close(); },
    };
  } catch (error) { await vite.close(); throw error; }
}

const settle = () => new Promise((resolve) => setImmediate(resolve));
const attempt = (id) => ({ id, topic: id });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((success, failure) => { resolve = success; reject = failure; });
  return { promise, resolve, reject };
};

test("history waits for the history view, shows loading immediately, and retains rows while the builder is open", async () => {
  const context = await fixture();
  try {
    const request = deferred();
    context.setHandler(() => request.promise);
    assert.equal(context.render().isHistoryLoading, false);
    assert.equal(context.requests.length, 0);
    const loadingFrames = [];
    assert.equal(context.render(true, "profile-a", (state) => loadingFrames.push(state.isHistoryLoading)).isHistoryLoading, true);
    assert.ok(loadingFrames.every(Boolean), "opening history never flashes an empty state before loading");
    assert.deepEqual(context.requests, [{ academicProfileId: "profile-a" }]);
    request.resolve({ attempts: [attempt("saved")] });
    await settle();
    assert.deepEqual(context.render(true).attempts, [attempt("saved")]);
    const builder = context.render(false);
    assert.deepEqual(builder.attempts, [attempt("saved")]);
    assert.equal(builder.isHistoryLoading, false);
    assert.equal(context.requests.length, 1);
    context.setHandler(() => ({ attempts: [attempt("newer")] }));
    assert.equal(context.render(true).isHistoryLoading, true);
    await settle();
    assert.deepEqual(context.render(true).attempts, [attempt("newer")]);
    assert.equal(context.requests.length, 2);
  } finally { await context.close(); }
});

test("closing history ignores a delayed result and re-entry uses the fresh request", async () => {
  const context = await fixture();
  try {
    const abandoned = deferred(), current = deferred();
    let calls = 0;
    context.setHandler(() => (++calls === 1 ? abandoned : current).promise);
    context.render(true);
    context.render(false);
    context.render(true);
    current.resolve({ attempts: [attempt("current")] });
    await settle();
    assert.deepEqual(context.render(true).attempts, [attempt("current")]);
    abandoned.resolve({ attempts: [attempt("obsolete")] });
    await settle();
    const state = context.render(true);
    assert.deepEqual(state.attempts, [attempt("current")]);
    assert.equal(state.isHistoryLoading, false);
    assert.equal(state.historyError, "");
  } finally { await context.close(); }
});

test("a profile switch hides previous rows on every render and ignores its request and captured setter", async () => {
  const context = await fixture();
  try {
    const previous = deferred(), next = deferred();
    context.setHandler(({ academicProfileId }) => academicProfileId === "profile-a" ? previous.promise : next.promise);
    const oldState = context.render(true);
    oldState.setAttempts([attempt("profile-a-row")]);
    assert.deepEqual(context.render(true).attempts, [attempt("profile-a-row")]);
    const frames = [];
    context.render(true, "profile-b", (state) => frames.push(state.attempts));
    assert.ok(frames.every((rows) => rows.length === 0), "the first profile-b render cannot expose profile-a rows");
    oldState.setAttempts([attempt("late-old-save")]);
    previous.resolve({ attempts: [attempt("old-server-row")] });
    await settle();
    assert.deepEqual(context.render(true, "profile-b").attempts, []);
    next.resolve({ attempts: [attempt("profile-b-row")] });
    await settle();
    assert.deepEqual(context.render(true, "profile-b").attempts, [attempt("profile-b-row")]);
    assert.deepEqual(context.requests.map((row) => row.academicProfileId), ["profile-a", "profile-b"]);
  } finally { await context.close(); }
});

test("failed history has its own error and retry clears it while fetching", async () => {
  const context = await fixture();
  try {
    context.setHandler(() => { throw Error("History is offline"); });
    context.render(true);
    await settle();
    let state = context.render(true);
    assert.equal(state.isHistoryLoading, false);
    assert.equal(state.historyError, "History is offline");
    const retry = deferred();
    context.setHandler(() => retry.promise);
    state.reloadHistory();
    state = context.render(true);
    assert.equal(state.isHistoryLoading, true);
    assert.equal(state.historyError, "");
    retry.resolve({ attempts: [attempt("restored")] });
    await settle();
    state = context.render(true);
    assert.equal(state.historyError, "");
    assert.equal(state.isHistoryLoading, false);
    assert.deepEqual(state.attempts, [attempt("restored")]);
    assert.equal(context.render(false).historyError, "");
  } finally { await context.close(); }
});

test("insert, delete and clear operations are sequential and a pending refresh cannot undo them", async () => {
  const context = await fixture();
  try {
    const request = deferred();
    context.setHandler(() => request.promise);
    const state = context.render(true);
    state.setAttempts([attempt("keep"), attempt("delete")]);
    state.setAttempts((rows) => [attempt("created"), ...rows]);
    state.setAttempts((rows) => rows.filter((row) => row.id !== "delete"));
    assert.deepEqual(context.render(true).attempts.map((row) => row.id), ["created", "keep"]);
    request.resolve({ attempts: [attempt("keep"), attempt("delete")] });
    await settle();
    assert.deepEqual(context.render(true).attempts.map((row) => row.id), ["created", "keep"]);
    const refresh = deferred();
    context.setHandler(() => refresh.promise);
    state.reloadHistory();
    const refreshing = context.render(true);
    refreshing.setAttempts([]);
    refresh.resolve({ attempts: [attempt("keep")] });
    await settle();
    assert.deepEqual(context.render(true).attempts, []);
    assert.equal(context.render(true).isHistoryLoading, false);
  } finally { await context.close(); }
});

test("canceled failures are ignored and malformed history becomes an empty list", async () => {
  const context = await fixture();
  try {
    const request = deferred();
    context.setHandler(() => request.promise);
    context.render(true);
    context.render(false);
    request.reject(Error("Late failure"));
    await settle();
    assert.equal(context.render(false).historyError, "");
    context.setHandler(() => ({ attempts: "bad rows" }));
    context.render(true);
    await settle();
    assert.deepEqual(context.render(true).attempts, []);
    assert.equal(context.render(true).historyError, "");
  } finally { await context.close(); }
});
