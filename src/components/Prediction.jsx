import { getPlannerMetrics } from "../utils/plannerMetrics";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

function Prediction({ schedule, completed, subjects = [] }) {
  const metrics = getPlannerMetrics(schedule, completed);

  let headline = "You need a stronger study rhythm.";
  let supportingText = "Aim to complete at least one planned task in the next session.";

  if (!subjects.length) {
    supportingText = "Add a subject first to start tracking your study progress.";
  } else if (metrics.completionRate >= 80) {
    headline = "You are on track for a strong finish.";
    supportingText = "Keep revision quality high and maintain the current pace.";
  } else if (metrics.completionRate >= 50) {
    headline = "Your progress is steady.";
    supportingText = "A little more consistency will move you into a safer range.";
  }

  return (
    <section className="card">
      <h2>Study prediction</h2>
      <p className="prediction-score">{metrics.completionRate}%</p>
      <p>{headline}</p>
      {subjects.length === 0 ? (
        <div className="prediction-subjects-action">
          <p className="card-subtext">{supportingText}</p>
          <Link
            aria-label="Add a subject"
            className="prediction-subjects-action-link"
            title="Add a subject"
            to="/subjects#add-subject"
          >
            <ArrowRight aria-hidden="true" size={17} />
          </Link>
        </div>
      ) : (
        <p className="card-subtext">{supportingText}</p>
      )}
    </section>
  );
}

export default Prediction;
