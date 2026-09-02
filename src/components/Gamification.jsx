import { useEffect, useId, useRef, useState } from "react";
import { Swords, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getPlannerMetrics } from "../utils/plannerMetrics";
import { combinedMomentumXp } from "../utils/quizBattleUi";
import "./Gamification.css";

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

function Gamification({
  battleStats,
  battleStatsError = "",
  battleStatsEnabled = true,
  battleStatsLoading = false,
  completed,
  onRetryBattleStats,
  schedule,
}) {
  const navigate = useNavigate();
  const battleDetailsId = useId();
  const battleDetailsTitleId = useId();
  const battleDetailsCloseRef = useRef(null);
  const battleDetailsRef = useRef(null);
  const battleDetailsTriggerRef = useRef(null);
  const [battleDetailsOpen, setBattleDetailsOpen] = useState(false);
  const metrics = getPlannerMetrics(schedule, completed);
  const momentumXp = combinedMomentumXp(
    completed.length,
    battleStatsEnabled ? battleStats?.battleXp : 0,
  );
  const xp = momentumXp.totalXp;
  const level = momentumXp.level;
  const levelProgress = momentumXp.levelProgress;

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

  useEffect(() => {
    if (!battleDetailsOpen) return undefined;

    const focusFrame = window.requestAnimationFrame(() => battleDetailsCloseRef.current?.focus());

    const closeOnOutsidePointer = (event) => {
      if (!battleDetailsRef.current?.contains(event.target)) {
        setBattleDetailsOpen(false);
      }
    };
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      setBattleDetailsOpen(false);
      window.requestAnimationFrame(() => battleDetailsTriggerRef.current?.focus());
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [battleDetailsOpen]);

  const openQuizBattles = () => navigate("/quiz?tab=battles");
  const closeBattleDetails = () => {
    setBattleDetailsOpen(false);
    window.requestAnimationFrame(() => battleDetailsTriggerRef.current?.focus());
  };

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

      <div className="gamification-scroll-region">
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

        {battleStatsEnabled && (
          <div className="battle-insights" ref={battleDetailsRef}>
            <button
              aria-controls={battleDetailsId}
              aria-expanded={battleDetailsOpen}
              aria-haspopup="dialog"
              aria-label="View Quiz Battle momentum"
              className={`battle-insights-trigger${battleStatsError ? " is-error" : ""}`}
              onClick={() => setBattleDetailsOpen((current) => !current)}
              ref={battleDetailsTriggerRef}
              title="View Quiz Battle momentum"
              type="button"
            >
              <Swords aria-hidden="true" size={19} />
            </button>

            {battleDetailsOpen && (
              <section
                aria-labelledby={battleDetailsTitleId}
                className="battle-insights-popover"
                id={battleDetailsId}
                role="dialog"
              >
                <header>
                  <div>
                    <span>Quiz Battles</span>
                    <strong id={battleDetailsTitleId}>Battle momentum</strong>
                  </div>
                  <button
                    aria-label="Close Quiz Battle momentum"
                    onClick={closeBattleDetails}
                    ref={battleDetailsCloseRef}
                    type="button"
                  >
                    <X aria-hidden="true" size={16} />
                  </button>
                </header>

                <dl className="battle-insights-list">
                  <div>
                    <dt>Planner XP</dt>
                    <dd>{momentumXp.plannerXp}</dd>
                  </div>
                  <div>
                    <dt>Battle XP</dt>
                    <dd>{battleStatsLoading ? "Loading…" : momentumXp.battleXp}</dd>
                  </div>
                  <div>
                    <dt>Battles played</dt>
                    <dd>{battleStats?.played || 0}</dd>
                  </div>
                  <div className="battle-insights-record">
                    <dt>Record</dt>
                    <dd>
                      <span>{battleStats?.wins || 0} wins</span>
                      <span>{battleStats?.draws || 0} draws</span>
                      <span>{battleStats?.losses || 0} losses</span>
                    </dd>
                  </div>
                  {Number(battleStats?.uncontested) > 0 && (
                    <div>
                      <dt>Uncontested</dt>
                      <dd>{battleStats.uncontested}</dd>
                    </div>
                  )}
                  {Number(battleStats?.perfectScores) > 0 && (
                    <div>
                      <dt>Perfect scores</dt>
                      <dd>{battleStats.perfectScores}</dd>
                    </div>
                  )}
                </dl>

                {battleStats?.badges?.length > 0 && (
                  <div className="battle-insights-achievements">
                    <span>Achievements</span>
                    {battleStats.badges.map((battleBadge) => (
                      <strong key={battleBadge}>
                        <Swords aria-hidden="true" size={14} />
                        {battleBadge}
                      </strong>
                    ))}
                  </div>
                )}

                {battleStatsError && (
                  <div className="battle-insights-warning" role="status">
                    <span>Battle data could not be refreshed. Planner XP is still available.</span>
                    <button onClick={onRetryBattleStats} type="button">Retry</button>
                  </div>
                )}

                <button className="battle-insights-link" onClick={openQuizBattles} type="button">
                  Open Quiz Battles
                </button>
              </section>
            )}
          </div>
        )}

        {(metrics.isExamEligible || battleStatsEnabled) && (
          <div className="momentum-action-grid">
            {metrics.isExamEligible && (
              <article className="momentum-action-card exam-eligibility-achievement" role="status">
                <strong>🏆 Exam-ready achievement</strong>
                <p>You are now eligible to attend the exam</p>
                <button
                  className="secondary-btn exam-eligibility-cta"
                  onClick={() => navigate("/exam?section=attend")}
                  type="button"
                >
                  Attend Exam
                </button>
              </article>
            )}

            {battleStatsEnabled && (
              <article className="momentum-action-card quiz-battle-achievement">
                <strong><Swords aria-hidden="true" size={16} /> Quiz Battle arena</strong>
                <p>Challenge a friend and build verified battle XP.</p>
                <button className="secondary-btn quiz-battle-cta" onClick={openQuizBattles} type="button">
                  Attend quiz
                </button>
              </article>
            )}
          </div>
        )}

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
          Complete planner tasks and Quiz Battles to unlock stronger badges and higher levels.
        </p>
      </div>
    </section>
  );
}

export default Gamification;
