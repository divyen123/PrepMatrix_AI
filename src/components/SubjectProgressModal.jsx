import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  CircleDashed,
  Clock3,
  PenTool,
  Sparkles,
  Target,
  TrendingUp,
  X,
} from "lucide-react";

function SubjectProgressModal({ subject, onClose, schedule = [], completed = [] }) {
  const navigate = useNavigate();
  const closeButtonRef = useRef(null);
  const closeTimerRef = useRef(null);
  const previousFocusRef = useRef(null);
  const askAIButtonRef = useRef(null);
  const askAIChaptersRef = useRef(null);
  const askAIDialogRef = useRef(null);
  const askAIOpenRef = useRef(false);
  const [isVisible, setIsVisible] = useState(false);
  const [askAIOpen, setAskAIOpen] = useState(false);
  const [aiChapters, setAiChapters] = useState("");
  const [aiDoubts, setAiDoubts] = useState("");
  const [aiGoal, setAiGoal] = useState("concept-review");
  const [aiSessionLength, setAiSessionLength] = useState("40");
  const [aiError, setAiError] = useState("");
  const safeSchedule = useMemo(() => (Array.isArray(schedule) ? schedule : []), [schedule]);
  const safeCompleted = useMemo(() => (Array.isArray(completed) ? completed : []), [completed]);

  const subjectTasks = useMemo(
    () => safeSchedule.flatMap((day, dayIndex) => {
      const tasks = Array.isArray(day?.tasks) ? day.tasks : [];
      return tasks
        .filter((task) => typeof task?.task === "string" && task.task.startsWith(`${subject} -`))
        .map((task, taskIndex) => ({
          id: task.task,
          topic: task.task.slice(`${subject} -`.length).trimStart(),
          date: day.date || null,
          day: day.day || dayIndex + 1,
          order: dayIndex * 100 + taskIndex,
          isComplete: safeCompleted.includes(task.task),
        }));
    }).sort((left, right) => left.order - right.order),
    [safeCompleted, safeSchedule, subject]
  );

  const completedCount = subjectTasks.filter((task) => task.isComplete).length;
  const totalChapters = subjectTasks.length;
  const remainingCount = Math.max(totalChapters - completedCount, 0);
  const completionPercentage = totalChapters === 0
    ? 0
    : Math.round((completedCount / totalChapters) * 100);
  const nextTask = subjectTasks.find((task) => !task.isComplete);
  const readinessLabel = completionPercentage === 100
    ? "Ready for final revision"
    : completionPercentage >= 70
      ? "Strong exam readiness"
      : completionPercentage >= 40
        ? "Momentum is building"
        : "Build the foundation";

  const closeWithAction = useCallback((action) => {
    setIsVisible(false);
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      onClose();
      action?.();
    }, 220);
  }, [onClose]);

  const handleClose = useCallback(() => closeWithAction(), [closeWithAction]);

  const closeAskAIDialog = useCallback((restoreFocus = true) => {
    askAIOpenRef.current = false;
    setAskAIOpen(false);
    setAiError("");
    if (restoreFocus) {
      window.requestAnimationFrame(() => askAIButtonRef.current?.focus({ preventScroll: true }));
    }
  }, []);

  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    const frame = window.requestAnimationFrame(() => {
      setIsVisible(true);
      closeButtonRef.current?.focus({ preventScroll: true });
    });
    document.body.classList.add("modal-open");

    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (askAIOpenRef.current) {
        event.preventDefault();
        closeAskAIDialog();
        return;
      }
      handleClose();
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
      document.body.classList.remove("modal-open");
      document.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus?.({ preventScroll: true });
    };
  }, [closeAskAIDialog, handleClose]);

  const handleReferMaterial = () => {
    closeWithAction(() => navigate(`/resources?subject=${encodeURIComponent(subject)}`));
  };

  const handleQuiz = () => {
    closeWithAction(() => navigate(`/quiz?subject=${encodeURIComponent(subject)}`));
  };

  const handleOpenAskAI = () => {
    const unfinishedTopics = subjectTasks
      .filter((task) => !task.isComplete)
      .map((task) => task.topic);
    const suggestedTopics = unfinishedTopics.length > 0
      ? unfinishedTopics
      : subjectTasks.map((task) => task.topic);

    setAiChapters(suggestedTopics.join(", ") || nextTask?.topic || "");
    setAiDoubts("");
    setAiError("");
    askAIOpenRef.current = true;
    setAskAIOpen(true);
    window.requestAnimationFrame(() => askAIChaptersRef.current?.focus({ preventScroll: true }));
  };

  const handleAskAIDialogKeyDown = (event) => {
    if (event.key !== "Tab") return;

    const focusableElements = askAIDialogRef.current?.querySelectorAll(
      'button:not([disabled]), textarea:not([disabled]), select:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
    );
    if (!focusableElements?.length) {
      event.preventDefault();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  };

  const handleAskAISubmit = (event) => {
    event.preventDefault();
    const chapters = [...new Set(
      aiChapters
        .split(/[\n,;]+/)
        .map((chapter) => chapter.trim())
        .filter(Boolean)
    )];

    if (chapters.length === 0) {
      setAiError("Add at least one chapter or topic before continuing.");
      askAIChaptersRef.current?.focus();
      return;
    }

    const goalLabels = {
      "concept-review": "Build clear conceptual understanding and revise efficiently",
      practice: "Practice application-based questions and strengthen problem solving",
      exam: "Prepare for an exam with high-priority revision and likely questions",
      recovery: "Recover weak or missed topics with a focused catch-up plan",
    };
    const doubtText = aiDoubts.trim();
    const progressText = totalChapters > 0
      ? `${completedCount} of ${totalChapters} scheduled chapters completed (${completionPercentage}%)`
      : "No scheduled chapter progress is currently available";
    const prompt = [
      "Act as my professional study coach and subject tutor.",
      `Subject: ${subject}`,
      `Current progress: ${progressText}.`,
      `Chapters or topics to focus on:\n${chapters.map((chapter) => `- ${chapter}`).join("\n")}`,
      doubtText
        ? `Specific doubts or weak areas:\n${doubtText}`
        : "Specific doubts or weak areas: None provided. Briefly identify likely misconceptions before teaching.",
      `Study goal: ${goalLabels[aiGoal]}.`,
      `Available study time: ${aiSessionLength} minutes.`,
      "Please respond with: (1) a concise concept overview, (2) chapter-by-chapter priorities, (3) direct answers to each doubt, (4) a realistic timed study plan, and (5) three active-recall questions. Keep the response structured, practical, and appropriate for my current progress.",
    ].join("\n\n");

    closeAskAIDialog(false);
    closeWithAction(() => {
      window.dispatchEvent(
        new CustomEvent("openPrepMatrixAIChat", {
          detail: {
            createNewChat: true,
            message: prompt,
          },
        })
      );
    });
  };

  const formatDate = (date) => {
    if (!date) return "Scheduled plan";
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return "Scheduled plan";
    return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  return createPortal(
    <div
      className={`subject-modal-overlay ${isVisible ? "open" : ""}`}
      onClick={handleClose}
      role="presentation"
    >
      <section
        aria-describedby="subject-progress-description"
        aria-hidden={askAIOpen ? "true" : undefined}
        aria-labelledby="subject-progress-title"
        aria-modal="true"
        className={`subject-progress-modal ${isVisible ? "open" : ""}`}
        inert={askAIOpen ? "" : undefined}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <button
          aria-label="Close subject progress"
          className="subject-modal-close"
          onClick={handleClose}
          ref={closeButtonRef}
          type="button"
        >
          <X aria-hidden="true" size={14} strokeWidth={2.8} />
        </button>

        <header className="subject-modal-hero">
          <div className="subject-modal-hero-copy">
            <span className="subject-modal-eyebrow"><TrendingUp size={14} /> Subject performance</span>
            <h2 id="subject-progress-title">{subject}</h2>
            <p id="subject-progress-description">
              A focused view of completed chapters, upcoming work, and exam readiness.
            </p>
          </div>
          <div className="subject-modal-summary" aria-label={`${completionPercentage}% complete`}>
            <strong>{completionPercentage}%</strong>
            <span>complete</span>
          </div>
        </header>

        <div className="subject-modal-progress" aria-label={`${completedCount} of ${totalChapters} chapters completed`}>
          <span style={{ width: `${completionPercentage}%` }} />
        </div>

        <div className="subject-modal-stat-grid">
          <article>
            <span><CheckCircle2 size={15} /> Completed</span>
            <strong>{completedCount}</strong>
          </article>
          <article>
            <span><CircleDashed size={15} /> Remaining</span>
            <strong>{remainingCount}</strong>
          </article>
          <article>
            <span><CalendarDays size={15} /> Plan length</span>
            <strong>{totalChapters}</strong>
          </article>
        </div>

        <div className="subject-modal-grid">
          <section className="subject-timeline-section" aria-labelledby="subject-timeline-title">
            <div className="subject-panel-heading">
              <div>
                <span>Learning path</span>
                <h3 id="subject-timeline-title">Chapter timeline</h3>
              </div>
              <strong>{completedCount}/{totalChapters}</strong>
            </div>

            {subjectTasks.length > 0 ? (
              <div className="subject-timeline-list">
                {subjectTasks.map((task, index) => (
                  <article
                    className={`subject-timeline-item ${task.isComplete ? "completed" : "upcoming"}`}
                    key={`${task.id}-${index}`}
                    style={{ "--timeline-delay": `${index * 65}ms` }}
                  >
                    <div className="subject-timeline-rail" aria-hidden="true">
                      <span>{task.isComplete ? <Check size={13} strokeWidth={2.5} /> : index + 1}</span>
                      {index < subjectTasks.length - 1 && <i />}
                    </div>
                    <div className="subject-timeline-copy">
                      <div>
                        <strong>{task.topic}</strong>
                        <span className={`subject-task-status ${task.isComplete ? "done" : "pending"}`}>
                          {task.isComplete ? "Completed" : "Upcoming"}
                        </span>
                      </div>
                      <p><Clock3 size={13} /> Day {task.day} <span aria-hidden="true">·</span> {formatDate(task.date)}</p>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="subject-timeline-empty">
                <CalendarDays size={22} />
                <strong>No scheduled chapters yet</strong>
                <p>Generate a timetable to create an animated learning path for this subject.</p>
              </div>
            )}
          </section>

          <aside className="subject-readiness-section">
            <div className="subject-panel-heading">
              <div>
                <span>Readiness signal</span>
                <h3>Exam outlook</h3>
              </div>
            </div>

            <div className="readiness-gauge" style={{ "--progress": `${completionPercentage * 3.6}deg` }}>
              <div className="gauge-inner">
                <Target aria-hidden="true" size={22} />
                <strong>{completionPercentage}%</strong>
                <span>ready</span>
              </div>
            </div>

            <div className="subject-readiness-copy">
              <strong>{readinessLabel}</strong>
              <p>
                {nextTask
                  ? `Next focus: ${nextTask.topic}. Complete it to move this subject closer to exam readiness.`
                  : "All scheduled chapters are complete. Shift attention to active recall and timed practice."}
              </p>
            </div>

            <div className="subject-next-step">
              <span>Recommended next step</span>
              <strong>{nextTask?.topic || "Run a revision quiz"}</strong>
              <ArrowRight aria-hidden="true" size={16} />
            </div>
          </aside>
        </div>

        <footer className="subject-modal-actions">
          <button className="subject-action-btn" onClick={handleReferMaterial} type="button">
            <span className="subject-action-icon"><BookOpen size={17} /></span>
            <span><strong>Refer material</strong><small>Open curated resources</small></span>
            <ArrowRight size={15} />
          </button>
          <button className="subject-action-btn" onClick={handleQuiz} type="button">
            <span className="subject-action-icon"><PenTool size={17} /></span>
            <span><strong>Take a quiz</strong><small>Test this subject</small></span>
            <ArrowRight size={15} />
          </button>
          <button
            className="subject-action-btn primary"
            onClick={handleOpenAskAI}
            ref={askAIButtonRef}
            type="button"
          >
            <span className="subject-action-icon"><Sparkles size={17} /></span>
            <span><strong>Ask AI</strong><small>Build a revision plan</small></span>
            <ArrowRight size={15} />
          </button>
        </footer>
      </section>

        {askAIOpen && (
          <div
            className="subject-ai-dialog-backdrop"
            onClick={(event) => {
              event.stopPropagation();
              closeAskAIDialog();
            }}
            role="presentation"
          >
            <form
              aria-describedby="subject-ai-dialog-description"
              aria-labelledby="subject-ai-dialog-title"
              aria-modal="true"
              className="subject-ai-dialog"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={handleAskAIDialogKeyDown}
              onSubmit={handleAskAISubmit}
              ref={askAIDialogRef}
              role="dialog"
            >
              <header className="subject-ai-dialog-header">
                <span className="subject-ai-dialog-mark" aria-hidden="true">
                  <Sparkles size={18} />
                </span>
                <div>
                  <span>AI study brief</span>
                  <h3 id="subject-ai-dialog-title">Prepare your {subject} session</h3>
                  <p id="subject-ai-dialog-description">
                    Refine the chapters and goal. Your brief will open in AI Chat, ready to review and send.
                  </p>
                </div>
                <button
                  aria-label="Close Ask AI setup"
                  className="subject-ai-dialog-close"
                  onClick={() => closeAskAIDialog()}
                  type="button"
                >
                  <X aria-hidden="true" size={14} strokeWidth={2.8} />
                </button>
              </header>

              <div className="subject-ai-context" aria-label="Current subject progress">
                <span><Target size={14} /> {completionPercentage}% ready</span>
                <span><CheckCircle2 size={14} /> {completedCount}/{totalChapters} complete</span>
                <span><Clock3 size={14} /> {remainingCount} remaining</span>
              </div>

              <div className="subject-ai-fields">
                <label className="subject-ai-field subject-ai-field-wide">
                  <span>Chapter names <strong>Required</strong></span>
                  <textarea
                    aria-describedby={aiError ? "subject-ai-chapters-help subject-ai-error" : "subject-ai-chapters-help"}
                    aria-invalid={Boolean(aiError)}
                    onChange={(event) => {
                      setAiChapters(event.target.value);
                      if (aiError) setAiError("");
                    }}
                    placeholder="Example: Process scheduling, Memory management"
                    ref={askAIChaptersRef}
                    rows={3}
                    value={aiChapters}
                  />
                  <small id="subject-ai-chapters-help">Separate multiple chapters with commas or new lines.</small>
                </label>

                <label className="subject-ai-field subject-ai-field-wide">
                  <span>Doubts or weak areas <em>Optional</em></span>
                  <textarea
                    onChange={(event) => setAiDoubts(event.target.value)}
                    placeholder="Describe a confusing concept, formula, or question..."
                    rows={3}
                    value={aiDoubts}
                  />
                </label>

                <label className="subject-ai-field">
                  <span>Study goal</span>
                  <select onChange={(event) => setAiGoal(event.target.value)} value={aiGoal}>
                    <option value="concept-review">Concept review</option>
                    <option value="practice">Practice & application</option>
                    <option value="exam">Exam preparation</option>
                    <option value="recovery">Catch-up session</option>
                  </select>
                </label>

                <label className="subject-ai-field">
                  <span>Session length</span>
                  <select
                    onChange={(event) => setAiSessionLength(event.target.value)}
                    value={aiSessionLength}
                  >
                    <option value="20">20 minutes</option>
                    <option value="40">40 minutes</option>
                    <option value="60">60 minutes</option>
                    <option value="90">90 minutes</option>
                  </select>
                </label>
              </div>

              {aiError && <p className="subject-ai-error" id="subject-ai-error" role="alert">{aiError}</p>}

              <footer className="subject-ai-dialog-actions">
                <p><Sparkles size={13} /> A structured prompt will be prepared for you.</p>
                <div>
                  <button className="subject-ai-cancel" onClick={() => closeAskAIDialog()} type="button">
                    Cancel
                  </button>
                  <button className="subject-ai-submit" type="submit">
                    <Sparkles size={15} /> Ask AI <ArrowRight size={14} />
                  </button>
                </div>
              </footer>
            </form>
          </div>
        )}
    </div>,
    document.body
  );
}

export default SubjectProgressModal;