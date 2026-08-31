import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, PauseCircle, Swords, XCircle } from "lucide-react";
import "./QuizExitDialog.css";

export default function QuizExitDialog({
  busy = false,
  error = "",
  mode = "solo",
  onAbort,
  onPause,
  onStay,
  open = false,
}) {
  const dialogRef = useRef(null);
  const multiplayer = mode === "multiplayer";

  useEffect(() => {
    if (!open) return undefined;
    const previousActiveElement = document.activeElement;
    const frame = window.requestAnimationFrame(() => dialogRef.current?.focus());
    const handleKeyDown = (event) => {
      if (event.key !== "Escape" || busy) return;
      event.preventDefault();
      onStay?.();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      previousActiveElement?.focus?.();
    };
  }, [busy, onStay, open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="quiz-exit-backdrop" role="presentation">
      <section
        aria-describedby="quiz-exit-description"
        aria-labelledby="quiz-exit-title"
        aria-modal="true"
        className={`quiz-exit-dialog${multiplayer ? " is-multiplayer" : " is-solo"}`}
        onKeyDown={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="quiz-exit-dialog__icon" aria-hidden="true">
          {multiplayer ? <Swords size={25} /> : <AlertTriangle size={25} />}
        </div>
        <div className="quiz-exit-dialog__copy">
          <span className="section-tag">{multiplayer ? "Live multiplayer quiz" : "Quiz in progress"}</span>
          <h2 id="quiz-exit-title">
            {multiplayer ? "This quiz cannot be paused" : "What should happen to this quiz?"}
          </h2>
          <p id="quiz-exit-description">
            {multiplayer
              ? "Your timed battle is still active. Submit your answers or let the timer finish before going to another page."
              : "Pause to keep every answer and resume later, or end the attempt and record it as aborted in Quiz history."}
          </p>
          {error && <p className="quiz-exit-dialog__error" role="alert">{error}</p>}
        </div>

        <div className="quiz-exit-dialog__actions">
          <button
            className="quiz-exit-dialog__stay"
            disabled={busy}
            onClick={onStay}
            type="button"
          >
            {multiplayer ? "Continue quiz" : "Stay on quiz"}
          </button>
          {!multiplayer && (
            <>
              <button
                className="quiz-exit-dialog__pause"
                disabled={busy}
                onClick={onPause}
                type="button"
              >
                <PauseCircle aria-hidden="true" size={17} />
                Pause &amp; leave
              </button>
              <button
                className="quiz-exit-dialog__abort"
                disabled={busy}
                onClick={onAbort}
                type="button"
              >
                <XCircle aria-hidden="true" size={17} />
                {busy ? "Ending quiz…" : "End quiz"}
              </button>
            </>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}

