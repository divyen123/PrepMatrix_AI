import { useMemo, useState, useEffect } from "react";
import { getPlannerMetrics } from "../utils/plannerMetrics";
import { buildWeeklyReview } from "../utils/weeklyReview";

function WeeklyReview({ academicLevel = "College", academicTrack = "General", schedule = [], completed = [] }) {
  const [review, setReview] = useState(null);
  const metrics = useMemo(() => getPlannerMetrics(schedule, completed), [schedule, completed]);
  const hasScheduledPlanner = metrics.hasScheduledPlanner;
  const visibleReview = hasScheduledPlanner ? review : null;

  const generateReview = () => {
    if (!hasScheduledPlanner) return;
    setReview(buildWeeklyReview(metrics, { academicLevel, academicTrack }));
  };

  useEffect(() => {
    if (hasScheduledPlanner && !review) {
      generateReview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasScheduledPlanner]);

  if (!hasScheduledPlanner) {
    return (
      <div className="weekly-review-empty-state" role="status">
        Generate a timetable in Planner to unlock your weekly review.
      </div>
    );
  }

  if (!visibleReview) {
    return (
      <div className="weekly-review-empty-state" role="status">
        Generating your planner-aware weekly summary...
      </div>
    );
  }

  return (
    <section aria-label="Weekly review" className="weekly-review-output">
      <div className="weekly-review-highlights">
        {visibleReview.highlights.filter((item) => item.label !== "Remaining").map((item) => (
          <article
            className={item.label === "Priority subject"
              ? "is-priority-subject"
              : item.label === "Most completed subject"
                ? "is-most-completed-subject"
                : undefined}
            key={item.label}
          >
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </article>
        ))}
      </div>

      <div className="weekly-review-actions">
        <span>Action plan</span>
        <ol className="weekly-review-timeline">
          {visibleReview.actions.map((action, index) => (
            <li
              key={action}
              style={{
                "--timeline-step-delay": `${index * 360}ms`,
                "--timeline-line-delay": `${index * 360 + 140}ms`,
              }}
            >
              <span aria-hidden="true" className="weekly-review-timeline-marker">{index + 1}</span>
              <p>{action}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export default WeeklyReview;
