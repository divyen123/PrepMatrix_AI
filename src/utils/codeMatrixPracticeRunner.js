import { CODE_MATRIX_MAX_CODE } from './codeMatrixWorkspace.js';
import { normalizePracticeOutput } from './codeMatrixPractice.js';
import { createCodeMatrixBrowserRun } from './codeMatrixRuntime.js';

export const CODE_MATRIX_PRACTICE_SUITE_MS = 180_000;

// Each test uses the same isolated iframe/worker runtime as the compiler.
// Cancellation and the suite deadline also settle unresponsive runtime mocks.
export function createCodeMatrixPracticeRun({
  question, language, code, onEvent, createRun = createCodeMatrixBrowserRun,
  suiteTimeoutMs = CODE_MATRIX_PRACTICE_SUITE_MS,
} = {}) {
  const clock = () => globalThis.performance?.now() ?? Date.now();
  const started = clock();
  const testCases = Array.isArray(question?.testCases) ? question.testCases : [];
  let cases = testCases.map((testCase) => ({
    ...testCase, stdout: '', stderr: '', status: 'pending', passed: false,
  }));
  let activeTask = null;
  let stopped = false;
  let stopStatus = 'stopped';
  let settled = false;
  let stopSignal;
  const interruption = new Promise((resolve) => { stopSignal = resolve; });
  const emit = (event) => { try { onEvent?.(event); } catch { /* Observers cannot interrupt cleanup. */ } };
  const passed = () => cases.filter((testCase) => testCase.passed).length;
  const result = (status, stderr = '') => ({
    status, passed: passed(), total: cases.length, cases: cases.map((testCase) => ({ ...testCase })),
    durationMs: Math.max(0, clock() - started), code, language,
    questionId: question?.id || '', version: question?.version,
    stdout: '', stderr,
  });
  const interrupt = (status) => {
    if (settled || stopped) return;
    stopped = true;
    stopStatus = status;
    stopSignal({ status, stdout: '', stderr: status === 'timeout'
      ? 'The test suite exceeded three minutes.' : 'Test run stopped.' });
    try { activeTask?.cancel(); } catch { /* The interruption still settles the suite. */ }
  };
  const cancel = () => interrupt('stopped');
  const deadline = setTimeout(() => interrupt('timeout'), Math.min(CODE_MATRIX_PRACTICE_SUITE_MS,
    Number.isFinite(suiteTimeoutMs) && suiteTimeoutMs > 0 ? suiteTimeoutMs : CODE_MATRIX_PRACTICE_SUITE_MS));

  const promise = (async () => {
    // Defer scheduling so the caller can retain the handle before observers fire.
    await Promise.resolve();
    try {
      if (!question?.id || !Number.isInteger(question.version)
        || !Array.isArray(question.supportedLanguages) || !question.supportedLanguages.includes(language) || typeof code !== 'string'
        || new TextEncoder().encode(code).length > CODE_MATRIX_MAX_CODE
        || !testCases.length || testCases.length > 20
        || new Set(testCases.map((testCase) => testCase?.id)).size !== testCases.length
        || testCases.some((testCase) => !testCase || typeof testCase.id !== 'string' || !testCase.id
          || typeof testCase.input !== 'string' || typeof testCase.expectedOutput !== 'string')) {
        cases = cases.map((testCase) => ({ ...testCase, status: 'skipped' }));
        return result('error', 'Choose a supported practice question and keep code under 50 KB.');
      }
      for (let index = 0; index < testCases.length && !stopped; index += 1) {
        const testCase = testCases[index];
        const eventContext = { index, total: cases.length, caseId: testCase.id };
        emit({ type: 'case-start', ...eventContext });
        // A case-start observer may synchronously request cancellation.
        if (stopped) break;
        let outcome;
        try {
          activeTask = createRun({ language, code, input: testCase.input, interactive: false,
            onEvent: (event) => {
              if (settled || stopped || event.type !== 'status') return;
              emit({ type: 'status', ...eventContext, status: event.status, message: event.message });
            },
          });
          if (!activeTask || typeof activeTask.cancel !== 'function' || !activeTask.promise) {
            throw new Error('The practice runtime could not be started.');
          }
          // A runtime may emit status synchronously while being created.
          if (stopped) activeTask.cancel();
          outcome = await Promise.race([activeTask.promise, interruption]);
        } catch (error) {
          outcome = { status: 'error', stdout: '', stderr: error?.message || 'The practice runtime failed.' };
          try { activeTask?.cancel(); } catch { /* Already failed. */ }
        }
        activeTask = null;
        if (stopped) outcome = { ...outcome, status: stopStatus };
        const status = ['success', 'error', 'timeout', 'stopped'].includes(outcome?.status) ? outcome.status : 'error';
        const stdout = typeof outcome?.stdout === 'string' ? outcome.stdout : '';
        const record = {
          ...testCase, stdout, stderr: typeof outcome?.stderr === 'string' ? outcome.stderr : '', status,
          passed: status === 'success' && normalizePracticeOutput(stdout) === normalizePracticeOutput(testCase.expectedOutput),
        };
        cases[index] = record;
        emit({ type: 'case-result', ...eventContext, case: { ...record }, passed: passed() });
        if (status === 'stopped' || status === 'timeout') {
          stopped = true;
          stopStatus = status;
        }
      }
      cases = cases.map((testCase) => testCase.status === 'pending' ? { ...testCase, status: 'skipped' } : testCase);
      const status = stopped ? stopStatus : passed() === cases.length ? 'success' : 'error';
      return result(status, cases.find((testCase) => testCase.stderr)?.stderr || '');
    } catch (error) {
      cases = cases.map((testCase) => testCase.status === 'pending' ? { ...testCase, status: 'skipped' } : testCase);
      return result('error', error?.message || 'The test suite could not be completed.');
    } finally {
      settled = true;
      clearTimeout(deadline);
      try { activeTask?.cancel(); } catch { /* Clean up any unfinished runtime. */ }
      activeTask = null;
    }
  })();
  return { promise, cancel };
}
