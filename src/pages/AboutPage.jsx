import { createElement, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, BarChart3, Bell, BookOpen, Bot, Calendar,
  CheckCircle2, ClipboardList, GraduationCap, Library, Lightbulb, Mic, Network, Palette,
  PlayCircle, Sparkles, StickyNote, Target, TrendingUp, Trophy, X,
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

const FEATURES = [
  { icon: Calendar, title: "Smart Planner & Scheduler", desc: "Distributes study workloads, balances daily tasks by difficulty, and keeps missed work organized." },
  { icon: Bell, title: "Goals, Reminders & To-Dos", desc: "Tracks dated goals, scheduled reminders, quick tasks, study targets, and review nudges." },
  { icon: Bot, title: "AI Study Assistant", desc: "Explains doubts and uploaded images or PDFs, creates summaries, and uses planner context." },
  { icon: StickyNote, title: "Interactive Study Notes", desc: "Saves chapter summaries, doubts, and left-over topics for every subject." },
  { icon: Library, title: "Curated Study Materials", desc: "Organizes useful videos, articles, links, and bookmarked references." },
  { icon: Trophy, title: "Interactive Quizzes", desc: "Generates topic-level quizzes with score tracking and difficulty-aware practice." },
  { icon: GraduationCap, title: "Secure Exam Workspace", desc: "Runs secure 40-question exams, creates custom papers, and exports delayed results and achievement certificates." },
  { icon: TrendingUp, title: "Comprehensive Analytics", desc: "Shows completion progress, task distribution, readiness signals, and weekly momentum." },
  { icon: ClipboardList, title: "PDF Report Generation", desc: "Creates reports with task metrics, subject breakdowns, and productivity trends." },
  { icon: Network, title: "Worktree Mind Map", desc: "Builds visual study trees with parent links, presets, and fullscreen controls." },
  { icon: Mic, title: "Wake Assistant", desc: "Provides hands-free voice help and page commands through the focused assistant overlay." },
  { icon: Palette, title: "Appearance Customization", desc: "Adjusts backgrounds, brightness, layout scale, and the overall workspace theme." },
];

function AboutPage() {
  const navigate = useNavigate();
  const closeButtonRef = useRef(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const step = GUIDE_STEPS[activeStep];

  useEffect(() => {
    if (!guideOpen) return undefined;
    closeButtonRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setGuideOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [guideOpen]);

  const openGuide = () => {
    setActiveStep(0);
    setGuideOpen(true);
  };

  const goToStepPage = () => {
    setGuideOpen(false);
    navigate(step.route);
  };

  return (
    <section className="page-stack about-page-route">
      <div className="about-header-nav">
        <button aria-label="Go back" className="icon-shell-btn back-nav-btn" onClick={() => navigate(-1)} title="Go back" type="button">
          <ArrowLeft size={18} />
        </button>
        <div>
          <span className="section-tag">About application</span>
          <h2>PrepMatrix AI</h2>
        </div>
      </div>

      <section className="card about-hero-card">
        <div className="about-hero-copy">
          <span className="about-hero-kicker"><Sparkles size={14} /> Plan clearly. Study confidently.</span>
          <h3>Plan, study, practice, and measure progress in one workspace.</h3>
          <p>
            PrepMatrix AI connects subjects, schedules, goals, reminders, study tools, secure exams, and analytics around your learning profile.
          </p>
          <button className="about-guide-trigger" onClick={openGuide} type="button">
            <PlayCircle size={17} /> View guide <ArrowRight size={15} />
          </button>
        </div>
        <div className="about-hero-flow" aria-label="Recommended workflow">
          <span><strong>01</strong> Set up</span>
          <span><strong>02</strong> Stay on track</span>
          <span><strong>03</strong> Practice & review</span>
        </div>
      </section>

      <div className="about-section-heading">
        <div><span className="section-tag">One connected study system</span><h3>What PrepMatrix brings together</h3></div>
        <button className="about-guide-secondary" onClick={openGuide} type="button">How to use PrepMatrix <ArrowRight size={14} /></button>
      </div>

      <div className="about-features-grid">
        {FEATURES.map(({ icon: Icon, title, desc }) => (
          <article className="card feature-info-card" key={title}>
            <div className="feature-icon-wrapper">{createElement(Icon, { size: 20 })}</div>
            <div><h4>{title}</h4><p>{desc}</p></div>
          </article>
        ))}
      </div>

      <footer className="about-footer">&copy; 2026 PrepMatrix AI &bull; All rights reserved &bull; Tailored for Divyen R M</footer>

      {guideOpen && createPortal(
        <div className="guide-dialog-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setGuideOpen(false);
        }} role="presentation">
          <section aria-labelledby="guide-dialog-title" aria-modal="true" className="guide-dialog" role="dialog">
            <header className="guide-dialog-header">
              <div className="guide-dialog-mark"><Sparkles size={20} /></div>
              <div>
                <span className="section-tag">Quick start guide</span>
                <h2 id="guide-dialog-title">How to use PrepMatrix AI</h2>
                <p>Follow these six steps from first setup to weekly progress review.</p>
              </div>
              <button aria-label="Close guide" className="guide-dialog-close" onClick={() => setGuideOpen(false)} ref={closeButtonRef} type="button"><X size={18} /></button>
            </header>

            <div className="guide-dialog-progress" aria-hidden="true"><span style={{ width: `${((activeStep + 1) / GUIDE_STEPS.length) * 100}%` }} /></div>

            <div className="guide-dialog-body">
              <nav aria-label="Guide steps" className="guide-step-nav">
                {GUIDE_STEPS.map(({ icon: Icon, label }, index) => (
                  <button aria-current={activeStep === index ? "step" : undefined} className={activeStep === index ? "active" : ""} key={label} onClick={() => setActiveStep(index)} type="button">
                    <span className="guide-step-number">{activeStep > index ? <CheckCircle2 size={15} /> : index + 1}</span>
                    <span className="guide-step-icon">{createElement(Icon, { size: 16 })}</span>
                    <span>{label}</span>
                  </button>
                ))}
              </nav>

              <article className="guide-step-content" key={step.label}>
                <div className="guide-step-eyebrow"><span>Step {activeStep + 1} of {GUIDE_STEPS.length}</span><span>{step.label}</span></div>
                <h3>{step.title}</h3>
                <p className="guide-step-summary">{step.summary}</p>
                <ol className="guide-instruction-list">
                  {step.instructions.map((instruction, index) => <li key={instruction}><span>{index + 1}</span><p>{instruction}</p></li>)}
                </ol>
                <div className="guide-tip"><Lightbulb size={17} /><p><strong>Helpful tip</strong>{step.tip}</p></div>
              </article>
            </div>

            <footer className="guide-dialog-actions">
              <button className="guide-compact-btn secondary" disabled={activeStep === 0} onClick={() => setActiveStep((value) => value - 1)} type="button"><ArrowLeft size={14} /> Previous</button>
              <span>{activeStep + 1} / {GUIDE_STEPS.length}</span>
              <div>
                <button className="guide-compact-btn route" onClick={goToStepPage} type="button">{step.action}</button>
                {activeStep < GUIDE_STEPS.length - 1 ? (
                  <button className="guide-compact-btn primary" onClick={() => setActiveStep((value) => value + 1)} type="button">Next step <ArrowRight size={14} /></button>
                ) : (
                  <button className="guide-compact-btn primary" onClick={() => setGuideOpen(false)} type="button">Finish guide <CheckCircle2 size={14} /></button>
                )}
              </div>
            </footer>
          </section>
        </div>,
        document.body
      )}
    </section>
  );
}

export default AboutPage;
