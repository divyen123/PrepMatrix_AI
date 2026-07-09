import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Calendar,
  Bot,
  TrendingUp,
  Mic,
  Trophy,
  StickyNote,
  Library,
  ClipboardList,
  Network,
  Palette,
  Bell
} from "lucide-react";

function AboutPage() {
  const navigate = useNavigate();

  const handleBack = () => {
    navigate(-1);
  };

  const features = [
    {
      icon: Calendar,
      title: "Smart Planner & Scheduler",
      desc: "Distributes study workloads, balances daily tasks by difficulty, and keeps missed work organized with recovery-friendly planning."
    },
    {
      icon: Bot,
      title: "AI Study Assistant",
      desc: "A focused study chatbot for doubts, summaries, topic outlines, planner-aware advice, and crisp text-based responses."
    },
    {
      icon: TrendingUp,
      title: "Comprehensive Analytics",
      desc: "Shows completion progress, task distribution, exam readiness signals, and weekly study momentum in one place."
    },
    {
      icon: Mic,
      title: "Wake Assistant",
      desc: "Hands-free Wake Mode listens for Hey Prep, answers inside the overlay with clean text and voice, handles page commands, and resumes wake listening automatically."
    },
    {
      icon: Mic,
      title: "Separate Chatbox Recording",
      desc: "The chat mic works independently from Wake Mode, pauses background wake listening while recording, fills your spoken prompt, and uses a clear red recording state."
    },
    {
      icon: Network,
      title: "Worktree Mind Map",
      desc: "Build visual study trees with parent linking, opaque matching dropdowns, mood presets, fullscreen controls, centered toast feedback, and polished reset confirmations."
    },
    {
      icon: Trophy,
      title: "Interactive Quizzes",
      desc: "Generates topic-level quizzes with score tracking and difficulty-aware practice flow."
    },
    {
      icon: StickyNote,
      title: "Interactive Study Notes",
      desc: "Save chapter summaries, document doubts, and track left-over topics per subject."
    },
    {
      icon: Library,
      title: "Curated Study Materials",
      desc: "Organize chapter-wise resource links, articles, videos, and bookmarked references for quick revision."
    },
    {
      icon: ClipboardList,
      title: "PDF Report Generation",
      desc: "Creates PDF reports with task metrics, subject breakdowns, and productivity trends."
    },
    {
      icon: Palette,
      title: "Appearance Customization",
      desc: "Choose matching background themes, tune brightness, adjust layout scale, and keep theme cards aligned in a clean single-row layout where space allows."
    },
    {
      icon: Bell,
      title: "Silent App Reminders",
      desc: "Keeps reminder and toast feedback visual-first, with non-wake voice replies removed so only the Wake Assistant speaks."
    }
  ];

  return (
    <section className="page-stack about-page-route" style={{ animation: "fadeIn 0.3s ease" }}>
      <div className="about-header-nav" style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "24px" }}>
        <button
          onClick={handleBack}
          className="icon-shell-btn back-nav-btn"
          title="Go back"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "38px",
            height: "38px",
            borderRadius: "50%",
            background: "var(--surface)",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            color: "var(--text)",
            cursor: "pointer",
            transition: "all 0.2s"
          }}
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <span className="section-tag" style={{ textTransform: "uppercase", fontSize: "0.75rem", letterSpacing: "1.5px" }}>About Application</span>
          <h2 style={{ fontSize: "1.75rem", fontWeight: "700", margin: 0, color: "var(--text)" }}>PrepMatrix AI</h2>
        </div>
      </div>

      <div className="card about-hero-card" style={{ padding: "30px", marginBottom: "24px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "relative", zIndex: 2 }}>
          <h3 style={{ fontSize: "1.4rem", marginBottom: "10px", color: "var(--text)" }}>Empowering Smarter Study Planning</h3>
          <p style={{ color: "var(--text-secondary)", lineHeight: "1.6", maxWidth: "800px", margin: 0 }}>
            PrepMatrix AI is a study management and learning companion with planner-aware AI, reliable hands-free wake assistance, visual worktree mapping, analytics, notes, quizzes, reports, and customizable themes. It is built to keep study planning calm, fast, and focused.
          </p>
        </div>
      </div>

      <h3 style={{ fontSize: "1.25rem", fontWeight: "600", marginBottom: "16px", color: "var(--text)" }}>Core System Features</h3>
      
      <div className="about-features-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "16px" }}>
        {features.map((feature, idx) => {
          const Icon = feature.icon;
          return (
            <article className="card feature-info-card" key={idx} style={{ padding: "20px", display: "flex", gap: "16px", alignItems: "flex-start", transition: "transform 0.2s" }}>
              <div className="feature-icon-wrapper" style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "44px",
                height: "44px",
                borderRadius: "12px",
                background: "rgba(var(--accent-rgb), 0.16)",
                border: "1px solid rgba(var(--accent-rgb), 0.25)",
                color: "var(--accent)",
                flexShrink: 0
              }}>
                <Icon size={20} />
              </div>
              <div style={{ flex: 1 }}>
                <h4 style={{ fontSize: "1.05rem", fontWeight: "600", margin: "0 0 6px 0", color: "var(--text)" }}>{feature.title}</h4>
                <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", lineHeight: "1.5", margin: 0 }}>{feature.desc}</p>
              </div>
            </article>
          );
        })}
      </div>

      <div style={{ textAlign: "center", marginTop: "32px", padding: "16px", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
        <p>© 2026 PrepMatrix AI • All rights reserved • Tailored for Divyen R M</p>
      </div>
    </section>
  );
}

export default AboutPage;