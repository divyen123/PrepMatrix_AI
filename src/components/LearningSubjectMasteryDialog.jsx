import { useEffect, useId, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import {
  BookOpenCheck,
  BrainCircuit,
  CheckCircle2,
  Layers3,
  LoaderCircle,
  RefreshCw,
  X,
} from "lucide-react";
import {
  getLearningNodeStatus,
  hasLearningNodeAchievement,
  normalizeLearningState,
} from "../utils/learningMastery";
import "./LearningSubjectMasteryDialog.css";

function safeList(value) {
  return Array.isArray(value) ? value : [];
}

function masteryRows(notebooks, now) {
  return safeList(notebooks).map((notebook, index) => {
    const source = notebook && typeof notebook === "object" ? notebook : {};
    const state = normalizeLearningState(source.learningState, { notebook: source, now });
    const topics = Object.values(state.nodes).filter((node) => node.nodeType === "topic");
    const learnedTopics = topics.filter(hasLearningNodeAchievement);
    const masteredTopics = topics.filter((node) => (
      Boolean(node.masteredAt) || getLearningNodeStatus(node, { now }) === "mastered"
    ));
    const totalTopics = topics.length;
    const learnedCount = learnedTopics.length;

    return {
      id: String(source.id || source._id || `notebook-${index + 1}`),
      learnedCount,
      learnedTopicTitles: learnedTopics.map((topic) => topic.title).filter(Boolean),
      masteredCount: masteredTopics.length,
      percentage: totalTopics ? Math.round((learnedCount / totalTopics) * 100) : 0,
      subjectName: String(source.subjectName || source.subject || "General study"),
      title: String(source.title || source.name || source.subjectName || `Notebook ${index + 1}`),
      totalTopics,
    };
  });
}

function NotebookMasteryRow({ row }) {
  const visibleTopics = row.learnedTopicTitles.slice(0, 4);
  const remainingCount = Math.max(row.learnedTopicTitles.length - visibleTopics.length, 0);
  const progressLabel = `${row.title}: ${row.learnedCount} of ${row.totalTopics} topics learned`;

  return (
    <article className="learning-subject-mastery-row">
      <div className="learning-subject-mastery-row__heading">
        <div>
          <span>{row.subjectName}</span>
          <h3>{row.title}</h3>
        </div>
        <strong>{row.percentage}%</strong>
      </div>

      <div
        aria-label={progressLabel}
        aria-valuemax={row.totalTopics}
        aria-valuemin="0"
        aria-valuenow={row.learnedCount}
        className="learning-subject-mastery-progress"
        role="progressbar"
      >
        <i style={{ width: `${row.percentage}%` }} />
      </div>

      <div className="learning-subject-mastery-row__metrics">
        <span><BookOpenCheck aria-hidden="true" size={15} /> {row.learnedCount} of {row.totalTopics} learned</span>
        <span><BrainCircuit aria-hidden="true" size={15} /> {row.masteredCount} mastered</span>
      </div>

      <div className="learning-subject-mastery-topics">
        <span className="learning-subject-mastery-topics__label">Learned topics</span>
        {visibleTopics.length ? (
          <div>
            {visibleTopics.map((topic, index) => (
              <span className="learning-subject-mastery-topic" key={`${row.id}-${topic}-${index}`}>
                <CheckCircle2 aria-hidden="true" size={13} />
                {topic}
              </span>
            ))}
            {remainingCount > 0 && (
              <span className="learning-subject-mastery-topic is-more">+{remainingCount} more</span>
            )}
          </div>
        ) : (
          <p>
            {row.totalTopics
              ? "No topics have been marked as learned yet."
              : "This notebook does not have generated topics yet."}
          </p>
        )}
      </div>
    </article>
  );
}

function LearningSubjectMasteryDialog({
  error = "",
  loading = false,
  notebooks = [],
  now,
  onClose,
  onRetry,
  open = false,
}) {
  const closeButtonRef = useRef(null);
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const previousFocusRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();
  const rows = useMemo(() => masteryRows(notebooks, now), [notebooks, now]);
  const totals = useMemo(() => rows.reduce((summary, row) => ({
    learned: summary.learned + row.learnedCount,
    topics: summary.topics + row.totalTopics,
  }), { learned: 0, topics: 0 }), [rows]);
  const overallPercentage = totals.topics
    ? Math.round((totals.learned / totals.topics) * 100)
    : 0;

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;

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
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
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
  }, [open]);

  if (!open) return null;

  const dialog = (
    <div
      className="learning-subject-mastery-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCloseRef.current?.();
      }}
      role="presentation"
    >
      <section
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="learning-subject-mastery-dialog"
        id="learning-subject-mastery-dialog"
        ref={dialogRef}
        role="dialog"
      >
        <header className="learning-subject-mastery-header">
          <span className="learning-subject-mastery-header__icon" aria-hidden="true">
            <BrainCircuit size={22} />
          </span>
          <div>
            <span className="learning-subject-mastery-eyebrow">Learning progress</span>
            <h2 id={titleId}>Subject mastery</h2>
            <p id={descriptionId}>
              Learned topics compared with each notebook&apos;s complete topic set.
            </p>
          </div>
          <button
            aria-label="Close subject mastery"
            className="learning-subject-mastery-close"
            onClick={() => onCloseRef.current?.()}
            ref={closeButtonRef}
            type="button"
          >
            <X aria-hidden="true" size={19} />
          </button>
        </header>

        {!loading && !error && (
          <div className="learning-subject-mastery-summary" aria-label="Mastery summary">
            <article>
              <Layers3 aria-hidden="true" size={17} />
              <strong>{rows.length}</strong>
              <span>{rows.length === 1 ? "Notebook" : "Notebooks"}</span>
            </article>
            <article>
              <BookOpenCheck aria-hidden="true" size={17} />
              <strong>{totals.learned}/{totals.topics}</strong>
              <span>Topics learned</span>
            </article>
            <article>
              <BrainCircuit aria-hidden="true" size={17} />
              <strong>{overallPercentage}%</strong>
              <span>Learning coverage</span>
            </article>
          </div>
        )}

        <div className="learning-subject-mastery-content">
          {loading ? (
            <div className="learning-subject-mastery-state" aria-live="polite" role="status">
              <span aria-hidden="true"><LoaderCircle className="is-spinning" size={24} /></span>
              <h3>Reading mastery progress</h3>
              <p>Comparing learned topics with your saved notebook outlines.</p>
            </div>
          ) : error ? (
            <div className="learning-subject-mastery-state" role="alert">
              <span aria-hidden="true"><RefreshCw size={23} /></span>
              <h3>Mastery progress is temporarily unavailable</h3>
              <p>{error}</p>
              {typeof onRetry === "function" && (
                <button onClick={onRetry} type="button">Retry</button>
              )}
            </div>
          ) : rows.length ? (
            <div className="learning-subject-mastery-list">
              {rows.map((row, index) => (
                <NotebookMasteryRow key={`${row.id}-${index}`} row={row} />
              ))}
            </div>
          ) : (
            <div className="learning-subject-mastery-empty">
              <span aria-hidden="true"><BookOpenCheck size={24} /></span>
              <h3>No notebooks to compare yet</h3>
              <p>Save a learning notebook and its topic progress will appear here.</p>
            </div>
          )}
        </div>

        <footer className="learning-subject-mastery-footer">
          <span>Updates automatically when a topic is marked as completed.</span>
          <button onClick={() => onCloseRef.current?.()} type="button">Done</button>
        </footer>
      </section>
    </div>
  );

  return typeof document === "undefined" ? dialog : createPortal(dialog, document.body);
}

export default LearningSubjectMasteryDialog;
