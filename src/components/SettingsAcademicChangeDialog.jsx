import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ArrowRight } from "lucide-react";

export default function SettingsAcademicChangeDialog({
  actionLabel = "Save anyway",
  busy = false,
  busyLabel = "Saving...",
  changes = [],
  description = "This changes the learner context used across study plans, quizzes, exams, and AI guidance.",
  dialogId = "settings-academic-confirm",
  nextLabel = "New",
  onCancel,
  onConfirm,
  open = false,
  fallbackFocusRef,
  returnFocusRef,
  title = "Update academic profile?",
}) {
  const dialogRef = useRef(null);
  const cancelButtonRef = useRef(null);
  const titleId = `${dialogId}-title`;
  const descriptionId = `${dialogId}-description`;

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;

    const previousFocus = document.activeElement;
    const returnFocusTarget = returnFocusRef?.current;
    const fallbackFocusTarget = fallbackFocusRef?.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusFrame = window.requestAnimationFrame(() => {
      cancelButtonRef.current?.focus({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      const focusTarget = returnFocusTarget?.isConnected
        ? returnFocusTarget
        : fallbackFocusTarget?.isConnected
          ? fallbackFocusTarget
          : previousFocus;
      focusTarget?.focus?.({ preventScroll: true });
    };
  }, [fallbackFocusRef, open, returnFocusRef]);

  const handleBackdropMouseDown = (event) => {
    if (!busy && event.target === event.currentTarget) onCancel?.();
  };

  const handleKeyDown = (event) => {
    if (event.key === "Escape" && !busy) {
      event.preventDefault();
      onCancel?.();
      return;
    }

    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = Array.from(
      dialogRef.current.querySelectorAll("button:not([disabled])"),
    );
    if (focusable.length === 0) return;

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

  const content = (
    <div
      aria-hidden={!open}
      className={`confirm-modal-backdrop settings-academic-confirm-backdrop ${open ? "is-open" : "is-closed"}`}
      inert={!open}
      onKeyDown={handleKeyDown}
      onMouseDown={handleBackdropMouseDown}
    >
      <section
        aria-busy={busy}
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="confirm-modal settings-academic-confirm settings-academic-confirm--warning"
        ref={dialogRef}
        role="alertdialog"
      >
        <div className="confirm-modal-icon warning settings-academic-confirm__icon">
          <AlertTriangle aria-hidden="true" size={22} />
        </div>

        <div className="confirm-modal-copy settings-academic-confirm__copy">
          <h2 id={titleId}>{title}</h2>
          <p id={descriptionId}>{description}</p>
        </div>

        <dl className="settings-academic-confirm__changes">
          {changes.map((change) => (
            <div className="settings-academic-confirm__change" key={change.key}>
              <dt>{change.label}</dt>
              <dd>
                <span>
                  <small>Current</small>
                  <strong>{change.before}</strong>
                </span>
                <ArrowRight aria-hidden="true" className="settings-academic-confirm__arrow" size={16} />
                <span>
                  <small>{nextLabel}</small>
                  <strong>{change.after}</strong>
                </span>
              </dd>
            </div>
          ))}
        </dl>

        <div className="confirm-modal-actions settings-academic-confirm__actions">
          <button
            className="secondary-btn"
            disabled={busy}
            onClick={onCancel}
            ref={cancelButtonRef}
            type="button"
          >
            Cancel
          </button>
          <button
            className="action-btn"
            disabled={busy}
            onClick={onConfirm}
            type="button"
          >
            {busy ? busyLabel : actionLabel}
          </button>
        </div>
      </section>
    </div>
  );

  return typeof document === "undefined" ? content : createPortal(content, document.body);
}
