import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BrainCircuit,
  Check,
  ChevronRight,
  Clock3,
  Eye,
  EyeOff,
  LoaderCircle,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  addMemoryReviewTaskCompletion,
  buildMemoryReviewExperience,
  buildMemoryReviewSubmission,
  clearMemoryReviewTaskRecheck,
  createMemoryReviewQuiz,
  dismissMemoryReviewTask,
  mergeMemoryReviewSchedule,
} from "../utils/learningMemoryReviewExperience.js";
import { subscribeToLocalDateChanges } from "../utils/localDateRefresh.js";
import "./PredictiveMemoryReview.css";

const DIALOG_EXIT_DURATION_MS = 240;
const REVIEW_GUIDANCE_DURATION_MS = 4000;

function getFocusableElements(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )).filter((element) => !element.hasAttribute("hidden"));
}

function recallLabel(predictedRecall) {
  const percentage = Math.round(Math.min(1, Math.max(0, Number(predictedRecall) || 0)) * 100);
  return `${percentage}% predicted recall`;
}

export default function PredictiveMemoryReview({
  notebooks = [],
  schedule = [],
  setSchedule,
  completed = [],
  setCompleted,
  scheduleStartDate = "",
  onNotebookUpdated,
  loadError = "",
  loading = false,
  standalone = false,
}) {
  const [today, setToday] = useState(() => new Date());
  const [activeEntry, setActiveEntry] = useState(null);
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogRendered, setDialogRendered] = useState(false);
  const [dialogEntered, setDialogEntered] = useState(false);
  const [revealed, setRevealed] = useState({});
  const [ratings, setRatings] = useState({});
  const [reviewGuidance, setReviewGuidance] = useState({});
  const [confidence, setConfidence] = useState(3);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [pendingDeleteTaskId, setPendingDeleteTaskId] = useState(null);
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const panelRef = useRef(null);
  const deleteTriggerRefs = useRef(new Map());
  const reviewGuidanceTimersRef = useRef(new Map());
  const experience = useMemo(() => buildMemoryReviewExperience({
    notebooks,
    schedule,
    scheduleStartDate,
    completed,
    today,
    maxDaily: 3,
  }), [completed, notebooks, schedule, scheduleStartDate, today]);

  useEffect(() => subscribeToLocalDateChanges(setToday), []);

  useEffect(() => {
    if (experience.changed && typeof setSchedule === "function") {
      setSchedule((currentSchedule) => mergeMemoryReviewSchedule(currentSchedule, {
        notebooks,
        scheduleStartDate,
        completed,
        today,
        maxDaily: 3,
      }));
    }
  }, [completed, experience.changed, notebooks, scheduleStartDate, setSchedule, today]);

  const cancelReviewGuidanceTimers = useCallback(() => {
    if (typeof window !== "undefined") {
      reviewGuidanceTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    }
    reviewGuidanceTimersRef.current.clear();
  }, []);

  useEffect(() => () => cancelReviewGuidanceTimers(), [cancelReviewGuidanceTimers]);

  const resetQuiz = useCallback(() => {
    cancelReviewGuidanceTimers();
    setActiveEntry(null);
    setActiveQuiz(null);
    setRevealed({});
    setRatings({});
    setReviewGuidance({});
    setConfidence(3);
    setError("");
  }, [cancelReviewGuidanceTimers]);

  const closeQuiz = useCallback(() => {
    if (isSubmitting) return;
    setDialogOpen(false);
  }, [isSubmitting]);

  const openQuiz = useCallback((entry) => {
    const quiz = createMemoryReviewQuiz(entry, { dateKey: experience.dateKey });
    if (!quiz?.activeRecallPrompts?.length) {
      setError("This memory check could not be prepared. Try opening the learning notebook first.");
      return;
    }
    setActiveEntry(entry);
    setActiveQuiz(quiz);
    setRevealed({});
    setRatings({});
    cancelReviewGuidanceTimers();
    setReviewGuidance({});
    setConfidence(3);
    setError("");
    setDialogOpen(true);
  }, [cancelReviewGuidanceTimers, experience.dateKey]);

  const deleteReview = useCallback((entry) => {
    if (typeof setSchedule !== "function") {
      setPendingDeleteTaskId(null);
      return;
    }
    setSchedule((currentSchedule) => dismissMemoryReviewTask(
      mergeMemoryReviewSchedule(currentSchedule, {
        notebooks,
        scheduleStartDate,
        completed,
        today,
        maxDaily: 3,
      }),
      entry.task,
      {
        dateKey: experience.dateKey,
        dismissedAt: new Date().toISOString(),
      },
    ));
    setPendingDeleteTaskId(null);
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => panelRef.current?.focus());
    }
  }, [completed, experience.dateKey, notebooks, scheduleStartDate, setSchedule, today]);

  const cancelDeleteReview = useCallback((taskId) => {
    setPendingDeleteTaskId(null);
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => deleteTriggerRefs.current.get(taskId)?.focus());
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    let animationFrame;
    let exitTimer;

    if (dialogOpen) {
      setDialogRendered(true);
      animationFrame = window.requestAnimationFrame(() => setDialogEntered(true));
    } else {
      setDialogEntered(false);
      if (dialogRendered) {
        exitTimer = window.setTimeout(() => {
          setDialogRendered(false);
          resetQuiz();
        }, DIALOG_EXIT_DURATION_MS);
      }
    }

    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      if (exitTimer) window.clearTimeout(exitTimer);
    };
  }, [dialogOpen, dialogRendered, resetQuiz]);

  useEffect(() => {
    if (!dialogRendered || typeof document === "undefined") return undefined;

    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const previousRootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
      document.documentElement.style.overflow = previousRootOverflow;
      if (previouslyFocused?.isConnected) previouslyFocused.focus?.();
    };
  }, [dialogRendered]);

  useEffect(() => {
    if (!dialogOpen || !dialogRendered || typeof document === "undefined") return undefined;

    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeQuiz();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = getFocusableElements(dialogRef.current);
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
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
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeQuiz, dialogOpen, dialogRendered]);

  const questions = activeQuiz?.activeRecallPrompts || [];
  const ratedCount = questions.filter((question) => ratings[question.id]).length;
  const canSubmit = questions.length > 0 && ratedCount === questions.length && !isSubmitting;

  const rateQuestion = useCallback((questionId, rating) => {
    setRatings((current) => ({ ...current, [questionId]: rating }));

    const activeTimer = reviewGuidanceTimersRef.current.get(questionId);
    if (activeTimer && typeof window !== "undefined") window.clearTimeout(activeTimer);
    reviewGuidanceTimersRef.current.delete(questionId);

    if (rating !== "review") {
      setReviewGuidance((current) => {
        if (!current[questionId]) return current;
        const nextGuidance = { ...current };
        delete nextGuidance[questionId];
        return nextGuidance;
      });
      return;
    }

    setReviewGuidance((current) => ({ ...current, [questionId]: true }));
    if (typeof window === "undefined") return;

    const timerId = window.setTimeout(() => {
      reviewGuidanceTimersRef.current.delete(questionId);
      setReviewGuidance((current) => {
        if (!current[questionId]) return current;
        const nextGuidance = { ...current };
        delete nextGuidance[questionId];
        return nextGuidance;
      });
    }, REVIEW_GUIDANCE_DURATION_MS);
    reviewGuidanceTimersRef.current.set(questionId, timerId);
  }, []);

  const submitQuiz = useCallback(async () => {
    if (!activeEntry || !activeQuiz || !canSubmit) return;
    const payload = buildMemoryReviewSubmission({
      entry: activeEntry,
      quiz: activeQuiz,
      ratings,
      confidence,
      completedAt: new Date().toISOString(),
    });
    if (!payload) {
      setError("Rate every prompt before finishing this memory check.");
      return;
    }

    setIsSubmitting(true);
    setError("");
    try {
      if (typeof onNotebookUpdated === "function") {
        await onNotebookUpdated(payload);
      }
      if (typeof setSchedule === "function") {
        setSchedule((currentSchedule) => clearMemoryReviewTaskRecheck(
          currentSchedule,
          payload.task,
        ));
      }
      if (typeof setCompleted === "function" && activeEntry.historicallyCompleted === false) {
        setCompleted((currentValue) => addMemoryReviewTaskCompletion(
          Array.isArray(currentValue) ? currentValue : completed,
          payload.task,
          { schedule: experience.schedule },
        ));
      }
      setDialogOpen(false);
    } catch (submissionError) {
      setError(
        submissionError?.message
          || "Your result could not be saved. The planner task is still waiting.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [activeEntry, activeQuiz, canSubmit, completed, confidence, experience.schedule, onNotebookUpdated, ratings, setCompleted, setSchedule]);

  if (!experience.entries.length && !error && !loadError && !loading && !standalone) return null;

  return (
    <section
      aria-label={standalone ? "Recall sessions" : undefined}
      aria-labelledby={standalone ? undefined : "memory-review-title"}
      className={`memory-review-panel${standalone ? " is-standalone" : ""}`}
      ref={panelRef}
      tabIndex={-1}
    >
      {standalone ? (
        <div className="memory-review-standalone-toolbar">
          <span aria-live="polite" className="memory-review-count" role="status">
            {loading ? "Loading" : `${experience.pendingEntries.length} due`}
          </span>
        </div>
      ) : (
        <header className="memory-review-heading">
          <span className="memory-review-heading-icon" aria-hidden="true">
            <BrainCircuit size={21} />
          </span>
          <div>
            <span className="memory-review-eyebrow">Predictive spaced repetition</span>
            <h2 id="memory-review-title">Three-minute memory checks</h2>
            <p>Short reviews appear when a concept is approaching its predicted forgetting point.</p>
          </div>
          <span className="memory-review-count">
            {loading ? "Loading" : `${experience.pendingEntries.length} due`}
          </span>
        </header>
      )}

      {error && !activeQuiz && <p className="memory-review-error" role="alert">{error}</p>}

      {loading ? (
        <div className="memory-review-empty" role="status">
          <LoaderCircle aria-hidden="true" className="is-spinning" size={20} />
          <div>
            <strong>Loading memory checks</strong>
            <span>Looking for concepts that are ready for a short recall session.</span>
          </div>
        </div>
      ) : loadError ? (
        <div className="memory-review-empty is-error" role="alert">
          <BrainCircuit aria-hidden="true" size={22} />
          <div>
            <strong>Memory checks are temporarily unavailable</strong>
            <span>{loadError}</span>
          </div>
        </div>
      ) : experience.entries.length ? (
        <div aria-label="Recall session cards" className="memory-review-list">
          {experience.entries.map((entry) => {
            const taskId = String(entry.task.id);
            const isConfirmingDelete = pendingDeleteTaskId === taskId;

            return (
              <article
                className={`memory-review-card${entry.completed ? " is-complete" : ""}${isConfirmingDelete ? " is-confirming-delete" : ""}`}
                key={entry.task.id}
              >
                <div className="memory-review-card-main">
                  <span className="memory-review-subject">{entry.candidate.subjectName}</span>
                  <h3>{entry.candidate.title}</h3>
                  <div className="memory-review-meta">
                    <span><Clock3 size={14} aria-hidden="true" />3 minutes</span>
                    <span><Sparkles size={14} aria-hidden="true" />{recallLabel(entry.candidate.predictedRecall)}</span>
                  </div>
                </div>
                <div className="memory-review-card-actions">
                  {isConfirmingDelete ? (
                    <div
                      aria-label={`Confirm deleting memory check for ${entry.candidate.title}`}
                      className="memory-review-delete-confirm"
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.preventDefault();
                          cancelDeleteReview(taskId);
                        }
                      }}
                      role="group"
                    >
                      <span className="memory-review-delete-confirm-copy">Delete this check?</span>
                      <div className="memory-review-delete-confirm-actions">
                        <button
                          aria-label={`Confirm deleting memory check for ${entry.candidate.title}`}
                          autoFocus
                          className="memory-review-confirm-button is-confirm"
                          onClick={() => deleteReview(entry)}
                          title="Confirm delete"
                          type="button"
                        >
                          <Check aria-hidden="true" size={14} />
                        </button>
                        <button
                          aria-label={`Cancel deleting memory check for ${entry.candidate.title}`}
                          className="memory-review-confirm-button is-cancel"
                          onClick={() => cancelDeleteReview(taskId)}
                          title="Cancel"
                          type="button"
                        >
                          <X aria-hidden="true" size={14} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {entry.completed ? (
                        <span className="memory-review-complete-label">
                          <Check size={16} aria-hidden="true" />Completed
                        </span>
                      ) : (
                        <button className="memory-review-start" type="button" onClick={() => openQuiz(entry)}>
                          {entry.recheckPending ? "Review again" : "Start check"} <ChevronRight size={16} aria-hidden="true" />
                        </button>
                      )}
                      <button
                        aria-label={`Delete memory check for ${entry.candidate.title}`}
                        className="memory-review-delete"
                        onClick={() => setPendingDeleteTaskId(taskId)}
                        ref={(node) => {
                          if (node) deleteTriggerRefs.current.set(taskId, node);
                          else deleteTriggerRefs.current.delete(taskId);
                        }}
                        title="Delete memory check"
                        type="button"
                      >
                        <Trash2 aria-hidden="true" size={16} />
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="memory-review-empty" role="status">
          <BrainCircuit aria-hidden="true" size={22} />
          <div>
            <strong>No memory checks are due right now</strong>
            <span>Keep learning from your notebooks. A recall card will appear when a concept approaches its review point.</span>
          </div>
        </div>
      )}

      {dialogRendered && activeEntry && activeQuiz && typeof document !== "undefined" && createPortal(
        <div
          aria-hidden={!dialogOpen}
          className={`memory-review-dialog-backdrop${dialogEntered && dialogOpen ? " is-open" : " is-closing"}`}
          inert={!dialogOpen ? true : undefined}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeQuiz();
          }}
          role="presentation"
        >
          <section
            aria-describedby="memory-quiz-description"
            aria-labelledby="memory-quiz-title"
            aria-modal="true"
            className="memory-review-dialog"
            ref={dialogRef}
            role="dialog"
            tabIndex={-1}
          >
            <header className="memory-review-dialog-heading">
              <div>
                <span className="memory-review-eyebrow">3-minute active recall</span>
                <h3 id="memory-quiz-title">{activeEntry.candidate.title}</h3>
                <p id="memory-quiz-description">Answer from memory, reveal the note, then rate your recall honestly.</p>
              </div>
              <button aria-label="Close memory check" className="memory-review-icon-button" disabled={isSubmitting} onClick={closeQuiz} ref={closeButtonRef} type="button">
                <X size={19} aria-hidden="true" />
              </button>
            </header>

            <div
              aria-label={`${ratedCount} of ${questions.length} prompts rated`}
              aria-valuemax={questions.length}
              aria-valuemin={0}
              aria-valuenow={ratedCount}
              className="memory-review-progress"
              role="progressbar"
            >
              <span style={{ width: `${questions.length ? (ratedCount / questions.length) * 100 : 0}%` }} />
            </div>

            <div className="memory-review-questions">
              {questions.map((question, index) => {
                const isRevealed = Boolean(revealed[question.id]);
                const showReviewGuidance = Boolean(reviewGuidance[question.id]);
                const reviewGuidanceId = `memory-review-guidance-${index + 1}`;
                return (
                  <article className="memory-review-question" key={question.id}>
                    <span className="memory-review-question-number">Prompt {index + 1}</span>
                    <p className="memory-review-prompt">{question.prompt}</p>
                    <button
                      className="memory-review-reveal"
                      onClick={() => setRevealed((current) => ({
                        ...current,
                        [question.id]: !current[question.id],
                      }))}
                      type="button"
                    >
                      {isRevealed ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                      {isRevealed ? "Hide notebook answer" : "Reveal notebook answer"}
                    </button>
                    {isRevealed && (
                      <div className="memory-review-answer">
                        {question.revealAnswer || "Compare this with your saved notebook explanation."}
                      </div>
                    )}
                    <div className="memory-review-rating" aria-label={`Rate prompt ${index + 1}`} role="group">
                      <button
                        aria-pressed={ratings[question.id] === "recalled"}
                        className={ratings[question.id] === "recalled" ? "is-selected" : ""}
                        disabled={!isRevealed}
                        onClick={() => rateQuestion(question.id, "recalled")}
                        type="button"
                      >
                        <Check size={15} aria-hidden="true" />I recalled it
                      </button>
                      <button
                        aria-describedby={showReviewGuidance ? reviewGuidanceId : undefined}
                        aria-pressed={ratings[question.id] === "review"}
                        className={ratings[question.id] === "review" ? "is-selected is-review" : ""}
                        disabled={!isRevealed}
                        onClick={() => rateQuestion(question.id, "review")}
                        type="button"
                      >
                        <RotateCcw size={15} aria-hidden="true" />Review again
                      </button>
                    </div>
                    {showReviewGuidance && (
                      <p
                        aria-atomic="true"
                        aria-live="polite"
                        className="memory-review-rating-guidance"
                        id={reviewGuidanceId}
                        role="status"
                      >
                        <RotateCcw size={15} aria-hidden="true" />
                        <span>
                          <strong>Marked for review.</strong>{" "}
                          Read the answer once, hide it, then try again from memory.
                        </span>
                      </p>
                    )}
                  </article>
                );
              })}
            </div>

            <footer className="memory-review-dialog-footer">
              <label>
                Recall confidence
                <select value={confidence} onChange={(event) => setConfidence(Number(event.target.value))}>
                  <option value={1}>1 — Guessing</option>
                  <option value={2}>2 — Unsure</option>
                  <option value={3}>3 — Fair</option>
                  <option value={4}>4 — Confident</option>
                  <option value={5}>5 — Very confident</option>
                </select>
              </label>
              <div>
                <span>{ratedCount}/{questions.length} rated</span>
                <button className="memory-review-submit" disabled={!canSubmit} onClick={submitQuiz} type="button">
                  {isSubmitting ? <LoaderCircle className="is-spinning" size={17} aria-hidden="true" /> : <Check size={17} aria-hidden="true" />}
                  {isSubmitting ? "Saving…" : "Finish memory check"}
                </button>
              </div>
            </footer>
            {error && <p className="memory-review-error" role="alert">{error}</p>}
          </section>
        </div>,
        document.body,
      )}
    </section>
  );
}
