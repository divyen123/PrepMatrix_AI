import { createElement, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BookOpen,
  Calendar,
  CheckCircle2,
  Lightbulb,
  Sparkles,
  StickyNote,
  Target,
  X,
} from "lucide-react";

const GUIDE_STEPS = [
  {
    icon: Target,
    label: "Set your profile",
    title: "Choose the right learning profile",
    route: "/subjects",
    action: "Open Subjects",
    summary: "Start by telling PrepMatrix what and how you study so its suggestions stay relevant.",
    instructions: [
      "Open Subjects from the sidebar.",
      "Choose your student class and board or stream in the Class profile card.",
      "Use the profile that matches your current syllabus; materials and AI suggestions use it as context.",
    ],
    tip: "You can update the learning profile later without recreating your account.",
  },
  {
    icon: BookOpen,
    label: "Add subjects",
    title: "Build your complete subject list",
    route: "/subjects",
    action: "Add Subjects",
    summary: "Add every subject that should appear in the study schedule before generating a plan.",
    instructions: [
      "Enter a clear subject name, such as Mathematics or Data Structures.",
      "Add the total number of chapters or study units you need to cover.",
      "Set the difficulty to Easy, Medium, or Hard so the planner can balance the workload.",
      "Select Add subject and repeat for the rest of your syllabus. Review or edit entries in Subject library.",
    ],
    tip: "Accurate chapter counts and difficulty levels produce a more useful timetable.",
  },
  {
    icon: Calendar,
    label: "Plan your exam",
    title: "Set the exam date and study strategy",
    route: "/planner",
    action: "Open Planner",
    summary: "Turn your subject list into a focused schedule based on the time available before the exam.",
    instructions: [
      "Open Planner after you have added at least one subject.",
      "Choose a future Exam date.",
      "Select an Exam strategy: Balanced coverage, High priority first, Revision-heavy, or Rapid coverage.",
      "Select Generate schedule. Plans are limited to 30 days to keep the daily view focused.",
    ],
    tip: "Balanced coverage is a reliable starting point; use Revision-heavy when the exam is close and most topics are familiar.",
  },
  {
    icon: CheckCircle2,
    label: "Follow the plan",
    title: "Complete daily tasks and recover missed work",
    route: "/planner",
    action: "View Schedule",
    summary: "Use the generated timetable as your daily checklist and keep it accurate as you study.",
    instructions: [
      "Work through each Day card and mark a task complete only after finishing it.",
      "Use Recover backlog to move incomplete work forward when a day does not go as planned.",
      "Use Rebalance to smooth overloaded days, and Undo if you want to restore the previous layout.",
      "Create a New schedule when your exam date or priorities change; export the plan when you need a PDF copy.",
      "Use the Goal & Reminder Center for dated goals, study nudges, and quick to-dos.",
    ],
    tip: "Update task completion daily—Dashboard readiness and Analytics depend on this progress.",
  },
  {
    icon: StickyNote,
    label: "Study & revise",
    title: "Use notes, quizzes, and materials together",
    route: "/notes",
    action: "Open Notes",
    summary: "Support the timetable with focused learning tools instead of keeping study information in separate places.",
    instructions: [
      "Use Notes to save chapter summaries, doubts, and topics that still need attention.",
      "Open Quiz for topic-level practice and use the result to identify weak areas.",
      "Use Materials for syllabus-aware videos, articles, and references; bookmark useful resources for revision.",
      "Select the sidebar pet to open the AI study companion for explanations, outlines, or planner-aware advice.",
      "After reaching 80% planner completion, use Exam for a secure online attempt or a printable question paper.",
    ],
    tip: "Keep one short note for each difficult topic, then quiz yourself after revising it.",
  },
  {
    icon: BarChart3,
    label: "Review progress",
    title: "Measure progress and adjust the next week",
    route: "/analytics",
    action: "View Analytics",
    summary: "Use your completion data to decide what needs attention rather than relying on guesswork.",
    instructions: [
      "Check Dashboard for the current overview, momentum, and upcoming work.",
      "Open Analytics to review completion patterns, workload distribution, and exam readiness.",
      "Use Report for a detailed subject breakdown and exportable PDF summary.",
      "Return to Planner to rebalance or create a new schedule when the data shows a workload problem.",
    ],
    tip: "Review Analytics at least once a week and adjust the plan before unfinished work becomes a backlog.",
  },
];

function getFocusableElements(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(
    'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  ));
}

function PrepMatrixGuideDialog({ open, onClose, userName = "", variant = "manual" }) {
  const navigate = useNavigate();
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const [activeStep, setActiveStep] = useState(0);
  const isOnboarding = variant === "onboarding";
  const step = GUIDE_STEPS[activeStep];

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;

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
    navigate(step.route);
  };
  const displayName = String(userName || "").trim();

  return createPortal(
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
        className="guide-dialog"
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
                : "How to use PrepMatrix AI"}
            </h2>
            <p id="guide-dialog-description">
              {isOnboarding
                ? "Here’s the quickest path from your first subject to a confident weekly review."
                : "Follow these six steps from first setup to weekly progress review."}
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
          <span style={{ width: `${((activeStep + 1) / GUIDE_STEPS.length) * 100}%` }} />
        </div>

        <div className="guide-dialog-body">
          <nav aria-label="Guide steps" className="guide-step-nav">
            {GUIDE_STEPS.map(({ icon: Icon, label }, index) => (
              <button
                aria-current={activeStep === index ? "step" : undefined}
                className={activeStep === index ? "active" : ""}
                key={label}
                onClick={() => setActiveStep(index)}
                type="button"
              >
                <span className="guide-step-number">
                  {activeStep > index ? <CheckCircle2 aria-hidden="true" size={15} /> : index + 1}
                </span>
                <span className="guide-step-icon">{createElement(Icon, { "aria-hidden": true, size: 16 })}</span>
                <span>{label}</span>
              </button>
            ))}
          </nav>

          <article className="guide-step-content" key={step.label}>
            <div className="guide-step-eyebrow">
              <span>Step {activeStep + 1} of {GUIDE_STEPS.length}</span>
              <span>{step.label}</span>
            </div>
            <h3>{step.title}</h3>
            <p className="guide-step-summary">{step.summary}</p>
            <ol className="guide-instruction-list">
              {step.instructions.map((instruction, index) => (
                <li key={instruction}><span>{index + 1}</span><p>{instruction}</p></li>
              ))}
            </ol>
            <div className="guide-tip">
              <Lightbulb aria-hidden="true" size={17} />
              <p><strong>Helpful tip</strong>{step.tip}</p>
            </div>
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
          <span aria-live="polite">{activeStep + 1} / {GUIDE_STEPS.length}</span>
          <div>
            <button className="guide-compact-btn route" onClick={goToStepPage} type="button">{step.action}</button>
            {activeStep < GUIDE_STEPS.length - 1 ? (
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
    </div>,
    document.body
  );
}

export default PrepMatrixGuideDialog;
