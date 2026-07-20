import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Layers3,
  Plus,
  RotateCcw,
  Sparkles,
  Target,
  Trash2,
  X,
} from "lucide-react";
import {
  DEFAULT_STUDY_PREFERENCES,
  getChapterTopicSuggestions,
  getSubjectPlanAnalysis,
  normalizeStudyPreferences,
  normalizeSubjectTopics,
} from "../utils/subjectPlanning";
import "./SubjectPlanDialog.css";

const GOAL_COPY = {
  coverage: "Cover each study unit once in a clear sequence.",
  practice: "Turn each unit into a focused practice session.",
  revision: "Treat each unit as a compact revision block.",
};

function SubjectPlanDialog({
  hasActiveSchedule = false,
  onClose,
  onOpenPlanner,
  onSave,
  subject,
}) {
  const dialogRef = useRef(null);
  const topicInputRef = useRef(null);
  const closeTimerRef = useRef(null);
  const closingRef = useRef(false);
  const previousFocusRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const [isClosing, setIsClosing] = useState(false);
  const [topicInput, setTopicInput] = useState("");
  const [topicError, setTopicError] = useState("");
  const [topics, setTopics] = useState(() => normalizeSubjectTopics(subject?.topics));
  const [difficulty, setDifficulty] = useState(subject?.difficulty || "medium");
  const [preferences, setPreferences] = useState(() =>
    normalizeStudyPreferences(subject?.studyPreferences)
  );

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const originalConfiguration = useMemo(() => ({
    difficulty: subject?.difficulty || "medium",
    topics: normalizeSubjectTopics(subject?.topics),
    studyPreferences: normalizeStudyPreferences(subject?.studyPreferences),
  }), [subject]);

  const nextConfiguration = useMemo(() => ({
    difficulty,
    topics: normalizeSubjectTopics(topics),
    studyPreferences: normalizeStudyPreferences(preferences),
  }), [difficulty, preferences, topics]);

  const isDirty = JSON.stringify(originalConfiguration) !== JSON.stringify(nextConfiguration);
  const configuredSubject = useMemo(
    () => ({ ...subject, ...nextConfiguration }),
    [nextConfiguration, subject],
  );
  const analysis = useMemo(
    () => getSubjectPlanAnalysis(configuredSubject),
    [configuredSubject],
  );
  const suggestions = useMemo(
    () => getChapterTopicSuggestions(subject),
    [subject],
  );
  const selectedTopicKeys = useMemo(
    () => new Set(topics.map((topic) => topic.toLocaleLowerCase())),
    [topics],
  );

  const requestClose = useCallback((afterClose) => {
    if (closingRef.current) return;
    closingRef.current = true;
    setIsClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      onCloseRef.current();
      afterClose?.();
    }, 180);
  }, []);

  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.classList.add("modal-open");
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => {
      topicInputRef.current?.focus({ preventScroll: true });
    });

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) {
        event.preventDefault();
        return;
      }

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
      window.cancelAnimationFrame(focusFrame);
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
      document.body.classList.remove("modal-open");
      document.body.style.overflow = previousBodyOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus?.({ preventScroll: true });
    };
  }, [requestClose]);

  const addTopic = (rawTopic = topicInput) => {
    const topic = String(rawTopic || "").trim().slice(0, 120);
    if (!topic) {
      setTopicError("Type a topic before adding it.");
      return;
    }
    if (topics.length >= 60) {
      setTopicError("A subject can contain up to 60 focus topics.");
      return;
    }
    if (selectedTopicKeys.has(topic.toLocaleLowerCase())) {
      setTopicError("That topic is already in this plan.");
      return;
    }

    setTopics((current) => [...current, topic]);
    setTopicInput("");
    setTopicError("");
    window.requestAnimationFrame(() => topicInputRef.current?.focus());
  };

  const removeTopic = (topicToRemove) => {
    setTopics((current) => current.filter((topic) => topic !== topicToRemove));
    setTopicError("");
  };

  const resetPlanOptions = () => {
    setTopics([]);
    setPreferences({ ...DEFAULT_STUDY_PREFERENCES });
    setDifficulty(subject?.difficulty || "medium");
    setTopicInput("");
    setTopicError("");
  };

  const persistConfiguration = () => {
    if (!isDirty) return false;
    onSave({
      ...subject,
      ...nextConfiguration,
    });
    return true;
  };

  const handleSave = () => {
    persistConfiguration();
    requestClose();
  };

  const handleSaveAndPlan = () => {
    persistConfiguration();
    requestClose(onOpenPlanner);
  };

  const hours = analysis.totalMinutes / 60;
  const hoursLabel = Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
  const topicSummary = topics.length
    ? `${topics.length} named ${topics.length === 1 ? "topic" : "topics"}`
    : "Automatic chapter sequence";

  return createPortal(
    <div
      className={`subject-plan-backdrop${isClosing ? " is-closing" : ""}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
      role="presentation"
    >
      <section
        aria-describedby="subject-plan-description"
        aria-labelledby="subject-plan-title"
        aria-modal="true"
        className="subject-plan-dialog"
        ref={dialogRef}
        role="dialog"
      >
        <header className="subject-plan-header">
          <span className="subject-plan-header-mark" aria-hidden="true">
            <BookOpen size={22} />
          </span>
          <div>
            <span className="subject-plan-eyebrow">Subject planning workspace</span>
            <h2 id="subject-plan-title">Configure {subject?.name}</h2>
            <p id="subject-plan-description">
              Add optional focus topics and set a realistic rhythm for the next generated schedule.
            </p>
          </div>
          <button
            aria-label="Close subject planner"
            className="subject-plan-close"
            onClick={() => requestClose()}
            type="button"
          >
            <X size={18} />
          </button>
        </header>

        <div className="subject-plan-summary" aria-label="Current subject plan summary">
          <article>
            <Layers3 aria-hidden="true" size={16} />
            <span>Study units</span>
            <strong>{analysis.unitCount}</strong>
          </article>
          <article>
            <CalendarDays aria-hidden="true" size={16} />
            <span>Weekly target</span>
            <strong>{analysis.preferences.sessionsPerWeek} sessions</strong>
          </article>
          <article>
            <Clock3 aria-hidden="true" size={16} />
            <span>Session length</span>
            <strong>{analysis.preferences.sessionMinutes} min</strong>
          </article>
          <article>
            <Target aria-hidden="true" size={16} />
            <span>Plan intensity</span>
            <strong>{analysis.intensity}</strong>
          </article>
        </div>

        <div className="subject-plan-body">
          <section className="subject-plan-panel subject-topic-panel" aria-labelledby="subject-topic-heading">
            <div className="subject-plan-panel-heading">
              <div>
                <span className="subject-plan-step">01</span>
                <div>
                  <h3 id="subject-topic-heading">Optional focus topics</h3>
                  <p>Leave this empty to plan {subject?.chapters || 0} numbered chapters automatically.</p>
                </div>
              </div>
              <span className="subject-plan-count">{topics.length}/60</span>
            </div>

            <div className="subject-topic-composer">
              <input
                aria-describedby={topicError ? "subject-topic-error" : undefined}
                maxLength="120"
                onChange={(event) => {
                  setTopicInput(event.target.value);
                  if (topicError) setTopicError("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addTopic();
                  }
                }}
                placeholder={`e.g. Arrays, Limits, Organic reactions`}
                ref={topicInputRef}
                value={topicInput}
              />
              <button onClick={() => addTopic()} type="button">
                <Plus size={16} />
                Add topic
              </button>
            </div>
            {topicError && <p className="subject-topic-error" id="subject-topic-error" role="alert">{topicError}</p>}

            {suggestions.length > 0 && (
              <div className="subject-topic-suggestions">
                <span>Quick add</span>
                <div>
                  {suggestions.map((suggestion) => {
                    const isSelected = selectedTopicKeys.has(suggestion.toLocaleLowerCase());
                    return (
                      <button
                        aria-pressed={isSelected}
                        className={isSelected ? "is-selected" : ""}
                        disabled={isSelected}
                        key={suggestion}
                        onClick={() => addTopic(suggestion)}
                        type="button"
                      >
                        {isSelected ? <CheckCircle2 size={13} /> : <Plus size={13} />}
                        {suggestion}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="subject-topic-list" aria-live="polite">
              {topics.length === 0 ? (
                <div className="subject-topic-empty">
                  <Sparkles aria-hidden="true" size={19} />
                  <div>
                    <strong>Topics are optional</strong>
                    <span>The planner will use Chapter 1 through Chapter {subject?.chapters || 0}.</span>
                  </div>
                </div>
              ) : (
                topics.map((topic, index) => (
                  <div className="subject-topic-item" key={topic}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <strong>{topic}</strong>
                    <button
                      aria-label={`Remove ${topic}`}
                      onClick={() => removeTopic(topic)}
                      title="Remove topic"
                      type="button"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>

          <aside className="subject-plan-side">
            <section className="subject-plan-panel" aria-labelledby="subject-rhythm-heading">
              <div className="subject-plan-panel-heading">
                <div>
                  <span className="subject-plan-step">02</span>
                  <div>
                    <h3 id="subject-rhythm-heading">Study rhythm</h3>
                    <p>These settings shape order, frequency, and time labels.</p>
                  </div>
                </div>
              </div>

              <div className="subject-plan-fields">
                <label>
                  <span>Difficulty</span>
                  <select onChange={(event) => setDifficulty(event.target.value)} value={difficulty}>
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </label>
                <label>
                  <span>Target sessions / week</span>
                  <select
                    onChange={(event) => setPreferences((current) => ({
                      ...current,
                      sessionsPerWeek: Number(event.target.value),
                    }))}
                    value={preferences.sessionsPerWeek}
                  >
                    {[1, 2, 3, 4, 5, 6, 7].map((value) => (
                      <option key={value} value={value}>{value} {value === 1 ? "session" : "sessions"}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Session length</span>
                  <select
                    onChange={(event) => setPreferences((current) => ({
                      ...current,
                      sessionMinutes: Number(event.target.value),
                    }))}
                    value={preferences.sessionMinutes}
                  >
                    {[25, 40, 45, 60, 90].map((value) => (
                      <option key={value} value={value}>{value} minutes</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Preferred time</span>
                  <select
                    onChange={(event) => setPreferences((current) => ({
                      ...current,
                      preferredTime: event.target.value,
                    }))}
                    value={preferences.preferredTime}
                  >
                    <option value="any">Flexible</option>
                    <option value="morning">Morning</option>
                    <option value="midday">Midday</option>
                    <option value="afternoon">Afternoon</option>
                    <option value="evening">Evening</option>
                    <option value="night">Night</option>
                  </select>
                </label>
                <label className="subject-plan-field-full">
                  <span>Study goal</span>
                  <select
                    onChange={(event) => setPreferences((current) => ({
                      ...current,
                      studyGoal: event.target.value,
                    }))}
                    value={preferences.studyGoal}
                  >
                    <option value="coverage">Learn and cover</option>
                    <option value="practice">Practice and apply</option>
                    <option value="revision">Revise and retain</option>
                  </select>
                  <small>{GOAL_COPY[preferences.studyGoal]}</small>
                </label>
              </div>
            </section>

            <section className="subject-plan-analysis" aria-labelledby="subject-analysis-heading">
              <div>
                <span><Sparkles size={14} /> Planner analysis</span>
                <strong id="subject-analysis-heading">{analysis.estimatedWeeks} week{analysis.estimatedWeeks === 1 ? "" : "s"} at target pace</strong>
              </div>
              <p>
                {topicSummary}. Approximately <strong>{hoursLabel} hours</strong> across {analysis.unitCount} planned sessions.
              </p>
              <div className="subject-plan-analysis-bar" aria-hidden="true">
                <span style={{ width: `${Math.min(100, Math.max(16, (analysis.unitCount / Math.max(analysis.preferences.sessionsPerWeek * 4, 1)) * 100))}%` }} />
              </div>
              <small>
                Named topics are scheduled first. Remaining units use chapter labels; a close exam date may compress the weekly target.
              </small>
            </section>
          </aside>
        </div>

        <footer className="subject-plan-footer">
          <div className="subject-plan-save-note">
            {hasActiveSchedule ? (
              <>
                <CalendarDays aria-hidden="true" size={15} />
                <span>Your current timetable stays intact. Generate a new one to apply these settings.</span>
              </>
            ) : (
              <>
                <CheckCircle2 aria-hidden="true" size={15} />
                <span>These settings will shape your first generated timetable.</span>
              </>
            )}
          </div>
          <div className="subject-plan-footer-actions">
            <button className="subject-plan-reset" disabled={!isDirty} onClick={resetPlanOptions} type="button">
              <RotateCcw size={15} />
              Reset
            </button>
            <button className="subject-plan-cancel" onClick={() => requestClose()} type="button">
              Cancel
            </button>
            <button className="subject-plan-save" disabled={!isDirty} onClick={handleSave} type="button">
              Save changes
            </button>
            <button className="subject-plan-primary" onClick={handleSaveAndPlan} type="button">
              {isDirty ? "Save & open planner" : "Open planner"}
              <ChevronRight size={16} />
            </button>
          </div>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

export default SubjectPlanDialog;
