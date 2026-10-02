import { useEffect, useId, useRef, useState } from 'react';
import { Code2, X } from 'lucide-react';
import GlobalMomentum from './GlobalMomentum';
import './MomentumViews.css';
import './Gamification.css';
import './GlobalMomentumCard.css';

export default function GlobalMomentumCard({ momentum, momentumError = '', onRetryMomentum }) {
  const [codeDetailsOpen, setCodeDetailsOpen] = useState(false);
  const codeDetailsId = useId();
  const codeDetailsTitleId = useId();
  const codeDetailsCloseRef = useRef(null);
  const codeDetailsRef = useRef(null);
  const codeDetailsTriggerRef = useRef(null);

  const runs = momentum?.successfulCodeRuns || 0;
  const codingXp = momentum?.global?.breakdown?.coding || 0;
  const practiceXp = (momentum?.history || []).filter((entry) => entry.kind === 'coding' && entry.source === 'practice').reduce((sum, entry) => sum + Number(entry.xp || 0), 0);
  const solvedQuestions = momentum?.solvedCodeQuestions || 0;
  const runsPerReward = momentum?.rules?.codeRunsPerReward || 4;
  const rewardXp = momentum?.rules?.coding || 10;
  const practiceRewardXp = momentum?.rules?.practiceCoding || 10;
  const currentRunStep = runs % runsPerReward;
  const runsNeeded = runsPerReward - currentRunStep;

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
              <dt>Coding XP</dt>
              <dd>{codingXp} XP</dd>
            </div>
            <div>
              <dt>Solved questions</dt>
              <dd>{solvedQuestions}</dd>
            </div>
            <div>
              <dt>Practice XP</dt>
              <dd>{practiceXp} XP</dd>
            </div>
            <div>
              <dt>Compiler XP</dt>
              <dd>{Math.max(0, codingXp - practiceXp)} XP</dd>
            </div>
          </dl>

          <p className="codematrix-practice-reward-copy">+{practiceRewardXp} XP for each newly solved question.</p>

          <div className="codematrix-reward-box">
            <div className="codematrix-reward-status">
              <span>Compiler runs</span>
              <strong>{currentRunStep}/{runsPerReward}</strong>
            </div>
            <div
              className="codematrix-reward-bar"
              role="progressbar"
              aria-label="CodeMatrix reward progress"
              aria-valuemin={0}
              aria-valuemax={runsPerReward}
              aria-valuenow={currentRunStep}
            >
              <i style={{ width: `${100 * currentRunStep / runsPerReward}%` }} />
            </div>
            <p>
              {`${runsNeeded} more successful ${runsNeeded === 1 ? 'run' : 'runs'} for +${rewardXp} XP.`}
            </p>
          </div>
        </section>
      )}
    </div>
  );

  return (
    <section className={`card gamification-card global-momentum-card${codeDetailsOpen ? ' has-code-details' : ''}`}>
      <div className="gamification-header">
        <div>
          <div className="momentum-title-row">
            <h3>Global momentum</h3>
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

    </section>
  );
}
