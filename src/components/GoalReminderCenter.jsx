import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CalendarClock,
  Check,
  CheckCircle2,
  Flag,
  Info,
  ListTodo,
  EllipsisVertical,
  Plus,
  RotateCcw,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "react-toastify";
import { getAcademicProfileExamples } from "../utils/academicProfileExamples";

import {
  OPEN_GOAL_REMINDER_EVENT,
  clearPlannerCollection,
  createPlannerId,
  getLocalDateKey,
  getPlannerAttentionSummary,
  getTomorrowDateKey,
  normalizePlannerData,
  normalizePlannerSettings,
  postponeGoalToTomorrow,
} from "../utils/goalReminderStore";

const PRIORITY_LABELS = { low: "Low", medium: "Normal", high: "High" };
const CATEGORY_LABELS = { study: "Study", exam: "Exam", project: "Project", personal: "Personal" };
const BULK_CLEAR_ACTIONS = Object.freeze([
  { key: "goals", label: "Clear all goals", success: "All goals cleared." },
  { key: "todos", label: "Clear all to-do's", success: "All to-do's cleared." },
]);
const DRAWER_CLOSE_DURATION_MS = 280;

function createGoalDraft() {
  return {
    title: "",
    notes: "",
    targetDate: getTomorrowDateKey(),
    priority: "medium",
    category: "study",
  };
}

function formatDateLabel(dateKey) {
  if (!dateKey) return "No date";
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0);
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function getDateTone(dateKey, today, completed) {
  if (completed) return "complete";
  if (!dateKey) return "neutral";
  if (dateKey < today) return "overdue";
  if (dateKey === today) return "today";
  return "upcoming";
}

function sortPlannerItems(items, dateField) {
  return [...items].sort((left, right) => {
    if (left.completed !== right.completed) return left.completed ? 1 : -1;
    const leftDate = left[dateField] || "9999-12-31";
    const rightDate = right[dateField] || "9999-12-31";
    if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);
    return String(left.createdAt).localeCompare(String(right.createdAt));
  });
}

function PlannerCheckbox({ checked, label, onChange }) {
  return (
    <label className="planner-item-checkbox" title={label}>
      <input aria-label={label} checked={checked} onChange={onChange} type="checkbox" />
      <span aria-hidden="true"><Check size={13} strokeWidth={3} /></span>
    </label>
  );
}

function DeleteConfirmation({ label, onCancel, onConfirm }) {
  return (
    <div className="planner-delete-confirm" role="group" aria-label={`Confirm deleting ${label}`}>
      <span>Delete?</span>
      <button aria-label={`Confirm delete ${label}`} className="planner-confirm-btn is-confirm" onClick={onConfirm} title="Confirm delete" type="button">
        <Check size={13} strokeWidth={3} />
      </button>
      <button aria-label="Cancel delete" className="planner-confirm-btn is-cancel" onClick={onCancel} title="Cancel" type="button">
        <X size={13} strokeWidth={3} />
      </button>
    </div>
  );
}

