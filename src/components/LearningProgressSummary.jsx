import {
  ArrowUpRight,
  BookOpenCheck,
  BrainCircuit,
  CircleAlert,
  Clock3,
  Layers3,
  LoaderCircle,
  RefreshCw,
  Sparkles,
  Target,
} from "lucide-react";
import { Link } from "react-router-dom";
import "../pages/LearningInsights.css";

function formatLearningTime(minutes) {
  const safeMinutes = Math.max(0, Math.round(Number(minutes) || 0));
  if (safeMinutes < 60) return `${safeMinutes}m`;
  const hours = Math.floor(safeMinutes / 60);
  const remainder = safeMinutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
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
  error = "",
  insights,
  loading = false,
  onRetry,
  title = "Learning progress",
}) {
  const hasNotebooks = Number(insights?.notebookCount || 0) > 0;

  return (
    <section className="card learning-insights-card">
      <div className="learning-insights-heading">
        <div>
          <span className="section-tag">Learning evidence</span>
          <h3>{title}</h3>
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
      )}
    </section>
  );
}

export default LearningProgressSummary;
