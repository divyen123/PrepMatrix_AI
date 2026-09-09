import { parse } from 'acorn';
import {
  CODE_MATRIX_LIMITS,
  CODE_MATRIX_RUNTIMES,
  buildCodeMatrixWorkerSource,
  boundCodeMatrixText,
  normalizeCodeMatrixResult,
} from './codeMatrixWorkerSource.js';

export { CODE_MATRIX_LIMITS, CODE_MATRIX_RUNTIMES };

// Insert budget checks using JavaScript syntax positions, never regex rewriting.
// Checks remain on the original line so errors point to the student's file.
export function instrumentCodeMatrixPreview(source, guardName) {
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'script' });
  const inserts = [];
  const check = `${guardName}();`;
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (['WhileStatement', 'DoWhileStatement', 'ForStatement', 'ForInStatement', 'ForOfStatement'].includes(node.type)) {
      if (node.body.type === 'BlockStatement') inserts.push([node.body.start + 1, check]);
      else { inserts.push([node.body.start, `{${check}`]); inserts.push([node.body.end, '}']); }
    }
    if (['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node.type)) {
      if (node.body.type === 'BlockStatement') inserts.push([node.body.start + 1, check]);
      else { inserts.push([node.body.start, `(${guardName}(),`]); inserts.push([node.body.end, ')']); }
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'type') continue;
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(ast);
  let result = source;
  for (const [position, text] of inserts.sort((a, b) => b[0] - a[0])) result = result.slice(0, position) + text + result.slice(position);
  return result;
}

function codeMatrixPreviewBootstrap(config) {
  let emitted = 0;
  const send = (type, message, level = 'log') => {
    if (emitted++ > 100) return;
    parent.postMessage({ channel: config.channel, type, level, message: String(message).slice(0, 4000) }, '*');
  };
  const format = (value) => {
    try { return typeof value === 'string' ? value.slice(0, 2000) : String(value).slice(0, 2000); }
    catch { return '[Uninspectable]'; }
  };
  for (const level of ['log', 'info', 'warn', 'error', 'debug']) console[level] = (...args) => send('console', args.slice(0, 20).map(format).join(' '), level);
  window.addEventListener('error', (event) => {
    event.preventDefault();
    // Skip the injected budget helper's first line and point to its caller.
    const frame = [...String(event.error?.stack || '').matchAll(/script\.js:(\d+):(\d+)/g)].find((match) => Number(match[1]) > 1);
    const line = frame ? Number(frame[1]) : event.lineno;
    const column = frame ? Number(frame[2]) : event.colno;
    send('error', `${event.message}${line ? `\nscript.js:${Math.max(1, line - 1)}:${column || 1}` : ''}`);
  });
  window.addEventListener('unhandledrejection', (event) => { event.preventDefault(); send('error', event.reason?.message || event.reason); });
  window.addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style');
    style.textContent = config.css;
    document.head.appendChild(style);
    if (config.error) { send('error', config.error); return; }
    const script = document.createElement('script');
    script.nonce = config.nonce;
    script.textContent = config.javascript;
    document.body.appendChild(script);
  }, { once: true });
}

export function buildCodeMatrixPreview({ html = '', css = '', javascript = '', channel }) {
  const nonce = crypto.randomUUID().replaceAll('-', '');
  const guard = `cmGuard_${nonce}`;
  let script = '';
  let error = '';
  try {
    const guarded = instrumentCodeMatrixPreview(javascript, guard);
    // A lexical const prevents student declarations from replacing the guard.
    script = `{const ${guard}=(()=>{let count=0,start=0,pending=false;const clock=performance.now.bind(performance),defer=setTimeout.bind(window);return()=>{if(!pending){pending=true;count=0;start=clock();defer(()=>{pending=false;},0);}if(++count>100000||clock()-start>2000)throw Error('Preview execution limit reached. Check loops or recursion.');};})();\n${guarded}\n}\n//# sourceURL=script.js`;
  } catch (failure) { error = `JavaScript syntax error: ${failure.message}${failure.loc ? `\nscript.js:${failure.loc.line}:${failure.loc.column + 1}` : ''}`; }
  const config = { css, javascript: script, channel, nonce, error };
  const csp = `default-src 'none'; base-uri 'none'; object-src 'none'; frame-src 'none'; connect-src 'none'; form-action 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:;`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}"><script nonce="${nonce}">(${codeMatrixPreviewBootstrap.toString()})(${serializeCodeMatrixScriptData(config)});</script></head><body>${html}</body></html>`;
}

