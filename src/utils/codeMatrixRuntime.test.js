import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {
  createCodeMatrixBrowserRun,
  buildCodeMatrixRuntimeCsp,
  serializeCodeMatrixScriptData,
  CODE_MATRIX_LIMITS as limits,
} from './codeMatrixRuntime.js';
import {
  buildCodeMatrixWorkerSource,
  createCodeMatrixLineReader,
  normalizeCodeMatrixResult,
} from './codeMatrixWorkerSource.js';

test('stdin preserves blank lines, normalizes line endings and returns null at EOF', () => {
  const read = createCodeMatrixLineReader('one\r\n\r\ntwo\rthree\n');
  assert.deepEqual(Array.from({ length: 6 }, read), ['one', '', 'two', 'three', null, null]);
  assert.equal(createCodeMatrixLineReader('')(), null);
  const blank = createCodeMatrixLineReader('\n');
  assert.equal(blank(), '');
  assert.equal(blank(), null);
});

test('script data round trips hostile end tags, comments and Unicode without HTML delimiters', () => {
  const hostile = { source: '</ScRiPt><script>parent.compromised=true</script><!--\u2028\u2029&', css: '</style>' };
  const serialized = serializeCodeMatrixScriptData(hostile);
  assert.doesNotMatch(serialized, /[<>&\u2028\u2029]/);
  assert.deepEqual(JSON.parse(serialized), hostile);
  assert.equal(vm.runInNewContext(`(${serialized}).source`), hostile.source);
});

test('CSP allows only exact pinned assets and denies app/network sources', () => {
  for (const language of ['javascript', 'python', 'sql']) {
    const csp = buildCodeMatrixRuntimeCsp(language);
    const directives = Object.fromEntries(csp.split(';').filter((part) => part.trim()).map((part) => {
      const [name, ...values] = part.trim().split(/\s+/);
      return [name, values];
    }));
    assert.deepEqual(directives['default-src'], ["'none'"]);
    assert.deepEqual(directives['worker-src'], ['blob:']);
    assert.deepEqual(directives['form-action'], ["'none'"]);
    assert.doesNotMatch(csp, /'self'|\*|\/api|allow-same-origin/);
    const urls = [...directives['script-src'], ...directives['connect-src']].filter((value) => value.startsWith('https:'));
    for (const url of urls) {
      assert.match(url, /^https:\/\/cdn\.jsdelivr\.net\/(pyodide\/v0\.27\.7\/full\/(pyodide\.(js|asm\.js|asm\.wasm)|python_stdlib\.zip|pyodide-lock\.json)|npm\/sql\.js@1\.13\.0\/dist\/sql-wasm\.(js|wasm))$/);
    }
    if (language === 'javascript') assert.deepEqual(directives['connect-src'], ["'none'"]);
  }
});

test('untrusted results are bounded, typed and safe for prototype-like local names', () => {
  const result = normalizeCodeMatrixResult({
    status: 'unknown', durationMs: Infinity, stdout: 'x'.repeat(100_000), stderr: 42,
    tables: Array.from({ length: 20 }, () => ({
      columns: Array.from({ length: 70 }, (_, i) => `column${i}`),
      values: Array.from({ length: 210 }, () => Array(70).fill('y'.repeat(5000))),
    })),
    trace: Array.from({ length: 250 }, () => ({ line: 3, locals: JSON.parse('{"__proto__":"safe","x":"value"}') })),
  });
  assert.equal(result.status, 'error');
  assert.equal(result.durationMs, 0);
  assert.equal(result.stdout.length, limits.outputChars);
  assert.match(result.stdout, /\[truncated\]$/);
  assert.equal(result.stderr, '');
  assert.ok(result.tables.length <= limits.tables);
  let cells = 0;
  let chars = 0;
  for (const table of result.tables) {
    assert.ok(table.columns.length <= limits.columns);
    assert.ok(table.values.length <= limits.rows);
    chars += table.columns.join('').length;
    for (const row of table.values) {
      assert.equal(row.length, table.columns.length);
      cells += row.length;
      for (const value of row) {
        assert.ok(value.length <= limits.cellChars);
        chars += value.length;
      }
    }
  }
  assert.ok(chars <= limits.tableChars);
  assert.ok(cells <= limits.cells);
  assert.equal(result.trace.length, limits.traceEntries);
  assert.equal(Object.getPrototypeOf(result.trace[0].locals), null);
  assert.equal(result.trace[0].locals.__proto__, 'safe');
  assert.equal({}.safe, undefined);
});

