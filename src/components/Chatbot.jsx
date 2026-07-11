import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { getPlannerMetrics } from "../utils/plannerMetrics";
import {
  buildFallbackReply,
  resolveLocalAssistantCommand,
} from "../utils/assistantCommands";
import api, { API_BASE } from "../utils/apiClient";
import {
  MessageSquare,
  Plus,
  Trash2,
  Edit2,
  Menu,
  X,
  Check,
  Loader2,
  Send,
  Mic,
  Square,
  Copy
} from "lucide-react";

function formatMessageText(text) {
  if (!text) return "";
  
  const blocks = text.split(/\n/);
  
  return blocks.map((block, idx) => {
    let cleanBlock = block.trim();
    if (!cleanBlock) return <div key={idx} className="chat-spacer" style={{ height: "8px" }} />;
    
    const isBullet = cleanBlock.startsWith("* ") || cleanBlock.startsWith("- ");
    const numMatch = cleanBlock.match(/^(\d+)\.\s+(.*)/);
    
    const parseBold = (str) => {
      const parts = str.split(/\*\*([^*]+)\*\*/g);
      return parts.map((part, i) => {
        if (i % 2 === 1) {
          return <strong key={i}>{part}</strong>;
        }
        return part;
      });
    };
    
    if (isBullet) {
      const content = cleanBlock.substring(2);
      return (
        <ul key={idx} className="chat-bullet-list" style={{ margin: "4px 0", paddingLeft: "20px" }}>
          <li style={{ listStyleType: "disc" }}>{parseBold(content)}</li>
        </ul>
      );
    }
    
    if (numMatch) {
      const num = numMatch[1];
      const content = numMatch[2];
      return (
        <ol key={idx} className="chat-num-list" style={{ margin: "4px 0", paddingLeft: "20px" }} start={num}>
          <li style={{ listStyleType: "decimal" }}>{parseBold(content)}</li>
        </ol>
      );
    }
    
    return (
      <p key={idx} className="chat-paragraph" style={{ margin: "6px 0" }}>
        {parseBold(block)}
      </p>
    );
  });
}

