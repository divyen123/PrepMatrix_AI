import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createServer } from 'vite';
import { CODE_MATRIX_PRACTICE_QUESTIONS } from '../utils/codeMatrixPractice.js';

const HOOKS = `
  export { lazy, Suspense } from 'react';
  let slots = [], cursor = 0, effects = [];
  const changed = (a, b) => !a || !b || a.length !== b.length || b.some((value, index) => !Object.is(value, a[index]));
  export function useState(initial) {
    const index = cursor++;
    slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
    return [slots[index].value, (next) => {
      if (slots[index]) slots[index].value = typeof next === 'function' ? next(slots[index].value) : next;
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
  export function useEffect(effect, dependencies) {
    const index = cursor++;
    if (!slots[index] || changed(slots[index].dependencies, dependencies)) effects.push(() => {
      slots[index]?.cleanup?.();
      slots[index] = { dependencies, cleanup: effect() };
    });
  }
  export function render(callback) {
    cursor = 0;
    const tree = callback();
    const pending = effects; effects = [];
    pending.forEach((effect) => effect());
    return tree;
  }
  export function unmount() { slots.forEach((slot) => slot?.cleanup?.()); slots = []; effects = []; }
`;
const FIXTURE = `
  import { CODE_MATRIX_PRACTICE_QUESTIONS } from '/src/utils/codeMatrixPractice.js';
  export const state = { active: true, suiteOutcome: null, compilerOutcome: { status: 'success', stdout: 'ok', stderr: '' },
    celebrations: [], rewards: [], solved: [], suites: [], compilerRuns: [], pending: false, complete: null };
  export const celebrateCompletion = (options) => state.celebrations.push(options);
  export const recordReward = (...args) => state.rewards.push(args);
  export const markSolved = (result) => { state.solved.push(result); return true; };
  export const usePractice = () => ({ panelOpen: state.active, question: state.active ? CODE_MATRIX_PRACTICE_QUESTIONS[0] : null,
    draft: 'student solution', solvedIds: [], storageAvailable: true, updateDraft() {}, exitPractice() {},
    markSolved, openPanel() {}, closePanel() {}, showQuestions() {}, selectQuestion() {}, resetDraft() {}, setLanguage() {} });
  function task(outcome) {
    const promise = state.pending ? new Promise((resolve) => { state.complete = resolve; }) : Promise.resolve(outcome);
    return { promise, cancel() {}, submitInput() {} };
  }
  export function createCodeMatrixPracticeRun(options) { state.suites.push(options); return task(state.suiteOutcome); }
  export function createCodeMatrixBrowserRun(options) { state.compilerRuns.push(options); return task(state.compilerOutcome); }
  export const buildCodeMatrixPreview = async () => '';
`;

let vite;
let page;
let hooks;
let state;
let previousWindow;
let previousDocument;
before(async () => {
  previousWindow = globalThis.window;
  previousDocument = globalThis.document;
  globalThis.window = new EventTarget();
  globalThis.document = { body: {}, querySelector: () => null, addEventListener() {}, removeEventListener() {} };
  const modules = { 'virtual:celebration-hooks': HOOKS, 'virtual:celebration-fixture': FIXTURE,
    'virtual:celebration-router': 'export const useLocation = () => ({ key: "test", state: null }); export const Link = () => null;' };
  vite = await createServer({
    appType: 'custom', logLevel: 'silent', server: { middlewareMode: true },
    plugins: [{
      name: 'code-matrix-celebration-fixtures', enforce: 'pre',
      resolveId(id) { return Object.hasOwn(modules, id) ? `\0${id}` : null; },
      load(id) {
        if (modules[id.slice(1)]) return modules[id.slice(1)];
        const path = id.replaceAll('\\', '/');
        if (path.endsWith('/src/components/CodeMatrixEditor.jsx')) return 'export default function CodeMatrixEditor() { return null; }';
        if (path.endsWith('/src/hooks/useCodeMatrixWorkspace.js')) return `
          import { normalizeCodeMatrixWorkspace } from '../utils/codeMatrixWorkspace.js';
          export default () => ({ workspace: normalizeCodeMatrixWorkspace({ setupDismissed: true, language: 'python',
            drafts: { python: 'normal compiler code' } }), ready: true, syncState: 'saved', update() {}, flush() {}, retry() {} });`;
        if (path.endsWith('/src/hooks/useCodeMatrixPractice.js')) return 'export { usePractice as default } from "virtual:celebration-fixture";';
        if (path.endsWith('/src/hooks/useCodeRunRewards.js')) return 'import { recordReward } from "virtual:celebration-fixture"; export default () => recordReward;';
        if (path.endsWith('/src/hooks/useCodeMatrixTracking.js')) return `const begin = () => ({}), noop = () => {}; export default () => ({ begin, finish: noop, previewError: noop, recordInput: noop, markActivity: noop, pauseActivity: noop, flush: noop });`;
        if (path.endsWith('/src/utils/apiClient.js')) return 'export default { get: async () => ({ available: false }), post: async () => ({}) };';
        return null;
      },
      transform(source, id) {
        if (!id.replaceAll('\\', '/').endsWith('/src/pages/CodeMatrixPage.jsx')) return null;
        return source.replace('from "react"', 'from "virtual:celebration-hooks"')
          .replace('from "react-router-dom"', 'from "virtual:celebration-router"')
          .replace('from "../utils/codeMatrixRuntime.js"', 'from "virtual:celebration-fixture"')
          .replace("from '../utils/codeMatrixPracticeRunner.js'", "from 'virtual:celebration-fixture'")
          .replace("from '../utils/completionCelebration.js'", "from 'virtual:celebration-fixture'");
      },
    }],
  });
  ({ default: page } = await vite.ssrLoadModule('/src/pages/CodeMatrixPage.jsx'));
  hooks = await vite.ssrLoadModule('virtual:celebration-hooks');
  ({ state } = await vite.ssrLoadModule('virtual:celebration-fixture'));
});
after(async () => {
  hooks?.unmount();
  globalThis.window = previousWindow;
  globalThis.document = previousDocument;
  await vite?.close();
});

