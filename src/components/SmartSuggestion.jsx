import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { getPlannerMetrics } from "../utils/plannerMetrics";

// SmartSuggestion component renders curated dynamic recommendations.
function SmartSuggestion({
  academicLevel = "College",
  schedule,
  completed,
  subjects = [],
}) {
  const safeSubjects = Array.isArray(subjects) ? subjects : [];
  const metrics = getPlannerMetrics(schedule, completed);

  if (safeSubjects.length === 0) {
    return (
      <section aria-label="Smart suggestions" className="smart-suggestion-card">
        <Link
          aria-label="Add your subjects and generate a plan"
          className="smart-suggestion-cta is-empty"
          to="/subjects"
        >
          <span>Add your subjects and generate a plan</span>
          <ArrowRight aria-hidden="true" size={16} />
        </Link>
      </section>
    );
  }

  if (!metrics.hasScheduledPlanner) {
    return (
      <section aria-label="Smart suggestions" className="smart-suggestion-card">
        <Link
          aria-label="Generate a schedule"
          className="smart-suggestion-cta is-yellow"
          to="/planner/schedule"
        >
          <span>Generate a schedule</span>
          <ArrowRight aria-hidden="true" size={16} />
        </Link>
      </section>
    );
  }

  const weakest = metrics.weakSubject;
  const isSchoolLevel = academicLevel !== "College";

  const suggestions = [
    {
      label: "Priority",
      title: weakest ? `Revisit ${weakest}` : "Build the first plan",
      detail: weakest
        ? `For ${academicLevel}, revise the basics first, then solve chapter examples.`
        : `Create a ${academicLevel} study plan to unlock subject-specific focus guidance.`,
    },
    {
      label: "Next move",
      title: metrics.firstPendingTask || "Choose an exam date",
      detail: metrics.firstPendingTask
        ? isSchoolLevel
          ? "Start with the earliest pending chapter and keep the session short and clear."
          : "Start with the earliest pending item before adding extra work."
        : "Pick a future date so PrepMatrix can distribute chapters.",
    },

    {
      label: "Recovery",
      title: `${metrics.remainingTasks} tasks remaining`,
      detail: metrics.remainingTasks
        ? "Use recover backlog after missed sessions to keep the plan realistic."
        : "Your planner has no pending workload right now.",
    },
    {
      label: "Rhythm",
      title: `${metrics.completionRate}% complete`,
      detail: metrics.completionRate >= 50
        ? "Keep the current rhythm and protect revision time."
        : "Complete one planned task to restart momentum today.",
    },
  ];

  return (
    <section aria-label="Smart suggestions" className="smart-suggestion-card">
      <div className="smart-suggestion-strip">
        {suggestions.map((suggestion) => (
          <article className="suggestion-mini-card" key={suggestion.label}>
            <span className="panel-label">{suggestion.label}</span>
            <strong>{suggestion.title}</strong>
            <p>{suggestion.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export default SmartSuggestion;
