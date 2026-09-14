import { createElement, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BookOpen,
  BrainCircuit,
  Calendar,
  CheckCircle2,
  Sparkles,
  StickyNote,
  Target,
  X,
} from "lucide-react";
import { getAcademicProfileExamples } from "../utils/academicProfileExamples";
import PrepMatrixGuideDemo from "./PrepMatrixGuideDemo";

const GUIDE_STEPS = [
  {
    id: "profile", icon: Target, label: "Your profile",
    title: "Make learning fit you",
    route: "/settings", routeState: { highlightProfileInstitution: true }, action: "Open Settings",
    hint: "See how your academic profile gives your study tools context.",
  },
  {
    id: "subjects", icon: BookOpen, label: "Add subjects",
    title: "A subject becomes a study plan",
    route: "/subjects#add-subject", action: "Open Subjects",
    hint: "Add a subject, choose its difficulty, and watch your library grow.",
  },
  {
    id: "plan", icon: Calendar, label: "Make a plan",
    title: "Turn chapters into study days",
    route: "/planner/schedule", action: "Open Planner",
    hint: "Choose a strategy and see how your schedule takes shape.",
  },
  {
    id: "learn", icon: BrainCircuit, label: "Start learning",
    title: "See your material come together",
    route: "/learn#notebook-preparation", action: "Start Learning",
    hint: "Build a notebook, add a topic to your planner, then complete it.",
  },
  {
    id: "follow", icon: CheckCircle2, label: "Daily progress",
    title: "Small wins move you forward",
    route: "/planner/schedule", action: "View Schedule",
    hint: "Complete a task and move missed work to a new day.",
  },
  {
    id: "revise", icon: StickyNote, label: "Study & revise",
    title: "Remember more with a quick review",
    route: "/notes", action: "Open Notes",
    hint: "Try a note, a practice question, and a saved learning resource.",
  },
  {
    id: "review", icon: BarChart3, label: "See your progress",
    title: "Know what to work on next",
    route: "/analytics", action: "View Analytics",
    hint: "Select a progress lane to find your next study priority.",
  },
];

function getFocusableElements(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(
    'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  ));
}

function PrepMatrixGuideDialog({ academicProfile = {}, open, onClose, userName = "", variant = "manual" }) {
  const navigate = useNavigate();
  const dialogRef = useRef(null);
  const stepNavRef = useRef(null);
  const closeButtonRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const [activeStep, setActiveStep] = useState(0);
  const isOnboarding = variant === "onboarding";
  const curriculumExamples = useMemo(
    () => getAcademicProfileExamples(academicProfile),
    [academicProfile]
  );
  const guideSteps = useMemo(() => GUIDE_STEPS.map((guideStep, index) => (
    index === 1
      ? {
          ...guideStep,
          hint: `Try a subject such as ${curriculumExamples.subject}, then add it to the preview.`,
        }
      : guideStep
  )), [curriculumExamples.subject]);
  const step = guideSteps[activeStep];

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const nav = stepNavRef.current;
    const selected = nav?.querySelector('[aria-current="step"]');
    if (!open || !selected || nav.scrollWidth <= nav.clientWidth) return;
    const navBounds = nav.getBoundingClientRect();
    const selectedBounds = selected.getBoundingClientRect();
    nav.scrollTo({
      left: nav.scrollLeft + selectedBounds.left - navBounds.left - (nav.clientWidth - selectedBounds.width) / 2,
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }, [activeStep, open]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;

    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    setActiveStep(0);
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

  const closeGuide = (reason) => onCloseRef.current?.(reason);
  const goToStepPage = () => {
    closeGuide("route");
    navigate(step.route, { state: step.routeState });
  };
  const displayName = String(userName || "").trim();

  const dialog = (
    <div
      className={`guide-dialog-backdrop${isOnboarding ? " guide-dialog-backdrop--onboarding" : ""}`}
      onMouseDown={(event) => {
        if (!isOnboarding && event.target === event.currentTarget) closeGuide("backdrop");
      }}
      role="presentation"
    >
      <section
        aria-describedby="guide-dialog-description"
        aria-labelledby="guide-dialog-title"
        aria-modal="true"
        className="guide-dialog guide-dialog--visual"
        ref={dialogRef}
        role="dialog"
      >
        <header className="guide-dialog-header">
          <div className="guide-dialog-mark"><Sparkles aria-hidden="true" size={20} /></div>
          <div>
            <span className="section-tag">{isOnboarding ? "First-time setup guide" : "Quick start guide"}</span>
            <h2 id="guide-dialog-title">
              {isOnboarding
                ? `Welcome to PrepMatrix${displayName ? `, ${displayName}` : ""}`
                : "Learn PrepMatrix by doing"}
            </h2>
            <p id="guide-dialog-description">
              Try a mini demo or watch it unfold, then use it in your workspace.
            </p>
          </div>
          <button
            aria-label="Close guide"
            className="guide-dialog-close"
            onClick={() => closeGuide("close")}
            ref={closeButtonRef}
            title="Close guide"
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>

        <div className="guide-dialog-progress" aria-hidden="true">
          <span style={{ width: `${((activeStep + 1) / guideSteps.length) * 100}%` }} />
        </div>

        <div className="guide-dialog-body">
          <nav aria-label="Guide steps" className="guide-step-nav" ref={stepNavRef}>
            {guideSteps.map(({ icon: Icon, label }, index) => (
              <button
                aria-current={activeStep === index ? "step" : undefined}
                className={activeStep === index ? "active" : ""}
                key={label}
                onClick={() => setActiveStep(index)}
                type="button"
              >
                <span className="guide-step-number">
                  {index + 1}
                </span>
                <span className="guide-step-icon">{createElement(Icon, { "aria-hidden": true, size: 16 })}</span>
                <span>{label}</span>
              </button>
            ))}
          </nav>

          <article className="guide-step-content" key={step.label}>
            <div className="guide-step-eyebrow">
              <span>Step {activeStep + 1} of {guideSteps.length}</span>
            </div>
            <h3>{step.title}</h3>
            <p className="guide-step-summary">{step.hint}</p>
            <PrepMatrixGuideDemo
              key={step.id}
              stepId={step.id}
              examples={curriculumExamples}
              profileLabel={curriculumExamples.contextLabel}
            />
          </article>
        </div>

        <footer className="guide-dialog-actions">
          <button
            className="guide-compact-btn secondary"
            disabled={activeStep === 0}
            onClick={() => setActiveStep((value) => value - 1)}
            type="button"
          >
            <ArrowLeft aria-hidden="true" size={14} /> Previous
          </button>
          <span aria-live="polite">{activeStep + 1} / {guideSteps.length} · {step.label}</span>
          <div>
            <button className="guide-compact-btn route" onClick={goToStepPage} type="button">{step.action}</button>
            {activeStep < guideSteps.length - 1 ? (
              <button className="guide-compact-btn primary" onClick={() => setActiveStep((value) => value + 1)} type="button">
                Next step <ArrowRight aria-hidden="true" size={14} />
              </button>
            ) : (
              <button className="guide-compact-btn primary" onClick={() => closeGuide("finish")} type="button">
                Finish guide <CheckCircle2 aria-hidden="true" size={14} />
              </button>
            )}
          </div>
        </footer>
      </section>
    </div>
  );

  return typeof document === "undefined" ? dialog : createPortal(dialog, document.body);
}

export default PrepMatrixGuideDialog;
