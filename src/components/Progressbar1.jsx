import { useEffect, useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import confetti from "canvas-confetti";
import { toast } from "../utils/toast";
import successSound from "../assets/success.mp3";
import { getPlannerMetrics } from "../utils/plannerMetrics";
import { academicProfileStorageKey } from "../utils/academicProfileScope";
import CometDial from "./CometDial";

function ProgressBar1({ academicProfileDataId = "", schedule, completed, variant = "analytics" }) {
  const navigate = useNavigate();
  const safeSchedule = useMemo(() => (Array.isArray(schedule) ? schedule : []), [schedule]);
  const safeCompleted = Array.isArray(completed) ? completed : [];
  const metrics = getPlannerMetrics(schedule, completed);
  const progress = metrics.completionRate;
  const progressTone = progress >= 70
    ? "#22c55e"
    : progress >= 40
      ? "#eab308"
      : "#ef4444";
  const completedSet = new Set(safeCompleted);
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
    const taskNames = safeSchedule
      .flatMap((day) => (Array.isArray(day?.tasks) ? day.tasks.map((task) => task?.task).filter(Boolean) : []))
      .sort()
      .join("|");

    return academicProfileStorageKey(
      academicProfileDataId,
      "plan-completed",
      `${metrics.totalTasks}:${taskNames}`,
    ) || `prepmatrix-plan-completed:${metrics.totalTasks}:${taskNames}`;
  }, [academicProfileDataId, metrics.totalTasks, safeSchedule]);

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

  if (variant === "dashboard") {
    return (
      <section className="db-progress-status" aria-label="Progress status">
        <div className="db-progress-dial">
          <CometDial
            accent="var(--accent)"
            ink="var(--text)"
            label="Overall completion"
            readOnly
            readoutColor={progressTone}
            size={190}
            value={progress}
          />
          <span className="db-progress-dial-label">Overall completion</span>
        </div>
        <div className="db-progress-details">
          <div className={`db-progress-milestone${metrics.totalTasks === 0 ? " is-empty" : ""}`}>
            <strong>{milestoneLabel}</strong>
            <div className="db-progress-milestone-detail">
              <p>{milestoneDetail}</p>
              {metrics.totalTasks > 0 && progress < 100 && (
                <button
                  aria-label="Open Planner"
                  className="db-progress-planner-link"
                  onClick={() => navigate("/planner")}
                  title="Open Planner"
                  type="button"
                >
                  <ArrowRight aria-hidden="true" size={15} strokeWidth={2.4} />
                </button>
              )}
            </div>
          </div>
          <div className="db-progress-today">
            <span>Today</span>
            <strong>{todayLabel}</strong>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="card completion-card" style={{ padding: "20px", gap: "16px", maxWidth: "700px", margin: "0 auto", width: "100%" }}>
      <div className="analytics-completion-dial">
        <CometDial
          accent="var(--accent)"
          ink="var(--text)"
          label="Overall completion"
          readOnly
          readoutColor={progressTone}
          size={200}
          value={progress}
        />
      </div>

      <div className="completion-card-header">
        <h2 style={{ fontSize: "1.1rem" }}>Overall completion</h2>
        <span className="completion-card-value" style={{ fontSize: "1.6rem" }}>{progress}%</span>
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