async function runWorker(job, overrides = {}) {
  const messages = [];
  let finish;
  const result = new Promise((done) => { finish = done; });
  const port = {
    onmessage: null, start() {}, close() {},
    postMessage(message) {
      messages.push(structuredClone(message));
      if (message.type === 'ready') queueMicrotask(() => port.onmessage({ data: { type: 'run' } }));
      if (message.type === 'result') finish(structuredClone(message.result));
    },
  };
  const scope = vm.createContext({ performance, TextDecoder, Uint8Array, setTimeout, clearTimeout, addEventListener() {}, ...overrides });
  vm.runInContext(buildCodeMatrixWorkerSource(), scope);
  await scope.onmessage({ data: { type: 'connect', job: { input: '', debug: false, ...job } }, ports: [port] });
  return { result: await result, messages };
}

test('worker publishes the last output chunk while an asynchronous program is still waiting', async () => {
  const { result, messages } = await runWorker({ language: 'javascript', code: `
    console.log('Starting');
    await new Promise(resolve => setTimeout(resolve, 5));
    console.log('Next prompt');
    await new Promise(resolve => setTimeout(resolve, 100));
  ` });
  assert.equal(result.status, 'success');
  assert.ok(messages.some(message => message.type === 'snapshot' && message.result.stdout.includes('Next prompt')));
});

test('worker executes async JavaScript, input, console streams and returns', async () => {
  const { result } = await runWorker({ language: 'javascript', input: 'Ada\n7\n', code: `
    print(prompt('Name:'));
    console.warn('warning');
    console.error('error output');
    const n = Number(readLine());
    console.log(readLine());
    await new Promise(resolve => setTimeout(resolve, 1));
    return n * 6;
  ` });
  assert.equal(result.status, 'success');
  assert.equal(result.stdout, 'Name:Ada\nnull\n42\n');
  assert.equal(result.stderr, 'warning\nerror output\n');
});

test('worker preserves prior output on syntax/runtime errors and rejects async failures', async () => {
  for (const code of ['print("before"); throw new Error("boom");', 'print("before"); await Promise.reject(new Error("boom"));']) {
    const { result } = await runWorker({ language: 'javascript', code });
    assert.equal(result.status, 'error');
    assert.equal(result.stdout, 'before\n');
    assert.match(result.stderr, /boom/);
  }
  const { result } = await runWorker({ language: 'javascript', code: 'let =' });
  assert.equal(result.status, 'error');
  assert.match(result.stderr, /SyntaxError/);
});

test('worker output is bounded and inspects cycles without invoking getters/toJSON', async () => {
  const { result, messages } = await runWorker({ language: 'javascript', code: `
    const x = { get value() { throw Error('getter ran'); }, toJSON() { throw Error('toJSON ran'); } };
    x.self = x;
    console.log(x);
    for (let i = 0; i < 1000; i++) print('a'.repeat(1000));
  ` });
  assert.equal(result.status, 'success');
  assert.equal(result.stdout.length, limits.outputChars);
  assert.match(result.stdout, /\[Circular\]/);
  assert.match(result.stdout, /\[Getter\]/);
  assert.match(result.stdout, /\[truncated\]$/);
  assert.ok(messages.length < 20, 'snapshots are throttled, not one message per console call');
});

