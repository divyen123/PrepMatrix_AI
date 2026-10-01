import assert from 'node:assert/strict';
import test from 'node:test';
import { CODE_MATRIX_PRACTICE_QUESTIONS } from './codeMatrixPractice.js';
import { createCodeMatrixPracticeRun } from './codeMatrixPracticeRunner.js';
import { CODE_MATRIX_LIMITS } from './codeMatrixRuntime.js';

const question = CODE_MATRIX_PRACTICE_QUESTIONS[0];
const code = 'student solution';

test('compiled practice uses one suite for Java, C and C++ and grades every independent output', async () => {
  for (const language of ['java', 'c', 'cpp']) {
    let calls = 0;
    const events = [];
    const outcomes = question.testCases.map((testCase) => ({ status: 'success', stdout: testCase.expectedOutput, stderr: '' }));
    const task = createCodeMatrixPracticeRun({ question, language, code, onEvent: (event) => events.push(event),
      createSuiteRun(options) {
        calls += 1;
        assert.equal(options.language, language);
        assert.equal(options.code, code);
        assert.deepEqual(options.inputs, question.testCases.map((testCase) => testCase.input));
        return { cancel() {}, promise: Promise.resolve().then(() => {
          outcomes.forEach((result, index) => {
            options.onEvent({ type: 'case-start', index });
            options.onEvent({ type: 'case-result', index, result });
          });
          return { status: 'success', cases: outcomes };
        }) };
      },
    });
    const result = await task.promise;
    assert.equal(calls, 1);
    assert.equal(result.status, 'success');
    assert.equal(result.passed, 5);
    assert.equal(events.filter((event) => event.type === 'case-start').length, 5);
    assert.equal(events.filter((event) => event.type === 'case-result').length, 5, 'final report does not repeat streamed cases');
  }
});

test('suite watchdog allows each case its loading and execution budgets instead of cutting off the fifth case', async (t) => {
  const deadlines = [];
  t.mock.method(globalThis, 'setTimeout', (_callback, milliseconds) => { deadlines.push(milliseconds); return 1; });
  t.mock.method(globalThis, 'clearTimeout', () => {});
  const outcomes = question.testCases.map((testCase) => ({ status: 'success', stdout: testCase.expectedOutput }));
  const task = createCodeMatrixPracticeRun({ question, language: 'java', code,
    createSuiteRun() { return { cancel() {}, promise: Promise.resolve({ status: 'success', cases: outcomes }) }; },
  });
  assert.equal((await task.promise).status, 'success');
  assert.equal(deadlines[0], question.testCases.length * (CODE_MATRIX_LIMITS.bootMs + CODE_MATRIX_LIMITS.runMs));
});

test('compiled suite cannot pass wrong output, missing cases or a failed terminal status', async () => {
  const correct = question.testCases.map((testCase) => ({ status: 'success', stdout: testCase.expectedOutput }));
  for (const outcome of [
    { status: 'success', cases: correct.map((item, index) => index === 4 ? { ...item, stdout: 'wrong' } : item) },
    { status: 'success', cases: correct.slice(0, 4) },
    { status: 'error', cases: correct, stderr: 'Worker failed after execution' },
  ]) {
    const task = createCodeMatrixPracticeRun({ question, language: 'java', code,
      createSuiteRun() { return { cancel() {}, promise: Promise.resolve(outcome) }; },
    });
    assert.equal((await task.promise).status, 'error');
  }
});