function EmptyPlannerState({ icon, title, detail }) {
  return (
    <div className="planner-empty-state">
      {icon}
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

function GoalReminderCenter({ academicProfile = {}, data, onDataChange, onOpen, onSettingsChange, settings }) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const curriculumExamples = useMemo(
    () => getAcademicProfileExamples(academicProfile),
    [academicProfile]
  );
  const [goalDraft, setGoalDraft] = useState(createGoalDraft);
  const [goalComposerOpen, setGoalComposerOpen] = useState(false);
  const [todoDraft, setTodoDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState("");
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false);
  const [confirmBulkClear, setConfirmBulkClear] = useState("");
  const [aboutOpen, setAboutOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const closeButtonRef = useRef(null);
  const closeTimerRef = useRef(null);
  const dialogRef = useRef(null);
  const aboutButtonRef = useRef(null);
  const aboutCloseButtonRef = useRef(null);
  const bulkMenuButtonRef = useRef(null);
  const bulkMenuRef = useRef(null);
  const aboutDialogRef = useRef(null);
  const goalComposerButtonRef = useRef(null);
  const goalComposerRef = useRef(null);
  const goalTitleInputRef = useRef(null);

  const plannerData = useMemo(() => normalizePlannerData(data), [data]);
  const plannerSettings = useMemo(() => normalizePlannerSettings(settings), [settings]);
  const today = useMemo(() => getLocalDateKey(now), [now]);
  const visibleGoals = useMemo(() => sortPlannerItems(
    plannerSettings.showCompleted ? plannerData.goals : plannerData.goals.filter((item) => !item.completed),
    "targetDate"
  ), [plannerData.goals, plannerSettings.showCompleted]);
  const visibleTodos = useMemo(() => [...(
    plannerSettings.showCompleted ? plannerData.todos : plannerData.todos.filter((item) => !item.completed)
  )].sort((left, right) => Number(left.completed) - Number(right.completed)), [plannerData.todos, plannerSettings.showCompleted]);
  const attentionSummary = useMemo(
    () => getPlannerAttentionSummary(plannerData, now),
    [now, plannerData],
  );
  const activeGoals = plannerData.goals.filter((item) => !item.completed).length;
  const openTodos = plannerData.todos.filter((item) => !item.completed).length;

  const persistData = (next) => onDataChange?.(normalizePlannerData(next));
  const persistSettings = (next) => onSettingsChange?.(normalizePlannerSettings(next));
  const closeGoalComposer = (restoreFocus = true) => {
    setGoalComposerOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => goalComposerButtonRef.current?.focus());
  };

  const openCenter = useCallback(() => {
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
    onOpen?.();
    setConfirmDelete("");
    setConfirmBulkClear("");
    setBulkMenuOpen(false);
    setAboutOpen(false);
    setGoalComposerOpen(false);
    setClosing(false);
    setOpen(true);
  }, [onOpen]);

  const closeCenter = useCallback(() => {
    if (closeTimerRef.current !== null) return;
    setConfirmBulkClear("");
    setBulkMenuOpen(false);
    setAboutOpen(false);
    setGoalComposerOpen(false);
    setClosing(true);

    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setOpen(false);
      setClosing(false);
    }, reducedMotion ? 0 : DRAWER_CLOSE_DURATION_MS);
  }, []);

  useEffect(() => () => window.clearTimeout(closeTimerRef.current), []);

  useEffect(() => {
    window.addEventListener(OPEN_GOAL_REMINDER_EVENT, openCenter);
    return () => window.removeEventListener(OPEN_GOAL_REMINDER_EVENT, openCenter);
  }, [openCenter]);

  useEffect(() => {
    const refreshClock = () => setNow(new Date());
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshClock();
    };
    const interval = window.setInterval(refreshClock, 15_000);
    window.addEventListener("focus", refreshClock);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshClock);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement;
    document.body.classList.add("goal-reminder-center-open");
    window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        if (aboutDialogRef.current) return;
        if (goalComposerRef.current) return;
        if (bulkMenuRef.current) {
          event.preventDefault();
          setConfirmBulkClear("");
          setBulkMenuOpen(false);
          window.requestAnimationFrame(() => bulkMenuButtonRef.current?.focus());
          return;
        }
        event.preventDefault();
        closeCenter();
        return;
      }
      if (event.key !== "Tab") return;
      if (aboutDialogRef.current) return;
      const focusable = dialogRef.current?.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.classList.remove("goal-reminder-center-open");
      previousFocus?.focus?.();
    };
  }, [closeCenter, open]);

  useEffect(() => {
    if (!bulkMenuOpen) return undefined;

    const handlePointerDown = (event) => {
      if (
        bulkMenuRef.current?.contains(event.target) ||
        bulkMenuButtonRef.current?.contains(event.target)
      ) return;
      setConfirmBulkClear("");
      setBulkMenuOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [bulkMenuOpen]);

  useEffect(() => {
    if (!goalComposerOpen) return undefined;
    window.requestAnimationFrame(() => goalTitleInputRef.current?.focus());

    const handlePointerDown = (event) => {
      if (
        goalComposerRef.current?.contains(event.target)
        || goalComposerButtonRef.current?.contains(event.target)
      ) return;
      setGoalComposerOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setGoalComposerOpen(false);
      window.requestAnimationFrame(() => goalComposerButtonRef.current?.focus());
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [goalComposerOpen]);

  useEffect(() => {
    if (!aboutOpen) return undefined;
    const previousFocus = document.activeElement;
    window.requestAnimationFrame(() => aboutCloseButtonRef.current?.focus());

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setAboutOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = aboutDialogRef.current?.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus?.();
    };
  }, [aboutOpen]);

  const createGoal = (event) => {
    event.preventDefault();
    if (!goalDraft.title.trim() || !goalDraft.targetDate) {
      toast.warn("Add a goal title and target date.");
      return;
    }
    const nextGoal = {
      id: createPlannerId("goal"),
      ...goalDraft,
      title: goalDraft.title.trim(),
      notes: goalDraft.notes.trim(),
      completed: false,
      completedAt: "",
      createdAt: new Date().toISOString(),
      postponedCount: 0,
    };
    persistData({ ...plannerData, goals: [nextGoal, ...plannerData.goals] });
    setGoalDraft(createGoalDraft());
    closeGoalComposer();
    toast.success("Goal created.");
  };

  const createTodo = (event) => {
    event.preventDefault();
    if (!todoDraft.trim()) return;
    const nextTodo = {
      id: createPlannerId("todo"),
      title: todoDraft.trim(),
      completed: false,
      createdAt: new Date().toISOString(),
    };
    persistData({ ...plannerData, todos: [nextTodo, ...plannerData.todos] });
    setTodoDraft("");
  };

  const toggleGoal = (goalId) => persistData({
    ...plannerData,
    goals: plannerData.goals.map((goal) => goal.id === goalId ? {
      ...goal,
      completed: !goal.completed,
      completedAt: goal.completed ? "" : new Date().toISOString(),
    } : goal),
  });

  const postponeGoal = (goalId) => {
    persistData({
      ...plannerData,
      goals: plannerData.goals.map((goal) => goal.id === goalId ? postponeGoalToTomorrow(goal) : goal),
    });
    toast.info("Goal moved to tomorrow.");
  };

  const toggleTodo = (todoId) => persistData({
    ...plannerData,
    todos: plannerData.todos.map((todo) => todo.id === todoId ? { ...todo, completed: !todo.completed } : todo),
  });

  const deleteItem = (type, id) => {
    const key = type === "goal" ? "goals" : "todos";
    persistData({ ...plannerData, [key]: plannerData[key].filter((item) => item.id !== id) });
    setConfirmDelete("");
  };

  const clearAllItems = (action) => {
    if (!plannerData[action.key].length) return;

    persistData(clearPlannerCollection(plannerData, action.key));
    setConfirmDelete("");
    setConfirmBulkClear("");
    setBulkMenuOpen(false);
    window.requestAnimationFrame(() => bulkMenuButtonRef.current?.focus());
    toast.success(action.success);
  };

  const dueGoalCount = attentionSummary.dueGoals.length;
  const staleTodoCount = attentionSummary.staleTodos.length;
  const attentionLabel = [
    dueGoalCount ? `${dueGoalCount} due goal${dueGoalCount === 1 ? "" : "s"}` : "",
    staleTodoCount ? `${staleTodoCount} to-do${staleTodoCount === 1 ? "" : "s"} open over 24 hours` : "",
  ].filter(Boolean).join(" and ");

  const dialog = open ? (
    <div
      className={`goal-reminder-backdrop${closing ? " is-closing" : ""}`}
      onMouseDown={(event) => event.target === event.currentTarget && closeCenter()}
    >
      <section
        aria-describedby="goal-reminder-center-description"
        aria-hidden={aboutOpen ? true : undefined}
        aria-labelledby="goal-reminder-center-title"
        aria-modal={aboutOpen ? undefined : true}
        className={`goal-reminder-dialog${closing ? " is-closing" : ""}`}
        inert={aboutOpen}
        ref={dialogRef}
        role="dialog"
      >
        <header className="goal-reminder-dialog-header">
          <div className="goal-reminder-dialog-title">
            <span className="goal-reminder-dialog-mark" aria-hidden="true"><Target size={19} /><ListTodo size={11} /></span>
            <div><h2 id="goal-reminder-center-title">Goal & To-Do Center</h2><p id="goal-reminder-center-description">Plan dated outcomes and clear compact daily tasks.</p></div>
          </div>
          <div className="goal-reminder-header-controls">
            <span className="goal-reminder-save-status"><CheckCircle2 aria-hidden="true" size={13} /><span>Changes save automatically to your workspace.</span></span>
            <label className="goal-reminder-show-completed"><input checked={plannerSettings.showCompleted} onChange={(event) => persistSettings({ ...plannerSettings, showCompleted: event.target.checked })} type="checkbox" /> Show completed items</label>
            <div className="goal-reminder-header-actions">
              <div className="goal-reminder-bulk-menu-wrap">
                <button
                  aria-controls="goal-reminder-bulk-menu"
                  aria-expanded={bulkMenuOpen}
                  aria-haspopup="menu"
                  aria-label="Open clear-all menu"
                  className="goal-reminder-more-btn"
                  onClick={() => {
                    setConfirmBulkClear("");
                    setGoalComposerOpen(false);
                    setBulkMenuOpen((current) => !current);
                  }}
                  ref={bulkMenuButtonRef}
                  title="Clear saved goals or to-do's"
                  type="button"
                ><EllipsisVertical size={18} /></button>
                {bulkMenuOpen && (
                  <div
                    aria-label="Clear saved goals or to-do's"
                    className="goal-reminder-bulk-menu"
                    id="goal-reminder-bulk-menu"
                    ref={bulkMenuRef}
                    role="menu"
                  >
                    {BULK_CLEAR_ACTIONS.map((action) => {
                      const count = plannerData[action.key].length;
                      return confirmBulkClear === action.key ? (
                        <div className="goal-reminder-bulk-confirm" key={action.key} role="none">
                          <span><strong>Clear all?</strong></span>
                          <button
                            aria-label={`Confirm ${action.label.toLowerCase()}`}
                            className="planner-confirm-btn is-confirm"
                            onClick={() => clearAllItems(action)}
                            role="menuitem"
                            title="Confirm clear all"
                            type="button"
                          ><Check size={13} strokeWidth={3} /></button>
                          <button
                            aria-label={`Cancel ${action.label.toLowerCase()}`}
                            className="planner-confirm-btn is-cancel"
                            onClick={() => setConfirmBulkClear("")}
                            role="menuitem"
                            title="Cancel"
                            type="button"
                          ><X size={13} strokeWidth={3} /></button>
                        </div>
                      ) : (
                        <button
                          className="goal-reminder-bulk-option"
                          disabled={count === 0}
                          key={action.key}
                          onClick={() => setConfirmBulkClear(action.key)}
                          role="menuitem"
                          type="button"
                        ><Trash2 aria-hidden="true" size={14} /><span>{action.label}</span><strong>{count}</strong></button>
                      );
                    })}
                  </div>
                )}
              </div>
              <button
                aria-expanded={aboutOpen}
                aria-haspopup="dialog"
                aria-label="About goals and to-do tasks"
                className="goal-reminder-about-btn"
                onClick={() => {
                  setConfirmBulkClear("");
                  setBulkMenuOpen(false);
                  setGoalComposerOpen(false);
                  setAboutOpen(true);
                }}
                ref={aboutButtonRef}
                title="How goals and to-do tasks work"
                type="button"
              ><Info size={18} /></button>
              <button aria-label="Close goal and to-do center" className="goal-reminder-close-btn" onClick={closeCenter} ref={closeButtonRef} type="button"><X size={18} /></button>
            </div>
          </div>
        </header>

        <div className="goal-reminder-stats">
          <div><Target size={16} /><span>Active goals</span><strong>{activeGoals}</strong></div>
          <div><ListTodo size={16} /><span>Open to-dos</span><strong>{openTodos}</strong></div>
        </div>

        <div className="goal-reminder-dialog-body">
          <section aria-labelledby="planner-goals-heading" className="planner-list-panel planner-goals-panel">
            <div className="planner-panel-heading">
              <div><h3 className="planner-panel-label" id="planner-goals-heading">Goals</h3></div>
              <div className="planner-panel-heading-actions">
                <strong>{activeGoals} active</strong>
                <button
                  aria-controls="planner-goal-composer"
                  aria-expanded={goalComposerOpen}
                  aria-haspopup="dialog"
                  aria-label="Add a new goal"
                  className="planner-add-goal-btn"
                  onClick={() => {
                    setConfirmDelete("");
                    setConfirmBulkClear("");
                    setBulkMenuOpen(false);
                    setGoalComposerOpen((current) => !current);
                  }}
                  ref={goalComposerButtonRef}
                  title="Add goal"
                  type="button"
                ><Plus aria-hidden="true" size={16} /></button>
              </div>
            </div>

            {goalComposerOpen && (
              <div
                aria-labelledby="planner-goal-composer-title"
                className="planner-goal-composer-popover"
                id="planner-goal-composer"
                ref={goalComposerRef}
                role="dialog"
              >
                <div className="planner-goal-composer-header">
                  <div><span>New goal</span><strong id="planner-goal-composer-title">Add a dated outcome</strong></div>
                  <button
                    aria-label="Close new goal form"
                    className="planner-goal-composer-close"
                    onClick={() => closeGoalComposer()}
                    title="Close"
                    type="button"
                  ><X aria-hidden="true" size={15} /></button>
                </div>

                <form className="planner-entry-form planner-goal-composer-form" onSubmit={createGoal}>
                  <label className="planner-field planner-field-full"><span>Goal title *</span><input maxLength="120" onChange={(event) => setGoalDraft({ ...goalDraft, title: event.target.value })} placeholder={curriculumExamples.goalTitlePlaceholder} ref={goalTitleInputRef} value={goalDraft.title} /></label>
                  <label className="planner-field"><span>Target date *</span><input min={today} onChange={(event) => setGoalDraft({ ...goalDraft, targetDate: event.target.value })} type="date" value={goalDraft.targetDate} /></label>
                  <label className="planner-field"><span>Priority</span><select onChange={(event) => setGoalDraft({ ...goalDraft, priority: event.target.value })} value={goalDraft.priority}><option value="low">Low</option><option value="medium">Normal</option><option value="high">High</option></select></label>
                  <label className="planner-field"><span>Category</span><select onChange={(event) => setGoalDraft({ ...goalDraft, category: event.target.value })} value={goalDraft.category}><option value="study">Study</option><option value="exam">Exam</option><option value="project">Project</option><option value="personal">Personal</option></select></label>
                  <label className="planner-field planner-field-notes"><span>Details</span><textarea maxLength="800" onChange={(event) => setGoalDraft({ ...goalDraft, notes: event.target.value })} placeholder="Add milestones or the intended outcome" rows="2" value={goalDraft.notes} /></label>
                  <div className="planner-goal-composer-actions">
                    <button className="planner-goal-cancel-btn" onClick={() => closeGoalComposer()} type="button">Cancel</button>
                    <button className="planner-create-btn" type="submit"><Plus size={15} /> Create goal</button>
                  </div>
                </form>
              </div>
            )}

            <div className="planner-scroll-list">
              {visibleGoals.length === 0 ? <EmptyPlannerState detail="Use the plus button to add a dated outcome." icon={<Target aria-hidden="true" size={20} />} title="No goals yet" /> : visibleGoals.map((goal) => {
                const tone = getDateTone(goal.targetDate, today, goal.completed);
                const deleteKey = `goal:${goal.id}`;
                return (
                  <article className={`planner-item-card priority-${goal.priority}${goal.completed ? " is-complete" : ""}`} key={goal.id}>
                    <PlannerCheckbox checked={goal.completed} label={goal.completed ? `Reopen ${goal.title}` : `Complete ${goal.title}`} onChange={() => toggleGoal(goal.id)} />
                    <div className="planner-item-copy">
                      <div className="planner-item-title-row"><strong>{goal.title}</strong><span className={`planner-date-chip is-${tone}`}>{tone === "overdue" ? "Overdue" : tone === "today" ? "Today" : tone === "complete" ? "Completed" : formatDateLabel(goal.targetDate)}</span></div>
                      {goal.notes && <p>{goal.notes}</p>}
                      <div className="planner-item-meta"><span><Flag size={12} /> {PRIORITY_LABELS[goal.priority]}</span><span>{CATEGORY_LABELS[goal.category]}</span>{goal.postponedCount > 0 && <span>{goal.postponedCount}× postponed</span>}</div>
                    </div>
                    <div className="planner-item-actions">
                      {!goal.completed && goal.targetDate <= today && <button className="planner-tomorrow-btn" onClick={() => postponeGoal(goal.id)} title="Postpone to tomorrow" type="button"><CalendarClock size={14} /><span>Tomorrow</span></button>}
                      {confirmDelete === deleteKey ? <DeleteConfirmation label={goal.title} onCancel={() => setConfirmDelete("")} onConfirm={() => deleteItem("goal", goal.id)} /> : <button aria-label={`Delete ${goal.title}`} className="planner-trash-btn" onClick={() => setConfirmDelete(deleteKey)} title="Delete goal" type="button"><Trash2 size={14} /></button>}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="quick-todo-heading" className="planner-list-panel planner-todo-panel">
            <div className="planner-panel-heading">
              <div><h3 className="planner-panel-label" id="quick-todo-heading">Quick to-do</h3></div>
              <strong>{openTodos} open</strong>
            </div>
            <form className="planner-todo-composer" onSubmit={createTodo}>
              <input aria-label="New to-do task" maxLength="160" onChange={(event) => setTodoDraft(event.target.value)} placeholder="Add a small next task" value={todoDraft} />
              <button aria-label="Add to-do task" disabled={!todoDraft.trim()} title="Add task" type="submit"><Plus size={15} /></button>
            </form>
            <div className="planner-todo-list">
              {visibleTodos.length === 0 ? <span className="planner-todo-empty">No to-do tasks yet.</span> : visibleTodos.map((todo) => {
                const deleteKey = `todo:${todo.id}`;
                return (
                  <div className={`planner-todo-row${todo.completed ? " is-complete" : ""}`} key={todo.id}>
                    <button
                      aria-label={todo.completed ? `Mark task not done: ${todo.title}` : `Mark task done: ${todo.title}`}
                      aria-pressed={todo.completed}
                      className="planner-todo-toggle"
                      onClick={() => toggleTodo(todo.id)}
                      type="button"
                    >
                      <span className="planner-todo-title">{todo.title}</span>
                    </button>
                    <div className="planner-todo-actions">
                      {todo.completed && (
                        <button
                          aria-label={`Undo completion for ${todo.title}`}
                          className="planner-undo-btn"
                          onClick={() => toggleTodo(todo.id)}
                          title="Mark as not done"
                          type="button"
                        >
                          <RotateCcw size={13} />
                        </button>
                      )}
                      {confirmDelete === deleteKey ? <DeleteConfirmation label={todo.title} onCancel={() => setConfirmDelete("")} onConfirm={() => deleteItem("todo", todo.id)} /> : <button aria-label={`Delete ${todo.title}`} className="planner-trash-btn" onClick={() => setConfirmDelete(deleteKey)} title="Delete task" type="button"><Trash2 size={13} /></button>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

        </div>

      </section>

        {aboutOpen && (
          <div
            className="goal-reminder-about-backdrop"
            onMouseDown={(event) => {
              event.stopPropagation();
              if (event.target === event.currentTarget) setAboutOpen(false);
            }}
          >
            <section
              aria-labelledby="goal-reminder-about-title"
              aria-modal="true"
              className="goal-reminder-about-dialog"
              id="goal-reminder-about-dialog"
              ref={aboutDialogRef}
              role="dialog"
            >
              <header className="goal-reminder-about-header">
                <div>
                  <span>Center guide</span>
                  <h3 id="goal-reminder-about-title">How goals and to-do tasks work</h3>
                </div>
                <button
                  aria-label="Close goals and to-do guide"
                  className="goal-reminder-about-close-btn"
                  onClick={() => setAboutOpen(false)}
                  ref={aboutCloseButtonRef}
                  title="Close guide"
                  type="button"
                ><X size={18} /></button>
              </header>

              <div className="goal-reminder-about-body">
                <div className="goal-reminder-about-features" aria-label="Goal and to-do features">
                  <article>
                    <div><Target aria-hidden="true" size={17} /><strong>Goals</strong></div>
                    <p>Create a dated outcome with priority, category, and details. Tick it when finished, or move an overdue goal to tomorrow.</p>
                  </article>
                  <article>
                    <div><ListTodo aria-hidden="true" size={17} /><strong>Quick to-do</strong></div>
                    <p>Add a small next action, then click its card to mark it done. Use Undo to restore a finished task or Delete to remove it.</p>
                  </article>
                </div>

                <section className="goal-reminder-about-settings" aria-labelledby="goal-reminder-about-settings-title">
                  <h4 id="goal-reminder-about-settings-title">Completed items</h4>
                  <dl>
                    <div>
                      <dt>Show completed items</dt>
                      <dd>Keeps finished goals and to-dos visible so they can be reviewed or reopened.</dd>
                    </div>
                  </dl>
                </section>

                <section className="goal-reminder-about-workflow" aria-labelledby="goal-reminder-about-workflow-title">
                  <h4 id="goal-reminder-about-workflow-title">A simple workflow</h4>
                  <ol>
                    <li>Create a dated goal with its priority, category, and optional details.</li>
                    <li>Use Quick to-do for short actions that do not need a date.</li>
                    <li>Mark items finished; enable Show completed items whenever you need to restore one.</li>
                  </ol>
                </section>
              </div>

              <footer className="goal-reminder-about-footer">
                <span><CheckCircle2 aria-hidden="true" size={14} /> Center changes save automatically.</span>
                <button className="goal-reminder-about-done-btn" onClick={() => setAboutOpen(false)} type="button">Got it</button>
              </footer>
            </section>
          </div>
        )}
    </div>
  ) : null;

  return (
    <div className="goal-reminder-launcher">
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={attentionSummary.total ? `Open Goal and To-Do Center. Attention needed: ${attentionLabel}.` : "Open Goal and To-Do Center"}
        className={`goal-reminder-launcher-button${attentionSummary.total ? " has-attention" : ""}`}
        onClick={openCenter}
        title="Goals and to-do list"
        type="button"
      >
        <span className="goal-reminder-launcher-visual" aria-hidden="true">
          <Target className="goal-reminder-target-icon" size={42} strokeWidth={1.8} />
          {attentionSummary.total > 0 && (
            <span className="goal-reminder-count">{attentionSummary.total > 99 ? "99+" : attentionSummary.total}</span>
          )}
        </span>
      </button>
      {typeof document !== "undefined" && dialog ? createPortal(dialog, document.body) : null}
    </div>
  );
}

export default GoalReminderCenter;
