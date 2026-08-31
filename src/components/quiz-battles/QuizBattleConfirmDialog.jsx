import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Clock3, LockKeyhole } from "lucide-react";

const ACTION_ICONS = {
  cancel: AlertTriangle,
  start: Clock3,
  submit: LockKeyhole,
};

export default function QuizBattleConfirmDialog({
  action = null,
  fallbackFocusRef,
  onCancel,
  onConfirm,
  open = false,
}) {
  const dialogRef = useRef(null);
  const cancelButtonRef = useRef(null);
  const actionKind = action?.kind || "battle";
  const titleId = `quiz-battle-confirm-${actionKind}-title`;
  const descriptionId = `quiz-battle-confirm-${actionKind}-description`;
  const ActionIcon = ACTION_ICONS[actionKind] || LockKeyhole;

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;

    const previousFocus = document.activeElement;
    const fallbackFocusTarget = fallbackFocusRef?.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => {
      cancelButtonRef.current?.focus({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      const previousFocusAvailable = previousFocus?.isConnected && !previousFocus?.disabled;
      const focusTarget = previousFocusAvailable ? previousFocus : fallbackFocusTarget;
      focusTarget?.focus?.({ preventScroll: true });
    };
  }, [fallbackFocusRef, open]);

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
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

  if (!open || !action) return null;

  const content = (
    <div
      className="confirm-modal-backdrop quiz-battle-confirm-backdrop"
      onKeyDown={handleKeyDown}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel?.();
      }}
    >
      <section
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className={`confirm-modal quiz-battle-confirm-dialog is-${action.tone || "info"}`}
        ref={dialogRef}
        role="alertdialog"
      >
        <div className={`confirm-modal-icon quiz-battle-confirm-dialog__icon is-${action.tone || "info"}`}>
          <ActionIcon aria-hidden="true" size={23} />
        </div>
        <div className="confirm-modal-copy quiz-battle-confirm-dialog__copy">
          <span className="section-tag">Quiz Battle</span>
          <h2 id={titleId}>{action.title}</h2>
          <p id={descriptionId}>{action.description}</p>
          {action.note && <small>{action.note}</small>}
        </div>
        <div className="confirm-modal-actions quiz-battle-confirm-dialog__actions">
          <button
            className="secondary-btn"
            onClick={onCancel}
            ref={cancelButtonRef}
            type="button"
          >
            {action.cancelLabel}
          </button>
          <button
            className={action.tone === "danger" ? "confirm-danger-btn" : "primary-btn"}
            onClick={onConfirm}
            type="button"
          >
            {action.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );

  return typeof document === "undefined" ? content : createPortal(content, document.body);
}
