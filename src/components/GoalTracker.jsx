import { useState } from "react";

function GoalTracker({ completed, schedule, subjects = [] }) {
  const [goal, setGoal] = useState("");
  const [days, setDays] = useState(5);

  const safeDays = Math.max(1, days);

  const goalTasks = schedule.flatMap(
    (day) =>
      day.tasks?.filter(
        (task) => goal && task.task.toLowerCase().includes(goal.toLowerCase())
      ) || []
  );

  const totalGoalTasks = goalTasks.length;
  const normalizedGoal = goal.trim().toLowerCase();
  const matchedSubjects = normalizedGoal
    ? subjects.filter((subject) => subject.name.toLowerCase().includes(normalizedGoal))
    : [];
  const matchedSubjectNames = [
    ...new Set(
      (matchedSubjects.length
        ? matchedSubjects.map((subject) => subject.name)
        : goalTasks.map((task) => task.task.split(" - Chapter ")[0]).filter(Boolean)
      )
    ),
  ];
  const completedGoalTasks = goalTasks.filter((task) =>
    completed.includes(task.task)
  ).length;

  const progress =
    totalGoalTasks === 0 ? 0 : (completedGoalTasks / totalGoalTasks) * 100;

  const dailyTarget =
    totalGoalTasks === 0 ? 0 : (totalGoalTasks / safeDays).toFixed(1);

  const averagePerDay =
    completedGoalTasks === 0
      ? 0
      : completedGoalTasks / Math.max(1, safeDays - 1);

  const remainingTasks = totalGoalTasks - completedGoalTasks;
  const estimatedDays =
    averagePerDay === 0 ? "Not enough data" : `${Math.ceil(remainingTasks / averagePerDay)} days`;

  const expectedProgress = 100 / safeDays;

  const progressColor =
    progress < 30 ? "#b8324b" : progress < 70 ? "#b7791f" : "#0b8f74";

  let statusMessage = "Choose a goal keyword to track a subject or chapter lane.";
  let statusClass = "status-neutral";

  if (progress < expectedProgress && totalGoalTasks > 0) {
    statusMessage = "You are behind the target pace.";
    statusClass = "status-warning";
  } else if (progress >= expectedProgress && progress < 100) {
    statusMessage = "You are currently on track.";
    statusClass = "status-success";
  } else if (progress === 100 && totalGoalTasks > 0) {
    statusMessage = "Goal completed.";
    statusClass = "status-success strong";
  } else if (goal && totalGoalTasks === 0) {
    statusMessage = "No tasks matched that goal yet.";
    statusClass = "status-warning";
  }

  return (
    <section className="card goal-tracker-card">
      <div className="goal-tracker-header">
        <div>
          <span className="section-tag">Goal focus</span>
          <h3>Goal tracker</h3>
          <p className="card-desc">
            Track one subject, topic, or chapter keyword against your generated plan.
          </p>
        </div>
        <strong className="goal-progress-value">{Math.round(progress)}%</strong>
      </div>

      <div className="goal-tracker-layout">
        <div className="goal-inputs goal-inputs-horizontal">
          <label>
            Goal keyword
            <input
              onChange={(event) => setGoal(event.target.value)}
              placeholder="Example: Math"
              type="text"
              value={goal}
            />
          </label>

          <label>
            Target days
            <input
              min="1"
              onChange={(event) => setDays(Math.max(1, Number(event.target.value)))}
              type="number"
              value={days}
            />
          </label>

          {goal ? (
            <div className="goal-match-summary" aria-live="polite">
              <span>Matched subject</span>
              <strong>
                {matchedSubjectNames.length ? matchedSubjectNames.join(", ") : "No subject found"}
              </strong>
            </div>
          ) : null}
        </div>

        <div className="goal-progress-panel">
          <div className="progress-bar-1 goal-progress-bar">
            <div
              className="progress-fill-1"
              style={{
                width: `${progress}%`,
                background: progressColor,
              }}
            />
          </div>

          <div className="goal-metric-grid">
            <div className="goal-metric-card">
              <span>Total chapters</span>
              <strong>{totalGoalTasks}</strong>
            </div>
            <div className="goal-metric-card">
              <span>Completed</span>
              <strong>{completedGoalTasks}</strong>
            </div>
            <div className="goal-metric-card">
              <span>Daily target</span>
              <strong>{dailyTarget}</strong>
            </div>
            <div className="goal-metric-card">
              <span>ETA</span>
              <strong className="goal-eta-value">{estimatedDays}</strong>
            </div>
          </div>

          <p className={statusClass}>{statusMessage}</p>
        </div>
      </div>
    </section>
  );
}

export default GoalTracker;

