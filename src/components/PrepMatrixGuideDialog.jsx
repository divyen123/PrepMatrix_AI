import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { Sparkles, X } from "lucide-react";
import { getAcademicProfileExamples } from "../utils/academicProfileExamples";
import Stepper, { Step } from "./Stepper";

function getFocusableElements(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(
    'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  ));
}

function PrepMatrixGuideDialog({ academicProfile = {}, open, onClose, userName = "", variant = "manual" }) {
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const isOnboarding = variant === "onboarding";
  const curriculumExamples = useMemo(
    () => getAcademicProfileExamples(academicProfile),
    [academicProfile]
  );

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;

    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTimer = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current?.("escape");
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = getFocusableElements(dialogRef.current);
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

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  const displayName = String(userName || "").trim();
  const dialog = (
    <div
      className={`prep-guide-backdrop${isOnboarding ? " prep-guide-backdrop--onboarding" : ""}`}
      onMouseDown={(event) => {
        if (!isOnboarding && event.target === event.currentTarget) onCloseRef.current?.("backdrop");
      }}
      role="presentation"
    >
      <section
        aria-labelledby="prep-guide-title"
        aria-modal="true"
        className="prep-guide-dialog"
        ref={dialogRef}
        role="dialog"
      >
        <header className="prep-guide-header">
          <span aria-hidden="true" className="prep-guide-mark"><Sparkles size={19} /></span>
          <div>
            <h2 id="prep-guide-title">
              {isOnboarding
                ? `Welcome to PrepMatrix${displayName ? `, ${displayName}` : ""}`
                : "How to use PrepMatrix"}
            </h2>
            <p>Get started in four quick steps.</p>
          </div>
          <button
            aria-label="Close guide"
            className="prep-guide-close"
            onClick={() => onCloseRef.current?.("close")}
            ref={closeButtonRef}
            title="Close guide"
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>

        <Stepper
          backButtonText="Back"
          disableStepIndicators={false}
          nextButtonText="Next"
          onFinalStepCompleted={() => onCloseRef.current?.("finish")}
        >
          <Step>
            <span className="prep-guide-step-count">Step 1 of 4</span>
            <h3>Set up your profile</h3>
            <p>Add your academic details in Settings so your study workspace fits your course.</p>
          </Step>
          <Step>
            <span className="prep-guide-step-count">Step 2 of 4</span>
            <h3>Add your subjects</h3>
            <p>Add a subject such as {curriculumExamples.subject}, then list the chapters you want to study.</p>
          </Step>
          <Step>
            <span className="prep-guide-step-count">Step 3 of 4</span>
            <h3>Plan and practice</h3>
            <p>Make a daily plan, then use Start Learning, Notes, and Quiz to work through it.</p>
          </Step>
          <Step>
            <span className="prep-guide-step-count">Step 4 of 4</span>
            <h3>See your progress</h3>
            <p>Complete your tasks and check Analytics to decide what to focus on next.</p>
          </Step>
        </Stepper>
      </section>
    </div>
  );

  return typeof document === "undefined" ? dialog : createPortal(dialog, document.body);
}

export default PrepMatrixGuideDialog;
