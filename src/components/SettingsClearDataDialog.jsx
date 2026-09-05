import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Check, ShieldCheck, Trash2 } from "lucide-react";

export default function SettingsClearDataDialog({
  busy = false,
  onCancel,
  onConfirm,
  open = false,
  returnFocusRef,
}) {
  const dialogRef = useRef(null);
  const cancelButtonRef = useRef(null);

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;

    const previousFocus = document.activeElement;
    const returnFocusTarget = returnFocusRef?.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusFrame = window.requestAnimationFrame(() => {
      cancelButtonRef.current?.focus({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      window.requestAnimationFrame(() => {
        const focusTarget = returnFocusTarget?.isConnected ? returnFocusTarget : previousFocus;
        focusTarget?.focus?.({ preventScroll: true });
      });
    };
  }, [open, returnFocusRef]);

  if (!open) return null;

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
    if (!focusable.length) return;

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
      className="confirm-modal-backdrop settings-clear-data-backdrop"
      onKeyDown={handleKeyDown}
      onMouseDown={handleBackdropMouseDown}
    >
      <section
        aria-busy={busy}
        aria-describedby="settings-clear-data-description"
        aria-labelledby="settings-clear-data-title"
        aria-modal="true"
        className="confirm-modal danger settings-clear-data-dialog"
        ref={dialogRef}
        role="alertdialog"
      >
        <div className="confirm-modal-icon danger settings-clear-data-dialog__icon" aria-hidden="true">
          <AlertTriangle size={22} />
        </div>

        <div className="confirm-modal-copy settings-clear-data-dialog__copy">
          <span className="section-tag">Confirmation required</span>
          <h2 id="settings-clear-data-title">Clear workspace data?</h2>
          <p id="settings-clear-data-description">
            This permanently clears study data from your active academic profile. This action cannot be undone.
          </p>
        </div>

        <div className="settings-clear-data-dialog__summary">
          <div>
            <Trash2 aria-hidden="true" size={17} />
            <span>
              <strong>Will be cleared</strong>
              Subjects, schedules, progress, bookmarks, goals, and to-do tasks
            </span>
          </div>
          <div className="is-safe">
            <ShieldCheck aria-hidden="true" size={17} />
            <span>
              <strong>Will stay</strong>
              Your account, academic profile, and appearance settings
            </span>
            <Check aria-hidden="true" className="settings-clear-data-dialog__check" size={16} />
          </div>
        </div>

        <div className="confirm-modal-actions settings-clear-data-dialog__actions">
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
            className="confirm-danger-btn"
            disabled={busy}
            onClick={onConfirm}
            type="button"
          >
            <Trash2 aria-hidden="true" size={16} />
            {busy ? "Clearing..." : "Clear Data"}
          </button>
        </div>
      </section>
    </div>
  );

  return typeof document === "undefined" ? content : createPortal(content, document.body);
}
