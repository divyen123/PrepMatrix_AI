import { useMemo, useState } from "react";
import { getPlannerMetrics } from "../utils/plannerMetrics";

function WeeklyReview({ academicLevel = "College", academicTrack = "General", schedule = [], completed = [] }) {
  const [review, setReview] = useState(null);
  const metrics = useMemo(() => getPlannerMetrics(schedule, completed), [schedule, completed]);

  const generateReview = () => {
    const missedTasks = metrics.remainingTasks;
    const weakSubject = metrics.weakSubject || "No weak subject detected yet";
    const nextTask = metrics.firstPendingTask || "No pending task right now";
    const completionLabel = `${metrics.completedTasks}/${metrics.totalTasks} tasks completed`;

    setReview({
      headline: `Weekly review for ${academicLevel} (${academicTrack})`,
      highlights: [
        { label: "Completed", value: completionLabel },
        { label: "Weakest area", value: weakSubject },
        { label: "Pending workload", value: `${missedTasks} tasks need attention` },
      ],
      actions: [
        `Start next week with ${nextTask}.`,
        "Recover backlog before adding new chapters.",
        "Protect one revision block after every 3 focused study sessions.",
        weakSubject === "No weak subject detected yet"
          ? "Complete more tasks to reveal a clearer weak-area pattern."
          : `Give ${weakSubject} one dedicated repair session.`,
      ],
    });
  };

  return (
    <section className="card weekly-review-card">
      <div className="weekly-review-header">
        <div>
          <span className="section-tag">AI weekly review</span>
          <h3>Next-week recovery plan</h3>
        </div>
        <button className="secondary-btn" onClick={generateReview} type="button">
          Generate review
        </button>
      </div>

      <p className="card-desc">
        Summarize completed tasks, weak subjects, missed chapters, and a simple recovery path for the next week.
      </p>

      {review ? (
        <div className="weekly-review-output">
          <div className="weekly-review-output-header">
            <span>Generated review</span>
            <strong>{review.headline}</strong>
          </div>

          <div className="weekly-review-highlights">
            {review.highlights.map((item) => (
              <article key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </article>
            ))}
          </div>

          <div className="weekly-review-actions">
            <span>Action plan</span>
            <ul>
              {review.actions.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <p className="empty-state">Click generate review to create a planner-aware weekly summary.</p>
      )}
    </section>
  );
}

export default WeeklyReview;
