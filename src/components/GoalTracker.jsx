import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Target, X } from "lucide-react";
import { extractSubjectFromTask } from "../utils/plannerMetrics";
import { getAcademicProfileExamples } from "../utils/academicProfileExamples";

function GoalTracker({
  completed = [],
  schedule = [],
  subjects = [],
  userProfile = {},
  onClose,
}) {
  const safeSubjects = Array.isArray(subjects) ? subjects : [];
  const safeCompleted = Array.isArray(completed) ? completed : [];
  const safeSchedule = Array.isArray(schedule) ? schedule : [];

  const [goal, setGoal] = useState(() => safeSubjects[0]?.name || "");
  const [days, setDays] = useState(5);
  const [isListOpen, setIsListOpen] = useState(false);
  const popupRef = useRef(null);
  const dropdownRef = useRef(null);

  const curriculumExamples = useMemo(
    () => getAcademicProfileExamples(userProfile),
    [userProfile]
  );

  const safeDays = Math.max(1, days);

  // Close popup when clicking outside or pressing Escape
  useEffect(() => {
    if (!onClose) return;
    const handleClickOutside = (event) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(event.target) &&
        !event.target.closest(".track-goals-btn")
      ) {
        onClose();
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  // Close suggestions dropdown when clicking outside
  useEffect(() => {
    if (!isListOpen) return;
    const handleDropdownOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsListOpen(false);
      }
    };
    document.addEventListener("mousedown", handleDropdownOutside);
    return () => {
      document.removeEventListener("mousedown", handleDropdownOutside);
    };
  }, [isListOpen]);

  const filteredSubjects = useMemo(() => {
    const trimmed = goal.trim().toLowerCase();
    if (!trimmed) return safeSubjects;
    return safeSubjects.filter(
      (sub) => sub?.name && sub.name.toLowerCase().includes(trimmed)
    );
  }, [safeSubjects, goal]);

  const handleSelectSubject = (subjectName) => {
    setGoal(subjectName);
    setIsListOpen(false);
  };

  const normalizedGoal = goal.trim().toLowerCase();
  const goalTasks = safeSchedule.flatMap(
    (day) =>
      day.tasks?.filter((task) => {
        if (!normalizedGoal) return false;
        const taskName = (task.task || "").toLowerCase();
        const subjectName = (task.subjectName || "").toLowerCase();
        return taskName.includes(normalizedGoal) || subjectName.includes(normalizedGoal);
      }) || []
  );

  const matchedSubjects = normalizedGoal
    ? safeSubjects.filter((subject) =>
        subject.name.toLowerCase().includes(normalizedGoal)
      )
    : [];

  const matchedSubjectNames = [
    ...new Set(
      matchedSubjects.length
        ? matchedSubjects.map((subject) => subject.name)
        : goalTasks.map((task) => extractSubjectFromTask(task.task)).filter(Boolean)
    ),
  ];

  const totalGoalTasks = goalTasks.length;
  const completedGoalTasks = goalTasks.filter((task) =>
    safeCompleted.includes(task.task)
  ).length;

  const progress =
    totalGoalTasks === 0 ? 0 : (completedGoalTasks / totalGoalTasks) * 100;

  const dailyTarget =
    totalGoalTasks === 0 ? 0 : (totalGoalTasks / safeDays).toFixed(1);

  const averagePerDay =
    completedGoalTasks === 0
      ? 0
      : completedGoalTasks / Math.max(1, safeDays - 1);

  const remainingTasks = totalGoalTasks - completedGoalTasks;
  const estimatedDays =
    averagePerDay === 0
      ? "Not enough data"
      : `${Math.ceil(remainingTasks / averagePerDay)} days`;

  const expectedProgress = 100 / safeDays;

  const progressColor =
    progress < 30 ? "#b8324b" : progress < 70 ? "#b7791f" : "#0b8f74";

  let statusMessage = "Choose a goal keyword to track a subject or chapter lane.";
  let statusClass = "status-neutral";

  if (progress < expectedProgress && totalGoalTasks > 0) {
    statusMessage = "You are behind the target pace.";
    statusClass = "status-warning";
  } else if (progress >= expectedProgress && progress < 100) {
    statusMessage = "You are currently on track.";
    statusClass = "status-success";
  } else if (progress === 100 && totalGoalTasks > 0) {
    statusMessage = "Goal completed.";
    statusClass = "status-success strong";
  } else if (goal && totalGoalTasks === 0) {
    statusMessage = "No tasks matched that goal yet.";
    statusClass = "status-warning";
  }

  if (!safeSubjects.length) {
    return (
      <section
        aria-label="Goal tracker"
        className="card goal-tracker-card goal-tracker-popup"
        ref={popupRef}
      >
        <div className="goal-tracker-header">
          <div className="goal-tracker-title-group">
            <Target aria-hidden="true" size={18} />
            <div>
              <h3>Goal tracker</h3>
            </div>
          </div>
          {onClose && (
            <button
              aria-label="Close goal tracker"
              className="goal-tracker-close-btn"
              onClick={onClose}
              type="button"
            >
              <X aria-hidden="true" size={14} />
            </button>
          )}
        </div>
        <p className="goal-subjects-empty-notice" role="status">
          Add subjects to track the goal
        </p>
      </section>
    );
  }

  return (
    <section
      aria-label="Goal tracker"
      className="card goal-tracker-card goal-tracker-popup"
      ref={popupRef}
    >
      <div className="goal-tracker-header">
        <div className="goal-tracker-title-group">
          <div className="goal-tracker-icon-badge" aria-hidden="true">
            <Target size={18} />
          </div>
          <div>
            <h3>Goal tracker</h3>
            <p className="card-desc">
              Track one subject, topic, or chapter keyword against your generated plan.
            </p>
          </div>
        </div>
        <div className="goal-tracker-header-actions">
          <strong className="goal-progress-value">{Math.round(progress)}%</strong>
          {onClose && (
            <button
              aria-label="Close goal tracker"
              className="goal-tracker-close-btn"
              onClick={onClose}
              type="button"
            >
              <X aria-hidden="true" size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="goal-tracker-layout">
        <div className="goal-inputs goal-inputs-horizontal">
          <div className="goal-input-field" ref={dropdownRef}>
            <label htmlFor="goal-subject-input">
              Goal keyword
            </label>
            <div className="goal-subject-input-wrapper">
              <input
                id="goal-subject-input"
                className="goal-subject-text-input"
                autoComplete="off"
                list="goal-subject-datalist"
                onChange={(event) => {
                  setGoal(event.target.value);
                  setIsListOpen(true);
                }}
                onFocus={() => setIsListOpen(true)}
                placeholder={`Example: ${safeSubjects[0]?.name || curriculumExamples.subject}`}
                type="text"
                value={goal}
              />
              <button
                aria-expanded={isListOpen}
                aria-label="Toggle subjects list"
                className="goal-subject-dropdown-toggle"
                onClick={() => setIsListOpen((prev) => !prev)}
                type="button"
              >
                <ChevronDown size={15} />
              </button>
              <datalist id="goal-subject-datalist">
                {safeSubjects.map((sub) => (
                  <option key={sub.name} value={sub.name} />
                ))}
              </datalist>

              {isListOpen && (
                <div className="goal-subject-suggestions-dropdown" role="listbox">
                  {filteredSubjects.length > 0 ? (
                    filteredSubjects.map((sub) => {
                      const isSelected =
                        sub.name.toLowerCase() === goal.trim().toLowerCase();
                      return (
                        <button
                          key={sub.name}
                          className={`goal-subject-suggestion-btn${
                            isSelected ? " is-selected" : ""
                          }`}
                          onClick={() => handleSelectSubject(sub.name)}
                          type="button"
                        >
                          <span className="goal-subject-suggestion-name">
                            {sub.name}
                          </span>
                          <span className="goal-subject-suggestion-meta">
                            {sub.chapters ? `${sub.chapters} ch` : ""}
                            {sub.difficulty ? ` • ${sub.difficulty}` : ""}
                          </span>
                        </button>
                      );
                    })
                  ) : (
                    <div className="goal-subject-suggestion-empty">
                      <span>No matching subjects</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="goal-input-field goal-days-field">
            <label htmlFor="goal-target-days-input">
              Target days
            </label>
            <input
              id="goal-target-days-input"
              className="goal-days-input"
              min="1"
              onChange={(event) =>
                setDays(Math.max(1, Number(event.target.value)))
              }
              type="number"
              value={days}
            />
          </div>

          {goal ? (
            <div className="goal-match-summary" aria-live="polite">
              <span>Matched subject</span>
              <strong>
                {matchedSubjectNames.length
                  ? matchedSubjectNames.join(", ")
                  : "No subject found"}
              </strong>
            </div>
          ) : null}
        </div>

        <div className="goal-progress-panel">
          <div className="progress-bar-1 goal-progress-bar">
            <div
              className="progress-fill-1"
              style={{
                width: `${progress}%`,
                background: progressColor,
              }}
            />
          </div>

          <div className="goal-metric-grid">
            <div className="goal-metric-card">
              <span>Total chapters</span>
              <strong>{totalGoalTasks}</strong>
            </div>
            <div className="goal-metric-card">
              <span>Completed</span>
              <strong>{completedGoalTasks}</strong>
            </div>
            <div className="goal-metric-card">
              <span>Daily target</span>
              <strong>{dailyTarget}</strong>
            </div>
            <div className="goal-metric-card">
              <span>ETA</span>
              <strong className="goal-eta-value">{estimatedDays}</strong>
            </div>
          </div>

          <p className={statusClass}>{statusMessage}</p>
        </div>
      </div>
    </section>
  );
}

export default GoalTracker;
