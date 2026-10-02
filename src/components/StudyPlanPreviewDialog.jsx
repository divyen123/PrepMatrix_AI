import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Circle, Download, LoaderCircle, X } from "lucide-react";
import { formatScheduleDayHeading } from "../utils/scheduleDates";
import { acquireDocumentScrollLock } from "../utils/documentScrollLock";
import { toast } from "../utils/toast";
import {
  getPlannerSessionLabel,
  isPlannerTaskCompleted,
  isPlannerTaskRecheckPending,
} from "../utils/plannerScheduleProgress";
import "./StudyPlanPreviewDialog.css";

export function StudyPlanPreviewContent({
  historical = false,
  completed = [],
  onClose = () => {},
  schedule = [],
  scheduleStartDate = "",
}) {
  const exportingRef = useRef(false);
  const [isExporting, setIsExporting] = useState(false);
  const days = Array.isArray(schedule) ? schedule : [];
  const completedTasks = Array.isArray(completed) ? completed : [];
  const tasks = days.flatMap((day) => (
    Array.isArray(day?.tasks)
      ? day.tasks.filter((task) => typeof task?.task === "string" && task.task.trim())
      : []
  ));
  const doneCount = tasks.filter((task) => (
    isPlannerTaskCompleted(task, completedTasks) && !isPlannerTaskRecheckPending(task)
  )).length;

  const downloadPDF = async () => {
    if (exportingRef.current || !days.length) return;
    exportingRef.current = true;
    setIsExporting(true);

    try {
      const { createStudyPlanPdf } = await import("../utils/studyPlanPdf.js");
      const pdf = createStudyPlanPdf({
        completed: completedTasks,
        historical,
        schedule: days,
        scheduleStartDate,
      });
      await pdf.save(historical ? "PreviousStudyPlan.pdf" : "StudyPlan.pdf", { returnPromise: true });
      toast.success("Study schedule PDF exported.");
    } catch {
      toast.error("Could not export the study schedule. Please try again.");
    } finally {
      exportingRef.current = false;
      setIsExporting(false);
    }
  };

  return (
    <>
      <header className="study-plan-preview-header">
        <div className="study-plan-preview-heading">
          <h2 id="study-plan-preview-title">{historical ? "Previous study schedule" : "Study schedule"}</h2>
          <p id="study-plan-preview-summary">{doneCount} of {tasks.length} tasks {historical ? "previously completed" : "complete"}</p>
        </div>
        <div className="study-plan-preview-actions">
          <button
            aria-busy={isExporting}
            aria-label={isExporting ? "Exporting study schedule as PDF" : "Download study schedule as PDF"}
            className="study-plan-preview-icon-button study-plan-preview-download"
            disabled={isExporting || !days.length}
            onClick={downloadPDF}
            title={isExporting ? "Exporting PDF..." : "Download as PDF"}
            type="button"
          >
            {isExporting
              ? <LoaderCircle aria-hidden="true" className="study-plan-preview-export-spinner" size={15} />
              : <Download aria-hidden="true" size={15} />}
          </button>
          <button
            aria-label="Close study schedule"
            autoFocus
            className="study-plan-preview-icon-button study-plan-preview-close"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={15} />
          </button>
        </div>
      </header>
      <div className="study-plan-preview-days">
        {days.map((day, dayIndex) => {
          const dayTasks = Array.isArray(day?.tasks)
            ? day.tasks.filter((task) => typeof task?.task === "string" && task.task.trim())
            : [];
          const isDayComplete = dayTasks.length > 0 && dayTasks.every((task) => (
            isPlannerTaskCompleted(task, completedTasks) && !isPlannerTaskRecheckPending(task)
          ));

          return (
            <section
              className={`study-plan-preview-day${isDayComplete ? " is-complete" : ""}`}
              key={`${day?.day ?? dayIndex}-${dayIndex}`}
            >
              <h3>{formatScheduleDayHeading(day, dayIndex, scheduleStartDate)}</h3>
              {dayTasks.length ? (
                <ul>
                  {dayTasks.map((task, taskIndex) => {
                    const isDone = isPlannerTaskCompleted(task, completedTasks)
                      && !isPlannerTaskRecheckPending(task);
                    const session = getPlannerSessionLabel(task.time);
                    return (
                      <li className={isDone ? "is-complete" : ""} key={`${task.task}-${taskIndex}`}>
                        <span aria-label={isDone ? historical ? "Previously completed" : "Completed" : historical ? "Not completed" : "Pending"} className="study-plan-preview-status">
                          {isDone
                            ? <CheckCircle2 aria-hidden="true" size={17} />
                            : <Circle aria-hidden="true" size={17} />}
                        </span>
                        <span className="study-plan-preview-task-name">{task.task}</span>
                        {session && <small>{session}</small>}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="study-plan-preview-revision">Revision block</p>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}

export default function StudyPlanPreviewDialog({
  historical = false,
  completed = [],
  onClose,
  schedule = [],
  scheduleStartDate = "",
}) {
  const dialogRef = useRef(null);
  const closeRequestedRef = useRef(false);
  const [isClosing, setIsClosing] = useState(false);

  const requestClose = () => {
    if (closeRequestedRef.current) return;
    closeRequestedRef.current = true;

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      onClose();
      return;
    }

    setIsClosing(true);
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const releaseScrollLock = acquireDocumentScrollLock();
    dialog.showModal();

    return () => {
      dialog.close();
      releaseScrollLock();
      previousFocus?.focus?.({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    if (!isClosing) return undefined;

    const timeout = window.setTimeout(onClose, 220);
    return () => window.clearTimeout(timeout);
  }, [isClosing, onClose]);

  return createPortal(
    <dialog
      aria-describedby="study-plan-preview-summary"
      aria-labelledby="study-plan-preview-title"
      className={`study-plan-preview-dialog${isClosing ? " is-closing" : ""}`}
      id="study-plan-preview-dialog"
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left || event.clientX > bounds.right
          || event.clientY < bounds.top || event.clientY > bounds.bottom
        ) {
          requestClose();
        }
      }}
      ref={dialogRef}
    >
      <StudyPlanPreviewContent
        historical={historical}
        completed={completed}
        onClose={requestClose}
        schedule={schedule}
        scheduleStartDate={scheduleStartDate}
      />
    </dialog>,
    document.body,
  );
}
