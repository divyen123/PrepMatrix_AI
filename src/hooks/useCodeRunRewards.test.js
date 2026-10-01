import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createServer } from 'vite';
import { CODE_MATRIX_PRACTICE_QUESTIONS } from '../utils/codeMatrixPractice.js';
import { createCodeMatrixPracticeRun } from '../utils/codeMatrixPracticeRunner.js';
import { codeRewardOutbox } from '../utils/codeRewardOutbox.js';
import { validatePracticeReward } from '../../server/momentumService.js';

const HOOKS_FIXTURE = `
  export { createElement } from 'react';
  let slots = [], cursor = 0, effects = [];
  const changed = (previous, next) => !previous || previous.length !== next.length || next.some((value, index) => !Object.is(value, previous[index]));
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
    const result = callback();
    const pending = effects; effects = [];
    pending.forEach((effect) => effect());
    return result;
  }
  export function unmount() {
    slots.forEach((slot) => slot?.cleanup?.());
    slots = []; effects = [];
  }
`;
const API_FIXTURE = `
  let scope = '', postHandler = async () => ({ awardedXp: 0 });
  export const requests = [];
  export const getApiAcademicProfileScope = () => scope;
  export const setScope = (value) => { scope = value; };
  export const setPostHandler = (handler) => { postHandler = handler; };
  export default { async post(path, run, options) {
    const request = { path, run: structuredClone(run), options };
    requests.push(request);
    return postHandler(request);
  } };
`;

async function fixture() {
  const modules = {
    'virtual:code-reward-hooks': HOOKS_FIXTURE,
    'virtual:code-reward-api': API_FIXTURE,
    'virtual:code-reward-toast': 'export const notifications = []; export const toast = { success(content, options) { notifications.push({ content, options }); } };',
    'virtual:code-reward-icon': 'export const Code2 = () => null;',
  };
  const vite = await createServer({
    configFile: false, appType: 'custom', logLevel: 'silent', server: { middlewareMode: true },
    plugins: [{
      name: 'code-reward-hook-test-fixtures', enforce: 'pre',
      resolveId(id) { return Object.hasOwn(modules, id) ? `\0${id}` : null; },
      load(id) { return modules[id.slice(1)] ?? null; },
      transform(source, id) {
        if (!id.replaceAll('\\', '/').endsWith('/src/hooks/useCodeRunRewards.js')) return null;
        return source.replace("from 'react'", "from 'virtual:code-reward-hooks'")
          .replace("from '../utils/apiClient'", "from 'virtual:code-reward-api'")
          .replace("from '../utils/toast'", "from 'virtual:code-reward-toast'")
          .replace("from 'lucide-react'", "from 'virtual:code-reward-icon'");
      },
    }],
  });
  const previousWindow = globalThis.window;
  const rows = new Map();
  const storage = { get length() { return rows.size; }, key: (index) => [...rows.keys()][index],
    getItem: (key) => rows.get(key) ?? null, setItem: (key, value) => rows.set(key, value), removeItem: (key) => rows.delete(key) };
  const browser = new EventTarget();
  const intervals = new Map();
  let intervalId = 0;
  browser.localStorage = storage;
  browser.setInterval = (callback) => { intervals.set(++intervalId, callback); return intervalId; };
  browser.clearInterval = (id) => intervals.delete(id);
  const events = [];
  for (const name of ['prepmatrix:momentum-updated', 'prepmatrix:code-reward-recorded']) {
    browser.addEventListener(name, (event) => events.push({ name, detail: event.detail }));
  }
  globalThis.window = browser;
  try {
    const [{ default: useCodeRunRewards }, hooks, api, toasts] = await Promise.all([
      vite.ssrLoadModule('/src/hooks/useCodeRunRewards.js'),
      vite.ssrLoadModule('virtual:code-reward-hooks'),
      vite.ssrLoadModule('virtual:code-reward-api'),
      vite.ssrLoadModule('virtual:code-reward-toast'),
    ]);
    return { ...api, ...toasts, browser, storage, events, intervals,
      render(profileId) { api.setScope(profileId); return hooks.render(() => useCodeRunRewards(profileId)); },
      unmount: hooks.unmount,
      async close() { hooks.unmount(); globalThis.window = previousWindow; await vite.close(); },
    };
  } catch (error) { globalThis.window = previousWindow; await vite.close(); throw error; }
}

const settle = async () => { await new Promise((resolve) => setImmediate(resolve)); };
const question = CODE_MATRIX_PRACTICE_QUESTIONS[0];
const evidence = () => ({ questionId: question.id, version: question.version,
  results: question.testCases.map(({ id, expectedOutput }) => ({ id, status: 'success', stdout: expectedOutput })) });
const award = (duplicate = false) => ({ awardedXp: 10, duplicate, source: 'practice',
  questionId: question.id, version: question.version, title: question.title });
const contentText = (element) => typeof element === 'string' ? element
  : Array.isArray(element) ? element.map(contentText).join(' ') : contentText(element?.props?.children || '');

