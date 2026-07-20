import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  BookOpen,
  ChevronRight,
  Layers3,
  ListChecks,
  Plus,
  Settings2,
  ShieldAlert,
  X,
} from "lucide-react";
import {
  getSubjectStudyUnits,
  normalizeSubjectTopics,
} from "../utils/subjectPlanning";
import "./SubjectSnapshotDialog.css";

const SNAPSHOT_COPY = {
  subjects: {
    actionLabel: "Add subject",
    actionTarget: "add-subject",
    description: "Every subject currently feeding your study plan, with its size and priority.",
    eyebrow: "Portfolio overview",
    Icon: BookOpen,
    metricLabel: "subjects in your library",
    title: "Total subjects",
  },
  chapters: {
    actionLabel: "Manage topics",
    actionTarget: "subject-library",
    description: "Custom topics appear first. Any remaining study units keep their numbered chapter labels.",
    eyebrow: "Chapter breakdown",
    Icon: Layers3,
    metricLabel: "chapters across all subjects",
    title: "Total chapters",
  },
  hard: {
    actionLabel: "Review priorities",
    actionTarget: "subject-library",
    description: "Subjects marked Hard receive extra attention when the planner balances your workload.",
    eyebrow: "Priority review",
    Icon: ShieldAlert,
    metricLabel: "hard-priority subjects",
    title: "Hard-priority subjects",
  },
};

function toChapterCount(subject) {
  const count = Number.parseInt(subject?.chapters, 10);
  return Number.isFinite(count) ? Math.max(count, 0) : 0;
}

function formatDifficulty(value) {
  const difficulty = String(value || "medium").toLowerCase();
  return difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
}

function SubjectSummaryRow({ priority = false, subject }) {
  const topics = normalizeSubjectTopics(subject?.topics);
  const chapterCount = toChapterCount(subject);
  const difficulty = String(subject?.difficulty || "medium").toLowerCase();

  return (
    <article className="subject-snapshot-row">
      <div className="subject-snapshot-row-heading">
        <div>
          <strong>{subject?.name || "Untitled subject"}</strong>
          <span>
            {chapterCount} {chapterCount === 1 ? "chapter" : "chapters"}
          </span>
        </div>
        <span className={`subject-snapshot-difficulty is-${difficulty}`}>
          {formatDifficulty(difficulty)}
        </span>
      </div>

      <div className="subject-snapshot-row-meta">
        <span>
          <ListChecks aria-hidden="true" size={14} />
          {topics.length
            ? `${topics.length} custom ${topics.length === 1 ? "topic" : "topics"}`
            : "Automatic chapter topics"}
        </span>
        {priority && <span className="is-priority">Priority scheduling</span>}
      </div>
    </article>
  );
}

function ChapterBreakdown({ subject }) {
  const topics = normalizeSubjectTopics(subject?.topics);
  const units = getSubjectStudyUnits(subject);
  const visibleUnits = units.slice(0, 24);
  const hiddenUnitCount = Math.max(units.length - visibleUnits.length, 0);
  const chapterCount = toChapterCount(subject);

  return (
    <article className="subject-snapshot-chapter-group">
      <header>
        <div>
          <strong>{subject?.name || "Untitled subject"}</strong>
          <span>
            {chapterCount} {chapterCount === 1 ? "chapter" : "chapters"}
          </span>
        </div>
        <span className="subject-snapshot-source">
          {topics.length
            ? `${topics.length} custom`
            : "Default chapters"}
        </span>
      </header>

      <div className="subject-snapshot-units">
        {visibleUnits.map((unit, index) => (
          <span
            className={`subject-snapshot-unit${index < topics.length ? " is-custom" : ""}`}
            key={`${unit}-${index}`}
          >
            <span aria-hidden="true" />
            {unit}
          </span>
        ))}
        {hiddenUnitCount > 0 && (
          <span className="subject-snapshot-unit is-more">
            +{hiddenUnitCount} more
          </span>
        )}
      </div>
    </article>
  );
}

