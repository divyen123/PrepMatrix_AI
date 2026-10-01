import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import {
  CODE_MATRIX_PRACTICE_QUESTIONS,
  readCodeMatrixPracticeState,
  writeCodeMatrixPracticeState,
} from '../utils/codeMatrixPractice.js';

const HOOKS = `
  let slots = [], cursor = 0, dirty = false, layouts = [], effects = [];
  const changed = (a, b) => !a || !b || a.length !== b.length || b.some((value, index) => !Object.is(value, a[index]));
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
  export function render(callback) {
    let result, renders = 0;
    do {
      dirty = false; cursor = 0;
      result = callback();
      const layoutQueue = layouts; layouts = []; layoutQueue.forEach((run) => run());
      const effectQueue = effects; effects = []; effectQueue.forEach((run) => run());
      if (++renders > 10) throw Error('Unexpected render loop');
    } while (dirty);
    return result;
  }
  export function unmount() { slots.forEach((slot) => slot?.cleanup?.()); slots = []; layouts = []; effects = []; }
`;
const API = `
  let scope = '', handler = async () => ({ momentum: { history: [] } });
  export const requests = [];
  export const getApiAcademicProfileScope = () => scope;
  export const setScope = (value) => { scope = value; };
  export const setHandler = (value) => { handler = value; };
  export default { async get(path, options) {
    const request = { path, options }; requests.push(request); return handler(request);
  } };
`;

async function fixture() {
  const rows = new Map();
  const storage = { getItem: (key) => rows.get(key) ?? null, setItem: (key, value) => rows.set(key, value), removeItem: (key) => rows.delete(key) };
  const browser = Object.assign(new EventTarget(), { localStorage: storage });
  const originals = ['window', 'localStorage'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: browser });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: storage });
  const restore = () => originals.forEach(([key, descriptor]) => {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  });
  const modules = { 'virtual:practice-hook-fixture': HOOKS, 'virtual:practice-api-fixture': API };
  const vite = await createServer({
    configFile: false, appType: 'custom', logLevel: 'silent', server: { middlewareMode: true },
    plugins: [{
      name: 'practice-hook-test-fixtures', enforce: 'pre',
      resolveId(id) { return Object.hasOwn(modules, id) ? `\0${id}` : null; },
      load(id) { return modules[id.slice(1)] ?? null; },
      transform(source, id) {
        if (!id.replaceAll('\\', '/').endsWith('/src/hooks/useCodeMatrixPractice.js')) return null;
        return source.replace("from 'react'", "from 'virtual:practice-hook-fixture'")
          .replace("from '../utils/apiClient'", "from 'virtual:practice-api-fixture'");
      },
    }],
  });
  try {
    const [{ default: usePractice }, hooks, api] = await Promise.all([
      vite.ssrLoadModule('/src/hooks/useCodeMatrixPractice.js'),
      vite.ssrLoadModule('virtual:practice-hook-fixture'),
      vite.ssrLoadModule('virtual:practice-api-fixture'),
    ]);
    return { ...api, storage, browser, unmount: hooks.unmount,
      render(profileId = 'profile-a', language = 'python') {
        api.setScope(profileId);
        return hooks.render(() => usePractice(profileId, language));
      },
      async close() { hooks.unmount(); restore(); await vite.close(); },
    };
  } catch (error) { restore(); await vite.close(); throw error; }
}

const question = CODE_MATRIX_PRACTICE_QUESTIONS[0];
const otherQuestion = CODE_MATRIX_PRACTICE_QUESTIONS[1];
const questionKey = `${question.id}:v${question.version}`;
const otherKey = `${otherQuestion.id}:v${otherQuestion.version}`;
const settle = () => new Promise((resolve) => setImmediate(resolve));
const completed = (language, code) => ({
  status: 'success', questionId: question.id, version: question.version, language, code, total: 5, passed: 5,
  cases: question.testCases.map((item) => ({ ...item, stdout: item.expectedOutput, status: 'success', passed: true })),
});
const historyRow = (item = question, language = 'python') => ({ kind: 'coding', source: 'practice', xp: 10,
  questionId: item.id, version: item.version, language });
const historyPayload = (history) => ({ momentum: { history } });

test('solving Python only appears for Python until JavaScript is independently completed; both persist on reload', async () => {
  const context = await fixture();
  try {
    let state = context.render();
    state.selectQuestion(question.id);
    state = context.render();
    state.updateDraft('Python solution');
    assert.equal(state.markSolved(completed('python', 'Python solution')), true);
    assert.deepEqual(context.render().solvedIds, [question.id]);
    context.render().setLanguage('javascript');
    state = context.render('profile-a', 'javascript');
    assert.deepEqual(state.solvedIds, [], 'the dropdown immediately filters to actual JavaScript completions');
    assert.notEqual(state.draft, 'Python solution');
    state.updateDraft('JavaScript solution');
    assert.equal(state.markSolved(completed('javascript', 'JavaScript solution')), true);
    assert.deepEqual(context.render('profile-a', 'javascript').solvedIds, [question.id]);
    assert.deepEqual(context.render().solvedIds, [question.id]);
    assert.deepEqual(readCodeMatrixPracticeState('profile-a', context.storage).solvedLanguages[questionKey], { python: true, javascript: true });
    context.unmount();
    assert.deepEqual(context.render('profile-a', 'javascript').solvedIds, [question.id]);
    assert.equal(context.render('profile-a', 'javascript').draft, 'JavaScript solution');
    assert.deepEqual(context.render('profile-a', 'java').solvedIds, []);
  } finally { await context.close(); }
});

