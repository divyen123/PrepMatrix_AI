import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Eye, EyeOff, LockKeyhole, Trash2 } from "lucide-react";
import { describeAcademicProfileSlot } from "../utils/academicProfileSlots";
import { getAcademicProfileDisplayName } from "../utils/academicProfileNames";
import "./SettingsAcademicProfileDeleteDialog.css";

export default function SettingsAcademicProfileDeleteDialog({
  activeProfileId = "",
  busy = false,
  confirmationStep = "select",
  errorMessage = "",
  fallbackFocusRef,
  onBack,
  onCancel,
  onConfirm,
  onPasswordChange,
  onPasswordVisibilityChange,
  onProceed,
  onSelectionChange,
  open = false,
  password = "",
  passwordVisible = false,
  profiles = [],
  returnFocusRef,
  selectedProfileId = "",
}) {
  const dialogRef = useRef(null);
  const cancelButtonRef = useRef(null);
  const passwordInputRef = useRef(null);
  const pendingDeletionProfile = profiles.find((profile) => profile.deletionPending) || null;
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) || null;
  const confirmingPassword = confirmationStep === "password";

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;

    const previousFocus = document.activeElement;
    const returnFocusTarget = returnFocusRef?.current;
    const fallbackFocusTarget = fallbackFocusRef?.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
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

  useEffect(() => {
    if (!open || typeof window === "undefined") return undefined;
    const focusFrame = window.requestAnimationFrame(() => {
      if (confirmingPassword) {
        passwordInputRef.current?.focus({ preventScroll: true });
      } else {
        cancelButtonRef.current?.focus({ preventScroll: true });
      }
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [confirmingPassword, open]);

  useEffect(() => {
    if (!open || !confirmingPassword || !errorMessage || typeof window === "undefined") {
      return undefined;
    }
    const focusFrame = window.requestAnimationFrame(() => {
      passwordInputRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [confirmingPassword, errorMessage, open]);

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
        aria-describedby={`settings-profile-delete-description${confirmingPassword && errorMessage ? " settings-profile-delete-password-error" : ""}`}
        aria-labelledby="settings-profile-delete-title"
        aria-modal="true"
        className="confirm-modal danger settings-academic-confirm settings-profile-delete-dialog"
        id="settings-profile-delete-dialog"
        ref={dialogRef}
        role="alertdialog"
      >
        <div className="confirm-modal-icon danger settings-academic-confirm__icon">
          {confirmingPassword
            ? <LockKeyhole aria-hidden="true" size={21} />
            : <Trash2 aria-hidden="true" size={21} />}
        </div>

        <div className="confirm-modal-copy settings-academic-confirm__copy">
          <h2 id="settings-profile-delete-title">
            {confirmingPassword ? "Confirm with your application password" : "Delete an academic profile?"}
          </h2>
          <p id="settings-profile-delete-description">
            {confirmingPassword ? (
              `Enter the password you use to sign in to PrepMatrix before permanently deleting ${getAcademicProfileDisplayName(selectedProfile) || "the selected profile"}.`
            ) : (
              <>
                {pendingDeletionProfile
                  ? `${getAcademicProfileDisplayName(pendingDeletionProfile)} still needs deletion cleanup. Retry that profile to finish. `
                  : "Choose one profile to permanently remove. "}
                Its subjects, planner and completion history,
                notes, quizzes and battles, learning records, exams, saved materials, resume data,
                reminders, chats, and kids progress will be deleted. Files already downloaded to your
                device are not affected. The remaining profile will become current if needed.
              </>
            )}
          </p>
        </div>

        {confirmingPassword ? (
          <div className="settings-profile-delete-password-step">
            <button
              className="settings-profile-delete-password-back"
              disabled={busy}
              onClick={onBack}
              type="button"
            >
              <ArrowLeft aria-hidden="true" size={14} /> Review selected profile
            </button>
            <div className="settings-profile-delete-selected-summary" role="status">
              <span><Trash2 aria-hidden="true" size={17} /></span>
              <div>
                <small>Selected profile</small>
                <strong>{getAcademicProfileDisplayName(selectedProfile) || "Academic profile"}</strong>
                <p>{describeAcademicProfileSlot(selectedProfile) || "Academic profile"}</p>
              </div>
            </div>
            <label className="settings-profile-delete-password-field" htmlFor="settings-profile-delete-password">
              <span>Application password</span>
              <div>
                <input
                  aria-invalid={Boolean(errorMessage)}
                  aria-required="true"
                  autoComplete="current-password"
                  disabled={busy}
                  id="settings-profile-delete-password"
                  onChange={(event) => onPasswordChange?.(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && password && !busy) {
                      event.preventDefault();
                      onConfirm?.(password);
                    }
                  }}
                  placeholder="Enter your current password"
                  ref={passwordInputRef}
                  required
                  type={passwordVisible ? "text" : "password"}
                  value={password}
                />
                <button
                  aria-label={passwordVisible ? "Hide password" : "Show password"}
                  aria-pressed={passwordVisible}
                  disabled={busy}
                  onClick={onPasswordVisibilityChange}
                  title={passwordVisible ? "Hide password" : "Show password"}
                  type="button"
                >
                  {passwordVisible
                    ? <EyeOff aria-hidden="true" size={16} />
                    : <Eye aria-hidden="true" size={16} />}
                </button>
              </div>
            </label>
            <p className="settings-profile-delete-password-hint">
              This is your account login password. It is checked securely and is not saved with the profile.
            </p>
            {errorMessage ? (
              <p className="settings-profile-delete-password-error" id="settings-profile-delete-password-error" role="alert">
                {errorMessage}
              </p>
            ) : null}
          </div>
        ) : (
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
        )}

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
            disabled={busy || (confirmingPassword ? !password : !selectedProfileId)}
            onClick={confirmingPassword ? () => onConfirm?.(password) : onProceed}
            type="button"
          >
            {busy ? "Deleting..." : confirmingPassword ? "Confirm deletion" : "Delete profile"}
          </button>
        </div>
      </section>
    </div>
  );

  return typeof document === "undefined" ? content : createPortal(content, document.body);
}
