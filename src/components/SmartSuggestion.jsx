import { getPlannerMetrics } from "../utils/plannerMetrics";

function SmartSuggestion({ academicLevel = "College", academicTrack = "General", schedule, completed }) {
  const metrics = getPlannerMetrics(schedule, completed);
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
      label: "Level fit",
      title: `${academicLevel} - ${academicTrack}`, 
      detail: isSchoolLevel
        ? "Materials will prefer class-friendly explanations, syllabus terms, and guided practice for this stream."
        : "Materials will prefer deeper references, practical examples, and self-study resources for this stream.",
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
    <section className="card smart-suggestion-card">
      <div className="smart-suggestion-header">
        <h3>Smart suggestion</h3>
        <span>{metrics.totalTasks ? `${metrics.completedTasks}/${metrics.totalTasks} done` : `${academicLevel} profile`}</span>
      </div>

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


