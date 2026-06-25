import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function MiniProgressChart({ schedule, completed }) {
  let completedCount = 0;

  const data = schedule.map((day, index) => {
    day.tasks?.forEach((task) => {
      if (completed.includes(task.task)) {
        completedCount += 1;
      }
    });

    return {
      day: `Day ${index + 1}`,
      completed: completedCount,
    };
  });

  const totalTasks = schedule.reduce(
    (count, day) => count + (day.tasks ? day.tasks.length : 0),
    0
  );

  const progress =
    totalTasks === 0 ? 0 : (completed.length / totalTasks) * 100;

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
