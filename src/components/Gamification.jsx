import { useEffect, useId, useRef, useState } from "react";
import { Info, Swords, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getPlannerMetrics } from "../utils/plannerMetrics";
import { getStudyMomentumDailyMetrics } from "../utils/studyMomentumMetrics";
import { combinedMomentumXp } from "../utils/quizBattleUi";
import { subscribeToLocalDateChanges } from "../utils/localDateRefresh";
import CometDial from "./CometDial";
import "./Gamification.css";
import './MomentumViews.css';

const MOMENTUM_GUIDANCE =
  "Earn XP through study tasks, exams, quizzes, and successful CodeMatrix runs. Global XP stays with you after a schedule is cleared.";

const MOMENTUM_REWARDS =
  "10 XP per study task · 40 XP per submitted exam · 10 XP per completed quiz · existing Battle rewards · 10 XP per four successful code runs.";

const BADGE_META = {
  "Getting started": {
    title: "Getting started",
    tone: "starter",
  },
  "Momentum builder": {
    title: "Momentum builder",
    tone: "momentum",
  },
  "Focused learner": {
    title: "Focused learner",
    tone: "focused",
  },
  "Consistent finisher": {
    title: "Consistent finisher",
    tone: "consistent",
  },
  "Pro learner": {
    title: "Pro learner",
    tone: "pro",
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
  scheduleStartDate = "",
  subjects = [],
  momentum,
  momentumError = '',
  onRetryMomentum,
}) {
  const navigate = useNavigate();
  const battleDetailsId = useId();
  const battleDetailsTitleId = useId();
  const badgeGuidanceId = useId();
  const battleDetailsCloseRef = useRef(null);
  const battleDetailsTriggerRef = useRef(null);
  const battleInsightsRef = useRef(null);
  const [battleDetailsOpen, setBattleDetailsOpen] = useState(false);
  const [battleDetailsMounted, setBattleDetailsMounted] = useState(false);
  const [today, setToday] = useState(() => new Date());
  const metrics = getPlannerMetrics(schedule, completed);
  const momentumXp = combinedMomentumXp(
    metrics.completedTasks,
    battleStatsEnabled ? momentum?.schedule?.breakdown?.battle : 0,
  );
  momentumXp.totalXp += (momentum?.schedule?.breakdown?.exam || 0) + (momentum?.schedule?.breakdown?.quiz || 0);
  momentumXp.level = Math.floor(momentumXp.totalXp / 100) + 1;
  const xp = momentumXp.totalXp;
  const level = momentumXp.level;
  const { todayCompleted, todayTotal, todayProgress, streak } = getStudyMomentumDailyMetrics({
    schedule,
    completed,
    scheduleStartDate,
    today,
  });
  const badge = getBadge(xp);
  const badgeMeta = BADGE_META[badge];
  const nextLevelXp = level * 100;
  const xpToNext = Math.max(nextLevelXp - xp, 0);
  const hasQuizSubjects = Array.isArray(subjects) && subjects.some((subject) => (
    String(subject?.name || subject || "").trim()
  ));
  const isQuizEligible = battleStatsEnabled && hasQuizSubjects;

  useEffect(() => subscribeToLocalDateChanges(setToday), []);

  useEffect(() => {
    if (!battleDetailsOpen) return undefined;

    const focusFrame = window.requestAnimationFrame(() => battleDetailsCloseRef.current?.focus());
    const closeOnOutsidePointer = (event) => {
      if (!battleInsightsRef.current?.contains(event.target)) {
        setBattleDetailsOpen(false);
      }
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setBattleDetailsOpen(false);
        window.requestAnimationFrame(() => battleDetailsTriggerRef.current?.focus());
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [battleDetailsOpen]);

  useEffect(() => {
    if (battleDetailsOpen || !battleDetailsMounted) return undefined;
    const timeout = window.setTimeout(() => setBattleDetailsMounted(false), 220);
    return () => window.clearTimeout(timeout);
  }, [battleDetailsMounted, battleDetailsOpen]);

  const openQuizBattles = () => navigate("/quiz?tab=battles");
  const toggleBattleDetails = () => {
    if (battleDetailsOpen) {
      setBattleDetailsOpen(false);
    } else {
      setBattleDetailsMounted(true);
      setBattleDetailsOpen(true);
    }
  };
  const closeBattleDetails = () => {
    setBattleDetailsOpen(false);
    window.requestAnimationFrame(() => battleDetailsTriggerRef.current?.focus());
  };

  return (
    <section className={`card gamification-card study-momentum-card ${badgeMeta.tone}${battleDetailsMounted ? " has-battle-details" : ""}`}>
      <div className="gamification-header">
        <div>
          <div className="momentum-title-row"><h3>Study momentum</h3>
          </div><p className="momentum-view-label">Current schedule · tasks, exams and quizzes</p>
        </div>
        <div className="gamification-header-actions">
          <div className="badge-emblem-wrap">
            <button
              aria-describedby={badgeGuidanceId}
              aria-label={`About Study momentum and the ${badgeMeta.title} badge`}
              className="badge-emblem"
              type="button"
            >
              <Info aria-hidden="true" size={19} />
            </button>
            <span className="badge-guidance-tooltip" id={badgeGuidanceId} role="tooltip">
              {MOMENTUM_GUIDANCE}
              <span className="badge-reward-guidance">{MOMENTUM_REWARDS}</span>
            </span>
          </div>
        </div>
      </div>

      <div className="gamification-scroll-region">
        {momentumError && <p className="momentum-refresh-error" role="status">Assessment XP could not be refreshed. <button type="button" onClick={onRetryMomentum}>Retry</button></p>}
        <div className="xp-ring-wrap">
          <CometDial
            accent="var(--accent)"
            className="momentum-comet-dial"
            figureSize={26}
            ink="var(--text)"
            label="Study momentum XP"
            max={Math.max(100, level * 100)}
            min={Math.max(0, (level - 1) * 100)}
            readOnly
            size={138}
            sublabel="XP"
            sweep={310}
            thickness={6}
            unit=""
            value={xp}
          />
          <div className="momentum-stats-grid">
            <article>
              <span>Level</span>
              <strong>{level}</strong>
            </article>
            <article
              aria-label={`Scheduled-task streak: ${streak} ${streak === 1 ? "day" : "days"}. Based on scheduled dates, not completion timestamps.`}
              title="Consecutive scheduled days with a completed task, ending today or yesterday"
            >
              <span>Streak</span>
              <strong>{streak}d</strong>
            </article>
            <article aria-label={`Today's scheduled tasks: ${todayCompleted} of ${todayTotal} completed (${todayProgress}%).`}>
              <span>Today</span>
              <strong>{todayProgress}%</strong>
            </article>
          </div>
        </div>

        <div className="battle-insights" ref={battleInsightsRef}>
          <div className="battle-summary-grid">
            <article>
              <span>Planner XP</span>
              <strong>{momentumXp.plannerXp}</strong>
            </article>
            <article>
              <span>Battle XP</span>
              <strong>{battleStatsEnabled && battleStatsLoading ? "Loading…" : momentumXp.battleXp}</strong>
            </article>
            <button
              aria-controls={battleDetailsId}
              aria-expanded={battleDetailsOpen}
              aria-haspopup="dialog"
              className={`battle-insights-trigger${battleStatsError ? " is-error" : ""}`}
              disabled={!battleStatsEnabled}
              onClick={toggleBattleDetails}
              ref={battleDetailsTriggerRef}
              type="button"
            >
              <span>Battles played</span>
              <strong>{battleStatsEnabled ? battleStats?.played || 0 : 0}</strong>
            </button>
          </div>
          {battleDetailsMounted && (
            <section
              aria-labelledby={battleDetailsTitleId}
              className={`battle-insights-popover study-battle-popover ${battleDetailsOpen ? "is-open" : "is-closing"}`}
              id={battleDetailsId}
              inert={battleDetailsOpen ? undefined : true}
              role="dialog"
            >
              <header>
                <strong id={battleDetailsTitleId}>Quiz Battles</strong>
                <button
                  aria-label="Close Quiz Battles details"
                  onClick={closeBattleDetails}
                  ref={battleDetailsCloseRef}
                  type="button"
                >
                  <X aria-hidden="true" size={16} />
                </button>
              </header>

              <dl className="battle-insights-list">
                <div className="battle-insights-record">
                  <dt>Record</dt>
                  <dd>
                    <span><span className="battle-record-win-count">{battleStats?.wins || 0}</span> wins</span>
                    <span>{battleStats?.draws || 0} draws</span>
                    <span><span className="battle-record-loss-count">{battleStats?.losses || 0}</span> losses</span>
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

              <div className="battle-insights-achievements">
                <span>Achievements</span>
                {battleStats?.badges?.length > 0
                  ? battleStats.badges.map((battleBadge) => (
                    <strong key={battleBadge}>
                      <Swords aria-hidden="true" size={14} />
                      {battleBadge}
                    </strong>
                  ))
                  : <p>{battleStatsLoading ? "Loading achievements…" : "No achievements yet."}</p>}
              </div>

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

        <div className="momentum-action-grid">
          <article
            aria-disabled={!metrics.isExamEligible}
            className={`momentum-action-card exam-eligibility-achievement ${metrics.isExamEligible ? "is-enabled" : "is-disabled"}`}
          >
            <strong>🏆 Exam-ready achievement</strong>
            <p>
              {metrics.isExamEligible
                ? "You are now eligible to attend the exam."
                : metrics.hasScheduledPlanner
                  ? `${metrics.completionRate}% complete. Reach 80% to unlock the exam.`
                  : "Create a schedule and complete 80% to unlock the exam."}
            </p>
            <button
              className="secondary-btn exam-eligibility-cta"
              disabled={!metrics.isExamEligible}
              onClick={() => navigate("/exam?section=attend")}
              type="button"
            >
              Attend Exam
            </button>
          </article>

          <article
            aria-disabled={!isQuizEligible}
            className={`momentum-action-card quiz-battle-achievement ${isQuizEligible ? "is-enabled" : "is-disabled"}`}
          >
            <strong><Swords aria-hidden="true" size={16} /> Quiz Battle arena</strong>
            <p>
              {hasQuizSubjects
                ? battleStatsEnabled
                  ? "Challenge a friend and build verified battle XP."
                  : "Quiz Battles are unavailable for this profile."
                : "Add at least one subject to unlock Quiz Battles."}
            </p>
            <button
              className="secondary-btn quiz-battle-cta"
              disabled={!isQuizEligible}
              onClick={openQuizBattles}
              type="button"
            >
              Attend quiz
            </button>
          </article>
        </div>

        <div className="next-reward-strip">
          <span>Next level</span>
          <strong>{xpToNext} XP needed</strong>
        </div>
      </div>

    </section>
  );
}

export default Gamification;