test('edited drafts, failed cases and a previous-language callback cannot mark the new language solved', async () => {
  const context = await fixture();
  try {
    let state = context.render();
    state.selectQuestion(question.id);
    state = context.render();
    state.updateDraft('original');
    const outcome = completed('python', 'original');
    state.updateDraft('edited');
    assert.equal(state.markSolved(outcome), false, 'markSolved checks the latest draft even before rerender');
    state = context.render();
    assert.equal(state.markSolved({ ...completed('python', 'edited'), status: 'error' }), false);
    const wrong = completed('python', 'edited');
    wrong.cases[0].stdout = 'incorrect';
    assert.equal(state.markSolved(wrong), false);
    const previousMark = state.markSolved;
    state.setLanguage('javascript');
    assert.deepEqual(context.render('profile-a', 'javascript').solvedIds, []);
    assert.equal(previousMark(completed('python', 'edited')), false);
    assert.deepEqual(readCodeMatrixPracticeState('profile-a', context.storage).solvedLanguages, {});
  } finally { await context.close(); }
});

test('canonical reward history restores a legacy completion only in its actual language and preserves known solves', async () => {
  const context = await fixture();
  try {
    writeCodeMatrixPracticeState('profile-a', {
      solved: { [questionKey]: true }, solvedLanguages: { [otherKey]: { cpp: true } },
      drafts: { [questionKey]: { python: 'Python draft', javascript: 'JavaScript draft' } },
    }, context.storage);
    assert.deepEqual(context.render().solvedIds, [], 'legacy flags do not guess a completion language');
    assert.deepEqual(context.render('profile-a', 'javascript').solvedIds, [], 'a draft alone is not a solve');
    const actual = historyRow();
    context.setHandler(() => historyPayload([actual,
      { ...actual, language: 'javascript', version: 2 }, { ...actual, language: 'javascript', xp: 0 },
      { ...actual, language: 'javascript', source: 'manual' }, { ...actual, version: '1', language: 'javascript' },
      { ...actual, language: 'html' }, { ...actual, questionId: 'unknown' }, { ...actual, language: undefined },
    ]));
    context.render().openPanel();
    context.render();
    await settle();
    assert.equal(context.requests[0].path, '/api/momentum');
    assert.equal(context.requests[0].options.academicProfileId, 'profile-a');
    assert.deepEqual(context.render().solvedIds, [question.id]);
    assert.deepEqual(context.render('profile-a', 'javascript').solvedIds, []);
    assert.deepEqual(context.render('profile-a', 'cpp').solvedIds, [otherQuestion.id]);
    assert.equal(readCodeMatrixPracticeState('profile-a', context.storage).drafts[questionKey].javascript, 'JavaScript draft');
    context.unmount();
    assert.deepEqual(context.render().solvedIds, [question.id]);
  } finally { await context.close(); }
});

test('delayed restore cannot write after closing the picker, changing API scope or switching profiles', async () => {
  for (const action of ['close', 'scope', 'profile']) {
    const context = await fixture();
    try {
      let resolve;
      context.setHandler(() => new Promise((done) => { resolve = done; }));
      context.render().openPanel();
      let state = context.render();
      assert.equal(context.requests.length, 1);
      if (action === 'close') { state.closePanel(); context.render(); }
      if (action === 'scope') context.setScope('profile-b');
      if (action === 'profile') {
        writeCodeMatrixPracticeState('profile-b', { solvedLanguages: { [otherKey]: { python: true } } }, context.storage);
        state = context.render('profile-b');
        assert.deepEqual(state.solvedIds, [otherQuestion.id]);
        assert.equal(state.panelOpen, false);
        assert.equal(state.draft, null);
      }
      resolve(historyPayload([historyRow()]));
      await settle();
      assert.deepEqual(readCodeMatrixPracticeState('profile-a', context.storage).solvedLanguages, {});
      assert.deepEqual(context.render(action === 'profile' ? 'profile-b' : 'profile-a').solvedIds,
        action === 'profile' ? [otherQuestion.id] : []);
    } finally { await context.close(); }
  }
});

test('offline restoration retries on online and matching reward events only while the picker is open', async () => {
  const context = await fixture();
  try {
    context.setHandler(() => { throw Error('Offline'); });
    const closed = context.render();
    assert.equal(context.requests.length, 0);
    closed.openPanel();
    context.render();
    await settle();
    assert.deepEqual(context.render().solvedIds, []);
    context.setHandler(() => historyPayload([historyRow()]));
    context.browser.dispatchEvent(new Event('online'));
    await settle();
    assert.deepEqual(context.render().solvedIds, [question.id]);
    assert.equal(context.requests.length, 2);
    context.setHandler(() => historyPayload([historyRow(otherQuestion, 'javascript')]));
    context.browser.dispatchEvent(new CustomEvent('prepmatrix:code-reward-recorded', { detail: { academicProfileId: 'profile-b' } }));
    assert.equal(context.requests.length, 2);
    context.browser.dispatchEvent(new CustomEvent('prepmatrix:code-reward-recorded', { detail: { academicProfileId: 'profile-a' } }));
    await settle();
    assert.deepEqual(context.render('profile-a', 'javascript').solvedIds, [otherQuestion.id]);
    assert.deepEqual(context.render().solvedIds, [question.id]);
    context.render().closePanel();
    context.render();
    context.browser.dispatchEvent(new Event('online'));
    context.browser.dispatchEvent(new CustomEvent('prepmatrix:code-reward-recorded', { detail: { academicProfileId: 'profile-a' } }));
    assert.equal(context.requests.length, 3, 'closed picker removes its retry listeners');
  } finally { await context.close(); }
});
