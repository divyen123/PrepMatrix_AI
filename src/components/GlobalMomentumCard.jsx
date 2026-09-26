import { useEffect, useId, useRef, useState } from 'react';
import { Code2, History, X } from 'lucide-react';
import GlobalMomentum from './GlobalMomentum';
import MomentumHistoryDialog from './MomentumHistoryDialog';
import './MomentumViews.css';
import './Gamification.css';
import './GlobalMomentumCard.css';

export default function GlobalMomentumCard({ momentum, momentumError = '', onRetryMomentum }) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [codeDetailsOpen, setCodeDetailsOpen] = useState(false);
  const codeDetailsId = useId();
  const codeDetailsTitleId = useId();
  const codeDetailsCloseRef = useRef(null);
  const codeDetailsRef = useRef(null);
  const codeDetailsTriggerRef = useRef(null);

  const runs = momentum?.successfulCodeRuns || 0;
  const codingXp = momentum?.global?.breakdown?.coding || 0;
  const codeRewardsEarned = Math.floor(runs / 4);
  const currentRunStep = runs % 4;
  const runsNeeded = 4 - currentRunStep;

  useEffect(() => {
    if (!codeDetailsOpen) return undefined;

    const focusFrame = window.requestAnimationFrame(() => codeDetailsCloseRef.current?.focus());

    const closeOnOutsidePointer = (event) => {
      if (!codeDetailsRef.current?.contains(event.target)) {
        setCodeDetailsOpen(false);
      }
    };
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape') return;
      setCodeDetailsOpen(false);
      window.requestAnimationFrame(() => codeDetailsTriggerRef.current?.focus());
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [codeDetailsOpen]);

  const closeCodeDetails = () => {
    setCodeDetailsOpen(false);
    window.requestAnimationFrame(() => codeDetailsTriggerRef.current?.focus());
  };

  const codeRewardsControl = (
    <div className="battle-insights codematrix-insights" ref={codeDetailsRef}>
      <button
        aria-controls={codeDetailsId}
        aria-expanded={codeDetailsOpen}
        aria-haspopup="dialog"
        aria-label="View CodeMatrix rewards"
        className="battle-insights-trigger"
        onClick={() => setCodeDetailsOpen((current) => !current)}
        ref={codeDetailsTriggerRef}
        title="View CodeMatrix rewards"
        type="button"
      >
        <Code2 aria-hidden="true" size={19} />
      </button>

      {codeDetailsOpen && (
        <section
          aria-labelledby={codeDetailsTitleId}
          className="battle-insights-popover codematrix-insights-popover"
          id={codeDetailsId}
          role="dialog"
        >
          <header>
            <div>
              <strong id={codeDetailsTitleId}>Coding rewards</strong>
            </div>
            <button
              aria-label="Close CodeMatrix rewards"
              onClick={closeCodeDetails}
              ref={codeDetailsCloseRef}
              type="button"
            >
              <X aria-hidden="true" size={16} />
            </button>
          </header>

          <dl className="battle-insights-list">
            <div>
              <dt>Total code runs</dt>
              <dd>{runs}</dd>
            </div>
            <div>
              <dt>Coding XP</dt>
              <dd>{codingXp} XP</dd>
            </div>
            <div>
              <dt>Rewards earned</dt>
              <dd>{codeRewardsEarned} × 10 XP</dd>
            </div>
          </dl>

          <div className="codematrix-reward-box">
            <div className="codematrix-reward-status">
              <span>Next reward progress</span>
              <strong>{currentRunStep}/4 runs</strong>
            </div>
            <div
              className="codematrix-reward-bar"
              role="progressbar"
              aria-label="CodeMatrix reward progress"
              aria-valuemin={0}
              aria-valuemax={4}
              aria-valuenow={currentRunStep}
            >
              <i style={{ width: `${currentRunStep * 25}%` }} />
            </div>
            <p>
              {runsNeeded === 4 && runs > 0
                ? '10 XP awarded! Complete next 4 runs for +10 XP.'
                : `${runsNeeded} more successful ${runsNeeded === 1 ? 'run' : 'runs'} to earn 10 XP.`}
            </p>
          </div>
        </section>
      )}
    </div>
  );

  return (
    <section className="card gamification-card global-momentum-card">
      <div className="gamification-header">
        <div>
          <div className="momentum-title-row">
            <h3>Global momentum</h3>
            <button
              type="button"
              className="momentum-icon-button"
              aria-label="View global XP history"
              title="View XP history"
              onClick={() => setHistoryOpen(true)}
            >
              <History size={17} />
            </button>
          </div>
          <p className="momentum-view-label">Lifetime progress · this academic profile</p>
        </div>
      </div>

      <div className="gamification-scroll-region">
        <GlobalMomentum
          codeRewardsControl={codeRewardsControl}
          data={momentum}
          error={momentumError}
          onRetry={onRetryMomentum}
        />
      </div>

      {historyOpen && <MomentumHistoryDialog data={momentum} onClose={() => setHistoryOpen(false)} />}
    </section>
  );
}