function Chatbot({ academicLevel = "College", academicTrack = "General", schedule = [], completed = [], setDarkMode, onReset }) {
  const navigate = useNavigate();
  const scrollRef = useRef(null);
  const chatRecognitionRef = useRef(null);
  const resumeWakeAfterChatMicRef = useRef(false);

  const metrics = useMemo(
    () => getPlannerMetrics(schedule, completed),
    [schedule, completed]
  );

  const plannerContext = useMemo(
    () => ({
      academicLevel,
      academicTrack,
      totalTasks: metrics.totalTasks,
      completedTasks: metrics.completedTasks,
      remainingTasks: metrics.remainingTasks,
      completionRate: metrics.completionRate,
      weakSubject: metrics.weakSubject,
      firstPendingTask: metrics.firstPendingTask,
      todayTasks: metrics.todayTasks.map((task) => task.task),
      subjectBreakdown: Object.entries(metrics.subjectStats).map(
        ([subject, values]) =>
          `${subject}: ${values.done}/${values.total} complete, ${values.pending} pending`
      ),
    }),
    [academicLevel, academicTrack, metrics]
  );

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [clearingSessions, setClearingSessions] = useState(false);
  const [showClearHistoryConfirm, setShowClearHistoryConfirm] = useState(false);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [activeSessionTitle, setActiveSessionTitle] = useState("New Chat");
  const [historyOpen, setHistoryOpen] = useState(true);
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [deletingSessionId, setDeletingSessionId] = useState(null);
  const [renameTitle, setRenameTitle] = useState("");

  const [assistantStatus, setAssistantStatus] = useState({
    available: false,
    model: "llama-3.1-8b-instant",
    message: "",
  });
  const [messages, setMessages] = useState([
    {
      id: "intro",
      role: "assistant",
      text: "Study assistant is ready. Ask for strategy, summaries, or planner-based advice.",
    },
  ]);

  const handleCopyMessage = useCallback(async (text = "") => {
    const copyText = text.trim();
    if (!copyText) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(copyText);
        return;
      }

      const textarea = document.createElement("textarea");
      textarea.value = copyText;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    } catch (error) {
      console.error("Failed to copy chat message:", error);
    }
  }, []);

  // Load session list from backend
  const fetchSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const data = await api.getChatSessions();
      const loadedSessions = data.sessions || [];
      setSessions(loadedSessions);
      // On mobile, if sessions came back empty, retry once after a short delay
      // (handles delayed cookie transmission on cold requests)
      if (loadedSessions.length === 0 && window.innerWidth <= 768) {
        setTimeout(async () => {
          try {
            const retry = await api.getChatSessions();
            if (retry.sessions?.length > 0) {
              setSessions(retry.sessions);
            }
          } catch (retryErr) {
            // Silent retry failure
          }
        }, 1500);
      }
    } catch (err) {
      console.error("Failed to load chat history:", err);
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      if (!chatRecognitionRef.current) {
        setIsVoiceRecording(false);
      }
      fetchSessions();
      // Set responsive history state default based on screen size
      setHistoryOpen(window.innerWidth > 768);
    }
  }, [open, fetchSessions]);

  useEffect(() => {
    if (open) {
      document.body.classList.add("chat-open");
    } else {
      document.body.classList.remove("chat-open");
    }
    return () => {
      document.body.classList.remove("chat-open");
    };
  }, [open]);

  useEffect(() => {
    const handleOpenChat = (event) => {
      setOpen(true);
      if (event.detail?.createNewChat) {
        handleNewChat();
      }
      if (event.detail?.message) {
        setInput(event.detail.message);
      }
    };
    window.addEventListener("openPrepMatrixAIChat", handleOpenChat);
    return () => window.removeEventListener("openPrepMatrixAIChat", handleOpenChat);
  }, [handleNewChat]);

  // Select a session to load details
  const handleSelectSession = useCallback(async (sessionId) => {
    setLoading(true);
    try {
      const data = await api.getChatSession(sessionId);
      const session = data.session;
      if (session) {
        setActiveSessionId(session._id);
        setActiveSessionTitle(session.title);
        setMessages(session.messages || []);
        if (window.innerWidth <= 768) {
          setHistoryOpen(false);
        }
      }
    } catch (err) {
      console.error("Failed to load session details:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Clear states to start a new chat
  const handleNewChat = useCallback(() => {
    setActiveSessionId(null);
    setActiveSessionTitle("New Chat");
    setMessages([
      {
        id: "intro",
        role: "assistant",
        text: "Study assistant is ready. Ask for strategy, summaries, or planner-based advice.",
      },
    ]);
    if (window.innerWidth <= 768) {
      setHistoryOpen(false);
    }
  }, []);

  // Delete a session
  const handleDeleteSession = useCallback(async (e, sessionId) => {
    e.stopPropagation();
    try {
      await api.deleteChatSession(sessionId);
      setSessions((current) => current.filter((s) => s._id !== sessionId));
      if (activeSessionId === sessionId) {
        handleNewChat();
      }
      setDeletingSessionId(null);
    } catch (err) {
      console.error("Failed to delete session:", err);
    }
  }, [activeSessionId, handleNewChat]);

  const handleClearAllChats = useCallback(async () => {
    if (sessions.length === 0 || clearingSessions) return;

    setClearingSessions(true);
    try {
      await api.clearChatSessions();
      setSessions([]);
      handleNewChat();
      setShowClearHistoryConfirm(false);
    } catch (err) {
      console.error("Failed to clear chat history:", err);
    } finally {
      setClearingSessions(false);
    }
  }, [clearingSessions, handleNewChat, sessions.length]);

  // Edit titles
  const handleStartRename = useCallback((e, session) => {
    e.stopPropagation();
    setEditingSessionId(session._id);
    setRenameTitle(session.title);
  }, []);

  const handleSaveRename = useCallback(async (e, sessionId) => {
    e.stopPropagation();
    const cleanTitle = renameTitle.trim();
    if (!cleanTitle) return;
    try {
      await api.renameChatSession(sessionId, cleanTitle);
      setSessions((current) =>
        current.map((s) => (s._id === sessionId ? { ...s, title: cleanTitle } : s))
      );
      if (activeSessionId === sessionId) {
        setActiveSessionTitle(cleanTitle);
      }
      setEditingSessionId(null);
    } catch (err) {
      console.error("Failed to rename session:", err);
    }
  }, [renameTitle, activeSessionId]);

  const sendMessage = useCallback(
    async (message = input, options = {}) => {
      const finalMessage = message.trim();

      if (!finalMessage) {
        return;
      }

      const userMessage = {
        id: `${Date.now()}-user`,
        role: "user",
        text: finalMessage,
      };

      setMessages((current) => [...current, userMessage]);
      setInput(options.keepInput ? finalMessage : "");

      const localCommand = resolveLocalAssistantCommand(finalMessage, {
        metrics,
        onReset,
        setDarkMode,
        navigate,
      });

      if (localCommand) {
        setMessages((current) => [
          ...current,
          {
            id: `${Date.now()}-assistant-local`,
            role: "assistant",
            text: localCommand.response,
          },
        ]);
        return;
      }

      setLoading(true);

      try {
        const payload = await api.post("/api/study-assistant/chat", {
          message: finalMessage,
          sessionId: activeSessionId,
          plannerContext,
        });

        const reply = payload.reply?.trim() || "I couldn't generate a response for that request.";

        setMessages((current) => [
          ...current,
          {
            id: `${Date.now()}-assistant`,
            role: "assistant",
            text: reply,
          },
        ]);

        if (payload.sessionId) {
          const isNew = !activeSessionId;
          setActiveSessionId(payload.sessionId);
          if (payload.sessionTitle) {
            setActiveSessionTitle(payload.sessionTitle);
          }
          if (isNew) {
            fetchSessions();
          } else {
            setSessions((current) => {
              const matched = current.find((s) => s._id === payload.sessionId);
              if (matched) {
                matched.title = payload.sessionTitle || matched.title;
                matched.updatedAt = new Date().toISOString();
                return [...current].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
              }
              return current;
            });
          }
        }

        setAssistantStatus({
          available: true,
          model: payload.model || assistantStatus.model,
          message: "",
        });
      } catch (err) {
        console.error("Study assistant error:", err);
        const errorMessage = err instanceof Error ? err.message : "Unable to reach the AI assistant.";
        const isApiError = err instanceof Error && err.message && err.message !== "Failed to fetch";
        const replyText = isApiError ? `Error: ${errorMessage}` : buildFallbackReply(finalMessage, metrics);

        setMessages((current) => [
          ...current,
          {
            id: `${Date.now()}-assistant-fallback`,
            role: "assistant",
            text: replyText,
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [activeSessionId, assistantStatus.model, fetchSessions, input, metrics, navigate, onReset, plannerContext, setDarkMode]
  );

  useEffect(() => {
    const getStatus = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/study-assistant/status`);
        const payload = await response.json();

        if (!response.ok) {
          throw new Error();
        }

        setAssistantStatus({
          available: Boolean(payload.available),
          model: payload.model || "llama-3.1-8b-instant",
          message: payload.message || "",
        });
      } catch {
        setAssistantStatus({
          available: false,
          model: "llama-3.1-8b-instant",
          message: "Unable to reach the AI assistant service.",
        });
      }
    };

    getStatus();
  }, []);

  useEffect(() => {
    const openChatSession = (event) => {
      const sessionId = event.detail?.sessionId;
      setOpen(true);
      if (sessionId) {
        fetchSessions();
        handleSelectSession(sessionId);
      }
    };

    window.sendToChatbot = (voiceText) => {
      setOpen(true);
      sendMessage(voiceText);
    };

    window.openStudyAssistant = () => setOpen(true);
    window.addEventListener("prepmatrixOpenChatSession", openChatSession);

    return () => {
      window.removeEventListener("prepmatrixOpenChatSession", openChatSession);
      delete window.sendToChatbot;
      delete window.openStudyAssistant;
    };
  }, [fetchSessions, handleSelectSession, sendMessage]);

  useEffect(() => () => {
    const activeRecognition = chatRecognitionRef.current;
    if (activeRecognition) {
      activeRecognition.onstart = null;
      activeRecognition.onresult = null;
      activeRecognition.onerror = null;
      activeRecognition.onend = null;
      try {
        activeRecognition.abort?.();
      } catch {
        try {
          activeRecognition.stop?.();
        } catch {
          // Browser recognition may already be stopped.
        }
      }
      chatRecognitionRef.current = null;
    }
    resumeWakeAfterChatMicRef.current = false;
    window.dispatchEvent(new CustomEvent("voiceRecordingChange", { detail: { isRecording: false, source: "chatbot" } }));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  // Sync mic recording state from VoiceAssistant via custom event
  useEffect(() => {
    const handler = (e) => {
      if (chatRecognitionRef.current) return;
      setIsVoiceRecording(Boolean(e.detail?.isRecording));
    };
    window.addEventListener("voiceRecordingChange", handler);
    return () => window.removeEventListener("voiceRecordingChange", handler);
  }, []);

  const handleMicClick = () => {
    const activeRecognition = chatRecognitionRef.current;
    if (activeRecognition) {
      try {
        activeRecognition.stop();
      } catch {
        // Recognition may already be stopped by the browser.
      }
      chatRecognitionRef.current = null;
      setIsVoiceRecording(false);
      window.dispatchEvent(new CustomEvent("voiceRecordingChange", { detail: { isRecording: false, source: "chatbot" } }));
      if (resumeWakeAfterChatMicRef.current) {
        window.studyVoiceAssistant?.setWakeMode?.(true);
        resumeWakeAfterChatMicRef.current = false;
      }
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setInput("Voice recognition is not supported in this browser.");
      return;
    }

    resumeWakeAfterChatMicRef.current = localStorage.getItem("prepmatrix_wake_mode") === "true";
    if (resumeWakeAfterChatMicRef.current) {
      window.studyVoiceAssistant?.pauseWakeListening?.();
    } else {
      window.studyVoiceAssistant?.stopWakeListening?.();
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 5;
    recognition.lang = "en-IN";
    chatRecognitionRef.current = recognition;

    let finalTranscript = "";
    let heardSpeech = false;

    recognition.onstart = () => {
      setIsVoiceRecording(true);
      window.dispatchEvent(new CustomEvent("voiceRecordingChange", { detail: { isRecording: true, source: "chatbot" } }));
    };

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript || "")
        .join(" ")
        .trim();

      if (transcript) {
        heardSpeech = true;
        finalTranscript = transcript;
        setInput(transcript);
      }
    };

    recognition.onerror = (event) => {
      if (event.error !== "aborted" && event.error !== "no-speech") {
        setInput(`Voice recognition error: ${event.error}.`);
      }
    };

    recognition.onend = () => {
      chatRecognitionRef.current = null;
      setIsVoiceRecording(false);
      window.dispatchEvent(new CustomEvent("voiceRecordingChange", { detail: { isRecording: false, source: "chatbot" } }));

      const spokenText = finalTranscript.trim();
      if (heardSpeech && spokenText) {
        setInput(spokenText);
        sendMessage(spokenText, { keepInput: true });
      }

      if (resumeWakeAfterChatMicRef.current) {
        window.setTimeout(() => {
          window.studyVoiceAssistant?.setWakeMode?.(true);
          resumeWakeAfterChatMicRef.current = false;
        }, 350);
      }
    };

    try {
      recognition.start();
    } catch {
      chatRecognitionRef.current = null;
      setIsVoiceRecording(false);
      window.dispatchEvent(new CustomEvent("voiceRecordingChange", { detail: { isRecording: false, source: "chatbot" } }));
      if (resumeWakeAfterChatMicRef.current) {
        window.studyVoiceAssistant?.setWakeMode?.(true);
        resumeWakeAfterChatMicRef.current = false;
      }
    }
  };

  return (
    <>
      <button
        aria-label={open ? "Close study assistant chat" : "Open study assistant chat"}
        className={`chat-toggle-btn ${open ? "active" : ""}`}
        onClick={() => setOpen(!open)}
        type="button"
      >
        AI Chat
      </button>

      {open ? createPortal(
        <>
          <div className="chat-modal-backdrop" onClick={() => setOpen(false)} role="presentation" />
          <section className="chatbot sidebar-chatbot-portal">
            <div className="chat-box">
            
            {/* Sliding Backdrop on Mobile */}
            {historyOpen && window.innerWidth <= 768 && (
              <div className="chat-history-backdrop" onClick={() => setHistoryOpen(false)} />
            )}

            {/* Left Panel: Chat History */}
            <aside className={`chat-history-sidebar ${historyOpen ? "open" : "collapsed"}`}>
              <div className="sidebar-history-header">
                <h3>Chat History</h3>
                <div className="history-header-actions">
                  {showClearHistoryConfirm ? (
                    <div className="chat-clear-confirm-inline">
                      <span className="confirm-text">Clear all?</span>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          className="confirm-yes-btn"
                          onClick={handleClearAllChats}
                          title="Yes, clear all"
                          type="button"
                        >
                          <Check size={12} />
                        </button>
                        <button
                          className="confirm-no-btn"
                          onClick={() => setShowClearHistoryConfirm(false)}
                          title="Cancel"
                          type="button"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <button
                        className="new-chat-btn"
                        onClick={handleNewChat}
                        title="New conversation"
                        type="button"
                      >
                        <Plus size={14} />
                        <span>New</span>
                      </button>
                      <button
                        className="clear-all-chats-btn"
                        disabled={sessions.length === 0 || clearingSessions}
                        onClick={() => setShowClearHistoryConfirm(true)}
                        title="Clear all chats"
                        type="button"
                      >
                        {clearingSessions ? <Loader2 size={14} className="spinner" /> : <Trash2 size={14} />}
                        <span>Clear all</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="history-sessions-list">
                {sessionsLoading && (
                  <div className="history-loading">
                    <Loader2 size={16} className="spinner" />
                    <span>Loading chats...</span>
                  </div>
                )}

                {!sessionsLoading && sessions.length === 0 && (
                  <div className="history-empty">
                    No recent chats
                  </div>
                )}

                {sessions.map((s) => {
                  const isActive = s._id === activeSessionId;
                  const isEditing = s._id === editingSessionId;

                  return (
                    <div
                      key={s._id}
                      className={`history-session-item ${isActive ? "active" : ""}`}
                      onClick={() => !isEditing && deletingSessionId !== s._id && handleSelectSession(s._id)}
                    >
                      <MessageSquare size={14} className="session-icon" />

                      {isEditing ? (
                        <div className="rename-input-wrap" onClick={(e) => e.stopPropagation()}>
                          <input
                            autoFocus
                            onChange={(e) => setRenameTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveRename(e, s._id);
                              if (e.key === "Escape") setEditingSessionId(null);
                            }}
                            type="text"
                            value={renameTitle}
                          />
                          <button onClick={(e) => handleSaveRename(e, s._id)} type="button">
                            <Check size={12} />
                          </button>
                          <button onClick={() => setEditingSessionId(null)} type="button">
                            <X size={12} />
                          </button>
                        </div>
                      ) : deletingSessionId === s._id ? (
                        <div className="delete-confirm-wrap" onClick={(e) => e.stopPropagation()}>
                          <span className="delete-confirm-text">Delete?</span>
                          <div style={{ display: "flex", gap: "4px" }}>
                            <button
                              className="delete-yes-btn"
                              onClick={(e) => handleDeleteSession(e, s._id)}
                              title="Yes, delete"
                              type="button"
                            >
                              <Check size={12} />
                            </button>
                            <button
                              className="delete-no-btn"
                              onClick={() => setDeletingSessionId(null)}
                              title="Cancel"
                              type="button"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <span className="session-title" title={s.title}>
                            {s.title}
                          </span>
                          <div className="session-actions">
                            <button
                              aria-label="Rename conversation"
                              onClick={(e) => handleStartRename(e, s)}
                              type="button"
                            >
                              <Edit2 size={12} />
                            </button>
                            <button
                              aria-label="Delete conversation"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeletingSessionId(s._id);
                              }}
                              type="button"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </aside>

            {/* Right Panel: Active Chat */}
            <div className="chat-main">
              <div className="chat-header">
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <button
                    aria-label="Toggle chat history"
                    className="history-toggle-btn"
                    onClick={() => setHistoryOpen(!historyOpen)}
                    type="button"
                  >
                    <Menu size={20} />
                  </button>
                  <div>
                    <strong>{activeSessionId ? activeSessionTitle : "Study assistant"}</strong>
                  </div>
                </div>

                <button aria-label="Close study assistant chat" className="chat-close-btn" onClick={() => setOpen(false)} type="button">
                  <X size={16} />
                </button>
              </div>

              <div className="chat-messages" ref={scrollRef}>
                {messages.map((message) => (
                  <div className={`chat-message ${message.role}`} key={message.id}>
                    {formatMessageText(message.text)}
                    <button
                      aria-label="Copy chat message"
                      className="chat-message-copy-btn"
                      onClick={() => handleCopyMessage(message.text)}
                      title="Copy"
                      type="button"
                    >
                      <Copy size={13} strokeWidth={2.2} />
                    </button>
                  </div>
                ))}

                {loading ? (
                  <div className="chat-message assistant thinking-message">
                    <Loader2 size={14} className="spinner" />
                    <span>Thinking...</span>
                  </div>
                ) : null}
              </div>

              <div className="chat-input">
                <input
                  aria-label="Message study assistant"
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      sendMessage();
                    }
                  }}
                  placeholder="Ask anything..."
                  value={input}
                  className="chat-input-field"
                />
                <button
                  className={`chat-icon-btn chat-mic-btn${isVoiceRecording ? " recording" : ""}`}
                  onClick={handleMicClick}
                  type="button"
                  title={isVoiceRecording ? "Stop recording" : "Start voice recording"}
                  aria-label={isVoiceRecording ? "Stop recording" : "Start voice recording"}
                >
                  {isVoiceRecording ? <Square size={16} /> : <Mic size={16} />}
                </button>
                <button
                  className="chat-icon-btn chat-send-btn"
                  onClick={() => sendMessage()}
                  type="button"
                  title="Send message"
                  aria-label="Send message"
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
            </div>
          </section>
        </>,
        document.body
      ) : null}
    </>
  );
}

export default Chatbot;

