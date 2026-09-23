import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Target, X } from "lucide-react";
import { extractSubjectFromTask } from "../utils/plannerMetrics";
import { getAcademicProfileExamples } from "../utils/academicProfileExamples";

const POPUP_GAP = 10;
const POPUP_MARGIN = 16;
const POPUP_MAX_HEIGHT = 650;
const POPUP_MIN_HEIGHT = 180;
const POPUP_WIDTH = 480;

function resolvePopupPosition(anchorElement) {
  if (typeof window === "undefined") return null;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const viewportMaxHeight = Math.max(
    POPUP_MIN_HEIGHT,
    viewportHeight - (POPUP_MARGIN * 2),
  );
  const desiredHeight = Math.min(POPUP_MAX_HEIGHT, viewportMaxHeight);
  const popupWidth = Math.min(
    POPUP_WIDTH,
    Math.max(0, viewportWidth - (POPUP_MARGIN * 2)),
  );

  if (!anchorElement) {
    return {
      bottom: "auto",
      left: Math.max(POPUP_MARGIN, (viewportWidth - popupWidth) / 2),
      maxHeight: desiredHeight,
      placement: "center",
      top: Math.max(POPUP_MARGIN, (viewportHeight - desiredHeight) / 2),
    };
  }

  const anchorRect = anchorElement.getBoundingClientRect();
  const availableBelow = Math.max(
    0,
    viewportHeight - anchorRect.bottom - POPUP_GAP - POPUP_MARGIN,
  );
  const availableAbove = Math.max(
    0,
    anchorRect.top - POPUP_GAP - POPUP_MARGIN,
  );
  const openAbove =
    availableBelow < Math.min(420, desiredHeight) &&
    availableAbove > availableBelow;
  const availableHeight = openAbove ? availableAbove : availableBelow;
  const maxHeight = Math.min(
    desiredHeight,
    viewportMaxHeight,
    Math.max(POPUP_MIN_HEIGHT, availableHeight),
  );
  const unclampedLeft = anchorRect.right - popupWidth;
  const left = Math.min(
    Math.max(POPUP_MARGIN, unclampedLeft),
    Math.max(POPUP_MARGIN, viewportWidth - popupWidth - POPUP_MARGIN),
  );

  return {
    bottom: openAbove
      ? Math.max(POPUP_MARGIN, viewportHeight - anchorRect.top + POPUP_GAP)
      : "auto",
    left,
    maxHeight,
    placement: openAbove ? "above" : "below",
    top: openAbove
      ? "auto"
      : Math.min(
          anchorRect.bottom + POPUP_GAP,
          Math.max(POPUP_MARGIN, viewportHeight - maxHeight - POPUP_MARGIN),
        ),
  };
}

function renderPopup(content) {
  return typeof document === "undefined"
    ? content
    : createPortal(content, document.body);
}

