import { createElement, useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  BrainCircuit,
  Calendar,
  ClipboardList,
  Coins,
  Eye,
  GraduationCap,
  Keyboard,
  Library,
  Mic,
  Network,
  Palette,
  RefreshCcw,
  StickyNote,
  TimerReset,
  TrendingUp,
  Trophy,
} from "lucide-react";
import PrepMatrixGuideDialog from "../components/PrepMatrixGuideDialog";
import SpotlightCard from "../components/SpotlightCard";
import { KeyboardShortcutGroups } from "../components/KeyboardShortcutDialog";
import {
  AI_DEFAULT_COSTS,
  AI_FEATURE_LABELS,
  AI_FEATURES,
  useAiQuota,
} from "../utils/aiQuota";

const FEATURES = [
  { icon: Calendar, title: "Smart Planner & Scheduler", desc: "Distributes study workloads, balances daily tasks by difficulty, and keeps missed work organized." },
  { icon: ClipboardList, title: "Goals & To-Dos", desc: "Tracks dated outcomes and small next actions in one focused center." },
  { icon: Bot, title: "AI Study Assistant", desc: "Explains doubts and uploaded images or PDFs, creates summaries, and uses planner context." },
  { icon: BrainCircuit, title: "AI Learning Notebooks", desc: "Turns files or chapter lists into important questions, revised notes, editable outlines, and exportable mind maps." },
  { icon: StickyNote, title: "Interactive Study Notes", desc: "Saves chapter summaries, doubts, and left-over topics for every subject." },
  { icon: Library, title: "Curated Study Materials", desc: "Organizes useful videos, articles, links, and bookmarked references." },
  { icon: Trophy, title: "Interactive Quizzes & Battles", desc: "Generates topic practice and private asynchronous 10-question duels with server-scored results, XP, and badges." },
  { icon: GraduationCap, title: "Secure Exam Workspace", desc: "Runs secure 40-question exams, creates custom papers, and exports delayed results and achievement certificates." },
  { icon: TrendingUp, title: "Comprehensive Analytics", desc: "Shows completion progress, task distribution, readiness signals, and weekly momentum." },
  { icon: ClipboardList, title: "PDF Report Generation", desc: "Creates reports with task metrics, subject breakdowns, and productivity trends." },
  { icon: Network, title: "Worktree Mind Map", desc: "Builds visual study trees with parent links, presets, and fullscreen controls." },
  { icon: Mic, title: "Wake Assistant", desc: "Provides hands-free voice help and page commands through the focused assistant overlay." },
  { icon: Palette, title: "Appearance Customization", desc: "Adjusts backgrounds, brightness, layout scale, and the overall workspace theme." },
  { icon: Eye, title: "Distraction-Aware Focus Rooms", desc: "Uses opt-in, on-device vision to spot possible prolonged look-away or phone use and give a gentle voice nudge without uploading camera frames." },
  { icon: TimerReset, title: "Predictive Memory Reviews", desc: "Predicts when concepts are nearing their forgetting point and adds three-minute micro-quizzes to the daily planner." },
];

const CREDIT_ACTIONS = Object.values(AI_FEATURES);

function formatCreditReset(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "the next UTC month";
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
    timeZoneName: "short",
    year: "numeric",
  }).format(date);
}

