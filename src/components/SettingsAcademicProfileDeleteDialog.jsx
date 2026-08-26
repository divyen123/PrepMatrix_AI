import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Trash2 } from "lucide-react";
import { describeAcademicProfileSlot } from "../utils/academicProfileSlots";
import { getAcademicProfileDisplayName } from "../utils/academicProfileNames";
import "./SettingsAcademicProfileDeleteDialog.css";

export default function SettingsAcademicProfileDeleteDialog({
  activeProfileId = "",
  busy = false,
  fallbackFocusRef,
  onCancel,
  onConfirm,
  onSelectionChange,
  open = false,
  profiles = [],
  returnFocusRef,
  selectedProfileId = "",
}) {
  const dialogRef = useRef(null);
  const cancelButtonRef = useRef(null);
  const pendingDeletionProfile = profiles.find((profile) => profile.deletionPending) || null;

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
          : previousFocus?.isConnected
            ? previousFocus
            : null;
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
    const focusable = Array.from(dialogRef.current.querySelectorAll(
      'input:not([disabled]), button:not([disabled])',
    ));
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
      className={`confirm-modal-backdrop settings-academic-confirm-backdrop settings-profile-delete-backdrop ${open ? "is-open" : "is-closed"}`}
      inert={!open}
      onKeyDown={handleKeyDown}
      onMouseDown={handleBackdropMouseDown}
    >
      <section
        aria-busy={busy}
        aria-describedby="settings-profile-delete-description"
        aria-labelledby="settings-profile-delete-title"
        aria-modal="true"
        className="confirm-modal danger settings-academic-confirm settings-profile-delete-dialog"
        id="settings-profile-delete-dialog"
        ref={dialogRef}
        role="alertdialog"
      >
        <div className="confirm-modal-icon danger settings-academic-confirm__icon">
          <Trash2 aria-hidden="true" size={21} />
        </div>

        <div className="confirm-modal-copy settings-academic-confirm__copy">
          <h2 id="settings-profile-delete-title">Delete an academic profile?</h2>
          <p id="settings-profile-delete-description">
            {pendingDeletionProfile
              ? `${getAcademicProfileDisplayName(pendingDeletionProfile)} still needs deletion cleanup. Retry that profile to finish. `
              : "Choose one profile to permanently remove. "}
            Its subjects, planner and completion history,
            notes, quizzes and battles, learning records, exams, saved materials, resume data,
            reminders, chats, and kids progress will be deleted. Files already downloaded to your
            device are not affected. The remaining profile will become current if needed.
          </p>
        </div>

        <fieldset className="settings-profile-delete-options">
          <legend>Select profile</legend>
          {profiles.map((profile) => {
            const isCurrent = profile.id === activeProfileId;
            return (
              <label
                className={`settings-profile-delete-option${selectedProfileId === profile.id ? " is-selected" : ""}`}
                key={profile.id}
              >
                <input
                  checked={selectedProfileId === profile.id}
                  disabled={busy || Boolean(
                    pendingDeletionProfile
                    && pendingDeletionProfile.id !== profile.id
                  )}
                  name="academic-profile-to-delete"
                  onChange={() => onSelectionChange?.(profile.id)}
                  type="radio"
                  value={profile.id}
                />
                <span>
                  <strong>{getAcademicProfileDisplayName(profile)}</strong>
                  <small>{describeAcademicProfileSlot(profile) || "Academic profile"}</small>
                </span>
                {isCurrent
                  ? <em>Current</em>
                  : profile.deletionPending
                    ? <em>Retry deletion</em>
                    : null}
              </label>
            );
          })}
        </fieldset>

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
            className="confirm-danger-btn"
            disabled={busy || !selectedProfileId}
            onClick={onConfirm}
            type="button"
          >
            {busy ? "Deleting..." : "Delete profile"}
          </button>
        </div>
      </section>
    </div>
  );

  return typeof document === "undefined" ? content : createPortal(content, document.body);
}
