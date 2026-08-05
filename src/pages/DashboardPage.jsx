import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Lightbulb, BarChart2, CalendarCheck, Mic, Paperclip, UploadCloud } from "lucide-react";
import SmartSuggestion from "../components/SmartSuggestion";
import ProgressBar1 from "../components/Progressbar1";
import WeeklyReview from "../components/WeeklyReview";

const PANEL_BUTTONS = [
  { id: "suggestions", label: "Smart suggestions", icon: Lightbulb },
  { id: "progress",    label: "Progress status",   icon: BarChart2 },
  { id: "review",      label: "Weekly review",      icon: CalendarCheck },
];

const CARD_TONES = [
  { glow: "rgba(11,199,177,0.22)",  labelColor: "#24c7b1", bg: "rgba(11,199,177,0.06)" },
  { glow: "rgba(59,130,246,0.22)",  labelColor: "#60a5fa", bg: "rgba(59,130,246,0.06)" },
  { glow: "rgba(234,179,8,0.22)",   labelColor: "#eab308", bg: "rgba(234,179,8,0.06)"  },
  { glow: "rgba(168,85,247,0.22)",  labelColor: "#c084fc", bg: "rgba(168,85,247,0.06)" },
];

function DashboardPage({
  academicLevel,
  academicTrack,
  overviewCards,
  metrics,
  schedule,
  completed,
  userProfile,
  subjects = [],
}) {
  const navigate = useNavigate();
  const [showSubjectsPopup, setShowSubjectsPopup] = useState(false);
  const [activePanel, setActivePanel] = useState(null);
  const [searchInput, setSearchInput]   = useState("");
  const [isRecording, setIsRecording]   = useState(false);
  const [isDragging, setIsDragging]     = useState(false);
  const [attachments, setAttachments] = useState([]);
  const dragDepthRef = useRef(0);
  const inputRef     = useRef(null);
  const recognitionRef = useRef(null);

  const firstName =
    userProfile?.username?.split(" ")[0] ||
    userProfile?.name?.split(" ")[0] ||
    "there";

  /* ── Listen to attachments from Chatbot ─────────────── */
  useEffect(() => {
    const handler = (e) => setAttachments(e.detail?.attachments || []);
    window.addEventListener("chatAttachmentsChange", handler);
    return () => window.removeEventListener("chatAttachmentsChange", handler);
  }, []);

  /* ── Text submit ─────────────────────────────────────────── */
  const handleSearch = (e) => {
    e.preventDefault();
    if (isRecording) {
      recognitionRef.current?.stop();
    }
    const query = searchInput.trim();
    if (!query && attachments.length === 0) {
      if (window.openStudyAssistant) window.openStudyAssistant();
      return;
    }
    if (window.sendToChatbot) window.sendToChatbot(query);
    else if (window.openStudyAssistant) window.openStudyAssistant();
    setSearchInput("");
  };

  /* ── Mic button (Local Speech Recognition) ───────────────── */
  const handleMic = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSearchInput("Voice recognition is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang = "en-IN";
    recognitionRef.current = recognition;

    recognition.onstart = () => setIsRecording(true);
    recognition.onend = () => {
      setIsRecording(false);
      recognitionRef.current = null;
    };
    recognition.onerror = () => {
      setIsRecording(false);
      recognitionRef.current = null;
    };
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((res) => res[0]?.transcript || "")
        .join(" ")
        .trim();
      if (transcript) setSearchInput(transcript);
    };

    try {
      recognition.start();
    } catch {
      setIsRecording(false);
    }
  };

  /* ── File/paperclip button ───────────────────────────────── */
  const handleAttach = () => {
    if (window.triggerChatAttachment) window.triggerChatAttachment();
    else if (window.openStudyAssistant) window.openStudyAssistant();
  };

  /* ── Drag & drop onto the search bar ────────────────────── */
  const isFileDrag = (dt) =>
    dt && Array.from(dt.types || []).some((t) => t === "Files");

  const handleDragEnter = useCallback((e) => {
    if (!isFileDrag(e.dataTransfer)) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setIsDragging(true);
  }, []);

  const handleDragOver = useCallback((e) => {
    if (!isFileDrag(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDragLeave = useCallback((e) => {
    if (dragDepthRef.current === 0) return;
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e) => {
    dragDepthRef.current = 0;
    setIsDragging(false);
    if (!isFileDrag(e.dataTransfer)) return;
    e.preventDefault();

    const files = Array.from(e.dataTransfer.files || []);
    if (!files.length) return;

    // Send files directly to the Chatbot attachments state
    if (window.addChatbotAttachments) {
      window.addChatbotAttachments(files);
    } else if (window.triggerChatAttachment) {
      window.triggerChatAttachment();
    } else if (window.openStudyAssistant) {
      window.openStudyAssistant();
    }
  }, []);

  /* ── Panel toggle ────────────────────────────────────────── */
  const togglePanel = (id) =>
    setActivePanel((prev) => (prev === id ? null : id));

  return (
    <section className="db-page">
      {/* ── Welcome + Search ────────────────────────────────── */}
      <div className="db-hero">
        <h1 className="db-welcome">Welcome, {firstName}!</h1>
        <p className="db-tagline">What would you like to work on today?</p>

        <form
          className={`db-search-form${isDragging ? " db-search-form--dragging" : ""}`}
          onSubmit={handleSearch}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Drop overlay hint */}
          {isDragging && (
            <div className="db-drop-overlay" aria-hidden="true">
              <UploadCloud size={22} />
              <span>Drop to send to AI</span>
            </div>
          )}

          <Search size={17} className="db-search-icon" />

          {/* Render Document Chips */}
          {attachments.map((file, idx) => (
            <div key={idx} className="db-search-file-chip" title={file.file.name}>
              <Paperclip size={12} />
              <span className="db-file-name">{file.file.name}</span>
            </div>
          ))}

          <input
            ref={inputRef}
            className="db-search-input"
            type="text"
            placeholder={attachments.length > 0 ? "Ask about your document..." : "Ask your AI study assistant…"}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Ask AI study assistant"
          />

          {/* Paperclip — upload document */}
          <button
            type="button"
            className="db-search-action-btn"
            onClick={handleAttach}
            title="Upload document to AI"
            aria-label="Upload document to AI"
            style={{ position: "relative" }}
          >
            <Paperclip size={16} />
            {attachments.length > 0 && (
              <span className="db-attachment-badge" aria-label={`${attachments.length} attachments`}>
                {attachments.length}
              </span>
            )}
          </button>

          {/* Mic */}
          <button
            type="button"
            className={`db-search-action-btn db-mic-btn${isRecording ? " db-mic-btn--active" : ""}`}
            onClick={handleMic}
            title={isRecording ? "Stop recording" : "Voice input"}
            aria-label={isRecording ? "Stop recording" : "Voice input"}
          >
            {isRecording ? (
              <span className="db-mic-pulse" aria-hidden="true" />
            ) : (
              <Mic size={16} />
            )}
          </button>

          {/* Ask button — only when text is typed or files are attached */}
          {(searchInput || attachments.length > 0) && (
            <button type="submit" className="db-search-send" aria-label="Send">
              Ask
            </button>
          )}
        </form>
      </div>

      {/* ── Overview Cards ──────────────────────────────────── */}
      <div className="db-stats-grid">
        {overviewCards.map((card, i) => {
          const tone = CARD_TONES[i] || CARD_TONES[0];
          return (
            <article
              className="db-stat-card"
              key={card.label}
              style={{
                "--card-glow":        tone.glow,
                "--card-label-color": tone.labelColor,
                "--card-bg":          tone.bg,
                cursor:               "pointer",
              }}
              onClick={() => {
                if (card.label.toLowerCase().includes("subject")) setShowSubjectsPopup((prev) => !prev);
                else if (card.label.toLowerCase().includes("planned")) navigate("/planner");
                else if (card.label.toLowerCase().includes("remaining")) navigate("/analytics#topic-progress");
                else navigate("/analytics");
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  if (card.label.toLowerCase().includes("subject")) setShowSubjectsPopup((prev) => !prev);
                  else if (card.label.toLowerCase().includes("planned")) navigate("/planner");
                  else if (card.label.toLowerCase().includes("remaining")) navigate("/analytics#topic-progress");
                  else navigate("/analytics");
                }
              }}
            >
              <span className="db-stat-label">{card.label}</span>
              <strong className="db-stat-value">{card.value}</strong>
              <span className="db-stat-detail">{card.detail}</span>
            </article>
          );
        })}
      </div>

      {/* ── Panel Buttons ───────────────────────────────────── */}
      <div className="db-panel-buttons" role="group" aria-label="Dashboard panels">
        {PANEL_BUTTONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={`db-panel-btn${activePanel === id ? " db-panel-btn--active" : ""}`}
            onClick={() => togglePanel(id)}
            aria-pressed={activePanel === id}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Panel Content ───────────────────────────────────── */}
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

      {/* ── Subjects Timeline ───────────────────────────────────── */}
      <div className={`db-subjects-timeline-wrapper ${showSubjectsPopup ? "open" : ""}`}>
        <div className="db-subjects-timeline-header">
          <h3>Your Subjects</h3>
          <button
            className="primary-btn db-subjects-open-btn"
            onClick={() => navigate("/subjects#subject-library")}
            type="button"
          >
            Open subjects
          </button>
        </div>
        
        {subjects.length === 0 ? (
          <p className="db-subjects-empty">No subjects added yet.</p>
        ) : (
          <div className="db-subjects-timeline">
            {subjects.map((s, index) => (
              <div 
                key={s.id} 
                className="db-timeline-node"
                style={{ animationDelay: `${index * 0.15}s` }}
              >
                <div className="db-timeline-dot"></div>
                <div className="db-timeline-content">
                  <span className="db-timeline-name">{s.name}</span>
                  <span className="db-timeline-chapters">{s.chapters || 0} chapters</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default DashboardPage;