function SubjectSnapshotDialog({
  activeSnapshot,
  onClose,
  onPrimaryAction,
  subjects,
}) {
  const closeButtonRef = useRef(null);
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const previousFocusRef = useRef(null);
  const snapshot = SNAPSHOT_COPY[activeSnapshot];
  const safeSubjects = Array.isArray(subjects) ? subjects : [];
  const hardSubjects = safeSubjects.filter(
    (subject) => String(subject?.difficulty || "").toLowerCase() === "hard",
  );
  const totalChapters = safeSubjects.reduce(
    (sum, subject) => sum + toChapterCount(subject),
    0,
  );
  const metricValue = activeSnapshot === "subjects"
    ? safeSubjects.length
    : activeSnapshot === "chapters"
      ? totalChapters
      : hardSubjects.length;

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.classList.add("modal-open");
    document.body.style.overflow = "hidden";
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
      document.body.classList.remove("modal-open");
      document.body.style.overflow = previousBodyOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus?.({ preventScroll: true });
    };
  }, []);

  if (!snapshot || typeof document === "undefined") return null;

  const { Icon } = snapshot;
  const listedSubjects = activeSnapshot === "hard" ? hardSubjects : safeSubjects;
  const emptyTitle = activeSnapshot === "hard"
    ? "No hard-priority subjects"
    : "No subjects to show yet";
  const emptyCopy = activeSnapshot === "hard"
    ? "Subjects marked Hard will appear here automatically."
    : "Add a subject to start building this snapshot.";
  const primaryTarget = safeSubjects.length === 0
    ? "add-subject"
    : snapshot.actionTarget;
  const primaryLabel = safeSubjects.length === 0
    ? "Add subject"
    : snapshot.actionLabel;

  return createPortal(
    <div
      className="subject-snapshot-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCloseRef.current?.();
      }}
      role="presentation"
    >
      <section
        aria-describedby="subject-snapshot-description"
        aria-labelledby="subject-snapshot-title"
        aria-modal="true"
        className="subject-snapshot-dialog"
        ref={dialogRef}
        role="dialog"
      >
        <header className="subject-snapshot-header">
          <span className="subject-snapshot-icon" aria-hidden="true">
            <Icon size={21} />
          </span>
          <div>
            <span className="subject-snapshot-eyebrow">{snapshot.eyebrow}</span>
            <h2 id="subject-snapshot-title">{snapshot.title}</h2>
            <p id="subject-snapshot-description">{snapshot.description}</p>
          </div>
          <button
            aria-label="Close subject snapshot"
            className="subject-snapshot-close"
            onClick={() => onCloseRef.current?.()}
            ref={closeButtonRef}
            type="button"
          >
            <X size={18} />
          </button>
        </header>

        <div className="subject-snapshot-summary">
          <strong>{metricValue}</strong>
          <div>
            <span>{snapshot.metricLabel}</span>
            <small>Updated from your current subject library</small>
          </div>
        </div>

        <div className="subject-snapshot-content">
          {listedSubjects.length === 0 ? (
            <div className="subject-snapshot-empty">
              <span className="subject-snapshot-empty-icon" aria-hidden="true">
                <Icon size={20} />
              </span>
              <div>
                <strong>{emptyTitle}</strong>
                <p>{emptyCopy}</p>
              </div>
            </div>
          ) : activeSnapshot === "chapters" ? (
            <div className="subject-snapshot-list">
              {safeSubjects.map((subject, index) => (
                <ChapterBreakdown
                  key={`${subject?.name || "subject"}-${index}`}
                  subject={subject}
                />
              ))}
            </div>
          ) : (
            <div className="subject-snapshot-list">
              {listedSubjects.map((subject, index) => (
                <SubjectSummaryRow
                  key={`${subject?.name || "subject"}-${index}`}
                  priority={activeSnapshot === "hard"}
                  subject={subject}
                />
              ))}
            </div>
          )}
        </div>

        <footer className="subject-snapshot-footer">
          <button
            className="subject-snapshot-action is-secondary"
            onClick={() => onCloseRef.current?.()}
            type="button"
          >
            Close
          </button>
          <button
            className="subject-snapshot-action is-primary"
            onClick={() => onPrimaryAction?.(primaryTarget)}
            type="button"
          >
            {primaryTarget === "add-subject" ? (
              <Plus aria-hidden="true" size={15} />
            ) : (
              <Settings2 aria-hidden="true" size={15} />
            )}
            {primaryLabel}
            <ChevronRight aria-hidden="true" size={15} />
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

export default SubjectSnapshotDialog;
