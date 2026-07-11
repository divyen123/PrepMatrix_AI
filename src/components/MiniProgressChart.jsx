import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function MiniProgressChart({ schedule = [], completed = [] }) {
  const safeSchedule = Array.isArray(schedule) ? schedule : [];
  const safeCompleted = Array.isArray(completed) ? completed : [];
  let completedCount = 0;

  const data = safeSchedule.map((day, index) => {
    const tasks = Array.isArray(day?.tasks) ? day.tasks : [];
    tasks.forEach((task) => {
      if (task && safeCompleted.includes(task.task)) {
        completedCount += 1;
      }
    });

    return {
      day: `Day ${index + 1}`,
      completed: completedCount,
    };
  });

  const totalTasks = safeSchedule.reduce(
    (count, day) => count + (Array.isArray(day?.tasks) ? day.tasks.length : 0),
    0
  );

  const progress =
    totalTasks === 0 ? 0 : (safeCompleted.length / totalTasks) * 100;

  let lineColor = "#b8324b";
  if (progress > 40) lineColor = "#b7791f";
  if (progress > 70) lineColor = "#0b8f74";

  return (
    <div className="mini-chart-container">
      <h4>Progress trend ({Math.round(progress)}%)</h4>

      <ResponsiveContainer height={160} width="100%">
        <LineChart data={data} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid className="chart-grid" vertical={false} />
          <XAxis axisLine={false} dataKey="day" tickLine={false} tickMargin={8} className="chart-axis" />
          <YAxis axisLine={false} tickLine={false} tickMargin={8} className="chart-axis" />
          <Tooltip wrapperClassName="chart-tooltip" cursor={{ className: "chart-cursor" }} />
          <Line
            activeDot={{ r: 6 }}
            dataKey="completed"
            dot={{ r: 4, stroke: lineColor, strokeWidth: 2 }}
            stroke={lineColor}
            strokeWidth={3}
            type="monotone"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default MiniProgressChart;
