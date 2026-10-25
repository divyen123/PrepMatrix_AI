import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDownUp, ListOrdered } from "lucide-react";
import { PLANNER_SCHEDULE_REORDER_MODES } from "../utils/plannerScheduleReorder";
import "./PlannerScheduleReorderDialog.css";

const OPTIONS = [
  {
    description: "Use each subject's saved topic order, then its chapters from Chapter 1 onward.",
    label: "Order-wise",
    value: PLANNER_SCHEDULE_REORDER_MODES.SEQUENCE,
  },
  {
    description: "Study Hard subjects first, then Medium, then Easy. Saved order stays intact within each group.",
    label: "Priority-wise",
    value: PLANNER_SCHEDULE_REORDER_MODES.PRIORITY,
  },
];

export default function PlannerScheduleReorderDialog({
  busy = false,
  onApply = () => {},
  onClose = () => {},
  open = false,
  returnFocusRef,
}) {
  const [mode, setMode] = useState(PLANNER_SCHEDULE_REORDER_MODES.SEQUENCE);
  const dialogRef = useRef(null);
  const cancelButtonRef = useRef(null);
  const previousFocusRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (open) setMode(PLANNER_SCHEDULE_REORDER_MODES.SEQUENCE);
  }, [open]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;

    previousFocusRef.current = document.activeElement;
    const returnFocusTarget = returnFocusRef?.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusFrame = window.requestAnimationFrame(() => {
      cancelButtonRef.current?.focus({ preventScroll: true });
    });

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll(
        'button:not([disabled]), input:not([disabled])',
      ));
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable.at(-1);
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
      document.body.style.overflow = previousOverflow;

      const focusTarget = returnFocusTarget?.isConnected
        ? returnFocusTarget
        : previousFocusRef.current?.isConnected
          ? previousFocusRef.current
          : null;
      focusTarget?.focus?.({ preventScroll: true });
    };
  }, [busy, onClose, open, returnFocusRef]);

  const content = (
    <div
      aria-hidden={!open}
      className={"confirm-modal-backdrop planner-reorder-backdrop " + (open ? "is-open" : "is-closed")}
      inert={!open}
      onMouseDown={(event) => {
        if (!busy && event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-busy={busy}
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="confirm-modal planner-reorder-dialog"
        id="planner-reorder-dialog"
        ref={dialogRef}
        role="dialog"
      >
        <div className="planner-reorder-heading">
          <span className="confirm-modal-icon" aria-hidden="true">
            <ArrowDownUp size={21} />
          </span>
          <div className="confirm-modal-copy">
            <h2 id={titleId}>Reorder unfinished tasks</h2>
            <p id={descriptionId}>
              Completed tasks, recall sessions, notes, learning tasks, dates, and time slots stay unchanged.
            </p>
          </div>
        </div>

        <fieldset className="planner-reorder-options">
          <legend>Choose an order</legend>
          {OPTIONS.map((option) => (
            <label
              className={"planner-reorder-option" + (mode === option.value ? " is-selected" : "")}
              key={option.value}
            >
              <input
                checked={mode === option.value}
                disabled={busy}
                name="planner-reorder-mode"
                onChange={() => setMode(option.value)}
                type="radio"
                value={option.value}
              />
              <span className="planner-reorder-option-icon" aria-hidden="true">
                <ListOrdered size={17} />
              </span>
              <span>
                <strong>{option.label}</strong>
                <small>{option.description}</small>
              </span>
            </label>
          ))}
        </fieldset>

        <p className="planner-reorder-note" role="note">
          You can undo this once after it is applied.
        </p>

        <div className="confirm-modal-actions">
          <button
            className="secondary-btn"
            disabled={busy}
            onClick={onClose}
            ref={cancelButtonRef}
            type="button"
          >
            Cancel
          </button>
          <button
            className="action-btn planner-reorder-apply-btn"
            disabled={busy}
            onClick={() => onApply(mode)}
            type="button"
          >
            {busy ? "Reordering…" : "Apply reorder"}
          </button>
        </div>
      </section>
    </div>
  );

  return typeof document === "undefined" ? content : createPortal(content, document.body);
}
