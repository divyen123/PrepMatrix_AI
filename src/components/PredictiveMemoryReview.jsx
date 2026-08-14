import { useCallback, useEffect, useMemo, useState } from "react";
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
  X,
} from "lucide-react";
import {
  addMemoryReviewTaskCompletion,
  buildMemoryReviewExperience,
  buildMemoryReviewSubmission,
  createMemoryReviewQuiz,
} from "../utils/learningMemoryReviewExperience.js";
import { subscribeToLocalDateChanges } from "../utils/localDateRefresh.js";
import "./PredictiveMemoryReview.css";

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
}) {
  const [today, setToday] = useState(() => new Date());
  const [activeEntry, setActiveEntry] = useState(null);
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [revealed, setRevealed] = useState({});
  const [ratings, setRatings] = useState({});
  const [confidence, setConfidence] = useState(3);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
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
      setSchedule(experience.schedule);
    }
  }, [experience.changed, experience.schedule, setSchedule]);

  const closeQuiz = useCallback(() => {
    if (isSubmitting) return;
    setActiveEntry(null);
    setActiveQuiz(null);
    setRevealed({});
    setRatings({});
    setConfidence(3);
    setError("");
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
    setConfidence(3);
    setError("");
  }, [experience.dateKey]);

  const questions = activeQuiz?.activeRecallPrompts || [];
  const ratedCount = questions.filter((question) => ratings[question.id]).length;
  const canSubmit = questions.length > 0 && ratedCount === questions.length && !isSubmitting;

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
      if (typeof setCompleted === "function") {
        setCompleted((currentValue) => addMemoryReviewTaskCompletion(
          Array.isArray(currentValue) ? currentValue : completed,
          payload.task,
          { schedule: experience.schedule },
        ));
      }
      setActiveEntry(null);
      setActiveQuiz(null);
      setRevealed({});
      setRatings({});
      setConfidence(3);
    } catch (submissionError) {
      setError(
        submissionError?.message
          || "Your result could not be saved. The planner task is still waiting.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [activeEntry, activeQuiz, canSubmit, completed, confidence, experience.schedule, onNotebookUpdated, ratings, setCompleted]);

  if (!experience.entries.length && !error) return null;

  return (
    <section className="memory-review-panel" aria-labelledby="memory-review-title">
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
          {experience.pendingEntries.length} due
        </span>
      </header>

      {error && !activeQuiz && <p className="memory-review-error" role="alert">{error}</p>}

      <div className="memory-review-list">
        {experience.entries.map((entry) => (
          <article
            className={`memory-review-card${entry.completed ? " is-complete" : ""}`}
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
            {entry.completed ? (
              <span className="memory-review-complete-label">
                <Check size={16} aria-hidden="true" />Completed
              </span>
            ) : (
              <button className="memory-review-start" type="button" onClick={() => openQuiz(entry)}>
                Start check <ChevronRight size={16} aria-hidden="true" />
              </button>
            )}
          </article>
        ))}
      </div>

      {activeEntry && activeQuiz && (
        <div className="memory-review-dialog-backdrop" role="presentation">
          <section
            aria-labelledby="memory-quiz-title"
            aria-modal="true"
            className="memory-review-dialog"
            role="dialog"
          >
            <header className="memory-review-dialog-heading">
              <div>
                <span className="memory-review-eyebrow">3-minute active recall</span>
                <h3 id="memory-quiz-title">{activeEntry.candidate.title}</h3>
                <p>Answer from memory, reveal the note, then rate your recall honestly.</p>
              </div>
              <button aria-label="Close memory check" className="memory-review-icon-button" disabled={isSubmitting} onClick={closeQuiz} type="button">
                <X size={19} aria-hidden="true" />
              </button>
            </header>

            <div className="memory-review-progress" aria-label={`${ratedCount} of ${questions.length} prompts rated`}>
              <span style={{ width: `${questions.length ? (ratedCount / questions.length) * 100 : 0}%` }} />
            </div>

            <div className="memory-review-questions">
              {questions.map((question, index) => {
                const isRevealed = Boolean(revealed[question.id]);
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
                    <div className="memory-review-rating" aria-label={`Rate prompt ${index + 1}`}>
                      <button
                        aria-pressed={ratings[question.id] === "recalled"}
                        className={ratings[question.id] === "recalled" ? "is-selected" : ""}
                        disabled={!isRevealed}
                        onClick={() => setRatings((current) => ({ ...current, [question.id]: "recalled" }))}
                        type="button"
                      >
                        <Check size={15} aria-hidden="true" />I recalled it
                      </button>
                      <button
                        aria-pressed={ratings[question.id] === "review"}
                        className={ratings[question.id] === "review" ? "is-selected is-review" : ""}
                        disabled={!isRevealed}
                        onClick={() => setRatings((current) => ({ ...current, [question.id]: "review" }))}
                        type="button"
                      >
                        <RotateCcw size={15} aria-hidden="true" />Review again
                      </button>
                    </div>
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
        </div>
      )}
    </section>
  );
}
