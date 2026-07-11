import { useEffect } from "react";
import { X, TrendingUp, CheckCircle2, Award, CalendarRange } from "lucide-react";
import {
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  AreaChart,
  Area
} from "recharts";

function ProgressModal({ isOpen, isActive, onClose, schedule = [], completed = [] }) {
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

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

  const progress = totalTasks === 0 ? 0 : (completed.length / totalTasks) * 100;
  const velocity = completed.length / Math.max(schedule.length, 1);

  let statusText = "Needs Focus ⚠️";
  let colorTheme = {
    line: "#ef4444",
    fill: "rgba(239, 68, 68, 0.15)",
    text: "text-red",
    badge: "badge-red"
  };

  if (progress > 40) {
    statusText = "On Track 👍";
    colorTheme = {
      line: "#f59e0b",
      fill: "rgba(245, 158, 11, 0.15)",
      text: "text-amber",
      badge: "badge-amber"
    };
  }
  if (progress > 70) {
    statusText = "Ahead 🚀";
    colorTheme = {
      line: "#10b981",
      fill: "rgba(16, 185, 129, 0.15)",
      text: "text-green",
      badge: "badge-green"
    };
  }

  // Text contents explaining the plot and relevant insights
  let interpretationText = "";
  let recommendations = [];

  if (progress === 0) {
    interpretationText = "You haven't completed any tasks yet. Get started by checking off your first task in the Dashboard! Consistency early on helps build momentum.";
    recommendations = [
      "Set a goal to complete at least 1 task today.",
      "Start with the easiest tasks to build confidence and flow.",
      "Use the AI Chat to get help or explanations on any challenging topic."
    ];
  } else if (progress < 40) {
    interpretationText = "Your study velocity is lower than ideal. To reach your targets comfortably, try breaking complex subjects down and completing at least 1-2 tasks daily. Consistency is key to unlocking the learning curve.";
    recommendations = [
      "Dedicate a fixed 30-minute block for study focus today.",
      "Review your schedule and see if tasks can be spread out or simplified.",
      "Ask the AI assistant to summarize difficult topics for faster learning."
    ];
  } else if (progress <= 70) {
    interpretationText = "You're maintaining a steady completion rate. You have a solid grasp of your study tempo and are well on track. Make sure to review any pending tasks to keep the backlog clear.";
    recommendations = [
      "Keep a structured daily schedule to prevent tasks from piling up.",
      "Prioritize high-weightage subjects in your upcoming review cycles.",
      "Review your notes to quickly recap completed sections."
    ];
  } else {
    interpretationText = "Excellent work! You are pacing well ahead of the average curve. This high learning velocity suggests you are highly focused. Consider adding self-test quizzes or exploring deep-dive study materials to maximize retention.";
    recommendations = [
      "Maintain active recall for completed chapters to solidify memory.",
      "Use the AI Chat to test your knowledge on completed items.",
      "Review study insights to fine-tune your peak performance times."
    ];
  }

  return (
    <div
      className={`trend-modal-backdrop ${isActive ? "active" : ""}`}
      onClick={onClose}
      role="presentation"
    >
      <div
        className="trend-modal-content"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="trend-modal-title"
      >
        <button
          className="trend-modal-close-btn"
          onClick={onClose}
          aria-label="Close modal"
          type="button"
        >
          <X size={16} />
        </button>

        <div className="trend-modal-header">
          <div className="trend-modal-title-row">
            <h2 id="trend-modal-title">Progress Trend Analytics</h2>
            <span className={`trend-status-badge ${colorTheme.badge}`}>{statusText}</span>
          </div>
          <p className="trend-modal-subtitle">
            Detailed breakdown of your learning velocity and study plan completion.
          </p>
        </div>

        <div className="trend-modal-grid">
          {/* Left panel: Expanded Chart & Chart Guide */}
          <div className="trend-modal-left">
            <div className="trend-chart-card">
              <ResponsiveContainer height={260} width="100%">
                <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorProgress" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={colorTheme.line} stopOpacity={0.4} />
                      <stop offset="95%" stopColor={colorTheme.line} stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid className="chart-grid" vertical={false} strokeDasharray="3 3" />
                  <XAxis
                    axisLine={false}
                    dataKey="day"
                    tickLine={false}
                    tickMargin={8}
                    className="chart-axis"
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tickMargin={8}
                    className="chart-axis"
                  />
                  <Tooltip wrapperClassName="chart-tooltip" cursor={{ className: "chart-cursor" }} />
                  <Area
                    activeDot={{ r: 6, strokeWidth: 0 }}
                    dataKey="completed"
                    stroke={colorTheme.line}
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#colorProgress)"
                    type="monotone"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            
            <div className="trend-plot-explanation">
              <h3>Understanding the Plot</h3>
              <p>
                This chart maps your <strong>cumulative task completion</strong> over the course of your study schedule. 
                The <strong>X-axis</strong> tracks days chronologically, and the <strong>Y-axis</strong> measures the number of completed tasks. 
                A steeper slope indicates higher productivity and a faster study velocity.
              </p>
            </div>
          </div>

          {/* Right panel: Metrics & Insights */}
          <div className="trend-modal-right">
            <div className="trend-metrics-grid">
              <div className="trend-metric-card">
                <div className="trend-metric-icon-wrap">
                  <TrendingUp size={18} className={colorTheme.text} />
                </div>
                <div className="trend-metric-info">
                  <span className="trend-metric-val">{Math.round(progress)}%</span>
                  <span className="trend-metric-lbl">Completion Rate</span>
                </div>
              </div>

              <div className="trend-metric-card">
                <div className="trend-metric-icon-wrap">
                  <CheckCircle2 size={18} className="text-blue" />
                </div>
                <div className="trend-metric-info">
                  <span className="trend-metric-val">{completed.length} / {totalTasks}</span>
                  <span className="trend-metric-lbl">Completed Tasks</span>
                </div>
              </div>

              <div className="trend-metric-card">
                <div className="trend-metric-icon-wrap">
                  <CalendarRange size={18} className="text-purple" />
                </div>
                <div className="trend-metric-info">
                  <span className="trend-metric-val">{velocity.toFixed(1)}</span>
                  <span className="trend-metric-lbl">Tasks / Day</span>
                </div>
              </div>

              <div className="trend-metric-card">
                <div className="trend-metric-icon-wrap">
                  <Award size={18} className="text-orange" />
                </div>
                <div className="trend-metric-info">
                  <span className="trend-metric-val">{schedule.length}</span>
                  <span className="trend-metric-lbl">Total Days</span>
                </div>
              </div>
            </div>

            <div className="trend-insights-box">
              <h3>Study Insights</h3>
              <p>{interpretationText}</p>
            </div>

            <div className="trend-recommendations-box">
              <h3>Action Items</h3>
              <ul>
                {recommendations.map((rec, i) => (
                  <li key={i}>{rec}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProgressModal;
