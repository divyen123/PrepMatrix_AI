import { useCallback, useEffect, useState } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { Download, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "react-toastify";
import successSound from "../assets/success.mp3";
import { generateSchedule } from "../utils/scheduleGenerator";
import {
  formatScheduleDate,
  formatScheduleDayHeading,
  getScheduleGenerationWindow,
} from "../utils/scheduleDates";
import { subscribeToLocalDateChanges } from "../utils/localDateRefresh";
import {
  clearPlannerScheduleState,
  completePlannerTask,
  getPlannerDayAvailability,
  isPlannerTaskCompleted,
  isPlannerTaskPending,
  isPlannerTaskRecheckPending,
  reopenPlannerTask,
} from "../utils/plannerScheduleProgress";

export function ClearScheduleConfirmation({
  onCancel = () => {},
  onDelete = () => {},
}) {
  return (
    <div
      aria-describedby="clear-schedule-description"
      aria-labelledby="clear-schedule-title"
      aria-modal="true"
      className="planner-clear-confirmation"
      id="clear-schedule-confirmation"
      role="alertdialog"
    >
      <strong id="clear-schedule-title">Clear this schedule?</strong>
      <p id="clear-schedule-description">
        This removes the planner and its completion history. Your subjects stay saved.
      </p>
      <div className="planner-clear-confirmation-actions">
        <button
          className="planner-clear-cancel-btn"
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
        <button
          className="planner-clear-delete-btn"
          onClick={onDelete}
          type="button"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function PlannerScheduleDay({
  completed,
  dayIndex,
  item,
  onComplete,
  onReschedule,
  scheduleStartDate,
  today,
}) {
  const availability = getPlannerDayAvailability(
    item,
    dayIndex,
    scheduleStartDate,
    today,
  );
  const lockedDate = formatScheduleDate(availability.dateKey);

  return (
    <div
      aria-disabled={availability.isLocked || undefined}
      className={"day-card planner-day-card" + (availability.isLocked ? " is-locked" : "")}
    >
      <div className="day-title">
        <span>{formatScheduleDayHeading(item, dayIndex, scheduleStartDate)}</span>
        {availability.isLocked && (
          <span className="planner-day-locked-badge">
            {lockedDate
              ? "Locked until " + lockedDate
              : "Locked until its scheduled day"}
          </span>
        )}
      </div>
      {item.tasks?.length === 0 ? (
        <div className="task-chip revision">Revision block</div>
      ) : (
        item.tasks?.map((task, taskIndex) => {
          const wasCompleted = isPlannerTaskCompleted(task, completed);
          const isRecheckPending = isPlannerTaskRecheckPending(task);
          const showCompletedState = wasCompleted && !isRecheckPending;

          return (
            <div
              className="task-row planner-task-row"
              key={task.task + "-" + taskIndex}
            >
              <input
                aria-label={isRecheckPending
                  ? "Complete " + task.task + " again"
                  : "Mark " + task.task + " complete"}
                checked={showCompletedState}
                disabled={availability.isLocked || showCompletedState}
                onChange={() => onComplete(dayIndex, taskIndex)}
                type="checkbox"
              />
              <span className="time-slot">{task.time}</span>
              <span className={showCompletedState ? "task-chip done" : "task-chip"}>
                <span className="planner-task-label">{task.task}</span>
                {isRecheckPending && (
                  <span className="planner-already-completed-badge">
                    Already completed
                  </span>
                )}
              </span>
              <span className="planner-task-action-slot">
                {showCompletedState && (
                  <button
                    aria-label={"Reschedule " + task.task}
                    className="planner-reschedule-btn"
                    disabled={availability.isLocked}
                    onClick={() => onReschedule(dayIndex, taskIndex)}
                    title={"Reschedule " + task.task}
                    type="button"
                  >
                    <RotateCcw aria-hidden="true" size={15} />
                  </button>
                )}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}

function Timetable({
  academicProfileDataId = "",
  subjects,
  schedule,
  setSchedule,
  completed,
  setCompleted,
  scheduleStartDate,
  setScheduleStartDate,
  canManageSchedule = true,
  onOpenSubjects = () => {},
  onRequestParentAccess,
}) {
  const [examDate, setExamDate] = useState("");
  const [planMode, setPlanMode] = useState("balanced");
  const [loading, setLoading] = useState(false);
  const [previousSchedule, setPreviousSchedule] = useState(null);
  const [lastAction, setLastAction] = useState(null); // "rebalance" | "backlog"
  const [showGenerateForm, setShowGenerateForm] = useState(schedule.length === 0);
  const [showClearConfirmation, setShowClearConfirmation] = useState(false);
  const [today, setToday] = useState(() => new Date());

  const requestParentAccess = useCallback(() => {
    onRequestParentAccess?.();
    toast.info("A parent PIN is needed to create or change the schedule.", {
      toastId: "planner-parent-access",
    });
  }, [onRequestParentAccess]);

  useEffect(() => {
    if (schedule.length === 0) {
      setShowGenerateForm(true);
      setShowClearConfirmation(false);
    }
  }, [schedule.length]);

  useEffect(() => subscribeToLocalDateChanges(setToday), []);

  const getBacklogTasks = useCallback(() => {
    const backlog = [];

    schedule.forEach((day) => {
      day.tasks?.forEach((task) => {
        if (isPlannerTaskPending(task, completed)) {
          backlog.push({ ...task });
        }
      });
    });

    return backlog;
  }, [completed, schedule]);

  const generate = useCallback(() => {
    if (!canManageSchedule) {
      requestParentAccess();
      return;
    }
    if (!examDate || subjects.length === 0) {
      toast.error("Add at least one subject and select an exam date.", {
        toastId: "planner-missing-inputs",
      });
      return;
    }

    setLoading(true);

    setTimeout(() => {
      let { days, startDate } = getScheduleGenerationWindow(examDate, new Date());

      if (days < 1) {
        setLoading(false);
        toast.error("Choose an exam date with at least one study day available.", {
          toastId: "planner-future-date",
        });
        return;
      }

      if (days > 30) {
        toast.info("The planner limits schedules to 30 days for performance.", {
          toastId: "planner-day-limit",
        });
        days = 30;
      }

      const backlog = getBacklogTasks();
      const result = generateSchedule(subjects, days, backlog, {
        planMode,
        startDate,
      });

      setSchedule(result);
      setScheduleStartDate?.(startDate);
      setLoading(false);
      setPreviousSchedule(null);
      setShowGenerateForm(false);
      toast.success("Timetable generated.", {
        toastId: "planner-generated",
      });

      const audio = new Audio(successSound);
      audio.play().catch(() => {});
    }, 450);
  }, [
    canManageSchedule,
    examDate,
    getBacklogTasks,
    planMode,
    requestParentAccess,
    setSchedule,
    setScheduleStartDate,
    subjects,
  ]);

  useEffect(() => {
    window.plannerActions = { generate };

    const pendingRequest = window.plannerAutoGenerateRequested;
    if (pendingRequest) window.plannerAutoGenerateRequested = null;
    if (
      pendingRequest
      && (!pendingRequest.academicProfileId
        || pendingRequest.academicProfileId === academicProfileDataId)
    ) {
      window.setTimeout(generate, 350);
    }

    return () => {
      delete window.plannerActions;
    };
  }, [academicProfileDataId, generate]);

  const toggleComplete = (dayIndex, taskIndex) => {
    const nextState = completePlannerTask(
      schedule,
      completed,
      dayIndex,
      taskIndex,
    );

    if (nextState.schedule !== schedule) setSchedule(nextState.schedule);
    if (nextState.completed !== completed) setCompleted(nextState.completed);
  };

  const handleRescheduleTask = (dayIndex, taskIndex) => {
    const updatedSchedule = reopenPlannerTask(
      schedule,
      completed,
      dayIndex,
      taskIndex,
    );
    if (updatedSchedule !== schedule) setSchedule(updatedSchedule);
  };

  const requestClearSchedule = () => {
    if (!canManageSchedule) {
      requestParentAccess();
      return;
    }
    setShowClearConfirmation(true);
  };

  const handleClearSchedule = () => {
    if (!canManageSchedule) {
      setShowClearConfirmation(false);
      requestParentAccess();
      return;
    }

    const clearedState = clearPlannerScheduleState({
      completed,
      schedule,
      scheduleStartDate,
    });

    setSchedule(clearedState.schedule);
    setCompleted(clearedState.completed);
    setScheduleStartDate?.(clearedState.scheduleStartDate);
    setExamDate("");
    setPreviousSchedule(null);
    setLastAction(null);
    setShowGenerateForm(true);
    setShowClearConfirmation(false);
    toast.success("Schedule cleared. Your subjects are still saved.", {
      toastId: "planner-cleared",
    });
  };

  const downloadPDF = async () => {
    const element = document.getElementById("timetable");
    if (!element) return;

    const originalMaxHeight = element.style.maxHeight;
    const originalOverflowY = element.style.overflowY;
    const originalPaddingRight = element.style.paddingRight;

    element.style.maxHeight = "none";
    element.style.overflowY = "visible";
    element.style.paddingRight = "0";

    try {
      const canvas = await html2canvas(element);
      const imageData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const imageWidth = 190;
      const imageHeight = (canvas.height * imageWidth) / canvas.width;

      pdf.addImage(imageData, "PNG", 10, 10, imageWidth, imageHeight);
      pdf.save("StudyPlan.pdf");
      toast.success("PDF exported.", {
        toastId: "planner-pdf-exported",
      });
    } catch {
      toast.error("Failed to export PDF.");
    } finally {
      element.style.maxHeight = originalMaxHeight;
      element.style.overflowY = originalOverflowY;
      element.style.paddingRight = originalPaddingRight;
    }
  };

  const handleMissedTasks = () => {
    if (!canManageSchedule) {
      requestParentAccess();
      return;
    }
    setPreviousSchedule(structuredClone(schedule));
    setLastAction("backlog");
    const updatedSchedule = structuredClone(schedule);

    for (let index = 0; index < updatedSchedule.length - 1; index += 1) {
      const currentDay = updatedSchedule[index];
      const nextDay = updatedSchedule[index + 1];

      if (!currentDay.tasks) continue;

      const completedTasks = [];

      currentDay.tasks.forEach((task) => {
        if (!isPlannerTaskPending(task, completed)) {
          completedTasks.push(task);
          return;
        }

        if (!nextDay.tasks) nextDay.tasks = [];

        const alreadyExists = nextDay.tasks.some((nextTask) => nextTask.task === task.task);
        if (!alreadyExists) nextDay.tasks.push(task);
      });

      currentDay.tasks = completedTasks;
    }

    setSchedule(updatedSchedule);
    toast.success("Incomplete tasks moved forward.", {
      toastId: "planner-backlog-recovered",
    });
  };

  const rebalanceSchedule = () => {
    if (!canManageSchedule) {
      requestParentAccess();
      return;
    }
    setPreviousSchedule(structuredClone(schedule));
    setLastAction("rebalance");
    const updated = structuredClone(schedule);

    updated.forEach((day) => {
      if (day.tasks?.length > 4) {
        const overflow = day.tasks.slice(4);
        day.tasks = day.tasks.slice(0, 4);
        const nextOpenDay = updated.find((item) => item.tasks.length < 3);
        if (nextOpenDay) nextOpenDay.tasks.push(...overflow);
      }
    });

    setSchedule(updated);
    toast.success("Schedule rebalanced.", {
      toastId: "planner-rebalanced",
    });
  };

  const handleUndo = () => {
    if (!canManageSchedule) {
      requestParentAccess();
      return;
    }
    if (previousSchedule) {
      setSchedule(previousSchedule);
      setPreviousSchedule(null);
      setLastAction(null);
      toast.success("Changes undone successfully.", {
        toastId: "planner-undone",
      });
    }
  };

  return (
    <section className="card schedule-card">
      <div className="schedule-card-header">
        <div className="schedule-card-copy">
          <h2>Study schedule</h2>
          <p className="card-subtext">
            Generate a focused timetable, export it, and recover backlog when the week changes.
          </p>
        </div>
        {schedule.length > 0 && (
          <div className="planner-clear-control">
            <button
              aria-controls="clear-schedule-confirmation"
              aria-expanded={showClearConfirmation}
              aria-haspopup="dialog"
              className="secondary-btn action-btn planner-clear-schedule-btn"
              onClick={requestClearSchedule}
              type="button"
            >
              <Trash2 aria-hidden="true" size={15} />
              <span>Clear schedule</span>
            </button>
            {showClearConfirmation && (
              <ClearScheduleConfirmation
                onCancel={() => setShowClearConfirmation(false)}
                onDelete={handleClearSchedule}
              />
            )}
          </div>
        )}
      </div>

      <div className="timetable-topbar">
        {showGenerateForm ? (
          !canManageSchedule ? (
            <div className="planner-parent-lock" role="status">
              <div>
                <strong>Grown-up setup needed</strong>
                <p>A parent can enter the Parent PIN to create this learning schedule.</p>
              </div>
              <button className="action-btn" onClick={requestParentAccess} type="button">
                Open Parent Corner
              </button>
            </div>
          ) : (
          <>
            {subjects.length === 0 && (
              <div className="planner-subjects-empty" role="note">
                <div>
                  <strong>Add a subject first</strong>
                  <p>Your schedule uses the chapters and difficulty saved on the Subjects page.</p>
                </div>
                <button className="secondary-btn action-btn" onClick={onOpenSubjects} type="button">
                  Open Subjects
                </button>
              </div>
            )}
            <div className="form-grid planner-target-grid">
              <label className="field-stack compact-field">
                Exam date
                <input onChange={(event) => setExamDate(event.target.value)} type="date" value={examDate} />
              </label>

              <label className="field-stack compact-field">
                Exam strategy
                <select onChange={(event) => setPlanMode(event.target.value)} value={planMode}>
                  <option value="balanced">Balanced coverage</option>
                  <option value="high-priority">High priority first</option>
                  <option value="revision-heavy">Revision-heavy</option>
                  <option value="rapid">Rapid coverage</option>
                </select>
              </label>
            </div>

            <div className="timetable-actions">
              <button className="action-btn" disabled={loading || subjects.length === 0} onClick={generate} type="button">
                {loading ? (
                  <span className="spinner" />
                ) : (
                  <>
                    <span className="desktop-only-text">Generate schedule</span>
                    <span className="mobile-only-text">Generate</span>
                  </>
                )}
              </button>
              {schedule.length > 0 && (
                <button
                  className="secondary-btn action-btn"
                  onClick={() => setShowGenerateForm(false)}
                  type="button"
                >
                  Cancel
                </button>
              )}
            </div>
          </>
          )
        ) : (
          <div className="timetable-actions">
            <button className="secondary-btn action-btn" onClick={downloadPDF} type="button" title="Export PDF" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
              <Download size={14} />
              <span>Export</span>
            </button>
            <button className="secondary-btn action-btn" onClick={rebalanceSchedule} type="button">
              Rebalance
            </button>
            {previousSchedule && lastAction === "rebalance" && (
              <button className="secondary-btn action-btn undo-btn" onClick={handleUndo} type="button" title="Undo rebalance">
                ↩ Undo
              </button>
            )}
            <button className="secondary-btn action-btn" onClick={handleMissedTasks} type="button">
              <span className="desktop-only-text">Recover backlog</span>
              <span className="mobile-only-text">Recover</span>
            </button>
            {previousSchedule && lastAction === "backlog" && (
              <button className="secondary-btn action-btn undo-btn" onClick={handleUndo} type="button" title="Undo backlog recovery">
                ↩ Undo
              </button>
            )}
            <button
              className="action-btn new-schedule-btn"
              onClick={() => {
                if (!canManageSchedule) {
                  requestParentAccess();
                  return;
                }
                setShowGenerateForm(true);
              }}
              type="button"
            >
              <span className="desktop-only-text">New schedule</span>
              <span className="mobile-only-text">New schedule</span>
            </button>
          </div>
        )}
      </div>

      <div
        className="timetable"
        id="timetable"
        style={
          schedule.length > 8
            ? {
                maxHeight: "830px",
                overflowY: "auto",
                paddingRight: "8px",
              }
            : {}
        }
      >
        {schedule.length === 0 ? (
          <p className="empty-state">No timetable generated yet.</p>
        ) : (
          schedule.map((item, dayIndex) => (
            <PlannerScheduleDay
              completed={completed}
              dayIndex={dayIndex}
              item={item}
              key={item.day ?? dayIndex}
              onComplete={toggleComplete}
              onReschedule={handleRescheduleTask}
              scheduleStartDate={scheduleStartDate}
              today={today}
            />
          ))
        )}
      </div>
    </section>
  );
}

export default Timetable;
