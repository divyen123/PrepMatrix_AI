import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { getPlannerMetrics } from "../utils/plannerMetrics";

const DIFFICULTY_COLORS = {
  easy: "#2f7a4b",
  medium: "#c6871f",
  hard: "#c13a56",
};

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) {
    return null;
  }

  const point = payload[0].payload;

  return (
    <div className="landscape-tooltip">
      <strong>{point.subject}</strong>
      <p>Difficulty: {point.difficulty}</p>
      <p>Completed chapters: {point.x}</p>
      <p>Pending chapters: {point.y}</p>
      <p>Coverage: {point.completionRate}%</p>
    </div>
  );
}

function FocusLandscape({ subjects = [], schedule = [], completed = [] }) {
  const metrics = getPlannerMetrics(schedule, completed);

  const chartData = subjects.map((subject) => {
    const stats = metrics.subjectStats[subject.name] || {
      done: 0,
      pending: 0,
      total: 0,
    };

    const totalChapters = Math.max(subject.chapters, stats.total, 1);
    const completionRate = Math.round((stats.done / totalChapters) * 100) || 0;

    return {
      subject: subject.name,
      difficulty: subject.difficulty,
      x: stats.done,
      y: stats.pending,
      z: Math.max(totalChapters * 110, 180),
      completionRate,
    };
  });

  const focusLeader = [...chartData].sort(
    (left, right) => right.y - left.y || left.completionRate - right.completionRate
  )[0];

  const hardSubjects = chartData.filter((item) => item.difficulty === "hard");
  const mediumSubjects = chartData.filter((item) => item.difficulty === "medium");
  const easySubjects = chartData.filter((item) => item.difficulty === "easy");

  return (
    <section className="card landscape-card">
      <div className="landscape-header">
        <div>
          <span className="section-tag">Focus Map</span>
          <h2>Subject landscape</h2>
          <p className="card-subtext">
            Each bubble shows how balanced a subject is. Larger bubbles represent
            bigger chapter loads, while higher placement means more unfinished work.
          </p>
        </div>
      </div>

      {chartData.length === 0 ? (
        <p className="empty-state">
          Add subjects and generate a timetable to unlock the study landscape.
        </p>
      ) : (
        <div className="landscape-grid">
          <div className="landscape-chart-shell">
            <ResponsiveContainer height="100%" width="100%">
              <ScatterChart margin={{ top: 14, right: 18, left: 0, bottom: 8 }}>
                <CartesianGrid className="chart-grid" />
                <XAxis
                  allowDecimals={false}
                  dataKey="x"
                  name="Completed"
                  className="chart-axis"
                  tickLine={false}
                  label={{ value: "Completed chapters", position: "insideBottom", offset: -2 }}
                />
                <YAxis
                  allowDecimals={false}
                  dataKey="y"
                  name="Pending"
                  className="chart-axis"
                  tickLine={false}
                  label={{ value: "Pending chapters", angle: -90, position: "insideLeft" }}
                />
                <ZAxis dataKey="z" range={[180, 1100]} />
                <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: "4 4" }} />
                <Scatter data={easySubjects} fill={DIFFICULTY_COLORS.easy} />
                <Scatter data={mediumSubjects} fill={DIFFICULTY_COLORS.medium} />
                <Scatter data={hardSubjects} fill={DIFFICULTY_COLORS.hard} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          <div className="landscape-side">
            <div className="landscape-panel">
              <span className="panel-label">Focus priority</span>
              <strong>{focusLeader?.subject || "No subjects yet"}</strong>
              <p>
                {focusLeader
                  ? `${focusLeader.y} unfinished chapters are still sitting in this subject.`
                  : "Generate a schedule to see which subject needs attention first."}
              </p>
            </div>

            <div className="landscape-panel">
              <span className="panel-label">Difficulty balance</span>
              <div className="landscape-legend">
                <span><i className="legend-dot easy" /> Easy</span>
                <span><i className="legend-dot medium" /> Medium</span>
                <span><i className="legend-dot hard" /> Hard</span>
              </div>
              <p>
                Use the chart to compare high-load subjects with low completion, then
                rebalance before the backlog grows.
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default FocusLandscape;