test('worker runtime download failure is an error before execution', async () => {
  const { result, messages } = await runWorker({ language: 'python', code: 'print(1)' }, {
    importScripts() { throw new Error('CDN unavailable'); },
  });
  assert.equal(result.status, 'error');
  assert.equal(result.durationMs, 0);
  assert.match(result.stderr, /CDN unavailable/);
  assert.ok(!messages.some((message) => message.type === 'ready'));
});

function mockBrowser(t) {
  const frames = [];
  const channels = [];
  const listeners = new Map();
  const timers = new Map();
  let nextTimer = 0;
  let now = 0;
  class FakeChannel {
    constructor() {
      const port = () => ({ closed: false, sent: [], onmessage: null, start() {}, close() { this.closed = true; }, postMessage(message) { this.sent.push(message); } });
      this.port1 = port(); this.port2 = port(); channels.push(this);
    }
  }
  const window = {
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type, fn) { if (listeners.get(type) === fn) listeners.delete(type); },
  };
  const document = {
    body: { appendChild(frame) { frames.push(frame); } },
    createElement(tag) {
      assert.equal(tag, 'iframe');
      return {
        attrs: {}, removed: false,
        setAttribute(name, value) { this.attrs[name] = value; },
        remove() { this.removed = true; },
        contentWindow: { sent: [], postMessage(...args) { this.sent.push(args); } },
      };
    },
  };
  for (const [name, value] of Object.entries({ window, document, MessageChannel: FakeChannel,
    setTimeout: (fn, ms) => { const id = ++nextTimer; timers.set(id, { fn, ms }); return id; },
    clearTimeout: (id) => timers.delete(id), performance: { now: () => now },
  })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    t.after(() => { if (original) Object.defineProperty(globalThis, name, original); else delete globalThis[name]; });
  }
  return { frames, channels, listeners, timers, window,
    advance(ms) { now += ms; },
    message(data, index = 0) { channels[index].port1.onmessage?.({ data }); },
    fireTimer() { const [id, timer] = timers.entries().next().value; timers.delete(id); timer.fn(); },
    assertClean() {
      assert.equal(timers.size, 0);
      assert.equal(listeners.size, 0);
      assert.ok(frames.every((frame) => frame.removed));
      assert.ok(channels.every((channel) => channel.port1.closed && channel.port2.closed));
    },
  };
}

test('parent uses only private ports, isolates frames and keeps user source out of srcdoc', async (t) => {
  const browser = mockBrowser(t);
  const code = '</script><script>parent.compromised = true</script>';
  const events = [];
  const run = createCodeMatrixBrowserRun({ language: 'js', code, onEvent: (event) => events.push(event) });
  const frame = browser.frames[0];
  assert.equal(frame.attrs.sandbox, 'allow-scripts');
  assert.equal(frame.hidden, true);
  assert.ok(!frame.srcdoc.includes(code));
  assert.equal(browser.listeners.has('message'), false);
  frame.onload();
  frame.onload();
  assert.equal(frame.contentWindow.sent.length, 1);
  assert.equal(frame.contentWindow.sent[0][0].job.code, code);
  assert.equal(frame.contentWindow.sent[0][2][0], browser.channels[0].port2);
  assert.equal(browser.timers.values().next().value.ms, limits.bootMs);
  browser.advance(30_000);
  browser.message({ type: 'running' });
  assert.equal(browser.timers.values().next().value.ms, 10_000);
  browser.advance(123);
  browser.message({ type: 'result', result: { status: 'success', stdout: 'ok', stderr: '', durationMs: 999999 } });
  assert.deepEqual(await run.promise, { status: 'success', stdout: 'ok', stderr: '', durationMs: 123 });
  assert.deepEqual(events.map((event) => event.status), ['loading', 'running']);
  run.cancel();
  browser.assertClean();
});