test('compiled cancellation and deadline preserve completed cases and skip the remainder', async () => {
  for (const action of ['cancel', 'timeout']) {
    let cancellations = 0;
    let begin;
    const begun = new Promise((resolve) => { begin = resolve; });
    const task = createCodeMatrixPracticeRun({ question, language: 'java', code, suiteTimeoutMs: action === 'timeout' ? 5 : undefined,
      createSuiteRun(options) {
        const promise = Promise.resolve().then(() => {
          options.onEvent({ type: 'case-start', index: 0 });
          options.onEvent({ type: 'case-result', index: 0, result: { status: 'success', stdout: question.testCases[0].expectedOutput } });
          options.onEvent({ type: 'case-start', index: 1 });
          begin();
          return new Promise(() => {});
        });
        return { promise, cancel() { cancellations += 1; } };
      },
    });
    await begun;
    if (action === 'cancel') task.cancel();
    const result = await task.promise;
    assert.equal(result.status, action === 'cancel' ? 'stopped' : 'timeout');
    assert.equal(result.passed, 1);
    assert.equal(result.cases[1].status, result.status);
    assert.ok(result.cases.slice(2).every((testCase) => testCase.status === 'skipped'));
    assert.equal(cancellations, 1);
  }
});

test('runner executes every supplied input sequentially in a fresh noninteractive runtime and reports progress', async () => {
  const events = [];
  let active = 0;
  let calls = 0;
  const task = createCodeMatrixPracticeRun({ question, language: 'python', code, onEvent: (event) => events.push(event),
    createRun(options) {
      const index = calls++;
      assert.equal(active++, 0);
      assert.equal(options.input, question.testCases[index].input);
      assert.equal(options.interactive, false);
      assert.equal(options.code, code);
      assert.equal(options.language, 'python');
      options.onEvent({ type: 'status', status: 'loading', message: 'Loading' });
      return { cancel() {}, promise: Promise.resolve().then(() => {
        active -= 1;
        return { status: 'success', stdout: question.testCases[index].expectedOutput.replace(/\n/gu, ' \r\n'), stderr: '' };
      }) };
    },
  });
  const result = await task.promise;
  assert.equal(calls, 5);
  assert.equal(result.status, 'success');
  assert.equal(result.passed, 5);
  assert.equal(result.total, 5);
  assert.equal(result.code, code);
  assert.equal(result.language, 'python');
  assert.equal(result.questionId, question.id);
  assert.equal(result.version, 1);
  assert.ok(Number.isFinite(result.durationMs));
  assert.ok(result.cases.every((item) => item.passed));
  assert.deepEqual(events.filter((event) => event.type === 'case-result').map((event) => event.passed), [1, 2, 3, 4, 5]);
  assert.equal(events.filter((event) => event.type === 'case-start').length, 5);
  assert.equal(events.filter((event) => event.type === 'status').length, 5);
  task.cancel();
});

test('wrong output and runtime errors cannot pass even when a runtime exits successfully or prints expected output', async () => {
  let calls = 0;
  const run = createCodeMatrixPracticeRun({ question, language: 'javascript', code,
    createRun() {
      const index = calls++;
      return { cancel() {}, promise: Promise.resolve(index === 0
        ? { status: 'success', stdout: 'wrong', stderr: '' }
        : { status: index === 1 ? 'error' : 'success', stdout: question.testCases[index].expectedOutput, stderr: index === 1 ? 'boom' : '' }) };
    },
  });
  const result = await run.promise;
  assert.equal(calls, 5);
  assert.equal(result.status, 'error');
  assert.equal(result.passed, 3);
  assert.equal(result.cases[0].status, 'success');
  assert.equal(result.cases[0].passed, false);
  assert.equal(result.cases[1].status, 'error');
  assert.equal(result.cases[1].passed, false);
  assert.equal(result.stderr, 'boom');
});

test('cancel settles immediately, cancels current runtime, and schedules no additional cases', async () => {
  let calls = 0;
  let cancellations = 0;
  let begin;
  const begun = new Promise((resolve) => { begin = resolve; });
  const run = createCodeMatrixPracticeRun({ question, language: 'python', code,
    createRun() {
      calls += 1;
      begin();
      return { promise: new Promise(() => {}), cancel() { cancellations += 1; } };
    },
  });
  await begun;
  run.cancel();
  run.cancel();
  const result = await run.promise;
  assert.equal(result.status, 'stopped');
  assert.equal(result.passed, 0);
  assert.equal(calls, 1);
  assert.equal(cancellations, 1);
  assert.equal(result.cases[0].status, 'stopped');
  assert.ok(result.cases.slice(1).every((item) => item.status === 'skipped' && !item.passed));
});