const question = CODE_MATRIX_PRACTICE_QUESTIONS[0];
const success = () => ({ status: 'success', stdout: '', stderr: '', code: 'student solution', language: 'python',
  questionId: question.id, version: question.version, total: 5, passed: 5,
  cases: question.testCases.map((item) => ({ ...item, status: 'success', passed: true, stdout: item.expectedOutput, stderr: '' })),
});
const settle = () => new Promise((resolve) => setImmediate(resolve));
function find(tree, predicate) {
  if (!tree || typeof tree !== 'object') return null;
  if (predicate(tree)) return tree;
  for (const child of [tree.props?.children].flat(Infinity)) {
    const match = find(child, predicate);
    if (match) return match;
  }
  return null;
}
const render = () => hooks.render(() => page({ academicProfileDataId: 'celebration-test-profile', embedded: true }));
function reset(active = true) {
  hooks.unmount();
  Object.assign(state, { active, suiteOutcome: success(), pending: false, complete: null });
  for (const key of ['celebrations', 'rewards', 'solved', 'suites', 'compilerRuns']) state[key].length = 0;
  return render();
}
const editor = (tree) => find(tree, (element) => typeof element.props?.onRun === 'function' && typeof element.props?.onChange === 'function');
const button = (tree, label) => find(tree, (element) => element.type === 'button'
  && [element.props.children].flat(Infinity).some((child) => typeof child === 'string' && child.trim() === label));

test('a complete correct practice suite celebrates once and retains grading and reward behavior', async () => {
  const tree = reset();
  editor(tree).props.onRun();
  button(tree, 'Run').props.onClick();
  await settle();
  assert.equal(state.suites.length, 1, 'a duplicate callback during one run cannot start another suite');
  assert.deepEqual(state.celebrations, [{ zIndex: 14700 }]);
  assert.equal(state.solved.length, 1);
  assert.equal(state.rewards.length, 1);
  assert.deepEqual(state.rewards[0][2], { questionId: question.id, version: 1,
    results: question.testCases.map((item) => ({ id: item.id, status: 'success', stdout: item.expectedOutput })) });
  const results = find(render(), (element) => element.props?.result?.kind === 'practice');
  assert.equal(results.props.result.status, 'success');
  assert.equal(results.props.result.passed, 5);
});

test('incorrect, incomplete, failed, stopped and timed-out practice outcomes cannot celebrate or claim solved XP', async () => {
  const valid = success();
  const invalid = [
    { ...valid, status: 'error' }, { ...valid, status: 'stopped' }, { ...valid, status: 'timeout' },
    { ...valid, passed: 4 }, { ...valid, cases: valid.cases.slice(1) },
    { ...valid, version: 2 }, { ...valid, total: 0, passed: 0, cases: [] },
    { ...valid, cases: valid.cases.map((item, index) => index ? item : { ...item, stdout: 'incorrect' }) },
    { ...valid, cases: valid.cases.map((item, index) => index ? item : { ...item, status: 'error' }) },
  ];
  for (const outcome of invalid) {
    const tree = reset();
    state.suiteOutcome = outcome;
    editor(tree).props.onRun();
    await settle();
    assert.deepEqual(state.celebrations, []);
    assert.deepEqual(state.solved, []);
    assert.deepEqual(state.rewards, []);
  }
});

test('successful practice Debug and plain compiler runs do not celebrate', async () => {
  const practiceTree = reset();
  button(practiceTree, 'Debug').props.onClick();
  await settle();
  assert.equal(state.compilerRuns.length, 1);
  assert.equal(state.compilerRuns[0].debug, true);
  assert.deepEqual(state.celebrations, []);
  assert.deepEqual(state.solved, []);
  assert.deepEqual(state.rewards, []);
  const compilerTree = reset(false);
  editor(compilerTree).props.onRun();
  await settle();
  assert.equal(state.compilerRuns.length, 1);
  assert.deepEqual(state.celebrations, []);
  assert.equal(state.rewards.length, 1, 'successful compiler runs retain their existing reward behavior');
  assert.equal(state.rewards[0].length, 2);
});

test('cancelling a pending suite suppresses celebration even if its completion arrives later', async () => {
  const tree = reset();
  state.pending = true;
  editor(tree).props.onRun();
  const finish = state.complete;
  button(render(), 'Stop').props.onClick();
  finish(success());
  await settle();
  assert.deepEqual(state.celebrations, []);
  assert.deepEqual(state.solved, []);
  assert.deepEqual(state.rewards, []);
});
