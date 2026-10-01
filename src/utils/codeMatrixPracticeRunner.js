import { CODE_MATRIX_MAX_CODE } from './codeMatrixWorkspace.js';
import { normalizePracticeOutput } from './codeMatrixPractice.js';
import { CODE_MATRIX_LIMITS, createCodeMatrixBrowserRun, createCodeMatrixCompiledPracticeRun } from './codeMatrixRuntime.js';

export const CODE_MATRIX_PRACTICE_SUITE_MS = 180_000;

// Compiled languages retain their compiler artifacts in one isolated worker;
// each case still starts with a fresh program VM/instance and its own stdin.
// Cancellation and the suite deadline also settle unresponsive runtime mocks.
export function createCodeMatrixPracticeRun({
  question, language, code, onEvent, createRun = createCodeMatrixBrowserRun,
  createSuiteRun = createCodeMatrixCompiledPracticeRun, suiteTimeoutMs,
} = {}) {
  const clock = () => globalThis.performance?.now() ?? Date.now();
  const started = clock();
  const testCases = Array.isArray(question?.testCases) ? question.testCases : [];
  const maximumSuiteMs = Math.max(CODE_MATRIX_PRACTICE_SUITE_MS,
    Math.min(20, testCases.length) * (CODE_MATRIX_LIMITS.bootMs + CODE_MATRIX_LIMITS.runMs));
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
      ? 'The test suite exceeded its runtime deadline.' : 'Test run stopped.' });
    try { activeTask?.cancel(); } catch { /* The interruption still settles the suite. */ }
  };
  const cancel = () => interrupt('stopped');
  const deadline = setTimeout(() => interrupt('timeout'), Math.min(maximumSuiteMs,
    Number.isFinite(suiteTimeoutMs) && suiteTimeoutMs > 0 ? suiteTimeoutMs : maximumSuiteMs));
  const recordCase = (index, outcome) => {
    if (!testCases[index] || cases[index].status !== 'pending') return;
    const testCase = testCases[index];
    const status = ['success', 'error', 'timeout', 'stopped'].includes(outcome?.status) ? outcome.status : 'error';
    const stdout = typeof outcome?.stdout === 'string' ? outcome.stdout : '';
    const record = { ...testCase, stdout, stderr: typeof outcome?.stderr === 'string' ? outcome.stderr : '', status,
      passed: status === 'success' && normalizePracticeOutput(stdout) === normalizePracticeOutput(testCase.expectedOutput) };
    cases[index] = record;
    emit({ type: 'case-result', index, total: cases.length, caseId: testCase.id, case: { ...record }, passed: passed() });
  };

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
      if (['c', 'cpp', 'java'].includes(language) && createRun === createCodeMatrixBrowserRun) {
        let activeIndex = 0;
        let outcome;
        if (!stopped) {
          try {
            activeTask = createSuiteRun({ language, code, inputs: testCases.map((testCase) => testCase.input),
              onEvent(event) {
                if (settled || stopped) return;
                if (event.type === 'case-start' && Number.isInteger(event.index) && cases[event.index]?.status === 'pending') {
                  activeIndex = event.index;
                  emit({ type: 'case-start', index: event.index, total: cases.length, caseId: testCases[event.index].id });
                } else if (event.type === 'case-result') recordCase(event.index, event.result);
                else if (event.type === 'status') emit({ ...event, index: activeIndex, total: cases.length, caseId: testCases[activeIndex].id });
              },
            });
            if (!activeTask || typeof activeTask.cancel !== 'function' || !activeTask.promise) throw new Error('The practice runtime could not be started.');
            if (stopped) activeTask.cancel();
            outcome = await Promise.race([activeTask.promise, interruption]);
          } catch (error) {
            outcome = { status: 'error', stderr: error?.message || 'The practice runtime failed.' };
            try { activeTask?.cancel(); } catch { /* Already failed. */ }
          }
          activeTask = null;
          if (!stopped && Array.isArray(outcome?.cases)) outcome.cases.slice(0, cases.length).forEach((item, index) => recordCase(index, item));
          if (stopped || ['timeout', 'stopped'].includes(outcome?.status)) {
            if (!stopped) { stopped = true; stopStatus = outcome.status; }
            recordCase(activeIndex, { ...outcome, status: stopStatus });
          } else if (outcome?.status !== 'success' || passed() !== cases.length) {
            if (cases[activeIndex]?.status === 'pending') recordCase(activeIndex, { ...outcome, status: 'error' });
          }
        }
        cases = cases.map((testCase) => testCase.status === 'pending' ? { ...testCase, status: 'skipped' } : testCase);
        return result(stopped ? stopStatus : outcome?.status === 'success' && passed() === cases.length ? 'success' : 'error',
          cases.find((testCase) => testCase.stderr)?.stderr || outcome?.stderr || '');
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
        recordCase(index, outcome);
        const status = cases[index].status;
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