test('practice engine evidence produces confirmation and a bottom-right toast only after server acceptance', async () => {
  const context = await fixture();
  try {
    const outcome = await createCodeMatrixPracticeRun({ question, language: 'python', code: 'student solution',
      createRun: ({ input, interactive }) => {
        assert.equal(interactive, false);
        const testCase = question.testCases.find((item) => item.input === input);
        return { cancel() {}, promise: Promise.resolve({ status: 'success', stdout: `${testCase.expectedOutput.trim()}  \r\n\r\n` }) };
      } }).promise;
    assert.equal(outcome.status, 'success');
    const practice = { questionId: outcome.questionId, version: outcome.version,
      results: outcome.cases.map(({ id, status, stdout }) => ({ id, status, stdout })) };
    let confirm;
    context.setPostHandler(({ run }) => {
      assert.equal(validatePracticeReward(run.practice, run.language).id, question.id);
      return new Promise((resolve) => { confirm = resolve; });
    });
    const runId = randomUUID();
    const record = context.render('profile-a');
    record(runId, 'python', practice);
    await settle();
    assert.equal(context.requests.length, 1);
    assert.equal(context.events.length, 0);
    assert.equal(context.notifications.length, 0);
    assert.equal(codeRewardOutbox('profile-a', context.storage).read()[0].runId, runId);
    confirm(award());
    await settle();
    assert.equal(context.notifications.length, 1);
    assert.match(contentText(context.notifications[0].content), /\+10 XP/u);
    assert.ok(contentText(context.notifications[0].content).includes(question.title));
    assert.equal(context.notifications[0].options.position, 'bottom-right');
    assert.deepEqual(context.events.find((event) => event.name === 'prepmatrix:code-reward-recorded').detail, {
      academicProfileId: 'profile-a', runId, questionId: question.id, version: question.version, awardedXp: 10, duplicate: false,
    });
    assert.deepEqual(codeRewardOutbox('profile-a', context.storage).read(), []);
  } finally { await context.close(); }
});

test('an offline practice award retries with the same run ID after remount and never claims XP early', async () => {
  const context = await fixture();
  try {
    const runId = randomUUID();
    context.setPostHandler(() => { throw new Error('Offline'); });
    context.render('profile-a')(runId, 'python', evidence());
    await settle();
    assert.equal(context.notifications.length, 0);
    assert.equal(context.events.length, 0);
    context.unmount();
    assert.equal(context.intervals.size, 0);
    context.setPostHandler(() => award());
    context.render('profile-a');
    await settle();
    assert.deepEqual(context.requests.map(({ run }) => run.runId), [runId, runId]);
    assert.equal(context.notifications.length, 1);
    assert.equal(context.storage.length, 0);
  } finally { await context.close(); }
});

test('replayed awards refresh totals without repeating the XP toast, including older duplicate response amounts', async () => {
  const context = await fixture();
  try {
    const run = { runId: randomUUID(), language: 'python', practice: evidence() };
    codeRewardOutbox('profile-a', context.storage).add(run);
    context.setPostHandler(() => award(true));
    context.render('profile-a');
    await settle();
    assert.equal(context.notifications.length, 0);
    assert.equal(context.events.filter((event) => event.name === 'prepmatrix:momentum-updated').length, 1);
    assert.equal(context.events.find((event) => event.name === 'prepmatrix:code-reward-recorded').detail.duplicate, true);
    assert.equal(context.storage.length, 0);
  } finally { await context.close(); }
});

test('changing profiles keeps each queue scoped and suppresses an old profile award toast', async () => {
  const context = await fixture();
  try {
    let confirmOld;
    context.setPostHandler(({ options }) => options.academicProfileId === 'profile-a'
      ? new Promise((resolve) => { confirmOld = resolve; }) : award());
    const oldRunId = randomUUID();
    context.render('profile-a')(oldRunId, 'python', evidence());
    const newRunId = randomUUID();
    context.render('profile-b')(newRunId, 'python', evidence());
    await settle();
    assert.deepEqual(context.requests.map(({ options }) => options.academicProfileId), ['profile-a', 'profile-b']);
    assert.equal(context.notifications.length, 1);
    assert.equal(context.notifications[0].options.toastId, `code-xp-${newRunId}`);
    confirmOld(award());
    await settle();
    assert.equal(context.notifications.length, 1);
    assert.equal(context.storage.length, 0);
    const confirmation = context.events.find((event) => event.detail.runId === oldRunId);
    assert.equal(confirmation.detail.academicProfileId, 'profile-a');
  } finally { await context.close(); }
});

test('incorrect output with successful runtime status never produces a confirmation or XP toast', async () => {
  const context = await fixture();
  try {
    context.setPostHandler(({ run }) => validatePracticeReward(run.practice, run.language));
    const practice = evidence();
    practice.results[0].stdout = 'incorrect output';
    context.render('profile-a')(randomUUID(), 'python', practice);
    await settle();
    assert.equal(context.requests.length, 1);
    assert.equal(context.notifications.length, 0);
    assert.equal(context.events.length, 0);
    assert.equal(context.storage.length, 0);
  } finally { await context.close(); }
});
