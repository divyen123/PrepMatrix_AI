import { useState, useRef } from "react";
import { Search, Lightbulb, BarChart2, CalendarCheck } from "lucide-react";
import SmartSuggestion from "../components/SmartSuggestion";
import ProgressBar1 from "../components/Progressbar1";
import WeeklyReview from "../components/WeeklyReview";

const PANEL_BUTTONS = [
  { id: "suggestions", label: "Smart suggestions", icon: Lightbulb },
  { id: "progress",    label: "Progress status",   icon: BarChart2 },
  { id: "review",      label: "Weekly review",      icon: CalendarCheck },
];

function DashboardPage({
  academicLevel,
  academicTrack,
  overviewCards,
  metrics,
  schedule,
  completed,
  userProfile,
}) {
  const [activePanel, setActivePanel] = useState(null);
  const [searchInput, setSearchInput] = useState("");
  const inputRef = useRef(null);

  const firstName = userProfile?.username?.split(" ")[0] || userProfile?.name?.split(" ")[0] || "there";

  const handleSearch = (e) => {
    e.preventDefault();
    const query = searchInput.trim();
    if (!query) {
      if (window.openStudyAssistant) window.openStudyAssistant();
      return;
    }
    if (window.sendToChatbot) {
      window.sendToChatbot(query);
    } else if (window.openStudyAssistant) {
      window.openStudyAssistant();
    }
    setSearchInput("");
  };

  const togglePanel = (id) => {
    setActivePanel((prev) => (prev === id ? null : id));
  };

  return (
    <section className="db-page">
      {/* ── Welcome + Search ─────────────────────────────── */}
      <div className="db-hero">
        <h1 className="db-welcome">Welcome, {firstName}!</h1>
        <p className="db-tagline">What would you like to work on today?</p>

        <form className="db-search-form" onSubmit={handleSearch}>
          <div className="db-search-wrap">
            <Search size={18} className="db-search-icon" />
            <input
              ref={inputRef}
              className="db-search-input"
              type="text"
              placeholder="Ask your AI study assistant…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label="Ask AI study assistant"
            />
            {searchInput && (
              <button
                type="submit"
                className="db-search-send"
                aria-label="Send"
              >
                Ask
              </button>
            )}
          </div>
        </form>
      </div>

      {/* ── Overview Cards ───────────────────────────────── */}
      <div className="db-stats-grid">
        {overviewCards.map((card) => (
          <article className="db-stat-card" key={card.label}>
            <span className="db-stat-label">{card.label}</span>
            <strong className="db-stat-value">{card.value}</strong>
            <span className="db-stat-detail">{card.detail}</span>
          </article>
        ))}
      </div>

      {/* ── Panel Toggle Buttons ─────────────────────────── */}
      <div className="db-panel-buttons" role="group" aria-label="Dashboard panels">
        {PANEL_BUTTONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={`db-panel-btn${activePanel === id ? " db-panel-btn--active" : ""}`}
            onClick={() => togglePanel(id)}
            aria-pressed={activePanel === id}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Panel Content (animated) ─────────────────────── */}
      <div className={`db-panel-content${activePanel ? " db-panel-content--visible" : ""}`}>
        {activePanel === "suggestions" && (
          <div className="db-panel-inner db-panel-enter" key="suggestions">
            <SmartSuggestion
              academicLevel={academicLevel}
              academicTrack={academicTrack}
              completed={completed}
              schedule={schedule}
            />
          </div>
        )}
        {activePanel === "progress" && (
          <div className="db-panel-inner db-panel-enter" key="progress">
            <ProgressBar1 completed={completed} schedule={schedule} />
          </div>
        )}
        {activePanel === "review" && (
          <div className="db-panel-inner db-panel-enter" key="review">
            <WeeklyReview
              academicLevel={academicLevel}
              academicTrack={academicTrack}
              completed={completed}
              schedule={schedule}
            />
          </div>
        )}
      </div>
    </section>
  );
}

export default DashboardPage;
