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

  return (
    <section className="card weekly-review-card">
      <div className="weekly-review-header">
        <div>
          <span className="section-tag">AI weekly review</span>
          <h3>Planner progress review</h3>
        </div>
      </div>

      <p className="card-desc">
        Generate a progress-aware summary and practical next steps from your current planner.
      </p>

      {visibleReview ? (
        <div className="weekly-review-output">
          <div className="weekly-review-output-header">
            <span>Generated review</span>
            <strong>{visibleReview.headline}</strong>
          </div>

          <div className="weekly-review-highlights">
            {visibleReview.highlights.map((item) => (
              <article key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </article>
            ))}
          </div>

          <div className="weekly-review-actions">
            <span>Action plan</span>
            <ul>
              {visibleReview.actions.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <p className="empty-state">
          {hasScheduledPlanner
            ? "Generating your planner-aware weekly summary..."
            : "Generate a timetable in Planner to unlock your weekly review."}
        </p>
      )}
    </section>
  );
}

export default WeeklyReview;
