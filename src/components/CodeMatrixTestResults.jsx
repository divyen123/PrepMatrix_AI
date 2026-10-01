import { Check, ChevronDown, CircleDashed, Clock3, LoaderCircle, X } from 'lucide-react';
import './CodeMatrixPracticePanel.css';

function caseStatus(test) {
  if (test.passed || test.status === 'passed') return ['passed', 'Passed', Check];
  if (test.status === 'timeout') return ['timeout', 'Time limit reached', Clock3];
  if (test.status === 'stopped') return ['stopped', 'Stopped', CircleDashed];
  if (test.status === 'pending' || test.status === 'skipped') return ['skipped', 'Not run', CircleDashed];
  if (test.status === 'error') return ['error', 'Execution error', X];
  return ['failed', 'Wrong output', X];
}

export default function CodeMatrixTestResults({ result, stale = false, busy = false, onShowProblem }) {
  const cases = result?.cases || [];
  const total = result?.total ?? result?.totalCases ?? cases.length;
  const passed = result?.passed ?? result?.passedCases ?? cases.filter((test) => test.passed || test.status === 'passed').length;
  const succeeded = !busy && result?.status === 'success' && total > 0 && passed === total;
  const firstFailed = cases.findIndex((test) => !test.passed && !['passed', 'pending', 'skipped'].includes(test.status));
  const awardedXp = result?.reward?.awarded ? Number(result.reward.xp || 0) : 0;
  const interrupted = result?.status === 'stopped';
  const completed = cases.filter((test) => !['pending', 'skipped'].includes(test.status)).length;
  const summary = busy ? `Checking test ${Math.min(completed + 1, total)} of ${total}…` : succeeded ? `All ${total} test cases passed` : interrupted ? 'Run stopped' : result?.status === 'timeout' ? 'Time limit reached' : `${passed} of ${total} test cases passed`;
  return <section className="cmx-practice cmx-tests" aria-label="Practice test results">
    {!result ? <div className="cmx-tests-empty"><CircleDashed size={26} aria-hidden="true" /><p>Run your solution to check the test cases.</p>{onShowProblem && <button type="button" className="cmx-practice-button" onClick={onShowProblem}>View problem</button>}</div> : <>
      <div className={`cmx-tests-summary${succeeded && !stale ? ' is-success' : !busy && !stale ? ' is-error' : ''}`} role="status" aria-live="polite">
        {busy ? <LoaderCircle size={19} className="cmx-spin" aria-hidden="true" /> : succeeded ? <Check size={20} aria-hidden="true" /> : interrupted ? <CircleDashed size={20} aria-hidden="true" /> : <X size={19} aria-hidden="true" />}
        <div><strong>{summary}</strong>{stale && <span>Code changed — run again.</span>}{awardedXp > 0 && !stale && <span className="cmx-tests-xp">+{awardedXp} XP earned</span>}</div>
      </div>
      {cases.length > 0 && <ol className="cmx-tests-list">{cases.map((test, index) => {
        const [tone, label, Icon] = caseStatus(test);
        return <li key={test.id || index}><details className={`cmx-test-case is-${tone}`} open={index === firstFailed && !busy}>
          <summary><span className="cmx-test-case-title"><Icon size={15} aria-hidden="true" />Test {index + 1}</span><span className="cmx-test-case-result">{label}<ChevronDown size={12} aria-hidden="true" /></span></summary>
          <div className="cmx-test-case-body">
            <div><span>Input</span><pre>{test.input || '(empty)'}</pre></div>
            <div><span>Expected output</span><pre>{test.expectedOutput ?? ''}</pre></div>
            <div><span>Actual output</span><pre>{(test.actualOutput ?? test.stdout) || '(empty)'}</pre></div>
            {(test.error || test.stderr) && <pre className="cmx-test-error">{test.error || test.stderr}</pre>}
          </div>
        </details></li>;
      })}</ol>}
      {(result.error || result.stderr) && !cases.some((test) => test.error || test.stderr) && <pre className="cmx-test-error cmx-tests-run-error">{result.error || result.stderr}</pre>}
      {onShowProblem && <footer className="cmx-practice-actions"><button type="button" className="cmx-practice-button" onClick={onShowProblem}>View problem</button></footer>}
    </>}
  </section>;
}