test('cancel and pagehide settle once with partial output and clean all resources', async (t) => {
  const browser = mockBrowser(t);
  const run = createCodeMatrixBrowserRun({ language: 'javascript', code: 'while(true){}' });
  browser.message({ type: 'running' });
  browser.message({ type: 'snapshot', result: { stdout: 'before loop\n', stderr: '' } });
  browser.listeners.get('pagehide')();
  run.cancel();
  const result = await run.promise;
  assert.equal(result.status, 'stopped');
  assert.equal(result.stdout, 'before loop\n');
  browser.assertClean();
});

test('terminal input pauses the deadline, echoes through the worker and resumes the remaining budget', async (t) => {
  const browser = mockBrowser(t);
  const events = [];
  const run = createCodeMatrixBrowserRun({ language: 'c', code: '', interactive: true, onEvent: (event) => events.push(event) });
  assert.equal(run.submitInput('too early'), false);
  browser.message({ type: 'running' });
  browser.advance(300);
  browser.message({ type: 'snapshot', result: { stdout: 'Number: ', stderr: '', status: 'success' } });
  browser.message({ type: 'input-request', id: 1 });
  assert.equal(browser.timers.values().next().value.ms, limits.inputWaitMs);
  assert.equal(events.find((event) => event.type === 'input-request').result.stdout, 'Number: ');
  browser.advance(60_000);
  assert.equal(run.submitInput('5'), true);
  assert.equal(run.submitInput('duplicate'), false);
  assert.deepEqual(browser.channels[0].port1.sent.at(-1), { type: 'input', id: 1, value: '5' });
  assert.equal(browser.timers.values().next().value.ms, 9700);
  browser.advance(200);
  browser.message({ type: 'input-request', id: 2 });
  assert.equal(run.submitInput('x'.repeat(limits.inputChars)), false);
  assert.equal(run.submitInput(null), true);
  browser.advance(100);
  browser.message({ type: 'result', result: { status: 'success', stdout: 'Number: 5\n10\n' } });
  assert.equal((await run.promise).durationMs, 600);
  assert.equal(run.submitInput(null), false);
  browser.assertClean();
});

test('waiting for input can be cancelled or timed out with partial output preserved', async (t) => {
  const browser = mockBrowser(t);
  for (const [index, action] of ['stop', 'timeout'].entries()) {
    const run = createCodeMatrixBrowserRun({ language: 'java', code: '', interactive: true });
    browser.message({ type: 'running' }, index);
    browser.message({ type: 'snapshot', result: { stdout: 'Name: ' } }, index);
    browser.message({ type: 'input-request', id: 1 }, index);
    if (action === 'stop') run.cancel(); else browser.fireTimer();
    const result = await run.promise;
    assert.equal(result.status, action === 'stop' ? 'stopped' : 'timeout');
    assert.equal(result.stdout, 'Name: ');
    assert.equal(run.submitInput('late'), false);
  }
  browser.assertClean();
});

test('local compiler CSP permits specific assets without exposing app endpoints', () => {
  for (const language of ['c', 'cpp', 'java', 'javascript']) {
    const csp = buildCodeMatrixRuntimeCsp(language, 'https://app.test/code-matrix/runtime/');
    assert.doesNotMatch(csp, /'self'|\*|\/api/);
    const urls = csp.match(/https:\/\/[^ ;]+/g);
    assert.ok(urls.length > 0);
    assert.ok(urls.every((url) => url.startsWith('https://app.test/code-matrix/runtime/') && !url.endsWith('/')));
  }
});

test('loading and execution deadlines are independent; repeated running messages cannot extend them', async (t) => {
  const browser = mockBrowser(t);
  const loading = createCodeMatrixBrowserRun({ language: 'python', code: 'print(1)' });
  browser.fireTimer();
  assert.equal((await loading.promise).status, 'timeout');
  assert.equal((await loading.promise).durationMs, 0);
  const running = createCodeMatrixBrowserRun({ language: 'js', code: 'while(true){}' });
  browser.message({ type: 'running' }, 1);
  const timer = browser.timers.keys().next().value;
  browser.advance(9000);
  browser.message({ type: 'running' }, 1);
  assert.equal(browser.timers.keys().next().value, timer);
  browser.advance(1000);
  browser.fireTimer();
  assert.equal((await running.promise).status, 'timeout');
  assert.equal((await running.promise).durationMs, 10_000);
  browser.assertClean();
});

