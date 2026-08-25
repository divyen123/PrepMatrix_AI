import { createElement, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Layers3,
  Lightbulb,
  Repeat2,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { ACADEMIC_PROFILE_GUIDE_STEPS } from "../utils/academicProfileGuide";
import "./AcademicProfilesGuide.css";

const EXIT_DURATION_MS = 480;
const STEP_ICONS = Object.freeze({
  welcome: Sparkles,
  "profile-a-safe": ShieldCheck,
  "separate-workspaces": Layers3,
  switching: Repeat2,
});

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
  const [activeStep, setActiveStep] = useState(0);
  const [entered, setEntered] = useState(false);
  const [rendered, setRendered] = useState(open);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    let animationFrame;
    let exitTimer;

    if (open) {
      setRendered(true);
      setActiveStep(0);
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

  const step = ACADEMIC_PROFILE_GUIDE_STEPS[activeStep];
  const StepIcon = STEP_ICONS[step.id] || Sparkles;
  const displayName = String(userName || "").trim();
  const stepTitle = step.id === "welcome"
    ? `You are now in ${activeProfileLabel}`
    : step.title;
  const requestClose = (reason) => onCloseRef.current?.(reason);

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
        className="academic-profile-intro-dialog"
        ref={dialogRef}
        role="dialog"
      >
        <header className="academic-profile-intro-header">
          <div className="academic-profile-intro-mark">
            <Sparkles aria-hidden="true" size={22} />
          </div>
          <div>
            <span className="academic-profile-guide-kicker">Your two-profile guide</span>
            <h2 id="academic-profile-intro-title">
              Welcome{displayName ? `, ${displayName}` : ""}
            </h2>
            <p id="academic-profile-intro-description">
              A quick tour of how {otherProfileLabel} and {activeProfileLabel} work together.
            </p>
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

        <div className="academic-profile-intro-identity" aria-label="Academic profile relationship">
          <span className="is-profile-a"><b>A</b>{otherProfileLabel}<small>Your original workspace</small></span>
          <ArrowRight aria-hidden="true" size={19} />
          <span className="is-profile-b is-current"><b>B</b>{activeProfileLabel}<small>Current workspace</small></span>
        </div>

        <div
          aria-label={`Step ${activeStep + 1} of ${ACADEMIC_PROFILE_GUIDE_STEPS.length}`}
          aria-valuemax={ACADEMIC_PROFILE_GUIDE_STEPS.length}
          aria-valuemin={1}
          aria-valuenow={activeStep + 1}
          className="academic-profile-intro-progress"
          role="progressbar"
        >
          <span style={{ width: `${((activeStep + 1) / ACADEMIC_PROFILE_GUIDE_STEPS.length) * 100}%` }} />
        </div>

        <div className="academic-profile-intro-body">
          <nav aria-label="Profile guide steps" className="academic-profile-intro-step-nav">
            {ACADEMIC_PROFILE_GUIDE_STEPS.map((guideStep, index) => (
              <button
                aria-current={activeStep === index ? "step" : undefined}
                className={activeStep === index ? "is-active" : ""}
                key={guideStep.id}
                onClick={() => setActiveStep(index)}
                type="button"
              >
                <span>{activeStep > index
                  ? <CheckCircle2 aria-hidden="true" size={15} />
                  : index + 1}</span>
                {guideStep.label}
              </button>
            ))}
          </nav>

          <article
            aria-live="polite"
            className={`academic-profile-intro-step tone-${step.tone}`}
            key={step.id}
          >
            <div className="academic-profile-intro-step-icon">
              {createElement(StepIcon, { "aria-hidden": true, size: 25 })}
            </div>
            <span>Step {activeStep + 1} of {ACADEMIC_PROFILE_GUIDE_STEPS.length}</span>
            <h3>{stepTitle}</h3>
            <p>{step.summary}</p>
            <ul>
              {step.points.map((point) => (
                <li key={point}><CheckCircle2 aria-hidden="true" size={16} /><span>{point}</span></li>
              ))}
            </ul>
            <aside>
              <Lightbulb aria-hidden="true" size={17} />
              <div><strong>Helpful tip</strong><p>{step.tip}</p></div>
            </aside>
          </article>
        </div>

        <footer className="academic-profile-intro-actions">
          <button
            className="academic-profile-guide-button is-secondary"
            disabled={activeStep === 0}
            onClick={() => setActiveStep((current) => Math.max(0, current - 1))}
            type="button"
          >
            <ArrowLeft aria-hidden="true" size={15} /> Previous
          </button>
          <span aria-live="polite">{activeStep + 1} / {ACADEMIC_PROFILE_GUIDE_STEPS.length}</span>
          {activeStep < ACADEMIC_PROFILE_GUIDE_STEPS.length - 1 ? (
            <button
              className="academic-profile-guide-button is-primary"
              onClick={() => setActiveStep((current) => current + 1)}
              type="button"
            >
              Next <ArrowRight aria-hidden="true" size={15} />
            </button>
          ) : (
            <button
              className="academic-profile-guide-button is-primary"
              onClick={() => requestClose("finish")}
              type="button"
            >
              Finish guide <CheckCircle2 aria-hidden="true" size={16} />
            </button>
          )}
        </footer>
      </section>
    </div>,
    document.body,
  );
}