// Escapes data inside the one trusted bootstrap script, including HTML parser
// end tags/comments. User source is sent over a port, never embedded as HTML.
export function serializeCodeMatrixScriptData(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

export function buildCodeMatrixRuntimeCsp(language) {
  const { pyodide, sql } = CODE_MATRIX_RUNTIMES;
  const scripts = language === 'python' ? `${pyodide}pyodide.js ${pyodide}pyodide.asm.js`
    : language === 'sql' ? `${sql}sql-wasm.js` : '';
  const connections = language === 'python'
    ? `${pyodide}pyodide.asm.wasm ${pyodide}python_stdlib.zip ${pyodide}pyodide-lock.json`
    : language === 'sql' ? `${sql}sql-wasm.wasm` : "'none'";
  return `default-src 'none'; base-uri 'none'; object-src 'none'; frame-src 'none'; form-action 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob: ${scripts}; worker-src blob:; connect-src ${connections};`;
}

function codeMatrixFrameMain(token, workerSource, limits) {
  let parentPort;
  let workerPort;
  let worker;
  let blobUrl;
  let timer;
  let ended = false;
  let running = false;
  let snapshot = { stdout: '', stderr: '' };
  const cleanup = () => {
    clearTimeout(timer);
    window.removeEventListener('message', connect);
    window.removeEventListener('pagehide', cleanup);
    worker?.terminate();
    workerPort?.close();
    parentPort?.close();
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    ended = true;
  };
  const finish = (result) => {
    if (ended) return;
    parentPort?.postMessage({ type: 'result', result });
    cleanup();
  };
  const fail = (message, status = 'error') => finish({
    ...snapshot, status, stderr: (snapshot.stderr + '\n' + message).slice(-limits.outputChars),
  });
  function connect(event) {
    // The app never listens to global frame messages. The iframe accepts one
    // channel from its actual parent, with a per-run token, then stops listening.
    if (parentPort || event.source !== parent || event.data?.type !== 'code-matrix-connect'
      || event.data?.token !== token || !event.ports[0]) return;
    parentPort = event.ports[0];
    window.removeEventListener('message', connect);
    parentPort.onmessage = (event) => { if (event.data?.type === 'stop') cleanup(); };
    parentPort.start();
    try {
      const channel = new MessageChannel();
      workerPort = channel.port1;
      blobUrl = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
      worker = new Worker(blobUrl);
      worker.onerror = (event) => { event.preventDefault(); fail(event.message || 'Runtime worker failed.'); };
      worker.onmessageerror = () => fail('Runtime message could not be decoded.');
      workerPort.onmessageerror = () => fail('Runtime message could not be decoded.');
      workerPort.onmessage = (event) => {
        if (ended) return;
        const data = event.data;
        if (data?.type === 'ready' && !running) {
          running = true;
          clearTimeout(timer);
          timer = setTimeout(() => fail('Execution exceeded 10 seconds.', 'timeout'), limits.runMs);
          parentPort.postMessage({ type: 'running' });
          workerPort.postMessage({ type: 'run' });
        } else if (data?.type === 'snapshot' && data.result) {
          snapshot = data.result;
          parentPort.postMessage(data);
        } else if (data?.type === 'result' && data.result) {
          finish(data.result);
        }
      };
      workerPort.start();
      timer = setTimeout(() => fail('Runtime loading exceeded 45 seconds.', 'timeout'), limits.bootMs);
      worker.postMessage({ type: 'connect', job: event.data.job }, [channel.port2]);
    } catch (error) { fail(error.message || 'Could not create an isolated worker.'); }
  }
  window.addEventListener('message', connect);
  window.addEventListener('pagehide', cleanup);
}

function buildFrameSource(language, token) {
  const csp = buildCodeMatrixRuntimeCsp(language);
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"></head><body><script>(${codeMatrixFrameMain.toString()})(${serializeCodeMatrixScriptData(token)},${serializeCodeMatrixScriptData(buildCodeMatrixWorkerSource())},${JSON.stringify(CODE_MATRIX_LIMITS)});</script></body></html>`;
}

/**
 * Browser-only, one fresh opaque-origin iframe + worker per call. No app code,
 * cookies, storage, DOM, APIs, or arbitrary network are exposed to user code.
 * Only the exact pinned core runtime assets are allowed by the inherited CSP;
 * extra Python packages, external JS imports and SQL extensions are unsupported.
 *
 * @param {{language: 'javascript'|'js'|'python'|'py'|'sql'|'sqlite', code: string,
 *   input?: string, debug?: boolean,
 *   onEvent?: (event: {type: 'status', status: 'loading'|'running', language: string, message: string}) => void}} options
 * @returns {{promise: Promise<{stdout: string, stderr: string,
 *   status: 'success'|'error'|'timeout'|'stopped', durationMs: number,
 *   tables?: Array<{columns: string[], values: Array<Array<string|number|null>>}>,
 *   trace?: Array<{line: number, locals: Record<string, string>}>}>, cancel: () => void}}
 *
 * promise always resolves, including validation/boot errors and cancellation.
 * durationMs excludes boot; it is 0 if execution never started. Loading gets
 * 45 seconds; execution gets another 10 seconds (including awaited JS/Python).
 * JS has console, print, input, readLine()/prompt(); EOF is null. A non-undefined
 * async return is printed. Detached async work ends when the program resolves.
 * Python debug records locals BEFORE each executed line, capped at 200; locals
 * are bounded repr strings. SQL starts with students(id,name,age,grade,marks).
 * Bounds are exported as CODE_MATRIX_LIMITS; SQL reports truncation in stderr.
 *
 * Call cancel in the owner's unmount/effect cleanup. cancel is idempotent;
 * pagehide also cancels. Every terminal path removes the iframe (terminating
 * its workers), closes ports and clears timers. CSP/Worker failures fail closed.
 */
export function createCodeMatrixBrowserRun({ language, code, input = '', debug = false, onEvent } = {}) {
  const aliases = { js: 'javascript', javascript: 'javascript', py: 'python', python: 'python', sql: 'sql', sqlite: 'sql' };
  const normalizedLanguage = typeof language === 'string' && Object.hasOwn(aliases, language.toLowerCase())
    ? aliases[language.toLowerCase()] : null;
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  let iframe;
  let channel;
  let timer;
  let done = false;
  let started = null;
  let latest = { stdout: '', stderr: '' };
  const clock = () => globalThis.performance?.now() ?? Date.now();
  const emit = (status, message) => {
    if (typeof onEvent === 'function') {
      try { onEvent({ type: 'status', status, language: normalizedLanguage, message }); }
      catch { /* A UI observer must not orphan the runtime. */ }
    }
  };
  const finish = (raw) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    globalThis.window?.removeEventListener('pagehide', cancel);
    if (channel) {
      try { channel.port1.postMessage({ type: 'stop' }); } catch { /* Already closed. */ }
      channel.port1.onmessage = null;
      channel.port1.onmessageerror = null;
      channel.port1.close();
      channel.port2.close();
    }
    if (iframe) {
      iframe.onload = null;
      iframe.onerror = null;
      iframe.remove();
    }
    resolve(normalizeCodeMatrixResult({ ...raw, durationMs: started === null ? 0 : clock() - started }));
  };
  const stopWith = (status, message) => finish({
    ...latest, status,
    stderr: message ? boundCodeMatrixText(latest.stderr + '\n' + message, CODE_MATRIX_LIMITS.outputChars) : latest.stderr,
  });
  function cancel() { stopWith('stopped', 'Execution stopped.'); }
  const handle = { promise, cancel };
  if (!normalizedLanguage || typeof code !== 'string' || typeof input !== 'string') {
    stopWith('error', 'Provide a supported language and string code/input.');
    return handle;
  }
  if (code.length > CODE_MATRIX_LIMITS.sourceChars || input.length > CODE_MATRIX_LIMITS.inputChars) {
    stopWith('error', 'Code or input exceeds the browser runtime limit.');
    return handle;
  }
  if (!globalThis.document || !globalThis.window || typeof globalThis.MessageChannel !== 'function') {
    stopWith('error', 'An isolated browser runtime is not available in this environment.');
    return handle;
  }
  try {
    const token = globalThis.crypto.randomUUID();
    channel = new MessageChannel();
    iframe = document.createElement('iframe');
    // NEVER add allow-same-origin, or construct the Worker in this app realm.
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('title', 'Code Matrix isolated runtime');
    iframe.hidden = true;
    iframe.referrerPolicy = 'no-referrer';
    iframe.srcdoc = buildFrameSource(normalizedLanguage, token);
    const job = { language: normalizedLanguage, code, input, debug: debug === true };
    let connected = false;
    iframe.onload = () => {
      if (done || connected) return;
      connected = true;
      try {
        // Opaque-origin targets require '*'; the transferred private port and
        // source+token check in the iframe establish the communication boundary.
        iframe.contentWindow.postMessage({ type: 'code-matrix-connect', token, job }, '*', [channel.port2]);
      } catch (error) { stopWith('error', error.message || 'Runtime connection failed.'); }
    };
    iframe.onerror = () => stopWith('error', 'The browser blocked the isolated runtime.');
    channel.port1.onmessageerror = () => stopWith('error', 'Runtime result could not be decoded.');
    channel.port1.onmessage = (event) => {
      if (done) return;
      const data = event.data;
      if (data?.type === 'running' && started === null) {
        started = clock();
        clearTimeout(timer);
        timer = setTimeout(() => stopWith('timeout', 'Execution exceeded 10 seconds.'), CODE_MATRIX_LIMITS.runMs);
        emit('running', 'Running code…');
      } else if (data?.type === 'snapshot' && data.result) {
        latest = normalizeCodeMatrixResult(data.result);
      } else if (data?.type === 'result' && data.result) {
        finish(data.result);
      }
    };
    channel.port1.start();
    timer = setTimeout(() => stopWith('timeout', 'Runtime loading exceeded 45 seconds.'), CODE_MATRIX_LIMITS.bootMs);
    window.addEventListener('pagehide', cancel);
    (document.body || document.documentElement).appendChild(iframe);
    emit('loading', normalizedLanguage === 'javascript' ? 'Preparing isolated JavaScript runtime…'
      : `Loading ${normalizedLanguage === 'python' ? 'Python (Pyodide 0.27.7)' : 'SQLite (sql.js 1.13.0)'}…`);
  } catch (error) { stopWith('error', error.message || 'Could not initialize the browser runtime.'); }
  return handle;
}