test('observer errors, malformed results and frame errors cannot orphan resources', async (t) => {
  const browser = mockBrowser(t);
  const run = createCodeMatrixBrowserRun({ language: 'js', code: '', onEvent() { throw Error('UI error'); } });
  browser.message({ type: 'unrelated' });
  browser.message({ type: 'result', result: { status: 'fake', stdout: 'a'.repeat(100_000) } });
  assert.equal((await run.promise).status, 'error');
  assert.equal((await run.promise).stdout.length, limits.outputChars);
  const blocked = createCodeMatrixBrowserRun({ language: 'js', code: '' });
  browser.frames[1].onerror();
  assert.equal((await blocked.promise).status, 'error');
  browser.assertClean();
});

test('validation and non-browser environments resolve errors without evaluating source', async () => {
  for (const options of [{ language: '__proto__', code: '' }, { language: 'js', code: 42 },
    { language: 'js', code: 'x'.repeat(limits.sourceChars + 1) },
    { language: 'js', code: '', input: 'x'.repeat(limits.inputChars + 1) },
    { language: 'js', code: 'globalThis.compromised = true' },
  ]) {
    const run = createCodeMatrixBrowserRun(options);
    assert.equal((await run.promise).status, 'error');
    run.cancel();
  }
  assert.equal(globalThis.compromised, undefined);
});

test('iframe rejects unrelated handshakes and terminates its worker on every terminal path', async (t) => {
  const browser = mockBrowser(t);
  const run = createCodeMatrixBrowserRun({ language: 'js', code: 'return 1' });
  const frame = browser.frames[0];
  frame.onload();
  const handshake = frame.contentWindow.sent[0][0];
  const source = frame.srcdoc.match(/<script>([\s\S]*)<\/script>/)[1];
  const handlers = new Map();
  const parent = {};
  const workerChannels = [];
  const workers = [];
  const urls = new Set();
  class Channel {
    constructor() {
      const port = () => ({ closed: false, sent: [], start() {}, close() { this.closed = true; }, postMessage(message) { this.sent.push(message); } });
      this.port1 = port(); this.port2 = port(); workerChannels.push(this);
    }
  }
  class Worker {
    constructor() { this.terminated = false; workers.push(this); }
    postMessage() {}
    terminate() { this.terminated = true; }
  }
  vm.runInNewContext(source, {
    parent, window: { addEventListener: (type, fn) => handlers.set(type, fn), removeEventListener: (type) => handlers.delete(type) },
    MessageChannel: Channel, Worker, Blob,
    URL: { createObjectURL() { urls.add('blob:null/id'); return 'blob:null/id'; }, revokeObjectURL: (url) => urls.delete(url) },
    setTimeout, clearTimeout,
  });
  const connect = handlers.get('message');
  connect({ source: {}, data: handshake, ports: [browser.channels[0].port2] });
  connect({ source: parent, data: { ...handshake, token: 'wrong' }, ports: [browser.channels[0].port2] });
  assert.equal(workers.length, 0);
  connect({ source: parent, data: handshake, ports: [browser.channels[0].port2] });
  assert.equal(workers.length, 1);
  assert.equal(handlers.has('message'), false);
  workerChannels[0].port1.onmessage({ data: { type: 'ready' } });
  workers[0].onerror({ preventDefault() {}, message: 'crashed' });
  assert.equal(workers[0].terminated, true);
  assert.equal(workerChannels[0].port1.closed, true);
  assert.equal(urls.size, 0);
  assert.equal(handlers.size, 0);
  run.cancel();
  await run.promise;
  browser.assertClean();
});
