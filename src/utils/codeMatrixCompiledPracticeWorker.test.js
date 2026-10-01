import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { prepareCodeMatrixCompiler } from './codeMatrixCompilers.js';
import { buildCodeMatrixCompiledPracticeWorkerSource } from './codeMatrixCompiledPracticeWorker.js';

function workerFixture(prepareCompiler, inputs, autoRun = true) {
  const messages = [];
  let resolve;
  let reject;
  const result = new Promise((done, fail) => { resolve = done; reject = fail; });
  const port = { onmessage: null, closed: false, start() {}, close() { this.closed = true; },
    postMessage(message) {
      messages.push(structuredClone(message));
      if (message.type === 'case-ready' && autoRun) queueMicrotask(() => {
        Promise.resolve(port.onmessage({ data: { type: 'run', index: message.index } })).catch(reject);
      });
      if (message.type === 'result') resolve(structuredClone(message.result));
    },
  };
  // Replace only the explicitly serialized compiler dependency. The worker's
  // actual message protocol and case-state logic still execute unchanged.
  const source = buildCodeMatrixCompiledPracticeWorkerSource();
  const injected = source.replace(prepareCodeMatrixCompiler.toString(), '__prepareCompilerFixture');
  assert.notEqual(injected, source);
  const scope = vm.createContext({ __prepareCompilerFixture: prepareCompiler, performance, setTimeout, clearTimeout, addEventListener() {} });
  vm.runInContext(injected, scope);
  const connected = scope.onmessage({ data: { type: 'connect', job: { language: 'java', code: 'student source', inputs } }, ports: [port] });
  return { messages, port, result, connected };
}

test('compiled worker prepares the source once and recreates execution plus stdin/output state for all five cases', async () => {
  let compilations = 0;
  let preparations = 0;
  let executions = 0;
  const inputs = ['one\n\n', 'two\n', 'three\n', 'four\n', 'five\n'];
  const worker = workerFixture(async ({ job, append, readLine, reusable }) => {
    assert.equal(job.code, 'student source');
    assert.equal(reusable, true);
    compilations += 1;
    append('stderr', 'compiler note\n');
    return async () => {
      preparations += 1;
      let localCounter = 0;
      return async () => {
        executions += 1;
        const lines = [];
        for (let line = readLine(); line !== null; line = readLine()) lines.push(line);
        append('stdout', `${++localCounter}:${lines.join('|')}\n`);
      };
    };
  }, inputs);
  const result = await worker.result;
  assert.equal(result.status, 'success');
  assert.equal(compilations, 1);
  assert.equal(preparations, 5);
  assert.equal(executions, 5);
  const cases = worker.messages.filter((message) => message.type === 'case-result');
  assert.deepEqual(cases.map((message) => message.result.stdout), ['1:one|\n', '1:two\n', '1:three\n', '1:four\n', '1:five\n']);
  assert.equal(cases[0].result.stderr, 'compiler note\n');
  assert.ok(cases.slice(1).every((message) => message.result.stderr === ''));
  assert.equal(worker.messages.filter((message) => message.type === 'compiling').length, 1);
  assert.deepEqual(worker.messages.filter((message) => message.type === 'case-ready').map((message) => message.index), [0, 1, 2, 3, 4]);
  assert.ok(worker.port.closed);
});

test('compile or case preparation failures retain diagnostic details and stop scheduling', async () => {
  let compileCalls = 0;
  const compilation = workerFixture(async ({ append }) => {
    compileCalls += 1;
    append('stderr', 'Main.java:4: syntax error\n');
    throw Error('Java compilation failed');
  }, ['a', 'b']);
  const result = await compilation.result;
  assert.equal(result.status, 'error');
  assert.match(result.stderr, /Main\.java:4: syntax error/u);
  assert.match(result.stderr, /Java compilation failed/u);
  assert.equal(compileCalls, 1);
  assert.equal(compilation.messages.filter((message) => message.type === 'case-ready').length, 0);
  assert.ok(compilation.port.closed);
  let preparations = 0;
  const preparation = workerFixture(async ({ append }) => async () => {
    if (++preparations === 2) throw Error('VM preparation failed');
    return async () => append('stdout', 'first case\n');
  }, ['a', 'b', 'c']);
  const failed = await preparation.result;
  assert.equal(failed.status, 'error');
  assert.match(failed.stderr, /VM preparation failed/u);
  assert.equal(preparations, 2);
  assert.equal(preparation.messages.filter((message) => message.type === 'case-result').length, 1);
  assert.ok(preparation.port.closed);
});