test('cancel before scheduling prevents runtime creation and a case-result observer can cancel remaining work', async () => {
  let calls = 0;
  const createRun = () => {
    const index = calls++;
    return { promise: Promise.resolve({ status: 'success', stdout: question.testCases[index].expectedOutput }), cancel() {} };
  };
  const immediate = createCodeMatrixPracticeRun({ question, language: 'python', code, createRun });
  immediate.cancel();
  assert.equal((await immediate.promise).status, 'stopped');
  assert.equal(calls, 0);
  const afterFirst = createCodeMatrixPracticeRun({ question, language: 'python', code, createRun,
    onEvent(event) { if (event.type === 'case-result') afterFirst.cancel(); },
  });
  const result = await afterFirst.promise;
  assert.equal(result.status, 'stopped');
  assert.equal(result.passed, 1);
  assert.equal(calls, 1);
});

test('runtime timeout cannot pass and whole-suite deadline settles even an unresponsive runtime', async () => {
  let calls = 0;
  const timeout = createCodeMatrixPracticeRun({ question, language: 'python', code,
    createRun() { calls += 1; return { promise: Promise.resolve({ status: 'timeout', stdout: question.testCases[0].expectedOutput }), cancel() {} }; },
  });
  const timedResult = await timeout.promise;
  assert.equal(timedResult.status, 'timeout');
  assert.equal(timedResult.passed, 0);
  assert.equal(calls, 1);
  let cancellations = 0;
  const deadline = createCodeMatrixPracticeRun({ question, language: 'python', code, suiteTimeoutMs: 5,
    createRun() { return { promise: new Promise(() => {}), cancel() { cancellations += 1; } }; },
  });
  const result = await deadline.promise;
  assert.equal(result.status, 'timeout');
  assert.equal(result.passed, 0);
  assert.equal(cancellations, 1);
  assert.match(result.stderr, /suite exceeded/u);
});

test('observer errors and thrown or rejected runtime failures produce bounded complete reports', async () => {
  let calls = 0;
  const run = createCodeMatrixPracticeRun({ question, language: 'java', code, onEvent() { throw Error('UI'); },
    createRun() {
      const index = calls++;
      if (index === 0) throw Error('Could not load compiler');
      return { cancel() {}, promise: Promise.reject(Error('Worker failed')) };
    },
  });
  const result = await run.promise;
  assert.equal(result.status, 'error');
  assert.equal(result.total, 5);
  assert.equal(result.passed, 0);
  assert.equal(calls, 5);
  assert.equal(result.cases[0].stderr, 'Could not load compiler');
  assert.ok(result.cases.slice(1).every((item) => item.stderr === 'Worker failed'));
});

test('invalid questions, unsupported languages and oversized code never start a runtime', async () => {
  let calls = 0;
  const createRun = () => { calls += 1; throw Error('Must not execute'); };
  for (const options of [
    { question: null, language: 'python', code },
    { question, language: 'html', code },
    { question, language: 'python', code: 'x'.repeat(50_001) },
    { question, language: 'python', code: '💡'.repeat(12_501) },
    { question: { ...question, testCases: [] }, language: 'python', code },
    { question: { ...question, testCases: [null] }, language: 'python', code },
    { question: { ...question, testCases: [question.testCases[0], question.testCases[0]] }, language: 'python', code },
  ]) {
    const result = await createCodeMatrixPracticeRun({ ...options, createRun }).promise;
    assert.equal(result.status, 'error');
    assert.equal(result.passed, 0);
  }
  assert.equal(calls, 0);
});
