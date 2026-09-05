import { useCallback, useEffect, useRef, useState } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { ArrowRight, Download, LockOpen, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "react-toastify";
import successSound from "../assets/success.mp3";
import PlannerUnlockQuizDialog from "./PlannerUnlockQuizDialog";
import api from "../utils/apiClient";
import { createAiIdempotencyKey, getAiRequestErrorMessage } from "../utils/aiQuota";
import { generateSchedule } from "../utils/scheduleGenerator";
import {
  formatScheduleDate,
  formatScheduleDayHeading,
  getScheduleGenerationWindow,
  toLocalDateKey,
} from "../utils/scheduleDates";
import { isEditableShortcutTarget } from "../utils/appKeyboardShortcuts";
import { subscribeToLocalDateChanges } from "../utils/localDateRefresh";
import {
  PLANNER_UNLOCK_QUIZ_QUESTION_COUNT,
  clearPlannerScheduleState,
  completePlannerTask,
  completePlannerUnlockQuiz,
  getPlannerDayProgression,
  getPlannerNextUnlockCandidateIndex,
  getPlannerSessionLabel,
  isPlannerMemoryReviewTask,
  isPlannerTaskCompleted,
  isPlannerTaskPending,
  isPlannerTaskRecheckPending,
  preparePlannerMemoryReviewNavigation,
  reopenPlannerTask,
} from "../utils/plannerScheduleProgress";
import { buildPlannerUnlockQuizRequest } from "../utils/plannerUnlockQuiz";

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

export function PlannerScheduleDay({
  completed,
  dayIndex,
  isUnlockCandidate,
  item,
  onComplete,
  onOpenMemoryReview = () => {},
  onReschedule,
  onUnlock,
  schedule,
  scheduleStartDate,
  today,
}) {
  const progression = getPlannerDayProgression(
    schedule,
    completed,
    dayIndex,
    scheduleStartDate,
    today,
  );
  const lockedDate = formatScheduleDate(progression.dateKey);
  const dayNumber = Number.parseInt(item?.day, 10) || dayIndex + 1;
  const canShowUnlockQuiz = progression.canAttemptUnlockQuiz
    && isUnlockCandidate !== false;

  return (
    <div
      className={"day-card planner-day-card" + (progression.isLocked ? " is-locked" : "")}
      data-planner-date={progression.dateKey || undefined}
      tabIndex={-1}
    >
      <div className="day-title">
        <span>{formatScheduleDayHeading(item, dayIndex, scheduleStartDate)}</span>
        {progression.isLocked && (
          <span className="planner-day-lock-controls">
            <span className="planner-day-locked-badge">
              {lockedDate
                ? "Locked until " + lockedDate
                : "Locked until its scheduled day"}
            </span>
            {canShowUnlockQuiz && (
              <button
                aria-controls="planner-unlock-quiz-dialog"
                aria-haspopup="dialog"
                aria-label={"Take unlock quiz for Day " + dayNumber}
                className="planner-day-unlock-btn"
                onClick={() => onUnlock(dayIndex)}
                title={"Unlock Day " + dayNumber + " with a quiz"}
                type="button"
              >
                <LockOpen aria-hidden="true" size={14} />
              </button>
            )}
          </span>
        )}
      </div>
      {progression.isRevisionDay ? (
        <div className="task-chip revision">Revision block</div>
      ) : (
        item.tasks?.map((task, taskIndex) => {
          const memoryReviewTask = isPlannerMemoryReviewTask(task);
          const wasCompleted = isPlannerTaskCompleted(task, completed);
          const isRecheckPending = isPlannerTaskRecheckPending(task);
          const showCompletedState = wasCompleted && !isRecheckPending;
          const sessionLabel = getPlannerSessionLabel(task.time);

          return (
            <div
              className={
                "task-row planner-task-row"
                + (showCompletedState ? " is-completed" : "")
              }
              data-planner-day-index={dayIndex}
              data-planner-task-completed={showCompletedState ? "true" : "false"}
              data-planner-task-index={taskIndex}
              key={task.task + "-" + taskIndex}
              tabIndex={progression.isLocked ? -1 : 0}
            >
              <span className="planner-task-control-slot">
                {memoryReviewTask ? (
                  <button
                    aria-label={showCompletedState
                      ? "Redo memory recall session for " + task.task
                      : (isRecheckPending ? "Continue" : "Open")
                        + " memory recall session for " + task.task}
                    className={
                      "planner-memory-review-btn"
                      + (showCompletedState ? " is-redo" : " is-open")
                    }
                    disabled={progression.isLocked}
                    onClick={() => onOpenMemoryReview(dayIndex, taskIndex)}
                    title={showCompletedState
                      ? "Redo this memory recall session"
                      : isRecheckPending
                        ? "Continue this memory recall session"
                        : "Open this memory recall session"}
                    type="button"
                  >
                    {showCompletedState ? (
                      <RotateCcw aria-hidden="true" size={15} />
                    ) : (
                      <ArrowRight aria-hidden="true" size={16} />
                    )}
                  </button>
                ) : showCompletedState ? (
                  <button
                    aria-label={"Reschedule " + task.task}
                    className="planner-reschedule-btn"
                    disabled={progression.isLocked}
                    onClick={() => onReschedule(dayIndex, taskIndex)}
                    title={"Reschedule " + task.task}
                    type="button"
                  >
                    <RotateCcw aria-hidden="true" size={15} />
                  </button>
                ) : (
                  <input
                    aria-label={isRecheckPending
                      ? "Complete " + task.task + " again"
                      : "Mark " + task.task + " complete"}
                    checked={false}
                    disabled={progression.isLocked}
                    onChange={() => onComplete(dayIndex, taskIndex)}
                    type="checkbox"
                  />
                )}
              </span>
              {!showCompletedState && sessionLabel && (
                <span className="time-slot">{sessionLabel}</span>
              )}
              <span className={showCompletedState ? "task-chip done" : "task-chip"}>
                <span className="planner-task-label">{task.task}</span>
                {isRecheckPending && (
                  <span className="planner-already-completed-badge">
                    Already completed
                  </span>
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
  academicProfile = {},
  academicProfileDataId = "",
  subjects,
  schedule,
  setSchedule,
  completed,
  setCompleted,
  scheduleStartDate,
  setScheduleStartDate,
  canManageSchedule = true,
  onOpenMemoryReview = () => {},
  onOpenSubjects = () => {},
  onRequestParentAccess,
  onShortcutActionHandled = () => {},
  shortcutAction = "",
}) {
  const [examDate, setExamDate] = useState("");
  const [planMode, setPlanMode] = useState("balanced");
  const [loading, setLoading] = useState(false);
  const [previousSchedule, setPreviousSchedule] = useState(null);
  const [lastAction, setLastAction] = useState(null); // "rebalance" | "backlog"
  const [showGenerateForm, setShowGenerateForm] = useState(schedule.length === 0);
  const [showClearConfirmation, setShowClearConfirmation] = useState(false);
  const [today, setToday] = useState(() => new Date());
  const [unlockQuizTarget, setUnlockQuizTarget] = useState(null);
  const academicProfileIdRef = useRef(academicProfileDataId);
  const completedRef = useRef(completed);
  const scheduleRef = useRef(schedule);
  const scheduleStartDateRef = useRef(scheduleStartDate);
  const todayRef = useRef(today);
  const timetableTopbarRef = useRef(null);

  academicProfileIdRef.current = academicProfileDataId;
  completedRef.current = completed;
  scheduleRef.current = schedule;
  scheduleStartDateRef.current = scheduleStartDate;
  todayRef.current = today;

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

  const activeUnlockProgression = unlockQuizTarget
    ? getPlannerDayProgression(
        schedule,
        completed,
        unlockQuizTarget.dayIndex,
        scheduleStartDate,
        today,
      )
    : null;
  const activeUnlockContext = activeUnlockProgression?.quizContext || null;
  const nextUnlockCandidateDayIndex = getPlannerNextUnlockCandidateIndex(
    schedule,
    completed,
    scheduleStartDate,
    today,
  );

  useEffect(() => {
    if (!unlockQuizTarget || !activeUnlockProgression) return;

    const contextMatches = activeUnlockContext
      ? activeUnlockContext.targetDayKey === unlockQuizTarget.targetDayKey
        && activeUnlockContext.sourceDayKey === unlockQuizTarget.sourceDayKey
        && activeUnlockContext.sourceTaskSignature === unlockQuizTarget.sourceTaskSignature
      : !unlockQuizTarget.sourceDayKey && !unlockQuizTarget.sourceTaskSignature;
    const naturallyUnlocked = !activeUnlockProgression.isLocked
      && !activeUnlockProgression.isQuizUnlocked;

    if (
      unlockQuizTarget.academicProfileDataId !== academicProfileDataId
      || unlockQuizTarget.dayIndex !== nextUnlockCandidateDayIndex
      || !contextMatches
      || naturallyUnlocked
    ) {
      setUnlockQuizTarget(null);
    }
  }, [
    academicProfileDataId,
    activeUnlockContext,
    activeUnlockProgression,
    nextUnlockCandidateDayIndex,
    unlockQuizTarget,
  ]);

  const openUnlockQuiz = (dayIndex) => {
    const candidateDayIndex = getPlannerNextUnlockCandidateIndex(
      scheduleRef.current,
      completedRef.current,
      scheduleStartDateRef.current,
      todayRef.current,
    );
    if (dayIndex !== candidateDayIndex) return;

    const progression = getPlannerDayProgression(
      scheduleRef.current,
      completedRef.current,
      dayIndex,
      scheduleStartDateRef.current,
      todayRef.current,
    );
    const context = progression.quizContext;
    if (!progression.canAttemptUnlockQuiz || !context) return;

    setUnlockQuizTarget({
      academicProfileDataId: academicProfileIdRef.current,
      dayIndex,
      sourceDayKey: context?.sourceDayKey || "",
      sourceTaskSignature: context?.sourceTaskSignature || "",
      targetDayKey: context?.targetDayKey || "index:" + dayIndex,
    });
  };

  const generateUnlockQuiz = async (topicDetails = "") => {
    const target = unlockQuizTarget;
    const requestProfileId = academicProfileIdRef.current;
    const currentProgression = target
      ? getPlannerDayProgression(
          scheduleRef.current,
          completedRef.current,
          target.dayIndex,
          scheduleStartDateRef.current,
          todayRef.current,
        )
      : null;
    const context = currentProgression?.quizContext;
    const currentCandidateDayIndex = getPlannerNextUnlockCandidateIndex(
      scheduleRef.current,
      completedRef.current,
      scheduleStartDateRef.current,
      todayRef.current,
    );
    const contextMatches = Boolean(
      target
      && context
      && target.academicProfileDataId === requestProfileId
      && target.targetDayKey === context.targetDayKey
      && target.sourceDayKey === context.sourceDayKey
      && target.sourceTaskSignature === context.sourceTaskSignature,
    );

    if (
      !contextMatches
      || !currentProgression?.canAttemptUnlockQuiz
      || target.dayIndex !== currentCandidateDayIndex
    ) {
      throw new Error("This schedule changed. Close the quiz and open the unlock button again.");
    }

    try {
      const quizRequest = buildPlannerUnlockQuizRequest(context, topicDetails);
      const payload = await api.generateQuiz({
        limit: PLANNER_UNLOCK_QUIZ_QUESTION_COUNT,
        subjectName: quizRequest.subjectName,
        topic: quizRequest.topic,
      }, {
        academicProfileId: requestProfileId,
        headers: { "Idempotency-Key": createAiIdempotencyKey() },
        timeoutMs: 120000,
      });

      const latestProgression = getPlannerDayProgression(
        scheduleRef.current,
        completedRef.current,
        target.dayIndex,
        scheduleStartDateRef.current,
        todayRef.current,
      );
      const latestContext = latestProgression.quizContext;
      const latestCandidateDayIndex = getPlannerNextUnlockCandidateIndex(
        scheduleRef.current,
        completedRef.current,
        scheduleStartDateRef.current,
        todayRef.current,
      );
      if (
        academicProfileIdRef.current !== requestProfileId
        || target.dayIndex !== latestCandidateDayIndex
        || latestContext?.targetDayKey !== target.targetDayKey
        || latestContext?.sourceDayKey !== target.sourceDayKey
        || latestContext?.sourceTaskSignature !== target.sourceTaskSignature
      ) {
        throw new Error("The planner changed while the quiz was loading. Open the unlock button again.");
      }

      return payload.questions || [];
    } catch (error) {
      throw new Error(getAiRequestErrorMessage(
        error,
        "Could not generate the planner unlock quiz.",
      ));
    }
  };

  const completeUnlockQuiz = (quizResult) => {
    const target = unlockQuizTarget;
    if (
      !target
      || target.academicProfileDataId !== academicProfileIdRef.current
    ) {
      return false;
    }

    const currentSchedule = scheduleRef.current;
    const progression = getPlannerDayProgression(
      currentSchedule,
      completedRef.current,
      target.dayIndex,
      scheduleStartDateRef.current,
      todayRef.current,
    );
    const context = progression.quizContext;
    const currentCandidateDayIndex = getPlannerNextUnlockCandidateIndex(
      currentSchedule,
      completedRef.current,
      scheduleStartDateRef.current,
      todayRef.current,
    );
    const contextMatches = Boolean(
      context
      && context.targetDayKey === target.targetDayKey
      && context.sourceDayKey === target.sourceDayKey
      && context.sourceTaskSignature === target.sourceTaskSignature,
    );

    if (
      !contextMatches
      || !progression.canAttemptUnlockQuiz
      || target.dayIndex !== currentCandidateDayIndex
    ) {
      return false;
    }

    const update = completePlannerUnlockQuiz(
      currentSchedule,
      completedRef.current,
      target.dayIndex,
      quizResult,
      {
        now: new Date(),
        scheduleStartDate: scheduleStartDateRef.current,
        today: todayRef.current,
      },
    );
    if (!update.unlocked) return false;

    scheduleRef.current = update.schedule;
    setSchedule(update.schedule);
    toast.success(
      "Day " + context.targetDayNumber + " unlocked with " + update.score + "/10.",
      { toastId: "planner-day-quiz-unlocked-" + context.targetDayKey },
    );
    return true;
  };

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

      setUnlockQuizTarget(null);
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

  const toggleComplete = useCallback((dayIndex, taskIndex) => {
    const nextState = completePlannerTask(
      schedule,
      completed,
      dayIndex,
      taskIndex,
    );

    if (nextState.schedule !== schedule) setSchedule(nextState.schedule);
    if (nextState.completed !== completed) setCompleted(nextState.completed);
  }, [completed, schedule, setCompleted, setSchedule]);

  useEffect(() => {
    const handlePlannerKeyboardShortcut = (event) => {
      if (
        event.defaultPrevented
        || event.repeat
        || event.altKey
        || event.ctrlKey
        || event.metaKey
        || event.shiftKey
        || isEditableShortcutTarget(event.target)
        || unlockQuizTarget
        || showClearConfirmation
      ) return;

      const key = event.key.toLowerCase();
      if (key === "n") {
        event.preventDefault();
        if (!canManageSchedule) {
          requestParentAccess();
          return;
        }
        setShowGenerateForm(true);
        window.requestAnimationFrame(() => {
          timetableTopbarRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
          timetableTopbarRef.current?.querySelector("input, select")?.focus({ preventScroll: true });
        });
        return;
      }

      if (key === "t") {
        event.preventDefault();
        const todayCard = document.querySelector(
          `.planner-day-card[data-planner-date="${toLocalDateKey(today)}"]`,
        );
        if (todayCard instanceof HTMLElement) {
          todayCard.scrollIntoView({ behavior: "smooth", block: "center" });
          todayCard.focus({ preventScroll: true });
        } else {
          toast.info("Today's schedule card is not in this plan.", {
            toastId: "planner-shortcut-today-missing",
          });
        }
        return;
      }

      if (key === "c") {
        event.preventDefault();
        const focusedTask = document.activeElement?.closest?.(".planner-task-row");
        const dayIndex = Number.parseInt(focusedTask?.dataset.plannerDayIndex || "", 10);
        const taskIndex = Number.parseInt(focusedTask?.dataset.plannerTaskIndex || "", 10);
        const canComplete = focusedTask
          && focusedTask.dataset.plannerTaskCompleted !== "true"
          && focusedTask.querySelector('input[type="checkbox"]:not([disabled])');
        if (canComplete && Number.isInteger(dayIndex) && Number.isInteger(taskIndex)) {
          toggleComplete(dayIndex, taskIndex);
        } else {
          toast.info("Focus an incomplete planner task, then press C.", {
            toastId: "planner-shortcut-focus-task",
          });
        }
      }
    };

    document.addEventListener("keydown", handlePlannerKeyboardShortcut);
    return () => document.removeEventListener("keydown", handlePlannerKeyboardShortcut);
  }, [
    canManageSchedule,
    requestParentAccess,
    showClearConfirmation,
    today,
    toggleComplete,
    unlockQuizTarget,
  ]);

  useEffect(() => {
    if (!shortcutAction) return undefined;

    const actionFrame = window.requestAnimationFrame(() => {
      if (shortcutAction === "new") {
        if (!canManageSchedule) {
          requestParentAccess();
        } else {
          setShowGenerateForm(true);
          window.requestAnimationFrame(() => {
            timetableTopbarRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
            timetableTopbarRef.current?.querySelector("input, select")?.focus({ preventScroll: true });
          });
        }
      } else if (shortcutAction === "today") {
        const todayCard = document.querySelector(
          `.planner-day-card[data-planner-date="${toLocalDateKey(today)}"]`,
        );
        if (todayCard instanceof HTMLElement) {
          todayCard.scrollIntoView({ behavior: "smooth", block: "center" });
          todayCard.focus({ preventScroll: true });
        } else {
          toast.info("Today's schedule card is not in this plan.", {
            toastId: "planner-shortcut-today-missing",
          });
        }
      }
      onShortcutActionHandled();
    });

    return () => window.cancelAnimationFrame(actionFrame);
  }, [
    canManageSchedule,
    onShortcutActionHandled,
    requestParentAccess,
    shortcutAction,
    today,
  ]);

  const handleRescheduleTask = (dayIndex, taskIndex) => {
    const updatedSchedule = reopenPlannerTask(
      schedule,
      completed,
      dayIndex,
      taskIndex,
    );
    if (updatedSchedule !== schedule) setSchedule(updatedSchedule);
  };

  const handleOpenMemoryReview = (dayIndex, taskIndex) => {
    const navigation = preparePlannerMemoryReviewNavigation(
      schedule,
      completed,
      dayIndex,
      taskIndex,
    );
    if (!navigation.task) return;
    if (navigation.schedule !== schedule) setSchedule(navigation.schedule);
    onOpenMemoryReview(navigation.task);
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

    setUnlockQuizTarget(null);
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
    setUnlockQuizTarget(null);
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
    setUnlockQuizTarget(null);
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

      <div className="timetable-topbar" ref={timetableTopbarRef}>
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

      <div className="timetable" id="timetable">
        {schedule.length === 0 ? (
          <p className="empty-state">No timetable generated yet.</p>
        ) : (
          schedule.map((item, dayIndex) => (
            <PlannerScheduleDay
              completed={completed}
              dayIndex={dayIndex}
              isUnlockCandidate={dayIndex === nextUnlockCandidateDayIndex}
              item={item}
              key={item.day ?? dayIndex}
              onComplete={toggleComplete}
              onOpenMemoryReview={handleOpenMemoryReview}
              onReschedule={handleRescheduleTask}
              onUnlock={openUnlockQuiz}
              schedule={schedule}
              scheduleStartDate={scheduleStartDate}
              today={today}
            />
          ))
        )}
      </div>

      {unlockQuizTarget && activeUnlockProgression && (
        <PlannerUnlockQuizDialog
          academicProfile={academicProfile}
          canAttempt={Boolean(
            activeUnlockProgression.canAttemptUnlockQuiz
            && unlockQuizTarget.dayIndex === nextUnlockCandidateDayIndex
          )}
          context={activeUnlockContext}
          onClose={() => setUnlockQuizTarget(null)}
          onGenerate={generateUnlockQuiz}
          hasScheduledDate={Boolean(activeUnlockProgression.dateKey)}
          onPassed={completeUnlockQuiz}
          sessionKey={[
            unlockQuizTarget.academicProfileDataId,
            unlockQuizTarget.targetDayKey,
            unlockQuizTarget.sourceDayKey,
            unlockQuizTarget.sourceTaskSignature,
          ].join("|")}
        />
      )}
    </section>
  );
}

export default Timetable;
