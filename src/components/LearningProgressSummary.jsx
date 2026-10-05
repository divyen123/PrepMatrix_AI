import {
  ArrowUpRight,
  BookOpenCheck,
  CheckCircle2,
  Layers3,
  LoaderCircle,
  RefreshCw,
  Sparkles,
  Target,
} from "lucide-react";
import { Link } from "react-router-dom";
import "../pages/LearningInsights.css";

function LearningState({ error, loading, onRetry }) {
  if (loading) {
    return (
      <div aria-live="polite" className="learning-insights-state" role="status">
        <span className="learning-insights-state-icon">
          <LoaderCircle className="learning-insights-spinner" size={24} />
        </span>
        <h4>Reading your notebook progress</h4>
        <p>Loading saved notebooks and topic completion.</p>
      </div>
    );
  }

  return (
    <div className="learning-insights-state" role="alert">
      <span className="learning-insights-state-icon"><RefreshCw size={23} /></span>
      <h4>Notebook progress is temporarily unavailable</h4>
      <p>{error || "Your planner analytics are still available. Retry to load notebook progress."}</p>
      <button className="learning-insights-retry" onClick={onRetry} type="button">
        Retry notebook progress
      </button>
    </div>
  );
}

function EmptyLearningState({ historical = false }) {
  return (
    <div className="learning-insights-state">
      <span className="learning-insights-state-icon"><Sparkles size={24} /></span>
      <h4>{historical ? "No notebook progress was saved" : "Your notebook progress will appear here"}</h4>
      <p>
        {historical ? "There were no saved notebooks at the time of this schedule." : "Create a notebook and mark its topics completed to track your progress."}
      </p>
      {!historical && <Link className="learning-insights-link" to="/learn#notebook-preparation">
        Prepare a notebook <ArrowUpRight size={16} />
      </Link>}
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
  title = "Notebook preparation progress",
  historical = false,
}) {
  const hasNotebooks = Number(insights?.notebookCount || 0) > 0;
  const completedTopics = Number(insights?.completedTopicCount ?? insights?.learnedTopicCount ?? 0);
  const totalTopics = Number(insights?.topicCount || 0);
  const hasTopicTotal = insights?.topicCount != null;
  const coverage = totalTopics ? Math.min(100, Math.round((completedTopics / totalTopics) * 100)) : 0;

  return (
    <section className="card learning-insights-card">
      <div className="learning-insights-heading">
        <div>
          <h3>{title}</h3>
        </div>
        {!historical && <Link className="learning-insights-link" to="/learn#notebook-preparation">
          Open notebook preparation <ArrowUpRight size={16} />
        </Link>}
      </div>

      {loading || error ? (
        <LearningState error={error} loading={loading} onRetry={onRetry} />
      ) : !hasNotebooks ? (
        <EmptyLearningState historical={historical} />
      ) : (
        <div className="learning-insights-metric-grid">
          <Metric
            icon={<Layers3 size={18} />}
            label="Notebooks"
            value={Number(insights?.notebookCount || 0)}
          />
          <Metric
            icon={<CheckCircle2 size={18} />}
            label="Completed notebooks"
            value={insights?.completedNotebookCount ?? "—"}
          />
          <Metric
            icon={<BookOpenCheck size={18} />}
            label="Topics completed"
            value={hasTopicTotal ? `${completedTopics}/${totalTopics}` : completedTopics}
          />
          <Metric
            icon={<Target size={18} />}
            label="Completion"
            value={hasTopicTotal ? `${coverage}%` : "—"}
          />
        </div>
      )}
    </section>
  );
}

export default LearningProgressSummary;
