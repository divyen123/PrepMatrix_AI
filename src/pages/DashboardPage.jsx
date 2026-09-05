import { createElement, useState, useRef, useCallback, useEffect, useId, useMemo } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Search, Lightbulb, BarChart2, CalendarCheck, Mic, Paperclip, UploadCloud, X } from "lucide-react";
import SmartSuggestion from "../components/SmartSuggestion";
import ProgressBar1 from "../components/Progressbar1";
import WeeklyReview from "../components/WeeklyReview";
import SubjectPlanDialog from "../components/SubjectPlanDialog";
import {
  buildHomeNavigationRoute,
  getHomeNavigationSuggestions,
  resolveHomeNavigationCommand,
} from "../utils/homeNavigationCommands";
import { getDashboardCommandExampleCopy } from "../utils/dashboardCommandExamples";
import { runDashboardGoalReminderShortcut } from "../utils/dashboardGoalReminderShortcut";
import { sendDashboardChatMessage } from "../utils/chatMessageBridge";
import {
  DASHBOARD_VOICE_HINT_DURATION_MS,
  getNextDashboardVoiceHint,
} from "../utils/dashboardVoiceHints";

const PANEL_BUTTONS = [
  { id: "suggestions", label: "Smart suggestions", icon: Lightbulb },
  { id: "progress",    label: "Progress status",   icon: BarChart2 },
  { id: "review",      label: "Weekly review",      icon: CalendarCheck },
];

const DASHBOARD_PANEL_HASHES = {
  "#progress": "progress",
  "#progress-status": "progress",
  "#review": "review",
  "#smart-suggestions": "suggestions",
  "#suggestions": "suggestions",
  "#weekly-review": "review",
};

const CARD_TONES = [
  { glow: "rgba(11,199,177,0.22)",  labelColor: "#24c7b1", bg: "rgba(11,199,177,0.06)" },
  { glow: "rgba(59,130,246,0.22)",  labelColor: "#60a5fa", bg: "rgba(59,130,246,0.06)" },
  { glow: "rgba(234,179,8,0.22)",   labelColor: "#eab308", bg: "rgba(234,179,8,0.06)"  },
  { glow: "rgba(168,85,247,0.22)",  labelColor: "#c084fc", bg: "rgba(168,85,247,0.06)" },
];

function getNextNavigationSuggestionIndex(currentIndex, key, count) {
  if (!count) return -1;
  if (key === "ArrowDown") return (currentIndex + 1 + count) % count;
  if (key === "ArrowUp") return currentIndex <= 0 ? count - 1 : currentIndex - 1;
  return currentIndex;
}

function getNavigationOptions(suggestions, navigationCommand, currentRoute) {
  if (!navigationCommand) return suggestions;
  const commandRoute = buildHomeNavigationRoute(navigationCommand);
  if (suggestions.some((suggestion) => buildHomeNavigationRoute(suggestion) === commandRoute)) {
    return suggestions;
  }

  return [{
    ...navigationCommand,
    description: commandRoute === currentRoute
      ? `You’re already on ${navigationCommand.label}`
      : `Open ${navigationCommand.label}`,
  }, ...suggestions].slice(0, 6);
}

export function DashboardNavigationSuggestions({
  activeIndex = -1,
  currentRoute = "",
  id,
  navigationCommand = null,
  onSelect = () => undefined,
  query = "",
  suggestions = [],
}) {
  const options = getNavigationOptions(suggestions, navigationCommand, currentRoute);

  return (
    <div className="db-command-menu" id={id} role="listbox" aria-label="Page shortcuts">
      <div className="db-command-menu-label" aria-hidden="true" role="presentation">
        Page shortcuts
      </div>
      {options.length ? (
        options.map((suggestion, index) => (
          <button
            aria-selected={activeIndex === index}
            className={`db-command-option${activeIndex === index ? " db-command-option--active" : ""}`}
            id={`${id}-option-${index}`}
            key={`${suggestion.route}-${suggestion.label}`}
            onClick={() => onSelect(suggestion)}
            onMouseDown={(event) => event.preventDefault()}
            role="option"
            tabIndex={-1}
            type="button"
          >
            <span className="db-command-option-copy">
              <strong>{suggestion.label}</strong>
              <small>{suggestion.description || `Open ${suggestion.label}`}</small>
            </span>
            <ArrowRight aria-hidden="true" size={16} />
          </button>
        ))
      ) : (
        <div className="db-command-empty" role="status">
          <strong>No matching page shortcut</strong>
          <span>Press Enter to ask the AI about “{query}” instead.</span>
        </div>
      )}
    </div>
  );
}

