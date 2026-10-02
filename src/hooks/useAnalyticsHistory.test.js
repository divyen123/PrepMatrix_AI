import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { createPlannerHistoryEntry } from '../utils/plannerHistory.js';

const HOOKS = `
  let slots = [], cursor = 0, dirty = false, effects = [];
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
  export function useEffect(callback, dependencies) {
    const index = cursor++;
    if (slots[index] && !changed(slots[index].dependencies, dependencies)) return;
    const previous = slots[index];
    slots[index] = { dependencies, cleanup: previous?.cleanup };
    effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = callback(); });
  }
  export function render(callback, observe) {
    let result, renders = 0;
    do {
      dirty = false; cursor = 0;
      result = callback(); observe?.(result);
      const queue = effects; effects = []; queue.forEach((run) => run());
      if (++renders > 10) throw Error('Unexpected render loop');
    } while (dirty);
    return result;
  }
  export function unmount() { slots.forEach((slot) => slot?.cleanup?.()); slots = []; effects = []; }
`;
const API = `
  let handler = async () => ({ momentum: null });
  export const requests = [];
  export const setHandler = (value) => { handler = value; };
  export default { async get(url, options) { requests.push({ url, options }); return handler(url, options); } };
`;
const settle = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((success, failure) => { resolve = success; reject = failure; });
  return { promise, resolve, reject };
};
const archive = (id = 'previous / #?', now = '2026-03-04', topic = 'Networks') => createPlannerHistoryEntry({
  subjects: [{ name: topic, chapters: 3 }],
  scheduleStartDate: '2026-03-01',
  schedule: [
    { date: '2026-03-01', tasks: [{ id: `${id}:one`, subjectName: topic, task: `${topic} - TCP` }] },
    { date: '2026-03-02', tasks: [{ id: `${id}:two`, subjectName: topic, task: `${topic} - UDP` }, { id: `${id}:three`, subjectName: topic, task: `${topic} - DNS` }] },
  ],
  completed: [`${id}:one`, `${id}:two`],
}, { id, now });

