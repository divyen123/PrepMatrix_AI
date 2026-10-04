import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Layers3, Repeat2, ShieldCheck, Sparkles, X } from "lucide-react";
import Stepper, { Step } from "./Stepper";
import "./AcademicProfilesGuide.css";
import "./AcademicProfileIntroDialog.css";

const EXIT_DURATION_MS = 480;
const STEP_LABELS = ["Welcome", "Keep A", "Separate", "Switch"];

function getFocusableElements(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(
    'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  ));
}

export default function AcademicProfileIntroDialog({
  activeProfileLabel = "Profile B",
  onClose,
  open = false,
  otherProfileLabel = "Profile A",
  userName = "",
}) {
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const [guideSession, setGuideSession] = useState(0);
  const [previewProfile, setPreviewProfile] = useState("b");
  const [entered, setEntered] = useState(false);
  const [rendered, setRendered] = useState(open);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (open) {
      setGuideSession((session) => session + 1);
      setPreviewProfile("b");
    }
  }, [open]);

  useEffect(() => {
    let animationFrame;
    let exitTimer;

    if (open) {
      setRendered(true);
      animationFrame = window.requestAnimationFrame(() => setEntered(true));
    } else {
      setEntered(false);
      if (rendered) {
        exitTimer = window.setTimeout(() => setRendered(false), EXIT_DURATION_MS);
      }
    }

    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      if (exitTimer) window.clearTimeout(exitTimer);
    };
  }, [open, rendered]);

  useEffect(() => {
    if (!open || !rendered) return undefined;

    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current?.("escape");
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = getFocusableElements(dialogRef.current);
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

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open, rendered]);

  if (!rendered || typeof document === "undefined") return null;

  const displayName = String(userName || "").trim();
  const requestClose = (reason) => onCloseRef.current?.(reason);
  const previewLabel = previewProfile === "a" ? otherProfileLabel : activeProfileLabel;

  return createPortal(
    <div
      aria-hidden={!open}
      className={`academic-profile-intro-backdrop${entered ? " is-open" : " is-closing"}`}
      inert={!open ? true : undefined}
      role="presentation"
    >
      <section
        aria-describedby="academic-profile-intro-description"
        aria-labelledby="academic-profile-intro-title"
        aria-modal="true"
        className="academic-profile-intro-dialog is-compact"
        ref={dialogRef}
        role="dialog"
      >
        <header className="academic-profile-intro-header">
          <div>
            <h2 id="academic-profile-intro-title">
              Welcome{displayName ? `, ${displayName}` : ""}
            </h2>
            <p id="academic-profile-intro-description">Four quick steps to use both profiles.</p>
          </div>
          <button
            aria-label="Close profile guide"
            className="academic-profile-intro-close"
            onClick={() => requestClose("close")}
            ref={closeButtonRef}
            title="Close guide"
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>

        <Stepper
          backButtonText="Previous"
          className="profile-intro-stepper"
          completeButtonText="Finish guide"
          key={guideSession}
          nextButtonText="Next"
          onFinalStepCompleted={() => requestClose("finish")}
          renderStepIndicator={({ step, currentStep, onStepClick }) => {
            const status = currentStep === step ? "active" : currentStep > step ? "complete" : "inactive";
            return (
              <button
                aria-current={currentStep === step ? "step" : undefined}
                aria-label={`Step ${step} of ${STEP_LABELS.length}: ${STEP_LABELS[step - 1]}`}
                className={`profile-intro-indicator is-${status}`}
                onClick={() => onStepClick(step)}
                type="button"
              >
                <span aria-hidden="true" className="profile-intro-indicator-circle">
                  {status === "complete" ? <CheckCircle2 size={18} /> : step}
                </span>
                <small>{STEP_LABELS[step - 1]}</small>
              </button>
            );
          }}
        >
          <Step>
            <article className="profile-intro-slide">
              <div className="profile-intro-step-heading">
                <span><Sparkles aria-hidden="true" size={22} /></span>
                <h3>{activeProfileLabel} is ready</h3>
              </div>
              <p>Use this space for a different class, course, or exam goal.</p>
              <ul>
                <li><CheckCircle2 aria-hidden="true" size={16} /><span>Start with fresh subjects and a new study plan.</span></li>
                <li><CheckCircle2 aria-hidden="true" size={16} /><span>Check the current profile before adding study work.</span></li>
              </ul>
            </article>
          </Step>
          <Step>
            <article className="profile-intro-slide">
              <div className="profile-intro-step-heading">
                <span><ShieldCheck aria-hidden="true" size={22} /></span>
                <h3>{otherProfileLabel} stays safe</h3>
              </div>
              <p>Your original subjects, notes, planner, and progress stay in {otherProfileLabel}.</p>
              <ul>
                <li><CheckCircle2 aria-hidden="true" size={16} /><span>Return to your original workspace whenever you need it.</span></li>
                <li><CheckCircle2 aria-hidden="true" size={16} /><span>Switching keeps each profile’s study work separate.</span></li>
              </ul>
            </article>
          </Step>
          <Step>
            <article className="profile-intro-slide">
              <div className="profile-intro-step-heading">
                <span><Layers3 aria-hidden="true" size={22} /></span>
                <h3>Separate study. Shared account.</h3>
              </div>
              <p>Each profile has its own learning workspace.</p>
              <dl className="profile-intro-boundaries">
                <div><dt>Per profile</dt><dd>Subjects · Planner · Notes · Progress</dd></div>
                <div><dt>Shared</dt><dd>Sign-in · Security · AI credits</dd></div>
              </dl>
            </article>
          </Step>
          <Step>
            <article className="profile-intro-slide">
              <div className="profile-intro-step-heading">
                <span><Repeat2 aria-hidden="true" size={22} /></span>
                <h3>Switch when you need</h3>
              </div>
              <p>In Settings, check the Current label, choose Visit beside a profile, and wait for its workspace to load.</p>
              <div className="profile-intro-preview">
                <p>Try a preview</p>
                <div aria-label="Profile switch preview" role="group">
                  <button aria-pressed={previewProfile === "a"} onClick={() => setPreviewProfile("a")} type="button">{otherProfileLabel}</button>
                  <button aria-pressed={previewProfile === "b"} onClick={() => setPreviewProfile("b")} type="button">{activeProfileLabel}</button>
                </div>
                <p role="status">Preview: viewing {previewLabel}. Your active profile stays {activeProfileLabel}.</p>
              </div>
            </article>
          </Step>
        </Stepper>
      </section>
    </div>,
    document.body,
  );
}