export function DashboardVoiceEntryHint({ hint = "" }) {
  if (!hint) return null;

  return (
    <span
      className="db-voice-entry-hint"
      style={{ "--db-voice-hint-duration": `${DASHBOARD_VOICE_HINT_DURATION_MS}ms` }}
    >
      <Mic aria-hidden="true" size={13} strokeWidth={2.4} />
      <span><strong>Say</strong> <q>{hint}</q></span>
    </span>
  );
}

export function DashboardVoiceEntryDock({ hint = "" }) {
  if (!hint) return null;

  return (
    <div
      className="db-voice-entry-dock"
      style={{ "--db-voice-hint-duration": `${DASHBOARD_VOICE_HINT_DURATION_MS}ms` }}
      aria-atomic="true"
      aria-live="polite"
      role="status"
    >
      <span className="db-voice-entry-dock-gradient" aria-hidden="true" />
      <DashboardVoiceEntryHint hint={hint} />
    </div>
  );
}

function DashboardPage({
  academicProfileDataId = "",
  academicLevel,
  academicTrack,
  overviewCards,
  schedule,
  completed,
  userProfile,
  subjects = [],
  setSubjects,
  hasActiveSchedule,
  childMode = false,
  availableRoutes,
  homeRoute = "/dashboard",
  voiceAssistant,
  showEntryVoiceHint = false,
  onEntryVoiceHintConsumed,
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [showSubjectsPopup, setShowSubjectsPopup] = useState(false);
  const [activePanel, setActivePanel] = useState(null);
  const [searchInput, setSearchInput]   = useState("");
  const [isDragging, setIsDragging]     = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [submissionNotice, setSubmissionNotice] = useState("");
  const [voiceEntryHint, setVoiceEntryHint] = useState("");
  const dragDepthRef = useRef(0);
  const inputRef     = useRef(null);
  const panelContentRef = useRef(null);
  const voiceEntryHintClaimedRef = useRef(false);
  const suggestionListId = useId();
  const searchHelpId = useId();

  const [configureSubject, setConfigureSubject] = useState(null);

  useEffect(() => {
    if (!location.state?.focusGlobalAsk) return undefined;

    inputRef.current?.focus({ preventScroll: true });
    inputRef.current?.select?.();
    const nextState = { ...location.state };
    delete nextState.focusGlobalAsk;
    navigate({
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
    }, { replace: true, state: nextState });
    return undefined;
  }, [location.hash, location.pathname, location.search, location.state, navigate]);

  useEffect(() => {
    if (!showEntryVoiceHint) {
      voiceEntryHintClaimedRef.current = false;
      return;
    }

    if (
      voiceEntryHintClaimedRef.current
      || voiceAssistant?.supported === false
    ) {
      return;
    }

    voiceEntryHintClaimedRef.current = true;
    setVoiceEntryHint(getNextDashboardVoiceHint());
    onEntryVoiceHintConsumed?.();
  }, [onEntryVoiceHintConsumed, showEntryVoiceHint, voiceAssistant?.supported]);

  useEffect(() => {
    if (!voiceEntryHint) return undefined;

    const hideTimer = window.setTimeout(() => {
      setVoiceEntryHint("");
    }, DASHBOARD_VOICE_HINT_DURATION_MS);
    return () => window.clearTimeout(hideTimer);
  }, [voiceEntryHint]);

  useEffect(() => {
    const panelId = DASHBOARD_PANEL_HASHES[location.hash.toLowerCase()];
    if (!panelId) return undefined;
    if (activePanel !== panelId) {
      setActivePanel(panelId);
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => {
      panelContentRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      panelContentRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activePanel, location.hash]);

  useEffect(() => runDashboardGoalReminderShortcut({
    cancel: (frame) => window.cancelAnimationFrame(frame),
    location,
    navigate,
    schedule: (callback) => window.requestAnimationFrame(callback),
  }), [location, navigate]);

  const saveConfiguration = (updatedSubject) => {
    if (typeof setSubjects === "function") {
      const idx = subjects.findIndex((s) => s.name === updatedSubject.name);
      if (idx === -1) {
        setSubjects(subjects, { preserveSchedule: hasActiveSchedule });
      } else {
        const copy = [...subjects];
        copy[idx] = updatedSubject;
        setSubjects(copy, { preserveSchedule: hasActiveSchedule });
      }
    }
    setConfigureSubject(null);
  };

  const firstName =
    userProfile?.username?.split(" ")[0] ||
    userProfile?.name?.split(" ")[0] ||
    "there";

  const commandExampleCopy = useMemo(
    () => getDashboardCommandExampleCopy(availableRoutes),
    [availableRoutes],
  );

  const trimmedSearchInput = searchInput.trim();
  const currentRoute = `${location.pathname}${location.search}${location.hash}`;
  const navigationSuggestions = useMemo(
    () => attachments.length
      ? []
      : getHomeNavigationSuggestions(trimmedSearchInput, {
          availableRoutes,
          currentRoute,
          homeRoute,
          limit: 6,
        }),
    [attachments.length, availableRoutes, currentRoute, homeRoute, trimmedSearchInput],
  );
  const navigationCommand = useMemo(
    () => attachments.length
      ? null
      : resolveHomeNavigationCommand(trimmedSearchInput, {
          availableRoutes,
          homeRoute,
          allowContentIntents: false,
        }),
    [attachments.length, availableRoutes, homeRoute, trimmedSearchInput],
  );
  const navigationOptions = useMemo(
    () => getNavigationOptions(navigationSuggestions, navigationCommand, currentRoute),
    [currentRoute, navigationCommand, navigationSuggestions],
  );
  const navigationCommandIsCurrent = navigationCommand
    && buildHomeNavigationRoute(navigationCommand) === currentRoute;
  const showNavigationSuggestions = suggestionsOpen
    && attachments.length === 0
    && !isDragging;

  useEffect(() => {
    setActiveSuggestionIndex((current) => (
      current >= navigationOptions.length ? -1 : current
    ));
  }, [navigationOptions.length]);

  const openNavigationSuggestion = useCallback((suggestion) => {
    navigate(buildHomeNavigationRoute(suggestion));
    setSearchInput("");
    setSubmissionNotice("");
    setSuggestionsOpen(false);
    setActiveSuggestionIndex(-1);
  }, [navigate]);

  /* ── Listen to attachments from Chatbot ─────────────── */
  useEffect(() => {
    const handler = (e) => setAttachments(e.detail?.attachments || []);
    window.addEventListener("chatAttachmentsChange", handler);
    return () => window.removeEventListener("chatAttachmentsChange", handler);
  }, []);

  /* ── Text submit ─────────────────────────────────────────── */
  const handleSearch = async (e) => {
    e.preventDefault();
    setVoiceEntryHint("");
    if (voiceAssistant?.isCommandListening || voiceAssistant?.isProcessing) return;
    const query = searchInput.trim();
    if (!query && attachments.length === 0) {
      if (window.openStudyAssistant) window.openStudyAssistant();
      setSuggestionsOpen(false);
      setActiveSuggestionIndex(-1);
      return;
    }
    if (navigationCommand) {
      openNavigationSuggestion(navigationCommand);
      return;
    }
    const delivery = await sendDashboardChatMessage(window.sendToChatbot, query);
    if (!delivery.accepted) {
      if (delivery.reason === "unavailable") window.openStudyAssistant?.();
      setSubmissionNotice(delivery.message);
      setSuggestionsOpen(false);
      setActiveSuggestionIndex(-1);
      window.requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }

    setSearchInput("");
    setSubmissionNotice("");
    setSuggestionsOpen(false);
    setActiveSuggestionIndex(-1);
  };

  const handleSearchKeyDown = (event) => {
    if (event.key === "Escape") {
      setSuggestionsOpen(false);
      setActiveSuggestionIndex(-1);
      return;
    }

    if (
      showNavigationSuggestions
      && (event.key === "ArrowDown" || event.key === "ArrowUp")
      && navigationOptions.length
    ) {
      event.preventDefault();
      setActiveSuggestionIndex((current) => (
        getNextNavigationSuggestionIndex(current, event.key, navigationOptions.length)
      ));
      return;
    }

    if (
      event.key === "Enter"
      && showNavigationSuggestions
      && activeSuggestionIndex >= 0
      && navigationOptions[activeSuggestionIndex]
    ) {
      event.preventDefault();
      openNavigationSuggestion(navigationOptions[activeSuggestionIndex]);
    }
  };

  const handleMic = () => {
    setVoiceEntryHint("");
    setSubmissionNotice("");
    setSuggestionsOpen(false);
    setActiveSuggestionIndex(-1);

    if (!voiceAssistant?.supported) {
      setSubmissionNotice("Voice recognition is not supported in this browser.");
      return;
    }
    if (voiceAssistant.isCommandListening || voiceAssistant.isProcessing) return;

    const hasAttachments = attachments.length > 0;
    voiceAssistant.askWithVoice({
      onTranscript: async (spokenText) => {
        if (!hasAttachments) {
          setSearchInput("");
          return;
        }
        setSearchInput(spokenText);

        const delivery = await sendDashboardChatMessage(window.sendToChatbot, spokenText);
        if (!delivery.accepted) {
          if (delivery.reason === "unavailable") window.openStudyAssistant?.();
          setSubmissionNotice(delivery.message);
          window.requestAnimationFrame(() => inputRef.current?.focus());
          return;
        }

        setSearchInput("");
        setSubmissionNotice("");
      },
      processTranscript: !hasAttachments,
    });
  };

  const handleAttach = () => {
    setVoiceEntryHint("");
    setSubmissionNotice("");
    setSuggestionsOpen(false);
    setActiveSuggestionIndex(-1);
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
  const togglePanel = (id) => {
    if (DASHBOARD_PANEL_HASHES[location.hash.toLowerCase()]) {
      navigate({
        pathname: location.pathname,
        search: location.search,
        hash: "",
      }, { replace: true });
    }
    setActivePanel((prev) => (prev === id ? null : id));
  };

  return (
    <section className="db-page">
      {/* ── Welcome + Search ────────────────────────────────── */}
      <div className="db-hero">
        <h1 className="db-welcome">Welcome, {firstName}!</h1>
        <p className="db-tagline">What would you like to work on today?</p>

        <div
          className="db-command-shell"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              setSuggestionsOpen(false);
              setActiveSuggestionIndex(-1);
            }
          }}
        >
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
            <div key={idx} className="db-search-file-chip" title={file.name}>
              <Paperclip size={12} />
              <span className="db-file-name">{file.name}</span>
              <button
                type="button"
                className="db-file-remove-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.removeChatbotAttachment) {
                    window.removeChatbotAttachment(file.id);
                  }
                }}
                aria-label="Remove document"
              >
                <X size={16} />
              </button>
            </div>
          ))}

          <input
            ref={inputRef}
            data-dashboard-ask-input="true"
            className="db-search-input"
            type="text"
            placeholder={attachments.length > 0 ? "Ask about your document..." : commandExampleCopy.placeholder}
            value={searchInput}
            onChange={(event) => {
              setVoiceEntryHint("");
              setSearchInput(event.target.value);
              setSubmissionNotice("");
              setSuggestionsOpen(true);
              setActiveSuggestionIndex(-1);
            }}
            onKeyDown={handleSearchKeyDown}
            onFocus={() => {
              setVoiceEntryHint("");
              setSuggestionsOpen(true);
            }}
            aria-activedescendant={activeSuggestionIndex >= 0
              ? `${suggestionListId}-option-${activeSuggestionIndex}`
              : undefined}
            aria-autocomplete="list"
            aria-controls={suggestionListId}
            aria-describedby={searchHelpId}
            aria-expanded={showNavigationSuggestions}
            aria-label="Ask AI or open a page"
            autoComplete="off"
            role="combobox"
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
            className={`db-search-action-btn db-mic-btn${voiceAssistant?.isCommandListening ? " db-mic-btn--active" : ""}`}
            disabled={voiceAssistant?.isCommandListening || voiceAssistant?.isProcessing}
            onClick={handleMic}
            title={voiceAssistant?.isCommandListening ? "Listening..." : "Voice input"}
            aria-label={voiceAssistant?.isCommandListening ? "Listening to voice input" : "Voice input"}
          >
            {voiceAssistant?.isCommandListening ? (
              <span className="db-mic-pulse" aria-hidden="true" />
            ) : (
              <Mic size={16} />
            )}
          </button>

          {/* Ask button — only when text is typed or files are attached */}
          {(searchInput || attachments.length > 0) && (
            <button
              type="submit"
              className="db-search-send"
              disabled={voiceAssistant?.isCommandListening || voiceAssistant?.isProcessing}
              aria-label={navigationCommand
                ? `${navigationCommandIsCurrent ? "View" : "Open"} ${navigationCommand.label}`
                : "Ask AI"}
            >
              {navigationCommand ? (navigationCommandIsCurrent ? "View" : "Open") : "Ask"}
            </button>
          )}
          </form>

          <p
            className={`db-command-help${submissionNotice ? " db-command-help--warning" : ""}`}
            id={searchHelpId}
            aria-atomic="true"
            aria-live="polite"
            role="status"
          >
            <span className="db-command-help-copy">
              {submissionNotice
                || (attachments.length
                ? "Attached files will be sent to the AI study assistant."
                : navigationCommand
                  ? navigationCommandIsCurrent
                    ? `You’re already on ${navigationCommand.label}.`
                    : `Press Enter to open ${navigationCommand.label}.`
                  : trimmedSearchInput
                    ? "Choose a page shortcut, or press Enter to ask the AI."
                    : commandExampleCopy.helper)}
            </span>
          </p>

          {showNavigationSuggestions && (
            <DashboardNavigationSuggestions
              activeIndex={activeSuggestionIndex}
              currentRoute={currentRoute}
              id={suggestionListId}
              navigationCommand={navigationCommand}
              onSelect={openNavigationSuggestion}
              query={trimmedSearchInput}
              suggestions={navigationSuggestions}
            />
          )}
        </div>
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
                if (card.label.toLowerCase().includes("subject")) {
                  if (childMode) navigate("/learn");
                  else setShowSubjectsPopup((prev) => !prev);
                }
                else if (card.label.toLowerCase().includes("planned")) navigate("/planner/schedule");
                else if (card.label.toLowerCase().includes("remaining")) navigate("/analytics#topic-progress");
                else navigate("/analytics");
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  if (card.label.toLowerCase().includes("subject")) {
                    if (childMode) navigate("/learn");
                    else setShowSubjectsPopup((prev) => !prev);
                  }
                  else if (card.label.toLowerCase().includes("planned")) navigate("/planner/schedule");
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
            {createElement(Icon, { size: 14 })}
            {label}
          </button>
        ))}
      </div>

      {/* ── Panel Content ───────────────────────────────────── */}
      <div
        aria-label={activePanel ? `${PANEL_BUTTONS.find((panel) => panel.id === activePanel)?.label} panel` : undefined}
        className={`db-panel-content${activePanel ? " db-panel-content--visible" : ""}`}
        ref={panelContentRef}
        role={activePanel ? "region" : undefined}
        tabIndex={activePanel ? -1 : undefined}
      >
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
            <ProgressBar1 academicProfileDataId={academicProfileDataId} completed={completed} schedule={schedule} />
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
                style={{ animationDelay: `${index * 0.15}s`, cursor: "pointer" }}
                onClick={() => setConfigureSubject(s)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setConfigureSubject(s);
                  }
                }}
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

      {configureSubject && (
        <SubjectPlanDialog
          academicProfile={{ ...userProfile, academicLevel, academicTrack }}
          hasActiveSchedule={hasActiveSchedule}
          onClose={() => setConfigureSubject(null)}
          onOpenPlanner={() => navigate("/planner")}
          onSave={saveConfiguration}
          subject={configureSubject}
        />
      )}

      {voiceEntryHint && typeof document !== "undefined"
        ? createPortal(
          <DashboardVoiceEntryDock hint={voiceEntryHint} />,
          document.body,
        )
        : null}
    </section>
  );
}

export default DashboardPage;
