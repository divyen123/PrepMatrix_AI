const BADGE_META = {
  "Getting started": {
    icon: "🌱",
    title: "Getting started",
    tone: "starter",
    message: "Plant your first streak by completing one scheduled task.",
  },
  "Momentum builder": {
    icon: "⚡",
    title: "Momentum builder",
    tone: "momentum",
    message: "You are building rhythm. Keep the streak alive today.",
  },
  "Focused learner": {
    icon: "🎯",
    title: "Focused learner",
    tone: "focused",
    message: "Strong focus pattern detected. Push one harder topic next.",
  },
  "Consistent finisher": {
    icon: "🏅",
    title: "Consistent finisher",
    tone: "consistent",
    message: "Your completion habit is becoming reliable.",
  },
  "Pro learner": {
    icon: "🚀",
    title: "Pro learner",
    tone: "pro",
    message: "Elite pace. Keep recovery sessions balanced with progress.",
  },
};

function getBadge(xp) {
  if (xp >= 500) return "Pro learner";
  if (xp >= 300) return "Consistent finisher";
  if (xp >= 100) return "Focused learner";
  if (xp >= 50) return "Momentum builder";
  return "Getting started";
}

function Gamification({ completed, schedule }) {
  const xp = completed.length * 10;
  const level = Math.floor(xp / 100) + 1;
  const levelProgress = xp % 100;

  const todayTasks = schedule[0]?.tasks || [];
  const todayCompleted = todayTasks.filter((task) =>
    completed.includes(task.task)
  ).length;
  const todayProgress =
    todayTasks.length === 0
      ? 0
      : Math.round((todayCompleted / todayTasks.length) * 100);
  const streak = todayCompleted > 0 ? 1 : 0;
  const badge = getBadge(xp);
  const badgeMeta = BADGE_META[badge];
  const nextLevelXp = level * 100;
  const xpToNext = Math.max(nextLevelXp - xp, 0);

  return (
    <section className={`card gamification-card ${badgeMeta.tone}`}>
      <div className="gamification-orb" aria-hidden="true" />
      <div className="gamification-header">
        <div>
          <span className="section-tag">Momentum</span>
          <h3>Study momentum</h3>
        </div>
        <div className="badge-emblem" aria-label={`${badgeMeta.title} badge`} title={badgeMeta.title}>
          <span>{badgeMeta.icon}</span>
        </div>
      </div>

      <div className="xp-ring-wrap">
        <div
          className="xp-ring"
          style={{ "--xp-progress": `${Math.max(levelProgress, 4)}%` }}
        >
          <span>{xp}</span>
          <small>XP</small>
        </div>
        <div className="badge-summary">
          <strong>{badgeMeta.title}</strong>
          <p>{badgeMeta.message}</p>
        </div>
      </div>

      <div className="momentum-stats-grid">
        <article>
          <span>Level</span>
          <strong>{level}</strong>
        </article>
        <article>
          <span>Streak</span>
          <strong>{streak}d</strong>
        </article>
        <article>
          <span>Today</span>
          <strong>{todayProgress}%</strong>
        </article>
      </div>

      <div className="level-progress level-progress-animated">
        <div className="level-progress-fill" style={{ width: `${levelProgress}%` }} />
      </div>

      <div className="next-reward-strip">
        <span>Next level</span>
        <strong>{xpToNext} XP needed</strong>
      </div>

      <p className="card-desc">
        Complete tasks to unlock stronger badges, higher levels, and brighter streak rewards.
      </p>
    </section>
  );
}

export default Gamification;