test('an execution failure cannot contaminate subsequent case outputs or hide the failed suite status', async () => {
  let prepared = 0;
  const worker = workerFixture(async ({ append }) => async () => {
    const index = prepared++;
    return async () => {
      append('stdout', `case ${index}\n`);
      if (index === 1) throw Error('student runtime error');
    };
  }, ['a', 'b', 'c']);
  const result = await worker.result;
  assert.equal(result.status, 'error');
  const cases = worker.messages.filter((message) => message.type === 'case-result');
  assert.deepEqual(cases.map((message) => message.result.status), ['success', 'error', 'success']);
  assert.deepEqual(cases.map((message) => message.result.stdout), ['case 0\n', 'case 1\n', 'case 2\n']);
  assert.match(cases[1].result.stderr, /student runtime error/u);
  assert.equal(cases[2].result.stderr, '');
});

test('early, duplicate or out-of-order run requests execute each prepared case only once', async () => {
  let releaseCompiler;
  let executed = 0;
  const worker = workerFixture(() => new Promise((resolve) => { releaseCompiler = resolve; }), ['a', 'b'], false);
  await worker.port.onmessage({ data: { type: 'run', index: 0 } });
  assert.equal(executed, 0);
  releaseCompiler(async () => async () => { executed += 1; });
  await worker.connected;
  await worker.port.onmessage({ data: { type: 'run', index: 1 } });
  const first = worker.port.onmessage({ data: { type: 'run', index: 0 } });
  await worker.port.onmessage({ data: { type: 'run', index: 0 } });
  await first;
  assert.equal(executed, 1);
  await worker.port.onmessage({ data: { type: 'run', index: 0 } });
  await worker.port.onmessage({ data: { type: 'run', index: 1 } });
  assert.equal((await worker.result).status, 'success');
  assert.equal(executed, 2);
  assert.deepEqual(worker.messages.filter((message) => message.type === 'case-result').map((message) => message.index), [0, 1]);
});

test('the current case publishes partial output while execution is pending and clears it for the next case', async () => {
  let prepared = 0;
  let release;
  const worker = workerFixture(async ({ append, readLine }) => async () => {
    const index = prepared++;
    return async () => {
      append('stdout', `${index}:${readLine()}\n`);
      if (index === 0) {
        await new Promise((resolve) => setTimeout(resolve, 5));
        append('stdout', 'waiting\n');
        await new Promise((resolve) => { release = resolve; });
        throw Error('input exhausted');
      }
    };
  }, ['first', 'second']);
  await worker.connected;
  await new Promise((resolve) => setTimeout(resolve, 90));
  assert.ok(worker.messages.some((message) => message.type === 'snapshot' && message.index === 0 && message.result.stdout.includes('waiting\n')));
  assert.equal(worker.messages.some((message) => message.type === 'case-result'), false);
  release();
  assert.equal((await worker.result).status, 'error');
  const cases = worker.messages.filter((message) => message.type === 'case-result');
  assert.equal(cases[0].result.stdout, '0:first\nwaiting\n');
  assert.match(cases[0].result.stderr, /input exhausted/u);
  assert.equal(cases[1].result.stdout, '1:second\n');
  assert.equal(cases[1].result.stderr, '');
  assert.ok(worker.messages.filter((message) => message.type === 'snapshot' && message.index === 1).every((message) => !message.result.stdout.includes('first') && message.result.stderr === ''));
  assert.ok(worker.port.closed);
});