async function fixture({ reducedMotion = false } = {}) {
  const timers = new Map();
  let now = 0, timerId = 0;
  const originalWindow = globalThis.window;
  globalThis.window = {
    matchMedia: () => ({ matches: reducedMotion }),
    setTimeout(callback, duration) {
      const id = ++timerId;
      timers.set(id, { callback, at: now + duration });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
  };
  const modules = { 'virtual:analytics-history-hooks': HOOKS, 'virtual:analytics-history-api': API };
  const vite = await createServer({
    configFile: false, appType: 'custom', logLevel: 'silent', server: { middlewareMode: true },
    plugins: [{
      name: 'analytics-history-hook-fixtures', enforce: 'pre',
      resolveId(id) { return Object.hasOwn(modules, id) ? `\0${id}` : null; },
      load(id) { return modules[id.slice(1)] ?? null; },
      transform(source, id) {
        if (!id.replaceAll('\\', '/').endsWith('/src/hooks/useAnalyticsHistory.js')) return null;
        return source.replace('from "react"', 'from "virtual:analytics-history-hooks"')
          .replace('from "../utils/apiClient"', 'from "virtual:analytics-history-api"');
      },
    }],
  });
  try {
    const [{ default: useAnalyticsHistory }, hooks, api] = await Promise.all([
      vite.ssrLoadModule('/src/hooks/useAnalyticsHistory.js'),
      vite.ssrLoadModule('virtual:analytics-history-hooks'),
      vite.ssrLoadModule('virtual:analytics-history-api'),
    ]);
    const history = [archive()];
    return {
      ...api, history,
      render(profileId = 'profile-a', entries = history, observe) {
        return hooks.render(() => useAnalyticsHistory(profileId, entries), observe);
      },
      async advance(duration) {
        now += duration;
        for (const [id, timer] of [...timers].sort(([, left], [, right]) => left.at - right.at)) {
          if (timer.at > now) continue;
          timers.delete(id);
          timer.callback();
        }
        await settle();
      },
      unmount: hooks.unmount,
      timerCount: () => timers.size,
      async close() {
        hooks.unmount();
        globalThis.window = originalWindow;
        await vite.close();
      },
    };
  } catch (error) {
    globalThis.window = originalWindow;
    await vite.close();
    throw error;
  }
}

test('previous analytics exposes leaving/loading phases, requests the encoded scoped archive, and restores current without mutations', async () => {
  const context = await fixture();
  try {
    const before = structuredClone(context.history);
    const request = deferred();
    const savedMomentum = { schedule: { totalXp: 90, breakdown: { study: 20, exam: 40, quiz: 10, battle: 20 } } };
    context.setHandler(() => request.promise);
    const initial = context.render();
    assert.equal(initial.historical, false);
    assert.equal(initial.phase, 'idle');
    assert.equal(context.requests.length, 0);

    const entering = initial.switchView(true);
    let view = context.render();
    assert.equal(view.phase, 'leaving');
    assert.equal(view.busy, true);
    assert.equal(view.targetHistorical, true);
    assert.equal(view.historical, false);
    await context.advance(160);
    view = context.render();
    assert.equal(view.phase, 'loading');
    assert.deepEqual(context.requests, [{
      url: '/api/momentum?historyId=previous%20%2F%20%23%3F',
      options: { academicProfileId: 'profile-a', timeoutMs: 15000 },
    }]);
    request.resolve({ momentum: savedMomentum });
    await settle();
    assert.equal(context.render().phase, 'loading', 'fast data cannot skip the centered loading interval');
    await context.advance(380);
    await entering;
    view = context.render();
    assert.equal(view.phase, 'idle');
    assert.equal(view.historical, true);
    assert.equal(view.snapshot.id, before[0].id);
    assert.deepEqual(view.snapshot.completed, ['Networks - TCP', 'Networks - UDP']);
    assert.deepEqual(view.momentum, savedMomentum);

    const currentMomentum = { schedule: { totalXp: 120, breakdown: { study: 80, exam: 40, quiz: 0, battle: 0 } } };
    context.setHandler(() => ({ momentum: currentMomentum }));
    const exiting = view.switchView(false);
    assert.equal(context.render().phase, 'leaving');
    await context.advance(160);
    view = context.render();
    assert.equal(view.phase, 'loading');
    assert.equal(view.targetHistorical, false);
    await context.advance(380);
    await exiting;
    view = context.render();
    assert.equal(view.historical, false);
    assert.equal(view.busy, false);
    assert.equal(view.snapshot, null);
    assert.deepEqual(view.momentum, currentMomentum);
    assert.equal(typeof view.loadedAt, 'number');
    assert.equal(context.requests.length, 2, 'returning current refreshes its scoped XP while the loading status is visible');
    assert.deepEqual(context.requests[1], { url: '/api/momentum', options: { academicProfileId: 'profile-a', timeoutMs: 15000 } });
    assert.deepEqual(context.history, before);
  } finally { await context.close(); }
});

test('an unavailable archived XP request falls back to saved study XP and clears its error on return to current', async () => {
  const context = await fixture({ reducedMotion: true });
  try {
    context.setHandler(() => { throw Error('Offline'); });
    const switching = context.render().switchView(true);
    await context.advance(0);
    assert.equal(context.render().phase, 'loading');
    await context.advance(100);
    await switching;
    const view = context.render();
    assert.equal(view.historical, true);
    assert.equal(view.momentum.snapshotIncomplete, true);
    assert.equal(view.momentum.schedule.totalXp, 20);
    assert.deepEqual(view.momentum.schedule.breakdown, { study: 20, exam: 0, quiz: 0, battle: 0, coding: 0 });
    assert.match(view.error, /Showing saved study-task XP/u);
    context.setHandler(() => ({ momentum: { schedule: { totalXp: 40 } } }));
    const returning = view.switchView(false);
    await context.advance(0);
    await context.advance(100);
    await returning;
    assert.equal(context.render().error, '');
  } finally { await context.close(); }
});

test('switching profile cancels its transition and ignores old responses before showing another profile archive', async () => {
  const context = await fixture();
  try {
    const oldRequest = deferred(), newRequest = deferred();
    context.setHandler((url, options) => options.academicProfileId === 'profile-a' ? oldRequest.promise : newRequest.promise);
    const oldSwitch = context.render().switchView(true);
    await context.advance(160);
    const otherHistory = [archive('profile-b-history', '2026-04-01', 'Physics')];
    const frames = [];
    let view = context.render('profile-b', otherHistory, (state) => frames.push(state));
    assert.ok(frames.every((state) => !state.historical && !state.snapshot && !state.momentum && !state.busy));
    const newSwitch = view.switchView(true);
    await context.advance(160);
    oldRequest.resolve({ momentum: { schedule: { totalXp: 999 } } });
    await oldSwitch;
    view = context.render('profile-b', otherHistory);
    assert.equal(view.phase, 'loading');
    assert.equal(view.momentum, null);
    newRequest.resolve({ momentum: { schedule: { totalXp: 40 } } });
    await context.advance(380);
    await newSwitch;
    view = context.render('profile-b', otherHistory);
    assert.equal(view.snapshot.id, 'profile-b-history');
    assert.equal(view.momentum.schedule.totalXp, 40);
    assert.deepEqual(context.requests.map((request) => request.options.academicProfileId), ['profile-a', 'profile-b']);
  } finally { await context.close(); }
});

test('changing the selected archive cancels stale data, and unmount releases timers without leaking into a fresh view', async () => {
  const context = await fixture();
  try {
    const oldRequest = deferred();
    context.setHandler(() => oldRequest.promise);
    const switching = context.render().switchView(true);
    await context.advance(160);
    const nextHistory = [archive('newer-history', '2026-04-01')];
    const reset = context.render('profile-a', nextHistory);
    assert.equal(reset.phase, 'idle');
    assert.equal(reset.previous.id, 'newer-history');
    oldRequest.resolve({ momentum: { schedule: { totalXp: 999 } } });
    await switching;
    assert.equal(context.render('profile-a', nextHistory).momentum, null);

    const entering = context.render('profile-a', nextHistory).switchView(true);
    assert.equal(context.timerCount(), 1);
    context.unmount();
    await entering;
    assert.equal(context.timerCount(), 0);
    const fresh = context.render('profile-b', nextHistory);
    assert.equal(fresh.historical, false);
    assert.equal(fresh.busy, false);
    assert.equal(fresh.momentum, null);
  } finally { await context.close(); }
});

test('duplicate switch clicks issue one request and empty history leaves current analytics available', async () => {
  const context = await fixture();
  try {
    const state = context.render();
    context.setHandler(() => ({ momentum: { schedule: { totalXp: 20 } } }));
    const first = state.switchView(true);
    await state.switchView(true);
    await state.switchView(false);
    assert.equal(context.timerCount(), 1);
    await context.advance(160);
    await context.advance(380);
    await first;
    assert.equal(context.requests.length, 1);
    assert.equal(context.render().historical, true);
    const empty = context.render('profile-a', []);
    await empty.switchView(true);
    assert.equal(context.render('profile-a', []).phase, 'idle');
    assert.equal(context.render('profile-a', []).historical, false);
    assert.equal(context.requests.length, 1);
  } finally { await context.close(); }
});
