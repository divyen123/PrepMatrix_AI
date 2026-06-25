import { getPlannerMetrics } from "../utils/plannerMetrics";

function Insights({ schedule, completed }) {
  const metrics = getPlannerMetrics(schedule, completed);

  let patternMessage = "Complete a few tasks to unlock study-pattern insights.";

  if (metrics.morningCompleted > metrics.eveningCompleted) {
    patternMessage = "Your completed work is stronger during morning sessions.";
  } else if (metrics.eveningCompleted > metrics.morningCompleted) {
    patternMessage = "You are currently finishing more tasks in evening sessions.";
  }

  return (
    <section className="card">
      <h3>Study insights</h3>
      <p>{patternMessage}</p>
      <p>Completed tasks: {metrics.completedTasks}</p>
      <p className="card-desc">
        These signals are based on your planner activity and completion trend.
        Use them to place difficult chapters where your focus is strongest.
      </p>
    </section>
  );
}

export default Insights;
