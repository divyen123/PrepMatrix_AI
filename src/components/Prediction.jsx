import { useState } from "react";
import { getPlannerMetrics } from "../utils/plannerMetrics";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import StudyPlanPreviewDialog from "./StudyPlanPreviewDialog";

function getFinishSoonSuggestion(subjectStats) {
  const nextSubjects = Object.entries(subjectStats)
    .filter(([name, stats]) => name && stats.pending > 0)
    .sort(([leftName, left], [rightName, right]) => (
      left.pending - right.pending
      || right.done - left.done
      || leftName.localeCompare(rightName)
    ))
    .slice(0, 2);

  if (nextSubjects.length === 1) {
    const [[name, stats]] = nextSubjects;
    return `Finish ${name} (${stats.pending} ${stats.pending === 1 ? "task" : "tasks"} left).`;
  }

  if (nextSubjects.length === 2) {
    const [[firstName, first], [secondName, second]] = nextSubjects;
    return `Finish ${firstName} (${first.pending} left), then ${secondName} (${second.pending} left).`;
  }

  return "Your plan is complete. Review what you studied.";
}

function Prediction({ schedule, completed, subjects = [], scheduleStartDate = "" }) {
  const [showPlanPreview, setShowPlanPreview] = useState(false);
  const metrics = getPlannerMetrics(schedule, completed);
  const hasSubjects = Array.isArray(subjects) && subjects.length > 0;

  let headline = "You need a stronger study rhythm.";
  let supportingText = getFinishSoonSuggestion(metrics.subjectStats);

  if (!hasSubjects) {
    supportingText = "Add a subject first to start tracking your study progress.";
  } else if (!metrics.hasScheduledPlanner) {
    headline = "Plan your next study steps.";
    supportingText = "Create a plan to see which subjects to study first.";
  } else if (metrics.remainingTasks === 0) {
    headline = "Your plan is complete.";
  } else if (metrics.completionRate >= 80) {
    headline = "You are on track for a strong finish.";
  } else if (metrics.completionRate >= 50) {
    headline = "Your progress is steady.";
  }

  return (
    <section className="card">
      <h2>Study prediction</h2>
      <p className="prediction-score">{metrics.completionRate}%</p>
      <p>{headline}</p>
      {!hasSubjects ? (
        <div className="prediction-subjects-action">
          <p className="card-subtext">{supportingText}</p>
          <Link
            aria-label="Add a subject"
            className="prediction-subjects-action-link"
            title="Add a subject"
            to="/subjects#add-subject"
          >
            <ArrowRight aria-hidden="true" size={17} />
          </Link>
        </div>
      ) : (
        <>
          <p className="card-subtext">{supportingText}</p>
          {metrics.hasScheduledPlanner ? (
            <button
              aria-controls="study-plan-preview-dialog"
              aria-expanded={showPlanPreview}
              aria-haspopup="dialog"
              className="prediction-plan-link"
              onClick={() => setShowPlanPreview(true)}
              type="button"
            >
              <span>View plan</span>
              <ArrowRight aria-hidden="true" size={17} />
            </button>
          ) : (
            <Link
              className="prediction-plan-link"
              state={{ plannerShortcutAction: "new" }}
              to="/planner/schedule"
            >
              <span>Create plan</span>
              <ArrowRight aria-hidden="true" size={17} />
            </Link>
          )}
        </>
      )}
      {showPlanPreview && metrics.hasScheduledPlanner && (
        <StudyPlanPreviewDialog
          completed={completed}
          onClose={() => setShowPlanPreview(false)}
          schedule={schedule}
          scheduleStartDate={scheduleStartDate}
        />
      )}
    </section>
  );
}

export default Prediction;
