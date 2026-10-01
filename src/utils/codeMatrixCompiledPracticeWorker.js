import { prepareCodeMatrixCompiler } from './codeMatrixCompilers.js';
import { CODE_MATRIX_LIMITS, createCodeMatrixLineReader, boundCodeMatrixText, normalizeCodeMatrixResult } from './codeMatrixWorkerSource.js';

// One opaque-origin worker owns the compiler and its artifacts for the suite.
// Only program state is recreated between cases; no student code runs in the app.
function compiledPracticeWorker(limits, readLines, bound, normalize, prepareCompiler) {
  let connected = false;
  globalThis.onmessage = async (event) => {
    if (connected || event.data?.type !== 'connect' || !event.ports[0]) return;
    connected = true;
    globalThis.onmessage = null;
    const { job } = event.data;
    const port = event.ports[0];
    const send = port.postMessage.bind(port);
    let index = 0;
    let finished = false;
    let preparing = false;
    let running = false;
    let execute;
    let prepareRun;
    let readLine = readLines(job.inputs[0]);
    let state = { status: 'success', stdout: '', stderr: '' };
    let failed = false;
    let snapshotTimer;
    let lastSnapshot = -Infinity;
    const snapshot = (force = false) => {
      if (finished) return;
      if (!force && performance.now() - lastSnapshot < 60) {
        snapshotTimer ??= setTimeout(() => { snapshotTimer = undefined; snapshot(true); }, 60);
        return;
      }
      clearTimeout(snapshotTimer);
      snapshotTimer = undefined;
      lastSnapshot = performance.now();
      send({ type: 'snapshot', index, result: normalize(state, limits, bound) });
    };
    const append = (stream, text) => {
      if (finished || state[stream].length >= limits.outputChars) return;
      state[stream] = bound(state[stream] + text, limits.outputChars);
      snapshot();
    };
    const finish = (error) => {
      if (finished) return;
      if (error) appendError(error);
      finished = true;
      clearTimeout(snapshotTimer);
      send({ type: 'result', result: { status: error || failed ? 'error' : 'success', stderr: error ? state.stderr : '' } });
      port.close();
    };
    const appendError = (error) => {
      state.status = 'error';
      append('stderr', String(error?.stack || error?.message || error) + '\n');
    };
    globalThis.addEventListener('error', (event) => { event.preventDefault(); finish(event.error || event.message); });
    globalThis.addEventListener('unhandledrejection', (event) => { event.preventDefault(); finish(event.reason || 'Runtime failed.'); });
    const prepareCase = async () => {
      preparing = true;
      clearTimeout(snapshotTimer);
      snapshotTimer = undefined;
      lastSnapshot = -Infinity;
      state = { status: 'success', stdout: '', stderr: '' };
      readLine = readLines(job.inputs[index]);
      send({ type: 'case-start', index });
      try {
        if (!prepareRun) {
          send({ type: 'compiling' });
          prepareRun = await prepareCompiler({ job, assets: job.assets, append,
            readLine: () => readLine(), reusable: true });
        }
        execute = await prepareRun();
        preparing = false;
        send({ type: 'case-ready', index });
      } catch (error) { finish(error); }
    };
    port.onmessage = async (event) => {
      if (finished || preparing || running || event.data?.type !== 'run' || event.data.index !== index || !execute) return;
      running = true;
      try { await execute(); } catch (error) { appendError(error); }
      if (finished) return;
      clearTimeout(snapshotTimer);
      snapshotTimer = undefined;
      send({ type: 'case-result', index, result: normalize(state, limits, bound) });
      failed ||= state.status !== 'success';
      execute = null;
      running = false;
      index += 1;
      if (index === job.inputs.length) finish();
      else await prepareCase();
    };
    port.start();
    await prepareCase();
  };
}

export function buildCodeMatrixCompiledPracticeWorkerSource() {
  return `(${compiledPracticeWorker.toString()})(${JSON.stringify(CODE_MATRIX_LIMITS)},${createCodeMatrixLineReader.toString()},${boundCodeMatrixText.toString()},${normalizeCodeMatrixResult.toString()},${prepareCodeMatrixCompiler.toString()});`;
}
