import { createElement, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Bot,
  Calendar,
  ClipboardList,
  GraduationCap,
  Library,
  Mic,
  Network,
  Palette,
  PlayCircle,
  Sparkles,
  StickyNote,
  TrendingUp,
  Trophy,
} from "lucide-react";
import PrepMatrixGuideDialog from "../components/PrepMatrixGuideDialog";

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
  const [guideOpen, setGuideOpen] = useState(false);

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
          <button className="about-guide-trigger" onClick={() => setGuideOpen(true)} type="button">
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
        <button className="about-guide-secondary" onClick={() => setGuideOpen(true)} type="button">
          How to use PrepMatrix <ArrowRight size={14} />
        </button>
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

      <PrepMatrixGuideDialog
        onClose={() => setGuideOpen(false)}
        open={guideOpen}
      />
    </section>
  );
}

export default AboutPage;
