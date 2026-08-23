import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  LoaderCircle,
  LockKeyhole,
  RotateCcw,
  Unlock,
  X,
} from "lucide-react";
import {
  PLANNER_UNLOCK_PASS_PERCENTAGE,
  PLANNER_UNLOCK_QUIZ_QUESTION_COUNT,
} from "../utils/plannerScheduleProgress";
import {
  PLANNER_UNLOCK_TOPIC_DETAILS_MAX_LENGTH,
  normalizePlannerUnlockQuestions,
  normalizePlannerUnlockTopicDetails,
  scorePlannerUnlockQuiz,
} from "../utils/plannerUnlockQuiz";
import "./PlannerUnlockQuizDialog.css";

function PlannerUnlockQuizDialog({
  canAttempt = false,
  context,
  hasScheduledDate = true,
  onClose = () => {},
  onGenerate = async () => [],
  onPassed = () => {},
  sessionKey = "",
}) {
  const [answers, setAnswers] = useState({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [questions, setQuestions] = useState([]);
  const [result, setResult] = useState(null);
  const [topicDetails, setTopicDetails] = useState("");
  const closeButtonRef = useRef(null);
  const dialogRef = useRef(null);
  const generationIdRef = useRef(0);
  const onCloseRef = useRef(onClose);
  const previousFocusRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();
  const topicDetailsId = useId();
  const topicDetailsHelpId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const generationId = generationIdRef.current + 1;
    generationIdRef.current = generationId;
    setAnswers({});
    setCurrentQuestionIndex(0);
    setError("");
    setIsGenerating(false);
    setQuestions([]);
    setResult(null);
    setTopicDetails("");

    return () => {
      if (generationIdRef.current === generationId) {
        generationIdRef.current += 1;
      }
    };
  }, [sessionKey]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;

    previousFocusRef.current = document.activeElement;
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    const focusFrame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus({ preventScroll: true });
    });

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
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
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      previousFocusRef.current?.focus?.({ preventScroll: true });
    };
  }, []);

  const startQuiz = async () => {
    if (!canAttempt || isGenerating) return;
    const normalizedTopicDetails = normalizePlannerUnlockTopicDetails(topicDetails);
    if (context?.needsTopicDetails && !normalizedTopicDetails) {
      setError("Add what the generic chapters or units cover before starting the quiz.");
      return;
    }
    const generationId = generationIdRef.current + 1;
    generationIdRef.current = generationId;
    setError("");
    setIsGenerating(true);

    try {
      const generated = normalizePlannerUnlockQuestions(
        await onGenerate(normalizedTopicDetails),
      );
      if (generationIdRef.current !== generationId) return;
      if (generated.length !== PLANNER_UNLOCK_QUIZ_QUESTION_COUNT) {
        throw new Error("The quiz did not return all 10 valid questions. Please try again.");
      }
      setAnswers({});
      setCurrentQuestionIndex(0);
      setQuestions(generated);
      setResult(null);
    } catch (generationError) {
      if (generationIdRef.current !== generationId) return;
      setError(
        generationError instanceof Error
          ? generationError.message
          : "Could not generate the unlock quiz.",
      );
    } finally {
      if (generationIdRef.current === generationId) setIsGenerating(false);
    }
  };

  const retryWithNewQuestions = async () => {
    setAnswers({});
    setCurrentQuestionIndex(0);
    setError("");
    setQuestions([]);
    setResult(null);
    await startQuiz();
  };

  const submitQuiz = () => {
    const nextResult = scorePlannerUnlockQuiz(questions, answers);
    if (nextResult.passed && onPassed(nextResult) === false) {
      setAnswers({});
      setCurrentQuestionIndex(0);
      setError("The schedule changed before the result could be applied. Open the unlock button again.");
      setQuestions([]);
      setResult(null);
      return;
    }
    setResult(nextResult);
  };

  const currentQuestion = questions[currentQuestionIndex];
  const selectedAnswer = answers[currentQuestionIndex];
  const hasSelectedAnswer = Number.isInteger(selectedAnswer);
  const isLastQuestion = currentQuestionIndex === questions.length - 1;
  const missedQuestions = result
    ? questions.filter((question, index) => answers[index] !== question.answerIndex)
    : [];
  const normalizedTopicDetails = normalizePlannerUnlockTopicDetails(topicDetails);
  const isTopicDetailsRequired = Boolean(context?.needsTopicDetails);

  const dialog = (
    <div
      className="planner-unlock-quiz-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCloseRef.current?.();
      }}
      role="presentation"
    >
      <section
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="planner-unlock-quiz-dialog"
        id="planner-unlock-quiz-dialog"
        ref={dialogRef}
        role="dialog"
      >
        <header className="planner-unlock-quiz-header">
          <span aria-hidden="true" className="planner-unlock-quiz-header-icon">
            <BrainCircuit size={21} />
          </span>
          <div>
            <span className="planner-unlock-quiz-eyebrow">Early day access</span>
            <h2 id={titleId}>Unlock Day {context?.targetDayNumber || ""}</h2>
            <p id={descriptionId}>
              Score {PLANNER_UNLOCK_PASS_PERCENTAGE}% or higher across 10 questions from Day {context?.sourceDayNumber || "the previous study day"}.
            </p>
          </div>
          <button
            aria-label="Close unlock quiz"
            className="planner-unlock-quiz-close"
            onClick={() => onCloseRef.current?.()}
            ref={closeButtonRef}
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>

        <div className="planner-unlock-quiz-content">
          {!canAttempt && !result ? (
            <div className="planner-unlock-quiz-state is-locked" role="status">
              <span aria-hidden="true"><LockKeyhole size={26} /></span>
              <h3>Finish Day {context?.sourceDayNumber || "the previous study day"} first</h3>
              <p>
                Complete every scheduled topic for that study day. The 10-question unlock quiz will then become available here.
              </p>
            </div>
          ) : result ? (
            <div
              aria-live="polite"
              className={"planner-unlock-quiz-result " + (result.passed ? "is-passed" : "is-failed")}
            >
              <span aria-hidden="true">
                {result.passed ? <CheckCircle2 size={30} /> : <RotateCcw size={28} />}
              </span>
              <h3>
                {result.passed
                  ? "Day " + context?.targetDayNumber + " unlocked"
                  : "Almost there — review and retry"}
              </h3>
              <strong>{result.score}/{result.total} · {result.percentage}%</strong>
              <p>
                {result.passed
                  ? "You reached the 80% pass mark. The next study day is ready now."
                  : hasScheduledDate
                    ? "You need at least 8 correct answers. Your scheduled date will still unlock this day normally."
                    : "You need at least 8 correct answers. Generate a fresh quiz and try again."}
              </p>

              {!result.passed && missedQuestions.length > 0 && (
                <div className="planner-unlock-quiz-review">
                  <span>Review these answers</span>
                  {missedQuestions.slice(0, 4).map((question) => (
                    <article key={question.id}>
                      <strong>{question.question}</strong>
                      <p>
                        Correct: {question.options[question.answerIndex]}
                        {question.explanation ? " — " + question.explanation : ""}
                      </p>
                    </article>
                  ))}
                </div>
              )}

              <div className="planner-unlock-quiz-result-actions">
                {!result.passed && (
                  <button className="planner-unlock-quiz-secondary" onClick={retryWithNewQuestions} type="button">
                    <RotateCcw aria-hidden="true" size={15} />
                    Generate new questions
                  </button>
                )}
                <button className="planner-unlock-quiz-primary" onClick={() => onCloseRef.current?.()} type="button">
                  {result.passed ? "Continue planning" : "Close"}
                </button>
              </div>
            </div>
          ) : questions.length > 0 && currentQuestion ? (
            <div className="planner-unlock-quiz-question">
              <div className="planner-unlock-quiz-progress-copy">
                <span>Question {currentQuestionIndex + 1} of {questions.length}</span>
                <strong>{Math.round(((currentQuestionIndex + 1) / questions.length) * 100)}%</strong>
              </div>
              <div
                aria-label={"Question " + (currentQuestionIndex + 1) + " of " + questions.length}
                aria-valuemax={questions.length}
                aria-valuemin="1"
                aria-valuenow={currentQuestionIndex + 1}
                className="planner-unlock-quiz-progress"
                role="progressbar"
              >
                <i style={{ width: ((currentQuestionIndex + 1) / questions.length) * 100 + "%" }} />
              </div>

              <h3>{currentQuestion.question}</h3>
              <div className="planner-unlock-quiz-options" role="group" aria-label="Answer options">
                {currentQuestion.options.map((option, optionIndex) => (
                  <button
                    aria-pressed={selectedAnswer === optionIndex}
                    className={selectedAnswer === optionIndex ? "is-selected" : ""}
                    key={currentQuestion.id + "-option-" + optionIndex}
                    onClick={() => setAnswers((current) => ({
                      ...current,
                      [currentQuestionIndex]: optionIndex,
                    }))}
                    type="button"
                  >
                    <span>{String.fromCharCode(65 + optionIndex)}</span>
                    {option}
                  </button>
                ))}
              </div>

              <div className="planner-unlock-quiz-navigation">
                <button
                  className="planner-unlock-quiz-secondary"
                  disabled={currentQuestionIndex === 0}
                  onClick={() => setCurrentQuestionIndex((index) => Math.max(0, index - 1))}
                  type="button"
                >
                  <ArrowLeft aria-hidden="true" size={15} />
                  Back
                </button>
                <button
                  className="planner-unlock-quiz-primary"
                  disabled={!hasSelectedAnswer}
                  onClick={() => {
                    if (isLastQuestion) submitQuiz();
                    else setCurrentQuestionIndex((index) => index + 1);
                  }}
                  type="button"
                >
                  {isLastQuestion ? "Submit answers" : "Next"}
                  {!isLastQuestion && <ArrowRight aria-hidden="true" size={15} />}
                </button>
              </div>
            </div>
          ) : (
            <div className="planner-unlock-quiz-intro">
              <div className="planner-unlock-quiz-rule">
                <Unlock aria-hidden="true" size={19} />
                <div>
                  <strong>8 correct answers unlock Day {context?.targetDayNumber}</strong>
                  <span>One attempt uses 10 questions. A failed attempt never changes your schedule.</span>
                </div>
              </div>

              <div className="planner-unlock-quiz-topics">
                <span>Quiz topics from Day {context?.sourceDayNumber}</span>
                <div>
                  {(context?.topics || []).map((topic) => (
                    <span key={topic}>{topic}</span>
                  ))}
                </div>
              </div>

              <div className="planner-unlock-quiz-topic-input">
                <label htmlFor={topicDetailsId}>
                  Topic or chapter details
                  <span>{isTopicDetailsRequired ? "Required" : "Optional"}</span>
                </label>
                <input
                  aria-describedby={topicDetailsHelpId}
                  aria-required={isTopicDetailsRequired}
                  disabled={isGenerating}
                  id={topicDetailsId}
                  maxLength={PLANNER_UNLOCK_TOPIC_DETAILS_MAX_LENGTH}
                  onChange={(event) => {
                    setTopicDetails(event.target.value);
                    if (error) setError("");
                  }}
                  placeholder="e.g. REST API: HTTP methods; Cloud: IAM and regions"
                  type="text"
                  value={topicDetails}
                />
                <p id={topicDetailsHelpId}>
                  {isTopicDetailsRequired
                    ? "Some scheduled units only have a chapter or unit number. Add what they cover so the quiz tests the right material."
                    : "Optionally add a narrower focus. It will clarify—not replace—the scheduled topics above."}
                </p>
              </div>

              {error && <p className="planner-unlock-quiz-error" role="alert">{error}</p>}

              <button
                className="planner-unlock-quiz-primary planner-unlock-quiz-start"
                disabled={isGenerating || (isTopicDetailsRequired && !normalizedTopicDetails)}
                onClick={startQuiz}
                type="button"
              >
                {isGenerating ? (
                  <>
                    <LoaderCircle aria-hidden="true" className="is-spinning" size={16} />
                    Preparing questions
                  </>
                ) : (
                  <>
                    <BrainCircuit aria-hidden="true" size={16} />
                    Start 10-question quiz
                  </>
                )}
              </button>
              <p className="planner-unlock-quiz-fallback">
                {hasScheduledDate
                  ? "If the quiz service is unavailable, this day will still unlock on its scheduled date."
                  : "This plan has no usable scheduled date. Complete the quiz or generate a new dated schedule."}
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );

  return typeof document === "undefined" ? dialog : createPortal(dialog, document.body);
}

export default PlannerUnlockQuizDialog;
