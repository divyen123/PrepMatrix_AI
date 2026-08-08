import {
  ArrowUpRight,
  BookOpenCheck,
  BrainCircuit,
  CircleAlert,
  Clock3,
  GraduationCap,
  Layers3,
  LoaderCircle,
  RefreshCw,
  Sparkles,
  Target,
} from "lucide-react";
import { Link } from "react-router-dom";
import "../pages/LearningInsights.css";

function clampPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(100, Math.max(0, Math.round(numeric)));
}

function formatLearningTime(minutes) {
  const safeMinutes = Math.max(0, Math.round(Number(minutes) || 0));
  if (safeMinutes < 60) return `${safeMinutes}m`;
  const hours = Math.floor(safeMinutes / 60);
  const remainder = safeMinutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function statusLabel(value) {
  const key = String(value || "learned").trim().toLocaleLowerCase();
  if (key === "review_due" || key === "review-due") return "Review due";
  if (key === "in_progress" || key === "in-progress") return "In progress";
  return key.replaceAll("_", " ").replaceAll("-", " ") || "Learned";
}

function LearningState({ error, loading, onRetry }) {
  if (loading) {
    return (
      <div aria-live="polite" className="learning-insights-state" role="status">
        <span className="learning-insights-state-icon">
          <LoaderCircle className="learning-insights-spinner" size={24} />
        </span>
        <h4>Reading your learning history</h4>
        <p>Bringing together saved notebooks, mastery checks, and study sessions.</p>
      </div>
    );
  }

  return (
    <div className="learning-insights-state" role="alert">
      <span className="learning-insights-state-icon"><RefreshCw size={23} /></span>
      <h4>Learning progress is temporarily unavailable</h4>
      <p>{error || "Your planner analytics are still available. Retry to load notebook progress."}</p>
      <button className="learning-insights-retry" onClick={onRetry} type="button">
        Retry learning data
      </button>
    </div>
  );
}

function EmptyLearningState() {
  return (
    <div className="learning-insights-state">
      <span className="learning-insights-state-icon"><Sparkles size={24} /></span>
      <h4>Your learning evidence will appear here</h4>
      <p>
        Create a notebook, complete a guided topic, or pass a mastery check to build this view.
      </p>
      <Link className="learning-insights-link" to="/learn">
        Start learning <ArrowUpRight size={16} />
      </Link>
    </div>
  );
}

function Metric({ icon, label, value }) {
  return (
    <article className="learning-insights-metric">
      <span className="learning-insights-metric-icon">{icon}</span>
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  );
}

function LearningProgressSummary({
  description = "Evidence from guided study sessions, completion checks, and saved notebooks.",
  error = "",
  insights,
  loading = false,
  onRetry,
  title = "Learning progress",
  variant = "analytics",
}) {
  const hasNotebooks = Number(insights?.notebookCount || 0) > 0;
  const subjects = Array.isArray(insights?.subjects) ? insights.subjects.slice(0, 6) : [];
  const recentTopics = Array.isArray(insights?.recentLearnedTopics)
    ? insights.recentLearnedTopics.slice(0, 6)
    : [];

  return (
    <section className={`card learning-insights-card${variant === "report" ? " report-learning-card" : ""}`}>
      <div className="learning-insights-heading">
        <div>
          <span className="section-tag">Learning evidence</span>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <Link className="learning-insights-link" to="/learn">
          Open learning studio <ArrowUpRight size={16} />
        </Link>
      </div>

      {loading || error ? (
        <LearningState error={error} loading={loading} onRetry={onRetry} />
      ) : !hasNotebooks ? (
        <EmptyLearningState />
      ) : (
        <>
          <div className="learning-insights-metric-grid">
            <Metric
              icon={<BookOpenCheck size={18} />}
              label="Topics learned"
              value={Number(insights?.learnedTopicCount || 0)}
            />
            <Metric
              icon={<BrainCircuit size={18} />}
              label="Topics mastered"
              value={Number(insights?.masteredTopicCount || 0)}
            />
            <Metric
              icon={<Layers3 size={18} />}
              label="Review due"
              value={Number(insights?.reviewDueCount || 0)}
            />
            <Metric
              icon={<Clock3 size={18} />}
              label="Guided learning"
              value={formatLearningTime(insights?.studyMinutes)}
            />
            <Metric
              icon={<Target size={18} />}
              label="Practice accuracy"
              value={`${Number(insights?.accuracy || 0)}%`}
            />
            <Metric
              icon={<CircleAlert size={18} />}
              label="Open misconceptions"
              value={Number(insights?.unresolvedMisconceptionCount || 0)}
            />
          </div>

          <div className="learning-insights-layout">
            <section className="learning-insights-panel">
              <div className="learning-insights-panel-heading">
                <div>
                  <h4>Subject mastery</h4>
                  <p>Learned topics compared with each notebook&apos;s complete topic set.</p>
                </div>
                <span className="learning-insights-count">
                  {Number(insights?.subjectCount || subjects.length)} subjects
                </span>
              </div>

              <div className="learning-insights-subject-list">
                {subjects.length ? subjects.map((subject) => {
                  const rate = clampPercent(subject?.masteryRate ?? subject?.progressRate);
                  const learned = Number(subject?.learnedTopicCount ?? subject?.learnedTopics ?? 0);
                  const mastered = Number(subject?.masteredTopicCount ?? subject?.masteredTopics ?? 0);
                  const total = Number(subject?.topicCount ?? subject?.totalTopics ?? 0);
                  const name = subject?.subjectName || subject?.name || "Learning subject";
                  return (
                    <article className="learning-insights-subject-row" key={subject?.id || name}>
                      <div className="learning-insights-subject-top">
                        <div className="learning-insights-subject-copy">
                          <strong>{name}</strong>
                          <span>{learned} learned · {mastered} mastered · {total} total</span>
                        </div>
                        <span className="learning-insights-subject-rate">{rate}%</span>
                      </div>
                      <div
                        aria-label={`${name} mastery ${rate}%`}
                        aria-valuemax="100"
                        aria-valuemin="0"
                        aria-valuenow={rate}
                        className="learning-insights-progress"
                        role="progressbar"
                      >
                        <span style={{ width: `${rate}%` }} />
                      </div>
                    </article>
                  );
                }) : (
                  <div className="learning-insights-state">
                    <GraduationCap size={23} />
                    <p>Complete your first topic to establish subject mastery.</p>
                  </div>
                )}
              </div>
            </section>

            <section className="learning-insights-panel">
              <div className="learning-insights-panel-heading">
                <div>
                  <h4>Recently learned</h4>
                  <p>The latest topics backed by a completed learning activity.</p>
                </div>
                <span className="learning-insights-count">{recentTopics.length} recent</span>
              </div>

              <div className="learning-insights-topic-list">
                {recentTopics.length ? recentTopics.map((topic, index) => {
                  const status = statusLabel(topic?.status || topic?.masteryStatus);
                  const context = [topic?.subjectName, topic?.chapterTitle].filter(Boolean).join(" · ");
                  return (
                    <article
                      className="learning-insights-topic-row"
                      key={topic?.id || `${topic?.title || "topic"}-${index}`}
                    >
                      <span className="learning-insights-topic-marker"><BookOpenCheck size={17} /></span>
                      <div className="learning-insights-topic-copy">
                        <strong>{topic?.title || "Learned topic"}</strong>
                        <span>{context || "Saved learning notebook"}</span>
                      </div>
                      <span className={`learning-insights-status-chip${status === "Review due" ? " is-review" : ""}`}>
                        {status}
                      </span>
                    </article>
                  );
                }) : (
                  <div className="learning-insights-state">
                    <BrainCircuit size={23} />
                    <p>Your generated topics are ready. Finish one learning activity to record it here.</p>
                  </div>
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </section>
  );
}

export default LearningProgressSummary;