function AboutPage({ academicProfile = {} }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [guideOpen, setGuideOpen] = useState(false);
  const shortcutsRef = useRef(null);
  const { isKnown, loading, quota, refresh } = useAiQuota();
  const remainingCredits = isKnown ? quota.remaining : null;
  const usedCredits = isKnown
    ? Math.max(0, quota.used ?? quota.limit - quota.remaining - (quota.reserved || 0))
    : null;

  const revealKeyboardShortcuts = useCallback(() => {
    window.requestAnimationFrame(() => {
      const section = shortcutsRef.current;
      if (!section) return;
      section.scrollIntoView({
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start",
      });
      section.focus({ preventScroll: true });
    });
  }, []);

  useEffect(() => {
    if (location.hash === "#keyboard-shortcuts") revealKeyboardShortcuts();
  }, [location.hash, revealKeyboardShortcuts]);

  return (
    <section className="page-stack about-page-route">
      <div className="about-header-nav">
        <button aria-label="Go back" className="icon-shell-btn back-nav-btn page-back-control" onClick={() => navigate(-1)} title="Go back" type="button">
          <ArrowLeft aria-hidden="true" size={18} />
        </button>
        <div className="about-header-copy">
          <span className="section-tag">About application</span>
          <h2>PrepMatrix AI</h2>
        </div>
        <div className="about-guide-row">
          <button className="about-guide-secondary" onClick={() => setGuideOpen(true)} type="button">
            How to use PrepMatrix <ArrowRight size={14} />
          </button>
        </div>
      </div>

      <div className="about-features-grid">
        {FEATURES.map(({ icon: Icon, title, desc }) => (
          <SpotlightCard as="article" className="card feature-info-card" key={title} spotlightColor="rgba(var(--accent-rgb), 0.24)">
            <div className="feature-icon-wrapper">{createElement(Icon, { size: 20 })}</div>
            <div><h4>{title}</h4><p>{desc}</p></div>
          </SpotlightCard>
        ))}
      </div>

      <SpotlightCard aria-labelledby="about-credits-title" as="section" className="card about-credits-card" spotlightColor="rgba(var(--accent-rgb), 0.2)">
        <div className="about-credits-intro">
          <span className="section-tag">AI credits</span>
          <h3 id="about-credits-title">Your monthly AI allowance</h3>
          <p>
            Credits are used only when you request an AI action. If an AI request cannot be completed, its credits are returned automatically.
          </p>

          <div className="about-credit-balance">
            <Coins aria-hidden="true" size={22} />
            <div>
              <strong>{isKnown ? `${remainingCredits} credits left` : "Your current balance"}</strong>
              <span>
                {isKnown
                  ? `${usedCredits} used · ${quota.reserved || 0} processing · ${quota.limit} total`
                  : "Sign in to see your live allowance and reset date."}
              </span>
            </div>
          </div>

          {isKnown ? (
            <p className="about-credit-reset">Resets {formatCreditReset(quota.resetAt)}.</p>
          ) : (
            <button className="about-credit-refresh" disabled={loading} onClick={refresh} type="button">
              <RefreshCcw aria-hidden="true" className={loading ? "spinner" : ""} size={14} />
              {loading ? "Refreshing…" : "Refresh balance"}
            </button>
          )}
        </div>

        <div className="about-credit-costs">
          <span>Cost per action</span>
          <dl>
            {CREDIT_ACTIONS.map((feature) => {
              const cost = quota?.costs?.[feature] ?? AI_DEFAULT_COSTS[feature];
              return (
                <div key={feature}>
                  <dt>{AI_FEATURE_LABELS[feature]}</dt>
                  <dd>{cost} credit{cost === 1 ? "" : "s"}</dd>
                </div>
              );
            })}
          </dl>
        </div>
      </SpotlightCard>

      <section
        aria-labelledby="about-shortcuts-title"
        className="about-shortcuts-section"
        id="keyboard-shortcuts"
        ref={shortcutsRef}
        tabIndex={-1}
      >
        <header className="about-shortcuts-header">
          <span className="about-shortcuts-mark" aria-hidden="true"><Keyboard size={22} /></span>
          <div>
            <span className="section-tag">Keyboard guide</span>
            <h3 id="about-shortcuts-title">Move through PrepMatrix faster</h3>
            <p>Use these shortcuts anywhere in the workspace. Page actions pause automatically while you type in a field.</p>
          </div>
        </header>

        <KeyboardShortcutGroups spotlight />
      </section>

      <footer className="about-footer">&copy; 2026 PrepMatrix AI &bull; All rights reserved &bull; Tailored for Divyen R M</footer>

      <PrepMatrixGuideDialog
        academicProfile={academicProfile}
        onClose={() => setGuideOpen(false)}
        open={guideOpen}
      />
    </section>
  );
}

export default AboutPage;
