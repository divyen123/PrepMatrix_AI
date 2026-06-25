import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getPlannerMetrics } from "../utils/plannerMetrics";

function Analytics({ schedule, completed }) {
  const metrics = getPlannerMetrics(schedule, completed);

  const data = [
    { name: "Planned", value: metrics.totalTasks },
    { name: "Done", value: metrics.completedTasks },
    { name: "Remaining", value: metrics.remainingTasks },
  ];

  return (
    <section className="card analytics-overview-card">
      <div className="analytics-overview-header">
        <div>
          <h3>Task distribution</h3>
          <p className="card-subtext">
            Planned: {metrics.totalTasks} tasks. Done: {metrics.completedTasks}. Remaining: {metrics.remainingTasks}.
          </p>
        </div>
      </div>

      <div className="analytics-chart-shell">
        <ResponsiveContainer height="100%" width="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
            <CartesianGrid className="chart-grid" vertical={false} />
            <XAxis
              axisLine={false}
              dataKey="name"
              tickLine={false}
              tickMargin={10}
              className="chart-axis"
            />
            <YAxis axisLine={false} tickLine={false} tickMargin={8} className="chart-axis" />
            <Tooltip
              contentStyle={{}}
              cursor={{ className: "chart-cursor" }}
              wrapperClassName="chart-tooltip"
            />
            <Bar dataKey="value" className="chart-bar-fill" maxBarSize={168} radius={[12, 12, 4, 4]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export default Analytics;