function GoalTracker({
  anchorRef,
  closing = false,
  completed = [],
  schedule = [],
  subjects = [],
  userProfile = {},
  onClose,
}) {
  const safeSubjects = useMemo(
    () => (Array.isArray(subjects) ? subjects : []),
    [subjects],
  );
  const safeCompleted = Array.isArray(completed) ? completed : [];
  const safeSchedule = Array.isArray(schedule) ? schedule : [];

  const [goal, setGoal] = useState(() => safeSubjects[0]?.name || "");
  const [days, setDays] = useState(5);
  const [isListOpen, setIsListOpen] = useState(false);
  const popupRef = useRef(null);
  const dropdownRef = useRef(null);
  const [popupPosition, setPopupPosition] = useState(null);

  const curriculumExamples = useMemo(
    () => getAcademicProfileExamples(userProfile),
    [userProfile]
  );

  const safeDays = Math.max(1, days);

  useLayoutEffect(() => {
    const updatePopupPosition = () => {
      setPopupPosition(resolvePopupPosition(anchorRef?.current));
    };

    updatePopupPosition();
    window.addEventListener("resize", updatePopupPosition);
    window.addEventListener("scroll", updatePopupPosition, { passive: true });
    window.visualViewport?.addEventListener("resize", updatePopupPosition);
    window.visualViewport?.addEventListener("scroll", updatePopupPosition);

    return () => {
      window.removeEventListener("resize", updatePopupPosition);
      window.removeEventListener("scroll", updatePopupPosition);
      window.visualViewport?.removeEventListener("resize", updatePopupPosition);
      window.visualViewport?.removeEventListener("scroll", updatePopupPosition);
    };
  }, [anchorRef]);

  useEffect(() => {
    if (closing) setIsListOpen(false);
  }, [closing]);

  // Close popup when clicking outside or pressing Escape
  useEffect(() => {
    if (!onClose || closing) return undefined;
    const handleClickOutside = (event) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(event.target) &&
        !event.target?.closest?.(".track-goals-btn")
      ) {
        onClose("outside");
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose("escape");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closing, onClose]);

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
    if (safeSubjects.some((sub) => sub?.name?.toLowerCase() === trimmed)) {
      return safeSubjects;
    }
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
    progress < 30 ? "var(--danger)" : progress < 70 ? "var(--warning)" : "var(--accent)";

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
    return renderPopup(
      <section
        aria-hidden={closing || undefined}
        aria-labelledby="goal-tracker-title"
        aria-modal="false"
        className={`card goal-tracker-card goal-tracker-popup${closing ? " is-closing" : ""}`}
        data-placement={popupPosition?.placement || "center"}
        id="subject-goal-tracker"
        inert={closing ? "" : undefined}
        ref={popupRef}
        role="dialog"
        style={popupPosition ? {
          bottom: popupPosition.bottom,
          left: popupPosition.left,
          maxHeight: popupPosition.maxHeight,
          top: popupPosition.top,
        } : undefined}
      >
        <div className="goal-tracker-header">
          <div className="goal-tracker-title-group">
            <Target aria-hidden="true" size={18} />
            <div>
              <h3 id="goal-tracker-title">Goal tracker</h3>
            </div>
          </div>
          {onClose && (
            <button
              aria-label="Close goal tracker"
              className="goal-tracker-close-btn"
              onClick={() => onClose("button")}
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

  return renderPopup(
    <section
      aria-hidden={closing || undefined}
      aria-labelledby="goal-tracker-title"
      aria-modal="false"
      className={`card goal-tracker-card goal-tracker-popup${closing ? " is-closing" : ""}`}
      data-placement={popupPosition?.placement || "center"}
      id="subject-goal-tracker"
      inert={closing ? "" : undefined}
      ref={popupRef}
      role="dialog"
      style={popupPosition ? {
        bottom: popupPosition.bottom,
        left: popupPosition.left,
        maxHeight: popupPosition.maxHeight,
        top: popupPosition.top,
      } : undefined}
    >
      <div className="goal-tracker-header">
        <div className="goal-tracker-title-group">
          <div className="goal-tracker-icon-badge" aria-hidden="true">
            <Target size={18} />
          </div>
          <div>
            <h3 id="goal-tracker-title">Goal tracker</h3>
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
              onClick={() => onClose("button")}
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
                aria-autocomplete="list"
                aria-controls="goal-subject-suggestions"
                aria-expanded={isListOpen}
                id="goal-subject-input"
                className="goal-subject-text-input"
                autoComplete="off"
                onChange={(event) => {
                  setGoal(event.target.value);
                  setIsListOpen(true);
                }}
                onFocus={() => setIsListOpen(true)}
                placeholder={`Example: ${safeSubjects[0]?.name || curriculumExamples.subject}`}
                role="combobox"
                type="text"
                value={goal}
              />
              <button
                aria-controls="goal-subject-suggestions"
                aria-expanded={isListOpen}
                aria-haspopup="listbox"
                aria-label="Toggle subjects list"
                className="goal-subject-dropdown-toggle"
                onClick={() => setIsListOpen((prev) => !prev)}
                type="button"
              >
                <ChevronDown size={15} />
              </button>

              {isListOpen && (
                <div
                  className="goal-subject-suggestions-dropdown"
                  id="goal-subject-suggestions"
                  role="listbox"
                >
                  {filteredSubjects.length > 0 ? (
                    filteredSubjects.map((sub) => {
                      const isSelected =
                        sub.name.toLowerCase() === goal.trim().toLowerCase();
                      return (
                        <button
                          aria-selected={isSelected}
                          key={sub.name}
                          className={`goal-subject-suggestion-btn${
                            isSelected ? " is-selected" : ""
                          }`}
                          onClick={() => handleSelectSubject(sub.name)}
                          role="option"
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
