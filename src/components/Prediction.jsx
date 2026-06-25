import { getPlannerMetrics } from "../utils/plannerMetrics";

function Prediction({ schedule, completed }) {
  const metrics = getPlannerMetrics(schedule, completed);

  let headline = "You need a stronger study rhythm.";
  let supportingText = "Aim to complete at least one planned task in the next session.";

  if (metrics.completionRate >= 80) {
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
      <p className="card-subtext">{supportingText}</p>
    </section>
  );
}

export default Prediction;
