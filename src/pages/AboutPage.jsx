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
  ClipboardList
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
      desc: "Automatically distributes study workloads, balances daily tasks based on difficulty, and offers active recovery strategies for missed milestones."
    },
    {
      icon: Bot,
      title: "AI Study Assistant",
      desc: "Interactive study chatbot tailored to your academic level. Clarifies doubts, outlines topics, and retrieves planner metrics directly in conversation."
    },
    {
      icon: TrendingUp,
      title: "Comprehensive Analytics",
      desc: "Visualizes task completion progress, daily task distribution, exam readiness projections, and weekly study velocity signals."
    },
    {
      icon: Mic,
      title: "Voice-Command Assistant",
      desc: "Provides hands-free voice controls. Use 'Hey Jarvis' to ask about your study status, log completions, or get voice status checks."
    },
    {
      icon: Trophy,
      title: "Interactive Quizzes",
      desc: "Generates custom topic-level quizzes powered by AI, keeping track of scores and difficulty progressions."
    },
    {
      icon: StickyNote,
      title: "Interactive Study Notes",
      desc: "Save chapter summaries, document custom doubts, and keep track of left-over topics per subject."
    },
    {
      icon: Library,
      title: "Curated Study Materials",
      desc: "Suggests chapter-wise online reference articles, videos, and lets you bookmark your favorite resource links."
    },
    {
      icon: ClipboardList,
      title: "PDF Report Generation",
      desc: "Generates detailed PDF intelligence reports highlighting task completion metrics, subject breakdowns, and productivity trends."
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
            PrepMatrix AI is a comprehensive study management and cognitive learning companion. It integrates state-of-the-art AI assistance, dynamic task rebalancing, hands-free voice operations, and deep study telemetry to help students organize their academic tracks, assess their progress, and unlock their highest potential.
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
