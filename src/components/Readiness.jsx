import { getPlannerMetrics } from "../utils/plannerMetrics";

function Readiness({ schedule, completed }) {
  const metrics = getPlannerMetrics(schedule, completed);
  const percent = metrics.completionRate;

  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  let color = "#b8324b";
  if (percent > 40) color = "#b7791f";
  if (percent > 70) color = "#0b8f74";

  let message = "More practice is still needed.";
  if (percent >= 40 && percent < 70) message = "You are building good readiness.";
  if (percent >= 70) message = "You are approaching exam-ready territory.";

  return (
    <section className="card centered-card">
      <h3>Exam readiness</h3>

      <div className="readiness-ring">
        <svg height="120" width="120">
          <circle
            cx="60"
            cy="60"
            fill="none"
            r={radius}
            stroke="rgba(112, 128, 153, 0.25)"
            strokeWidth="10"
          />

          <circle
            cx="60"
            cy="60"
            fill="none"
            r={radius}
            stroke={color}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            strokeWidth="10"
            transform="rotate(-90 60 60)"
          />
        </svg>

        <div className="readiness-value">{percent}%</div>
      </div>

      <p>{message}</p>
    </section>
  );
}

export default Readiness;
