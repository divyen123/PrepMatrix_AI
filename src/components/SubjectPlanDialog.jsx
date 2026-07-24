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
  normalizeSubjectChapterNames,
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
  const chapterCount = Math.max(0, Number.parseInt(subject?.chapters, 10) || 0);
  const [chapterError, setChapterError] = useState("");
  const [chapterNameInput, setChapterNameInput] = useState("");
  const [chapterNumber, setChapterNumber] = useState(1);
  const [chapterNames, setChapterNames] = useState(() => normalizeSubjectChapterNames(subject?.chapterNames, chapterCount));
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
    chapterNames: normalizeSubjectChapterNames(subject?.chapterNames, chapterCount),
    topics: normalizeSubjectTopics(subject?.topics),
    studyPreferences: normalizeStudyPreferences(subject?.studyPreferences),
  }), [chapterCount, subject]);

  const nextConfiguration = useMemo(() => ({
    difficulty,
    chapterNames: normalizeSubjectChapterNames(chapterNames, chapterCount),
    topics: normalizeSubjectTopics(topics),
    studyPreferences: normalizeStudyPreferences(preferences),
  }), [chapterCount, chapterNames, difficulty, preferences, topics]);

  const isDirty = JSON.stringify(originalConfiguration) !== JSON.stringify(nextConfiguration);
  const configuredSubject = useMemo(
    () => ({ ...subject, ...nextConfiguration }),
    [nextConfiguration, subject],
  );
  const analysis = useMemo(
    () => getSubjectPlanAnalysis(configuredSubject),
    [configuredSubject],
  );
  const selectedTopicKeys = useMemo(
    () => new Set(topics.map((topic) => topic.toLocaleLowerCase())),
    [topics],
  );
  const namedChapters = useMemo(
    () => chapterNames
      .map((name, index) => ({ index, name: String(name || "").trim() }))
      .filter((chapter) => chapter.name),
    [chapterNames],
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

  const addChapterName = () => {
    const chapterIndex = Math.min(Math.max(Number(chapterNumber) - 1, 0), Math.max(chapterCount - 1, 0));
    const chapterName = String(chapterNameInput || "").trim().slice(0, 120);
    if (!chapterCount) {
      setChapterError("Add at least one chapter to this subject first.");
      return;
    }
    if (!chapterName) {
      setChapterError("Type a chapter name before adding it.");
      return;
    }
    if (selectedTopicKeys.has(chapterName.toLocaleLowerCase())) {
      setChapterError("That name is already used by a focus topic.");
      return;
    }
    const duplicateIndex = chapterNames.findIndex((name, index) => (
      index !== chapterIndex
      && String(name || "").trim().toLocaleLowerCase() === chapterName.toLocaleLowerCase()
    ));
    if (duplicateIndex >= 0) {
      setChapterError(`That name is already used for Chapter ${duplicateIndex + 1}.`);
      return;
    }

    const nextNames = [...chapterNames];
    while (nextNames.length <= chapterIndex) nextNames.push("");
    nextNames[chapterIndex] = chapterName;
    setChapterNames(normalizeSubjectChapterNames(nextNames, chapterCount));
    setChapterNameInput("");
    setChapterError("");

    const nextBlankIndex = Array.from(
      { length: chapterCount },
      (_, index) => index,
    ).find((index) => !String(nextNames[index] || "").trim());
    if (nextBlankIndex !== undefined) setChapterNumber(nextBlankIndex + 1);
  };

  const updateChapterName = (chapterIndex, nextValue) => {
    setChapterNames((current) => {
      const nextNames = [...current];
      while (nextNames.length <= chapterIndex) nextNames.push("");
      nextNames[chapterIndex] = String(nextValue ?? "").slice(0, 120);
      return nextNames;
    });
    setChapterError("");
  };

  const finishChapterNameEdit = () => {
    setChapterNames((current) => normalizeSubjectChapterNames(current, chapterCount));
  };

  const removeChapterName = (chapterIndex) => {
    setChapterNames((current) => {
      const nextNames = [...current];
      nextNames[chapterIndex] = "";
      return normalizeSubjectChapterNames(nextNames, chapterCount);
    });
    setChapterNumber(chapterIndex + 1);
    setChapterError("");
  };

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
    const topicMatchesChapter = chapterNames.some((name) => (
      String(name || "").trim().toLocaleLowerCase() === topic.toLocaleLowerCase()
    ));
    if (topicMatchesChapter) {
      setTopicError("That name is already used by a chapter.");
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

  const updateTopic = (topicIndex, nextValue) => {
    const nextTopic = String(nextValue ?? "").slice(0, 120);

    setTopics((current) =>
      current.map((topic, index) =>
        index === topicIndex ? nextTopic : topic,
      ),
    );
    setTopicError("");
  };

  const finishTopicEdit = (topicIndex) => {
    setTopics((current) => {
      const cleanedTopic = String(current[topicIndex] ?? "").trim();

      if (!cleanedTopic) {
        return current.filter((_, index) => index !== topicIndex);
      }

      return current.map((topic, index) =>
        index === topicIndex ? cleanedTopic : topic,
      );
    });
  };

  const removeTopic = (topicIndex) => {
    setTopics((current) => current.filter((_, index) => index !== topicIndex));
    setTopicError("");
  };

  const resetPlanOptions = () => {
    setChapterNames([]);
    setChapterNameInput("");
    setChapterNumber(1);
    setChapterError("");
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
  const contentSummary = [
    `${chapterCount} ${chapterCount === 1 ? "chapter" : "chapters"}`,
    namedChapters.length ? `${namedChapters.length} named` : null,
    topics.length ? `${topics.length} focus ${topics.length === 1 ? "topic" : "topics"}` : null,
  ].filter(Boolean).join(", ");

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
              Name chapters, add focus topics, and set a realistic study rhythm.
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
          <section className="subject-plan-panel subject-topic-panel" aria-labelledby="subject-content-heading">
            <div className="subject-plan-panel-heading">
              <div>
                <span className="subject-plan-step">01</span>
                <div>
                  <h3 id="subject-content-heading">Study content</h3>
                  <p>Name chapters and add extra focus topics to the schedule.</p>
                </div>
              </div>
            </div>

            <div className="subject-unit-group subject-chapter-group">
              <div className="subject-unit-group-heading">
                <div>
                  <h4>Chapter names</h4>
                  <p>Optional. Blank chapters stay as Chapter N.</p>
                </div>
                <span className="subject-plan-count">{namedChapters.length}/{chapterCount}</span>
              </div>

              <div className="subject-chapter-composer">
                <select
                  aria-label="Chapter number"
                  onChange={(event) => setChapterNumber(Number(event.target.value))}
                  value={chapterNumber}
                >
                  {Array.from({ length: chapterCount }, (_, index) => (
                    <option key={index + 1} value={index + 1}>Chapter {index + 1}</option>
                  ))}
                </select>
                <input
                  aria-describedby={chapterError ? "subject-chapter-error" : undefined}
                  maxLength="120"
                  onChange={(event) => {
                    setChapterNameInput(event.target.value);
                    if (chapterError) setChapterError("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addChapterName();
                    }
                  }}
                  placeholder="e.g. Network fundamentals"
                  value={chapterNameInput}
                />
                <button onClick={addChapterName} type="button">
                  <Plus size={16} />
                  Add chapter name
                </button>
              </div>
              {chapterError && (
                <p className="subject-topic-error" id="subject-chapter-error" role="alert">{chapterError}</p>
              )}

              <div className="subject-chapter-list" aria-live="polite">
                {namedChapters.length === 0 ? (
                  <div className="subject-unit-empty">No custom names yet. Raw chapter labels remain available.</div>
                ) : (
                  namedChapters.map(({ index, name }) => (
                    <div className="subject-topic-item subject-chapter-item" key={`chapter-${index}`}>
                      <span>CH {index + 1}</span>
                      <input
                        aria-label={`Rename Chapter ${index + 1}`}
                        className="subject-topic-name-input"
                        maxLength="120"
                        onBlur={finishChapterNameEdit}
                        onChange={(event) => updateChapterName(index, event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            event.currentTarget.blur();
                          }
                        }}
                        spellCheck="false"
                        title={`Rename Chapter ${index + 1}`}
                        value={name}
                      />
                      <button
                        aria-label={`Remove name from Chapter ${index + 1}`}
                        onClick={() => removeChapterName(index)}
                        title="Remove chapter name"
                        type="button"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="subject-unit-group subject-focus-group">
              <div className="subject-unit-group-heading">
                <div>
                  <h4>Focus topics</h4>
                  <p>Optional topics are added alongside every chapter.</p>
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


            <div className="subject-topic-list" aria-live="polite">
              {topics.length === 0 ? (
                <div className="subject-unit-empty">No extra topics yet. Chapters will still be planned.</div>
              ) : (
                topics.map((topic, index) => (
                  <div className="subject-topic-item" key={`topic-${index}`}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <input
                      aria-label={`Rename topic ${index + 1}`}
                      className="subject-topic-name-input"
                      maxLength="120"
                      onBlur={() => finishTopicEdit(index)}
                      onChange={(event) => updateTopic(index, event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          event.currentTarget.blur();
                        }
                      }}
                      spellCheck="false"
                      title="Rename topic"
                      value={topic}
                    />
                    <button
                      aria-label={`Remove ${topic || `topic ${index + 1}`}`}
                      onClick={() => removeTopic(index)}
                      title="Remove topic"
                      type="button"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
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
                {contentSummary}. Approximately <strong>{hoursLabel} hours</strong> across {analysis.unitCount} planned sessions.
              </p>
              <div className="subject-plan-analysis-bar" aria-hidden="true">
                <span style={{ width: `${Math.min(100, Math.max(16, (analysis.unitCount / Math.max(analysis.preferences.sessionsPerWeek * 4, 1)) * 100))}%` }} />
              </div>
              <small>
                Focus topics are added alongside chapters. Unnamed chapters keep their Chapter N fallback.
              </small>
            </section>
          </aside>
        </div>

        <footer className="subject-plan-footer">
          <div className="subject-plan-save-note">
            {hasActiveSchedule ? (
              <>
                <CalendarDays aria-hidden="true" size={15} />
                <span>Saving updates this subject in the current timetable without moving other tasks.</span>
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
