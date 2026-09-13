const MOMENTUM_LABELS = { study: 'Subjects', exam: 'Exams', quiz: 'Quizzes', battle: 'Quiz Battles', coding: 'CodeMatrix' };

export default function GlobalMomentum({ data, loading, error, onRetry }) {
  const global = data?.global;
  const xp = global?.totalXp || 0;
  const progress = global?.levelProgress || 0;
  const runs = data?.successfulCodeRuns || 0;
  return <>
    <div className="xp-ring-wrap">
      <div className="xp-ring" style={{ '--xp-progress': `${progress}%` }}><span>{loading && !data ? '…' : xp}</span><small>GLOBAL XP</small></div>
      <div className="badge-summary"><strong>Every effort counts</strong><p>Your lifetime XP in this academic profile stays with you when schedules are cleared.</p></div>
    </div>
    {error && <p className="momentum-refresh-error" role="status">{error} <button type="button" onClick={onRetry}>Retry</button></p>}
    <div className="global-momentum-sources">{Object.entries(MOMENTUM_LABELS).map(([kind, label]) => <article key={kind}><span>{label}</span><strong>{global?.breakdown?.[kind] || 0}<small> XP</small></strong></article>)}</div>
    <div className="momentum-stats-grid"><article><span>Global level</span><strong>{global?.level || 1}</strong></article><article><span>Rewards earned</span><strong>{data?.history?.length || 0}</strong></article><article><span>Code runs</span><strong>{runs}</strong></article></div>
    <div className="level-progress level-progress-animated" aria-label={`Global level progress: ${progress}%`}><div className="level-progress-fill" style={{ width: `${progress}%` }} /></div>
    <div className="next-reward-strip"><span>Next level</span><strong>{100 - progress} XP needed</strong></div>
    <div className="momentum-coding-progress"><span>CodeMatrix reward</span><strong>{runs % 4}/4 successful runs</strong><div role="progressbar" aria-label="CodeMatrix reward progress" aria-valuemin={0} aria-valuemax={4} aria-valuenow={runs % 4}><i style={{ width: `${runs % 4 * 25}%` }} /></div><small>{4 - runs % 4} more successful runs to earn 10 XP.</small></div>
  </>;
}
