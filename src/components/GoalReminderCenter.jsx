import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlarmClock,
  BellRing,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock3,
  Flag,
  Info,
  ListTodo,
  Plus,
  RotateCcw,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "react-toastify";

import {
  OPEN_GOAL_REMINDER_EVENT,
  createPlannerId,
  getLocalDateKey,
  getTomorrowDateKey,
  normalizePlannerData,
  normalizePlannerSettings,
  postponeGoalToTomorrow,
} from "../utils/goalReminderStore";

const PRIORITY_LABELS = { low: "Low", medium: "Normal", high: "High" };
const CATEGORY_LABELS = { study: "Study", exam: "Exam", project: "Project", personal: "Personal" };

function getSuggestedTime(date = new Date()) {
  const next = new Date(date);
  next.setMinutes(next.getMinutes() + 30);
  return `${String(next.getHours()).padStart(2, "0")}:${String(next.getMinutes()).padStart(2, "0")}`;
}

function createGoalDraft() {
  return {
    title: "",
    notes: "",
    targetDate: getTomorrowDateKey(),
    priority: "medium",
    category: "study",
  };
}

function createReminderDraft() {
  return {
    title: "",
    notes: "",
    date: getLocalDateKey(),
    time: getSuggestedTime(),
    priority: "medium",
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
      <input checked={checked} onChange={onChange} type="checkbox" />
      <span aria-hidden="true"><Check size={13} strokeWidth={3} /></span>
      <span className="sr-only">{label}</span>
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

function GoalReminderCenter({ data, onDataChange, onOpen, onSettingsChange, settings }) {
  const [open, setOpen] = useState(false);
  const [composer, setComposer] = useState("goal");
  const [goalDraft, setGoalDraft] = useState(createGoalDraft);
  const [reminderDraft, setReminderDraft] = useState(createReminderDraft);
  const [todoDraft, setTodoDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState("");
  const [aboutOpen, setAboutOpen] = useState(false);
  const [showNudge, setShowNudge] = useState(false);
  const [today, setToday] = useState(getLocalDateKey);
  const closeButtonRef = useRef(null);
  const dialogRef = useRef(null);
  const aboutButtonRef = useRef(null);
  const aboutCloseButtonRef = useRef(null);
  const aboutDialogRef = useRef(null);

  const plannerData = useMemo(() => normalizePlannerData(data), [data]);
  const plannerSettings = useMemo(() => normalizePlannerSettings(settings), [settings]);
  const visibleGoals = useMemo(() => sortPlannerItems(
    plannerSettings.showCompleted ? plannerData.goals : plannerData.goals.filter((item) => !item.completed),
    "targetDate"
  ), [plannerData.goals, plannerSettings.showCompleted]);
  const visibleReminders = useMemo(() => sortPlannerItems(
    plannerSettings.showCompleted ? plannerData.reminders : plannerData.reminders.filter((item) => !item.completed),
    "date"
  ), [plannerData.reminders, plannerSettings.showCompleted]);
  const visibleTodos = useMemo(() => [...(
    plannerSettings.showCompleted ? plannerData.todos : plannerData.todos.filter((item) => !item.completed)
  )].sort((left, right) => Number(left.completed) - Number(right.completed)), [plannerData.todos, plannerSettings.showCompleted]);
  const todayReminders = useMemo(() => plannerData.reminders
    .filter((item) => !item.completed && item.date === today)
    .sort((left, right) => (left.time || "00:00").localeCompare(right.time || "00:00")), [plannerData.reminders, today]);

  const activeGoals = plannerData.goals.filter((item) => !item.completed).length;
  const openTodos = plannerData.todos.filter((item) => !item.completed).length;

  const persistData = (next) => onDataChange?.(normalizePlannerData(next));
  const persistSettings = (next) => onSettingsChange?.(normalizePlannerSettings(next));

  const openCenter = () => {
    onOpen?.();
    setConfirmDelete("");
    setAboutOpen(false);
    setOpen(true);
  };

  const closeCenter = () => {
    setAboutOpen(false);
    setOpen(false);
  };

  useEffect(() => {
    const handleOpen = () => {
      onOpen?.();
      setConfirmDelete("");
      setAboutOpen(false);
      setOpen(true);
    };
    window.addEventListener(OPEN_GOAL_REMINDER_EVENT, handleOpen);
    return () => window.removeEventListener(OPEN_GOAL_REMINDER_EVENT, handleOpen);
  }, [onOpen]);

  useEffect(() => {
    const interval = window.setInterval(() => setToday(getLocalDateKey()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!plannerSettings.nudgeEnabled || todayReminders.length === 0 || open) {
      setShowNudge(false);
      return undefined;
    }

    let hideTimer = null;
    const reveal = () => {
      if (document.visibilityState === "hidden") return;
      setShowNudge(true);
      if (hideTimer) window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => setShowNudge(false), 6_000);
    };

    reveal();
    const interval = window.setInterval(reveal, plannerSettings.repeatSeconds * 1_000);
    return () => {
      window.clearInterval(interval);
      if (hideTimer) window.clearTimeout(hideTimer);
    };
  }, [open, plannerSettings.nudgeEnabled, plannerSettings.repeatSeconds, todayReminders]);

  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement;
    document.body.classList.add("goal-reminder-center-open");
    window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        if (aboutDialogRef.current) return;
        setAboutOpen(false);
        setOpen(false);
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
  }, [open]);

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
    toast.success("Goal created.");
  };

  const createReminder = (event) => {
    event.preventDefault();
    if (!reminderDraft.title.trim() || !reminderDraft.date) {
      toast.warn("Add a reminder title and date.");
      return;
    }
    const nextReminder = {
      id: createPlannerId("reminder"),
      ...reminderDraft,
      title: reminderDraft.title.trim(),
      notes: reminderDraft.notes.trim(),
      completed: false,
      completedAt: "",
      createdAt: new Date().toISOString(),
    };
    persistData({ ...plannerData, reminders: [nextReminder, ...plannerData.reminders] });
    setReminderDraft(createReminderDraft());
    toast.success("Reminder created.");
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

  const toggleReminder = (reminderId) => persistData({
    ...plannerData,
    reminders: plannerData.reminders.map((reminder) => reminder.id === reminderId ? {
      ...reminder,
      completed: !reminder.completed,
      completedAt: reminder.completed ? "" : new Date().toISOString(),
    } : reminder),
  });

  const toggleTodo = (todoId) => persistData({
    ...plannerData,
    todos: plannerData.todos.map((todo) => todo.id === todoId ? { ...todo, completed: !todo.completed } : todo),
  });

  const deleteItem = (type, id) => {
    const key = type === "goal" ? "goals" : type === "reminder" ? "reminders" : "todos";
    persistData({ ...plannerData, [key]: plannerData[key].filter((item) => item.id !== id) });
    setConfirmDelete("");
  };

  const nudgeText = todayReminders.length === 1
    ? `${todayReminders[0].title}${todayReminders[0].time ? ` · ${todayReminders[0].time}` : ""}`
    : `${todayReminders.length} reminders scheduled today`;

  const dialog = open ? (
    <div className="goal-reminder-backdrop" onMouseDown={(event) => event.target === event.currentTarget && closeCenter()}>
      <section
        aria-describedby="goal-reminder-center-description"
        aria-hidden={aboutOpen ? true : undefined}
        aria-labelledby="goal-reminder-center-title"
        aria-modal={aboutOpen ? undefined : true}
        className="goal-reminder-dialog"
        inert={aboutOpen}
        ref={dialogRef}
        role="dialog"
      >
        <header className="goal-reminder-dialog-header">
          <div className="goal-reminder-dialog-title">
            <span className="goal-reminder-dialog-mark" aria-hidden="true"><Target size={22} /><BellRing size={13} /></span>
            <div><span>Personal productivity</span><h2 id="goal-reminder-center-title">Goal & Reminder Center</h2><p id="goal-reminder-center-description">Plan outcomes, schedule reminders, and clear compact daily tasks.</p></div>
          </div>
          <div className="goal-reminder-header-actions">
            <button
              aria-expanded={aboutOpen}
              aria-haspopup="dialog"
              aria-label="About goals and reminders"
              className="goal-reminder-about-btn"
              onClick={() => setAboutOpen(true)}
              ref={aboutButtonRef}
              title="How goals and reminders work"
              type="button"
            ><Info size={18} /></button>
            <button aria-label="Close goal and reminder center" className="goal-reminder-close-btn" onClick={closeCenter} ref={closeButtonRef} type="button"><X size={18} /></button>
          </div>
        </header>

        <div className="goal-reminder-stats">
          <div><Target size={16} /><span>Active goals</span><strong>{activeGoals}</strong></div>
          <div><BellRing size={16} /><span>Today</span><strong>{todayReminders.length}</strong></div>
          <div><ListTodo size={16} /><span>Open tasks</span><strong>{openTodos}</strong></div>
        </div>

        <div className="goal-reminder-dialog-body">
          <section className="planner-composer-panel">
            <div className="planner-panel-heading">
              <div><span>Create</span><h3>Plan the next action</h3></div>
              <div className="planner-composer-tabs" role="group" aria-label="Choose item type">
                <button aria-pressed={composer === "goal"} className={composer === "goal" ? "is-active" : ""} onClick={() => setComposer("goal")} type="button"><Target size={14} /> Goal</button>
                <button aria-pressed={composer === "reminder"} className={composer === "reminder" ? "is-active" : ""} onClick={() => setComposer("reminder")} type="button"><AlarmClock size={14} /> Reminder</button>
              </div>
            </div>

            {composer === "goal" ? (
              <form className="planner-entry-form" onSubmit={createGoal}>
                <label className="planner-field planner-field-full"><span>Goal title *</span><input maxLength="120" onChange={(event) => setGoalDraft({ ...goalDraft, title: event.target.value })} placeholder="Complete the physics revision plan" value={goalDraft.title} /></label>
                <label className="planner-field"><span>Target date *</span><input min={today} onChange={(event) => setGoalDraft({ ...goalDraft, targetDate: event.target.value })} type="date" value={goalDraft.targetDate} /></label>
                <label className="planner-field"><span>Priority</span><select onChange={(event) => setGoalDraft({ ...goalDraft, priority: event.target.value })} value={goalDraft.priority}><option value="low">Low</option><option value="medium">Normal</option><option value="high">High</option></select></label>
                <label className="planner-field"><span>Category</span><select onChange={(event) => setGoalDraft({ ...goalDraft, category: event.target.value })} value={goalDraft.category}><option value="study">Study</option><option value="exam">Exam</option><option value="project">Project</option><option value="personal">Personal</option></select></label>
                <label className="planner-field planner-field-notes"><span>Details</span><textarea maxLength="800" onChange={(event) => setGoalDraft({ ...goalDraft, notes: event.target.value })} placeholder="Add milestones or the intended outcome" rows="3" value={goalDraft.notes} /></label>
                <button className="planner-create-btn" type="submit"><Plus size={15} /> Create goal</button>
              </form>
            ) : (
              <form className="planner-entry-form" onSubmit={createReminder}>
                <label className="planner-field planner-field-full"><span>Reminder title *</span><input maxLength="120" onChange={(event) => setReminderDraft({ ...reminderDraft, title: event.target.value })} placeholder="Review chapter 4 flashcards" value={reminderDraft.title} /></label>
                <label className="planner-field"><span>Date *</span><input min={today} onChange={(event) => setReminderDraft({ ...reminderDraft, date: event.target.value })} type="date" value={reminderDraft.date} /></label>
                <label className="planner-field"><span>Time</span><input onChange={(event) => setReminderDraft({ ...reminderDraft, time: event.target.value })} type="time" value={reminderDraft.time} /></label>
                <label className="planner-field"><span>Priority</span><select onChange={(event) => setReminderDraft({ ...reminderDraft, priority: event.target.value })} value={reminderDraft.priority}><option value="low">Low</option><option value="medium">Normal</option><option value="high">High</option></select></label>
                <label className="planner-field planner-field-notes"><span>Note</span><textarea maxLength="800" onChange={(event) => setReminderDraft({ ...reminderDraft, notes: event.target.value })} placeholder="Optional context for this reminder" rows="3" value={reminderDraft.notes} /></label>
                <button className="planner-create-btn" type="submit"><Plus size={15} /> Create reminder</button>
              </form>
            )}
          </section>

          <section className="planner-list-panel planner-todo-panel">
            <div className="planner-panel-heading">
              <div><span>Today</span><h3>Quick to-do</h3></div>
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

          <section className="planner-list-panel planner-goals-panel">
            <div className="planner-panel-heading"><div><span>Outcomes</span><h3>Goals</h3></div><strong>{activeGoals} active</strong></div>
            <div className="planner-scroll-list">
              {visibleGoals.length === 0 ? <EmptyPlannerState detail="Create a dated outcome to start tracking progress." icon={<Target aria-hidden="true" size={20} />} title="No goals yet" /> : visibleGoals.map((goal) => {
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

          <section className="planner-list-panel planner-reminder-panel">
            <div className="planner-panel-heading"><div><span>Schedule</span><h3>Reminders</h3></div><strong>{todayReminders.length} today</strong></div>
            <div className="planner-scroll-list planner-reminder-list">
              {visibleReminders.length === 0 ? <EmptyPlannerState detail="Add a dated reminder for an in-app nudge." icon={<BellRing aria-hidden="true" size={20} />} title="No reminders" /> : visibleReminders.map((reminder) => {
                const tone = getDateTone(reminder.date, today, reminder.completed);
                const deleteKey = `reminder:${reminder.id}`;
                return (
                  <article className={`planner-item-card planner-reminder-card priority-${reminder.priority}${reminder.completed ? " is-complete" : ""}`} key={reminder.id}>
                    <PlannerCheckbox checked={reminder.completed} label={reminder.completed ? `Reopen ${reminder.title}` : `Complete ${reminder.title}`} onChange={() => toggleReminder(reminder.id)} />
                    <div className="planner-item-copy">
                      <div className="planner-item-title-row"><strong>{reminder.title}</strong><span className={`planner-date-chip is-${tone}`}>{tone === "overdue" ? "Past" : tone === "today" ? "Today" : tone === "complete" ? "Done" : formatDateLabel(reminder.date)}</span></div>
                      {reminder.notes && <p>{reminder.notes}</p>}
                      <div className="planner-item-meta"><span><Clock3 size={12} /> {reminder.time || "All day"}</span><span><Flag size={12} /> {PRIORITY_LABELS[reminder.priority]}</span></div>
                    </div>
                    <div className="planner-item-actions">
                      {confirmDelete === deleteKey ? <DeleteConfirmation label={reminder.title} onCancel={() => setConfirmDelete("")} onConfirm={() => deleteItem("reminder", reminder.id)} /> : <button aria-label={`Delete ${reminder.title}`} className="planner-trash-btn" onClick={() => setConfirmDelete(deleteKey)} title="Delete reminder" type="button"><Trash2 size={14} /></button>}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>

        <footer className="goal-reminder-dialog-footer">
          <span><CheckCircle2 size={14} /> Changes save automatically to your workspace.</span>
          <label><input checked={plannerSettings.showCompleted} onChange={(event) => persistSettings({ ...plannerSettings, showCompleted: event.target.checked })} type="checkbox" /> Show completed items</label>
        </footer>
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
              aria-describedby="goal-reminder-about-description"
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
                  <h3 id="goal-reminder-about-title">How goals and reminders work</h3>
                  <p id="goal-reminder-about-description">A quick guide to planning, alerts, daily tasks, and the connected controls in Settings.</p>
                </div>
                <button
                  aria-label="Close goals and reminders guide"
                  className="goal-reminder-about-close-btn"
                  onClick={() => setAboutOpen(false)}
                  ref={aboutCloseButtonRef}
                  title="Close guide"
                  type="button"
                ><X size={18} /></button>
              </header>

              <div className="goal-reminder-about-body">
                <div className="goal-reminder-about-features" aria-label="Goal and reminder features">
                  <article>
                    <div><Target aria-hidden="true" size={17} /><strong>Goals</strong></div>
                    <p>Create a dated outcome with priority, category, and details. Tick it when finished, or move an overdue goal to tomorrow.</p>
                  </article>
                  <article>
                    <div><BellRing aria-hidden="true" size={17} /><strong>Reminders</strong></div>
                    <p>Schedule an alert with a date, time, priority, and note. Today&apos;s reminders also appear in the center summary.</p>
                  </article>
                  <article>
                    <div><ListTodo aria-hidden="true" size={17} /><strong>Quick to-do</strong></div>
                    <p>Add a small next action, then click its card to mark it done. Use Undo to restore a finished task or Delete to remove it.</p>
                  </article>
                </div>

                <section className="goal-reminder-about-settings" aria-labelledby="goal-reminder-about-settings-title">
                  <h4 id="goal-reminder-about-settings-title">Goal controls in Settings</h4>
                  <dl>
                    <div>
                      <dt>Daily target</dt>
                      <dd>Sets focused study hours. Each completed planner session counts as one hour and updates Today&apos;s study pace.</dd>
                    </div>
                    <div>
                      <dt>Weekly reviews</dt>
                      <dd>Choose 1, 2, 3, or daily reviews. Completing generated review reminders updates the weekly score.</dd>
                    </div>
                    <div>
                      <dt>Target-linked reminders</dt>
                      <dd>Save your targets to refresh a 6:00 PM daily study reminder and spread 7:00 PM review reminders across the week.</dd>
                    </div>
                    <div>
                      <dt>Animated nudge and repeat</dt>
                      <dd>Shows a six-second message above the sidebar target icon; the repeat menu controls how often it returns.</dd>
                    </div>
                    <div>
                      <dt>Show completed items</dt>
                      <dd>Keeps finished goals, reminders, and to-dos visible so they can be reviewed or reopened.</dd>
                    </div>
                  </dl>
                </section>

                <section className="goal-reminder-about-workflow" aria-labelledby="goal-reminder-about-workflow-title">
                  <h4 id="goal-reminder-about-workflow-title">A simple workflow</h4>
                  <ol>
                    <li>Choose Goal or Reminder, fill the compact form, and create it.</li>
                    <li>Use Quick to-do for short actions that do not need a date.</li>
                    <li>Mark items finished; enable Show completed items whenever you need to restore one.</li>
                    <li>Set study targets in Settings and select Save study targets to generate or refresh the linked reminders.</li>
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
      {showNudge && <div aria-hidden="true" className="goal-reminder-nudge">{nudgeText}</div>}
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={todayReminders.length ? `Open Goal and Reminder Center. ${todayReminders.length} reminders today.` : "Open Goal and Reminder Center"}
        className={`goal-reminder-launcher-button${todayReminders.length ? " has-today-reminders" : ""}`}
        onClick={openCenter}
        title="Goals, reminders, and to-do list"
        type="button"
      >
        <span className="goal-reminder-launcher-visual" aria-hidden="true">
          <Target className="goal-reminder-target-icon" size={42} strokeWidth={1.8} />
        </span>
      </button>
      {typeof document !== "undefined" && dialog ? createPortal(dialog, document.body) : null}
    </div>
  );
}

export default GoalReminderCenter;
