import { useEffect, useMemo } from "react";
import confetti from "canvas-confetti";
import { toast } from "react-toastify";
import successSound from "../assets/success.mp3";
import { getPlannerMetrics } from "../utils/plannerMetrics";

function ProgressBar1({ schedule, completed }) {
  const metrics = getPlannerMetrics(schedule, completed);
  const progress = metrics.completionRate;
  const completedSet = new Set(completed);
  const todayCompleted = metrics.todayTasks.filter((task) =>
    completedSet.has(task.task)
  ).length;
  const todayLabel =
    metrics.todayTasks.length === 0
      ? "No tasks"
      : `${todayCompleted}/${metrics.todayTasks.length}`;

  const nextMilestone = [25, 50, 75, 100].find((target) => progress < target) || 100;
  const milestoneTaskTarget = Math.ceil((nextMilestone / 100) * metrics.totalTasks);
  const tasksNeeded = Math.max(milestoneTaskTarget - metrics.completedTasks, 0);
  const milestoneLabel =
    metrics.totalTasks === 0
      ? "Generate a plan first"
      : progress === 100
        ? "Plan completed"
        : `Next milestone: ${nextMilestone}%`;
  const milestoneDetail =
    metrics.totalTasks === 0
      ? "Add subjects and generate a timetable to unlock milestone tracking."
      : progress === 100
        ? "Every planned task is complete. Strong finish."
        : `${tasksNeeded} more ${tasksNeeded === 1 ? "task" : "tasks"} needed`;
  const completionCelebrationKey = useMemo(() => {
    const taskNames = schedule
      .flatMap((day) => day.tasks?.map((task) => task.task) || [])
      .sort()
      .join("|");

    return `prepmatrix-plan-completed:${metrics.totalTasks}:${taskNames}`;
  }, [metrics.totalTasks, schedule]);

  useEffect(() => {
    if (progress === 100 && metrics.totalTasks > 0) {
      if (window.localStorage.getItem(completionCelebrationKey) === "shown") {
        return;
      }

      window.localStorage.setItem(completionCelebrationKey, "shown");

      confetti({
        particleCount: 150,
        spread: 100,
      });

      toast.success("Study plan completed.", {
        toastId: completionCelebrationKey,
      });

      const audio = new Audio(successSound);
      audio.play().catch(() => {});
    }
  }, [completionCelebrationKey, progress, metrics.totalTasks]);

  return (
    <section className="card completion-card">
      <div className="completion-card-header">
        <h2>Overall completion</h2>
        <span className="completion-card-value">{progress}%</span>
      </div>

      <p className="card-subtext">
        Track total study-plan progress across all scheduled tasks.
      </p>

      <div className="progress-container">
        <div className="progress-bar" style={{ width: `${progress}%` }} />
      </div>

      <div className="completion-stat-chips">
        <div className="completion-stat-chip">
          <span>Completed</span>
          <strong>{metrics.completedTasks}</strong>
        </div>
        <div className="completion-stat-chip">
          <span>Remaining</span>
          <strong>{metrics.remainingTasks}</strong>
        </div>
        <div className="completion-stat-chip accent-chip">
          <span>Today</span>
          <strong>{todayLabel}</strong>
        </div>
      </div>

      <div className="next-milestone-strip">
        <div>
          <span>Milestone</span>
          <strong>{milestoneLabel}</strong>
        </div>
        <p>{milestoneDetail}</p>
      </div>

      <div className="progress-text">
        {metrics.completedTasks}/{metrics.totalTasks} tasks completed
      </div>
    </section>
  );
}

export default ProgressBar1;
