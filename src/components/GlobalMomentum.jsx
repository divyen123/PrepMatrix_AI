import CometDial from './CometDial';

const MOMENTUM_LABELS = { study: 'Subjects', exam: 'Exams', quiz: 'Quizzes', battle: 'Quiz Battles', coding: 'CodeMatrix' };

export default function GlobalMomentum({ codeRewardsControl, data, error, onRetry }) {
  const global = data?.global;
  const xp = global?.totalXp || 0;
  const level = global?.level || (Math.floor(xp / 100) + 1);
  const minXp = Math.max(0, (level - 1) * 100);
  const maxXp = Math.max(100, level * 100);
  const progress = global?.levelProgress || 0;
  const runs = data?.successfulCodeRuns || 0;
  return <>
    <div className="xp-ring-wrap">
      <CometDial
        accent="var(--accent)"
        className="momentum-comet-dial"
        figureSize={26}
        ink="var(--text)"
        label="Global momentum XP"
        max={maxXp}
        min={minXp}
        readOnly
        size={138}
        sublabel="GLOBAL XP"
        sweep={310}
        thickness={6}
        unit=""
        value={xp}
      />
      <div className="momentum-stats-grid"><article><span>Global level</span><strong>{level}</strong></article><article className="is-rewards-earned"><span>Rewards earned</span><strong>{data?.history?.length || 0}</strong></article><article><span>Code runs</span><strong>{runs}</strong></article></div>
    </div>
    {error && <p className="momentum-refresh-error" role="status">{error} <button type="button" onClick={onRetry}>Retry</button></p>}
    <div className="global-momentum-sources">
      {Object.entries(MOMENTUM_LABELS).map(([kind, label]) => {
        const sourceXp = global?.breakdown?.[kind] || 0;
        return (
          <article key={kind}>
            <span>{label}</span>
            {kind === 'coding' ? (
              <div className="codematrix-source-actions">
                <strong>{sourceXp}<small> XP</small></strong>
                {codeRewardsControl}
              </div>
            ) : <strong>{sourceXp}<small> XP</small></strong>}
          </article>
        );
      })}
    </div>
    <div className="next-reward-strip"><span>Next level</span><strong>{100 - progress} XP needed</strong></div>
  </>;
}
