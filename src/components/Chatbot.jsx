import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { getPlannerMetrics } from "../utils/plannerMetrics";
import {
  buildFallbackReply,
  resolveLocalAssistantCommand,
} from "../utils/assistantCommands";
import {
  buildChatMaterialSuggestions,
  normalizeChatMaterialSuggestions,
} from "../utils/chatMaterialSuggestions";
import { filterChatSessionsByTitle } from "../utils/chatHistorySearch";
import { getChatMessageAcceptance } from "../utils/chatMessageBridge";
import { tokenizeChatMessageInline } from "../utils/chatMessageLinks";
import { getChatExperienceCopy } from "../utils/chatExperience";
import { normalizeChatAssistantContext } from "../utils/chatAssistantContext";
import api, { API_BASE } from "../utils/apiClient";
import {
  CHAT_ATTACHMENT_ACCEPT,
  DEFAULT_ATTACHMENT_PROMPT,
  MAX_CHAT_ATTACHMENTS,
  chatAttachmentMetadata,
  formatChatFileSize,
  getChatDroppedFiles,
  hasChatFileDrag,
  prepareChatAttachment,
  validateChatAttachmentSelection,
} from "../utils/chatAttachments";
import { ChatStudyPet } from "./StudyPet";
import {
  AI_FEATURES,
  createAiIdempotencyKey,
  getAiRequestErrorMessage,
  useAiQuota,
} from "../utils/aiQuota";
import { AiCreditCost } from "./AiQuotaProvider";
import {
  MessageSquare,
  Plus,
  Trash2,
  Edit2,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  Check,
  Loader2,
  Send,
  Mic,
  Square,
  Copy,
  Paperclip,
  FileText,
  UploadCloud,
  Image as ImageIcon,
  Search,
} from "lucide-react";

function formatMessageText(text, { linksAllowed = true, youtubeContext = false } = {}) {
  if (!text) return "";

  const blocks = text.split(/\n/);
  const parseInline = (value, enableYouTubeTitleLinks = false) => (
    tokenizeChatMessageInline(value, {
      linksAllowed,
      youtubeContext: youtubeContext && enableYouTubeTitleLinks,
    }).map((token, index) => {
      if (token.type === "strong") {
        return <strong key={`strong-${index}`}>{token.value}</strong>;
      }
      if (token.type === "link") {
        return (
          <a
            className="chat-message-link"
            href={token.href}
            key={`link-${index}`}
            rel="noopener noreferrer nofollow"
            target="_blank"
          >
            {token.value}
          </a>
        );
      }
      return token.value;
    })
  );

  return blocks.map((block, idx) => {
    const cleanBlock = block.trim();
    if (!cleanBlock) return <div key={idx} className="chat-spacer" style={{ height: "8px" }} />;

    const isBullet = cleanBlock.startsWith("* ") || cleanBlock.startsWith("- ");
    const numMatch = cleanBlock.match(/^(\d+)\.\s+(.*)/);

    if (isBullet) {
      const content = cleanBlock.substring(2);
      return (
        <ul key={idx} className="chat-bullet-list" style={{ margin: "4px 0", paddingLeft: "20px" }}>
          <li style={{ listStyleType: "disc" }}>{parseInline(content, true)}</li>
        </ul>
      );
    }

    if (numMatch) {
      const num = numMatch[1];
      const content = numMatch[2];
      return (
        <ol key={idx} className="chat-num-list" style={{ margin: "4px 0", paddingLeft: "20px" }} start={num}>
          <li style={{ listStyleType: "decimal" }}>{parseInline(content, true)}</li>
        </ol>
      );
    }

    return (
      <p key={idx} className="chat-paragraph" style={{ margin: "6px 0" }}>
        {parseInline(block)}
      </p>
    );
  });
}
function ChatMaterialSuggestions({
  academicLevel,
  academicTrack,
  materials,
  onOpenMaterials,
  onSaveBookmark,
  savedMaterialLinks,
}) {
  const suggestions = normalizeChatMaterialSuggestions(materials);

  if (!suggestions.length) return null;

  return (
    <section aria-label="Suggested study materials" className="chat-material-suggestions">
      <div className="chat-material-suggestions-heading">
        <strong>Suggested materials</strong>
        <span>{suggestions.length} options</span>
      </div>
      <div className="chat-material-suggestion-list">
        {suggestions.map((material) => {
          const saved = savedMaterialLinks.has(material.href);

          return (
            <article className="chat-material-suggestion-card" key={material.href}>
              <span className="chat-material-provider">{material.provider}</span>
              <strong>{material.title}</strong>
              {material.description ? <p>{material.description}</p> : null}
              <div className="chat-material-actions">
                <a
                  aria-label={`Open ${material.title} in a new tab`}
                  href={material.href}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open
                </a>
                <button
                  aria-label={saved ? `${material.title} is saved` : `Save ${material.title} to library`}
                  disabled={saved}
                  onClick={() =>
                    onSaveBookmark?.({
                      academicLevel: material.academicLevel || academicLevel,
                      academicTrack: material.academicTrack || academicTrack,
                      description: material.description,
                      href: material.href,
                      provider: material.provider,
                      subject: material.subject,
                      title: material.title,
                    })
                  }
                  type="button"
                >
                  {saved ? "Saved" : "Save to library"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
      <button
        className="chat-material-page-btn"
        onClick={onOpenMaterials}
        type="button"
      >
        Go to Materials page
      </button>
    </section>
  );
}

function Chatbot({
  academicLevel = "College",
  academicTrack = "General",
  availableRoutes,
  schedule = [],
  completed = [],
  materialBookmarks = [],
  onSaveBookmark,
  setDarkMode,
  subjects = [],
  onReset,
  childMode = false,
}) {
  const navigate = useNavigate();
  const { hasInsufficientCredits } = useAiQuota();
  const chatExperience = getChatExperienceCopy(childMode);
  const scrollRef = useRef(null);
  const chatRecognitionRef = useRef(null);
  const fileInputRef = useRef(null);
  const resumeWakeAfterChatMicRef = useRef(false);
  const mountedRef = useRef(true);
  const viewEpochRef = useRef(0);
  const chatRequestSeqRef = useRef(0);
  const attachmentPrepSeqRef = useRef(0);
  const attachmentDragDepthRef = useRef(0);
  const sessionLoadSeqRef = useRef(0);
  const sessionsFetchSeqRef = useRef(0);
  const historySearchSeqRef = useRef(0);
  const isSendingRef = useRef(false);

  const metrics = useMemo(
    () => getPlannerMetrics(schedule, completed),
    [schedule, completed]
  );
  const savedMaterialLinks = useMemo(
    () => new Set(materialBookmarks.map((bookmark) => bookmark.href)),
    [materialBookmarks]
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
  const [attachments, setAttachments] = useState([]);
  const [attachmentError, setAttachmentError] = useState("");
  const [preparingAttachments, setPreparingAttachments] = useState(false);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [assistantContext, setAssistantContext] = useState(null);
  
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [activeSessionTitle, setActiveSessionTitle] = useState("New Chat");
  const [historyOpen, setHistoryOpen] = useState(true);
  const [historySearch, setHistorySearch] = useState("");
  const [historySearchResponse, setHistorySearchResponse] = useState({
    query: "",
    sessions: [],
  });
  const [historySearchLoading, setHistorySearchLoading] = useState(false);
  const [historySearchError, setHistorySearchError] = useState("");
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [deletingSessionId, setDeletingSessionId] = useState(null);
  const [renameTitle, setRenameTitle] = useState("");

  const [assistantStatus, setAssistantStatus] = useState({
    available: false,
    model: "llama-3.1-8b-instant",
    message: "",
  });
  const [messages, setMessages] = useState(() => [
    {
      id: "intro",
      role: "assistant",
      text: getChatExperienceCopy(childMode).intro,
    },
  ]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      viewEpochRef.current += 1;
      chatRequestSeqRef.current += 1;
      attachmentPrepSeqRef.current += 1;
      sessionLoadSeqRef.current += 1;
      sessionsFetchSeqRef.current += 1;
      historySearchSeqRef.current += 1;
      isSendingRef.current = false;
    };
  }, []);

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
    const requestId = ++sessionsFetchSeqRef.current;
    const isCurrentRequest = () => mountedRef.current
      && sessionsFetchSeqRef.current === requestId;
    setSessionsLoading(true);
    try {
      const data = await api.getChatSessions();
      if (!isCurrentRequest()) return;
      const loadedSessions = data.sessions || [];
      setSessions(loadedSessions);
      // On mobile, if sessions came back empty, retry once after a short delay
      // (handles delayed cookie transmission on cold requests)
      if (loadedSessions.length === 0 && window.innerWidth <= 768) {
        setTimeout(async () => {
          try {
            const retry = await api.getChatSessions();
            if (isCurrentRequest() && retry.sessions?.length > 0) {
              setSessions(retry.sessions);
            }
          } catch {
            // Silent retry failure
          }
        }, 1500);
      }
    } catch (err) {
      if (!isCurrentRequest()) return;
      console.error("Failed to load chat history:", err);
    } finally {
      if (isCurrentRequest()) setSessionsLoading(false);
    }
  }, []);

  const historySearchQuery = useMemo(
    () => historySearch.trim().replace(/\s+/g, " ").slice(0, 120),
    [historySearch]
  );
  const titleHistoryMatches = useMemo(
    () => filterChatSessionsByTitle(sessions, historySearchQuery),
    [historySearchQuery, sessions]
  );
  const visibleSessions = useMemo(() => {
    if (!historySearchQuery) return sessions;
    if (historySearchResponse.query === historySearchQuery) {
      return historySearchResponse.sessions;
    }
    return titleHistoryMatches;
  }, [historySearchQuery, historySearchResponse, sessions, titleHistoryMatches]);

  const fetchHistorySearch = useCallback(async (query) => {
    const normalizedQuery = typeof query === "string"
      ? query.trim().replace(/\s+/g, " ").slice(0, 120)
      : "";
    const requestId = ++historySearchSeqRef.current;

    if (!normalizedQuery) {
      setHistorySearchLoading(false);
      setHistorySearchError("");
      return;
    }

    const isCurrentRequest = () => mountedRef.current
      && historySearchSeqRef.current === requestId;
    setHistorySearchLoading(true);
    setHistorySearchError("");
    try {
      const data = await api.getChatSessions(normalizedQuery);
      if (!isCurrentRequest()) return;
      setHistorySearchResponse({
        query: normalizedQuery,
        sessions: data.sessions || [],
      });
    } catch (err) {
      if (!isCurrentRequest()) return;
      console.error("Failed to search chat history:", err);
      setHistorySearchResponse({ query: "", sessions: [] });
      setHistorySearchError("Message search is unavailable. Showing title matches.");
    } finally {
      if (isCurrentRequest()) setHistorySearchLoading(false);
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
    historySearchSeqRef.current += 1;
    setHistorySearchLoading(Boolean(open && historySearchQuery));
    setHistorySearchError("");

    if (!open || !historySearchQuery) return undefined;

    const timeoutId = window.setTimeout(() => {
      void fetchHistorySearch(historySearchQuery);
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [fetchHistorySearch, historySearchQuery, open]);

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


  const invalidateViewWork = useCallback(() => {
    viewEpochRef.current += 1;
    chatRequestSeqRef.current += 1;
    attachmentPrepSeqRef.current += 1;
    sessionLoadSeqRef.current += 1;
    isSendingRef.current = false;
    setPreparingAttachments(false);
  }, []);

  // Select a session to load details
  const handleSelectSession = useCallback(async (sessionId) => {
    invalidateViewWork();
    const loadEpoch = viewEpochRef.current;
    const loadId = ++sessionLoadSeqRef.current;
    const isCurrentLoad = () => mountedRef.current
      && viewEpochRef.current === loadEpoch
      && sessionLoadSeqRef.current === loadId;
    setAttachments([]);
    setAttachmentError("");
    setAssistantContext(null);
    setLoading(true);
    try {
      const data = await api.getChatSession(sessionId);
      if (!isCurrentLoad()) return;
      const session = data.session;
      if (session) {
        setActiveSessionId(session._id);
        setActiveSessionTitle(session.title);
        setMessages(session.messages || []);
        setAssistantContext(normalizeChatAssistantContext(session.assistantContext));
        if (window.innerWidth <= 768) {
          setHistoryOpen(false);
        }
      }
    } catch (err) {
      if (!isCurrentLoad()) return;
      console.error("Failed to load session details:", err);
    } finally {
      if (isCurrentLoad()) setLoading(false);
    }
  }, [invalidateViewWork]);

  // Clear states to start a new chat
  const handleNewChat = useCallback((nextContext = null) => {
    invalidateViewWork();
    setLoading(false);
    setAttachments([]);
    setAttachmentError("");
    setAssistantContext(normalizeChatAssistantContext(nextContext));
    setActiveSessionId(null);
    setActiveSessionTitle("New Chat");
    setMessages([
      {
        id: "intro",
        role: "assistant",
        text: chatExperience.intro,
      },
    ]);
    if (window.innerWidth <= 768) {
      setHistoryOpen(false);
    }
  }, [chatExperience.intro, invalidateViewWork]);

  useEffect(() => {
    const handleOpenChat = (event) => {
      setOpen(true);
      const nextContext = normalizeChatAssistantContext(event.detail?.context);
      if (event.detail?.createNewChat || nextContext) {
        handleNewChat(nextContext);
      }
      if (event.detail?.message) {
        setInput(event.detail.message);
      }
    };
    window.addEventListener("openPrepMatrixAIChat", handleOpenChat);
    return () => window.removeEventListener("openPrepMatrixAIChat", handleOpenChat);
  }, [handleNewChat]);

  // Delete a session
  const handleDeleteSession = useCallback(async (e, sessionId) => {
    e.stopPropagation();
    try {
      await api.deleteChatSession(sessionId);
      setSessions((current) => current.filter((s) => s._id !== sessionId));
      setHistorySearchResponse((current) => ({
        ...current,
        sessions: current.sessions.filter((session) => session._id !== sessionId),
      }));
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
      setHistorySearchResponse({ query: "", sessions: [] });
      setHistorySearch("");
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
      if (historySearchQuery) {
        void fetchHistorySearch(historySearchQuery);
      }
      setEditingSessionId(null);
    } catch (err) {
      console.error("Failed to rename session:", err);
    }
  }, [
    activeSessionId,
    fetchHistorySearch,
    historySearchQuery,
    renameTitle,
  ]);

  const prepareAttachmentFiles = useCallback(async (files) => {
    if (childMode) return;
    if (assistantContext) {
      setAttachmentError("Medical training chat does not accept files or patient records.");
      return;
    }
    const selectedFiles = Array.from(files || []);
    if (!selectedFiles.length) return;

    const validationMessage = validateChatAttachmentSelection(selectedFiles, attachments);
    if (validationMessage) {
      setAttachmentError(validationMessage);
      return;
    }

    const preparationId = ++attachmentPrepSeqRef.current;
    const preparationEpoch = viewEpochRef.current;
    const isCurrentPreparation = () => mountedRef.current
      && viewEpochRef.current === preparationEpoch
      && attachmentPrepSeqRef.current === preparationId;
    setAttachmentError("");
    setPreparingAttachments(true);
    try {
      const prepared = await Promise.all(selectedFiles.map(prepareChatAttachment));
      if (!isCurrentPreparation()) return;
      const preparedValidationMessage = validateChatAttachmentSelection(
        prepared.map(({ name, type, size }) => ({ name, type, size })),
        attachments.map(({ name, type, size }) => ({ name, type, size })),
      );
      if (preparedValidationMessage) {
        setAttachmentError(preparedValidationMessage);
        return;
      }
      setAttachments((current) => [...current, ...prepared]);
    } catch (error) {
      if (!isCurrentPreparation()) return;
      setAttachmentError(error instanceof Error ? error.message : "The selected file could not be prepared.");
    } finally {
      if (isCurrentPreparation()) setPreparingAttachments(false);
    }
  }, [assistantContext, attachments, childMode]);

  const handleAttachmentInputChange = useCallback((event) => {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = "";
    void prepareAttachmentFiles(selectedFiles);
  }, [prepareAttachmentFiles]);

  const clearAttachmentDragState = useCallback(() => {
    attachmentDragDepthRef.current = 0;
    setIsDraggingFiles(false);
  }, []);

  const handleChatDragEnter = useCallback((event) => {
    if (!hasChatFileDrag(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    if (childMode || assistantContext) {
      event.dataTransfer.dropEffect = "none";
      return;
    }
    attachmentDragDepthRef.current += 1;
    setIsDraggingFiles(true);
  }, [assistantContext, childMode]);

  const handleChatDragOver = useCallback((event) => {
    if (!hasChatFileDrag(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    if (childMode || assistantContext) {
      event.dataTransfer.dropEffect = "none";
      return;
    }
    event.dataTransfer.dropEffect = loading || preparingAttachments ? "none" : "copy";
  }, [assistantContext, childMode, loading, preparingAttachments]);

  const handleChatDragLeave = useCallback((event) => {
    if (attachmentDragDepthRef.current === 0) return;
    event.preventDefault();
    event.stopPropagation();
    attachmentDragDepthRef.current = Math.max(0, attachmentDragDepthRef.current - 1);
    if (attachmentDragDepthRef.current === 0) setIsDraggingFiles(false);
  }, []);

  const handleChatDrop = useCallback((event) => {
    const isFileDrop = hasChatFileDrag(event.dataTransfer);
    clearAttachmentDragState();
    if (!isFileDrop) return;
    event.preventDefault();
    event.stopPropagation();
    if (childMode || assistantContext) return;

    const droppedFiles = getChatDroppedFiles(event.dataTransfer);
    if (!droppedFiles.length) return;
    if (loading || preparingAttachments) {
      setAttachmentError("Wait for the current response or file preparation to finish.");
      return;
    }
    void prepareAttachmentFiles(droppedFiles);
  }, [assistantContext, childMode, clearAttachmentDragState, loading, prepareAttachmentFiles, preparingAttachments]);

  useEffect(() => {
    if (!open) clearAttachmentDragState();
  }, [clearAttachmentDragState, open]);

  const handleRemoveAttachment = useCallback((attachmentId) => {
    setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
    setAttachmentError("");
  }, []);

  const sendMessage = useCallback(
    async (message = input, options = {}) => {
      const selectedAttachments = childMode || assistantContext
        ? []
        : (Array.isArray(options.attachments) ? options.attachments : attachments);
      const cleanMessage = typeof message === "string" ? message.trim() : "";
      const finalMessage = cleanMessage || (selectedAttachments.length ? DEFAULT_ATTACHMENT_PROMPT : "");
      const acceptance = getChatMessageAcceptance({
        attachmentCount: selectedAttachments.length,
        loading,
        message: finalMessage,
        preparingAttachments,
        sending: isSendingRef.current,
      });
      if (!acceptance.accepted) return acceptance;

      const messageAttachments = selectedAttachments.map((attachment) => ({
        ...chatAttachmentMetadata(attachment),
        ...(attachment.type.startsWith("image/") ? { dataUrl: attachment.dataUrl } : {}),
      }));
      const materialSuggestions = childMode || assistantContext || selectedAttachments.length
        ? []
        : buildChatMaterialSuggestions({
            academicLevel,
            academicTrack,
            message: finalMessage,
            metrics,
            subjects,
          });
      const userMessage = {
        id: `${Date.now()}-user`,
        role: "user",
        text: finalMessage,
        ...(messageAttachments.length ? { attachments: messageAttachments } : {}),
      };

      setMessages((current) => [...current, userMessage]);
      setInput(options.keepInput ? cleanMessage : "");
      setAttachments([]);
      setAttachmentError("");
      options.onAccepted?.(acceptance);

      const localCommand = childMode || assistantContext || selectedAttachments.length
        ? null
        : resolveLocalAssistantCommand(finalMessage, {
            availableRoutes,
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
        return acceptance;
      }

      if (hasInsufficientCredits(AI_FEATURES.CHAT)) {
        setInput(cleanMessage);
        setAttachments(selectedAttachments);
        setMessages((current) => [...current, {
          id: `${Date.now()}-assistant-quota`,
          role: "assistant",
          text: getAiRequestErrorMessage({ code: "AI_USER_QUOTA_EXHAUSTED" }),
          ...(materialSuggestions.length ? { materials: materialSuggestions } : {}),
        }]);
        return acceptance;
      }

      const requestId = ++chatRequestSeqRef.current;
      const requestEpoch = viewEpochRef.current;
      const originSessionId = activeSessionId;
      const isCurrentRequest = () => mountedRef.current
        && viewEpochRef.current === requestEpoch
        && chatRequestSeqRef.current === requestId;
      isSendingRef.current = true;
      setLoading(true);

      try {
        const payload = await api.post("/api/study-assistant/chat", {
          message: finalMessage,
          sessionId: originSessionId,
          plannerContext,
          assistantContext,
          materials: materialSuggestions,
          attachments: selectedAttachments.map(({ name, type, size, dataUrl }) => ({
            name,
            type,
            size,
            dataUrl,
          })),
        }, {
          timeoutMs: selectedAttachments.length ? 105000 : 30000,
          headers: { "Idempotency-Key": createAiIdempotencyKey() },
        });
        if (!isCurrentRequest()) return acceptance;
        const returnedAssistantContext = normalizeChatAssistantContext(payload.assistantContext);
        if (returnedAssistantContext) setAssistantContext(returnedAssistantContext);

        const reply = payload.reply?.trim() || "I couldn't generate a response for that request.";
        const returnedMaterials = normalizeChatMaterialSuggestions(payload.materials);
        const replyMaterials = returnedMaterials.length ? returnedMaterials : materialSuggestions;

        setMessages((current) => [
          ...current,
          {
            id: `${Date.now()}-assistant`,
            role: "assistant",
            text: reply,
            ...(replyMaterials.length ? { materials: replyMaterials } : {}),
          },
        ]);

        if (payload.sessionId) {
          const isNew = !originSessionId;
          setActiveSessionId(payload.sessionId);
          if (payload.sessionTitle) {
            setActiveSessionTitle(payload.sessionTitle);
          }
          if (isNew) {
            fetchSessions();
          } else {
            setSessions((current) => {
              const hasMatch = current.some((session) => session._id === payload.sessionId);
              if (!hasMatch) return current;

              return current
                .map((session) => session._id === payload.sessionId
                  ? {
                      ...session,
                      title: payload.sessionTitle || session.title,
                      updatedAt: new Date().toISOString(),
                    }
                  : session)
                .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
            });
          }
          if (historySearchQuery) {
            void fetchHistorySearch(historySearchQuery);
          }
        }

        setAssistantStatus({
          available: true,
          model: payload.model || assistantStatus.model,
          message: "",
        });
      } catch (err) {
        if (!isCurrentRequest()) return acceptance;
        console.error("Study assistant error:", err);
        const errorMessage = getAiRequestErrorMessage(err, "Unable to reach the AI assistant.");
        const isApiError = err instanceof Error && err.message && err.message !== "Failed to fetch";
        setAttachments(selectedAttachments);
        if (!options.keepInput) setInput(cleanMessage);
        const replyText = isApiError
          ? `Error: ${errorMessage}`
          : assistantContext
            ? "Medical training chat is temporarily unavailable. Keep this as a fictional, de-identified conceptual exercise and retry shortly."
          : selectedAttachments.length
            ? "I couldn't reach the assistant to analyze that file. Your files are still attached below so you can retry."
            : buildFallbackReply(finalMessage, metrics);

        setMessages((current) => [
          ...current,
          {
            id: `${Date.now()}-assistant-fallback`,
            role: "assistant",
            text: replyText,
            ...(materialSuggestions.length ? { materials: materialSuggestions } : {}),
          },
        ]);
      } finally {
        if (isCurrentRequest()) {
          isSendingRef.current = false;
          setLoading(false);
        }
      }
      return acceptance;
    },
    [
      activeSessionId,
      academicLevel,
      academicTrack,
      assistantContext,
      assistantStatus.model,
      attachments,
      availableRoutes,
      childMode,
      fetchHistorySearch,
      fetchSessions,
      historySearchQuery,
      input,
      loading,
      metrics,
      navigate,
      hasInsufficientCredits,
      onReset,
      plannerContext,
      preparingAttachments,
      setDarkMode,
      subjects,
    ]
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
      return new Promise((resolve) => {
        let settled = false;
        const settle = (result) => {
          if (settled) return;
          settled = true;
          resolve(result || {
            accepted: false,
            reason: "error",
            message: "The AI assistant could not accept that message.",
          });
        };

        Promise.resolve(sendMessage(voiceText, { onAccepted: settle }))
          .then(settle)
          .catch(() => settle({
            accepted: false,
            reason: "error",
            message: "The AI assistant could not accept that message.",
          }));
      });
    };

    window.openStudyAssistant = () => setOpen(true);

    // Allow the dashboard search bar to open the chatbot's file picker
    window.triggerChatAttachment = () => {
      if (assistantContext) {
        setAttachmentError("Medical training chat does not accept files or patient records.");
        return;
      }
      // Give the panel a frame to mount before clicking the hidden input
      window.requestAnimationFrame(() => {
        fileInputRef.current?.click();
      });
    };

    window.addChatbotAttachments = (files) => {
      void prepareAttachmentFiles(files);
    };
    window.removeChatbotAttachment = (id) => {
      setAttachments((current) => current.filter((a) => a.id !== id));
    };

    window.addEventListener("prepmatrixOpenChatSession", openChatSession);

    return () => {
      window.removeEventListener("prepmatrixOpenChatSession", openChatSession);
      delete window.sendToChatbot;
      delete window.openStudyAssistant;
      delete window.triggerChatAttachment;
      delete window.addChatbotAttachments;
      delete window.removeChatbotAttachment;
    };
  }, [assistantContext, fetchSessions, handleSelectSession, sendMessage, prepareAttachmentFiles]);

  // Broadcast attachment count to the dashboard so it can show a badge
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("chatAttachmentsChange", { detail: { count: attachments.length, attachments } }));
  }, [attachments]);

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

  const handleMicClick = useCallback(() => {
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
  }, [sendMessage]);

  useEffect(() => {
    window.toggleChatMic = () => {
      window.requestAnimationFrame(() => handleMicClick());
    };
    return () => {
      delete window.toggleChatMic;
    };
  }, [handleMicClick]);

  const companionStatus = useMemo(() => {
    if (isVoiceRecording) {
      return { message: "I’m listening. Tell me what you want to study.", state: "thinking" };
    }
    if (loading) {
      return { message: "Thinking through your question…", state: "thinking" };
    }
    if (attachments.length) {
      return {
        message: `${attachments.length} file${attachments.length === 1 ? "" : "s"} ready. Add a question or send for an overview.`,
        state: "idle",
      };
    }
    if (input.trim()) {
      return { message: "Your question is ready. Send it when you are ready.", state: "idle" };
    }

    const latestMessage = messages[messages.length - 1];
    if (latestMessage?.role === "assistant" && latestMessage.id !== "intro") {
      return { message: "Answer ready. Review it, then try one example yourself.", state: "answer" };
    }
    if (latestMessage?.role === "user") {
      return { message: "Question received. I’m getting it into focus.", state: "thinking" };
    }

    return { message: "One focused topic today is real progress.", state: "idle" };
  }, [attachments.length, input, isVoiceRecording, loading, messages]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("prepmatrixPetStatusChange", {
      detail: { message: companionStatus.message, state: companionStatus.state },
    }));
  }, [companionStatus]);

  return (
    <>
      <input
        accept={CHAT_ATTACHMENT_ACCEPT}
        className="chat-file-input"
        multiple
        onChange={handleAttachmentInputChange}
        ref={fileInputRef}
        tabIndex={-1}
        type="file"
        style={{ display: "none" }}
      />

      {open ? createPortal(
        <>
          <div className="chat-modal-backdrop" onClick={() => setOpen(false)} role="presentation" />
          <section
            aria-label={chatExperience.heading}
            aria-modal="true"
            className={`chatbot sidebar-chatbot-portal${childMode ? " is-kids-chat" : ""}`}
            role="dialog"
          >
            <div className="chat-pet-rail">
              <ChatStudyPet message={companionStatus.message} state={companionStatus.state} />
            </div>
            <div className="chat-box">
            
            {/* Sliding backdrop remains mounted so both open and close can animate. */}
            <div
              aria-hidden={!historyOpen}
              className={`chat-history-backdrop ${historyOpen ? "open" : ""}`}
              onClick={() => setHistoryOpen(false)}
            />

            {/* Left Panel: Chat History */}
            <aside
              aria-hidden={!historyOpen}
              className={`chat-history-sidebar ${historyOpen ? "open" : "collapsed"}`}
              id="chat-history-drawer"
            >
              <div className="sidebar-history-header">
                <h3>Chat History</h3>
                <div className="history-header-actions">
                  {showClearHistoryConfirm ? (
                    <div className="chat-clear-confirm-inline inline-destructive-confirm">
                      <span className="confirm-text">Clear all?</span>
                      <div className="compact-confirm-actions">
                        <button
                          aria-label="Confirm clearing all conversations"
                          className="compact-confirm-btn is-confirm confirm-yes-btn"
                          disabled={clearingSessions}
                          onClick={handleClearAllChats}
                          title="Yes, clear all"
                          type="button"
                        >
                          <Check aria-hidden="true" size={13} />
                        </button>
                        <button
                          aria-label="Cancel clearing conversations"
                          className="compact-confirm-btn is-cancel confirm-no-btn"
                          onClick={() => setShowClearHistoryConfirm(false)}
                          title="Cancel"
                          type="button"
                        >
                          <X aria-hidden="true" size={13} />
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

              <div className="chat-history-search-panel">
                <div className="chat-history-search-field" role="search">
                  {historySearchLoading ? (
                    <Loader2 aria-hidden="true" className="spinner" size={15} />
                  ) : (
                    <Search aria-hidden="true" size={15} />
                  )}
                  <input
                    aria-controls="chat-history-session-list"
                    aria-label="Search chat history"
                    autoComplete="off"
                    maxLength={120}
                    onChange={(event) => {
                      setHistorySearch(event.target.value);
                      setEditingSessionId(null);
                      setDeletingSessionId(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        setHistorySearch("");
                        event.currentTarget.blur();
                      }
                    }}
                    placeholder="Search titles & messages"
                    type="search"
                    value={historySearch}
                  />
                  {historySearch ? (
                    <button
                      aria-label="Clear chat history search"
                      className="chat-history-search-clear"
                      onClick={() => setHistorySearch("")}
                      title="Clear search"
                      type="button"
                    >
                      <X aria-hidden="true" size={13} />
                    </button>
                  ) : null}
                </div>
                <span
                  aria-live="polite"
                  className={`chat-history-search-status${historySearchError ? " is-error" : ""}`}
                >
                  {historySearchError
                    || (historySearchQuery
                      ? historySearchLoading
                        ? "Searching titles and messages..."
                        : `${visibleSessions.length} result${visibleSessions.length === 1 ? "" : "s"} found`
                      : "Searches titles and message text")}
                </span>
              </div>

              <div className="history-sessions-list" id="chat-history-session-list">
                {sessionsLoading && !historySearchQuery && (
                  <div className="history-loading">
                    <Loader2 size={16} className="spinner" />
                    <span>Loading chats...</span>
                  </div>
                )}

                {!sessionsLoading && !historySearchQuery && sessions.length === 0 && (
                  <div className="history-empty">
                    No recent chats
                  </div>
                )}

                {historySearchQuery && historySearchLoading && visibleSessions.length === 0 && (
                  <div className="history-loading">
                    <Loader2 size={16} className="spinner" />
                    <span>Searching chats...</span>
                  </div>
                )}

                {historySearchQuery && !historySearchLoading && visibleSessions.length === 0 && (
                  <div className="history-empty">
                    No chats match &ldquo;{historySearchQuery}&rdquo;
                  </div>
                )}

                {visibleSessions.map((s) => {
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
                          <div className="compact-confirm-actions">
                            <button
                              aria-label="Confirm deleting conversation"
                              className="compact-confirm-btn is-confirm delete-yes-btn"
                              onClick={(e) => handleDeleteSession(e, s._id)}
                              title="Yes, delete"
                              type="button"
                            >
                              <Check aria-hidden="true" size={13} />
                            </button>
                            <button
                              aria-label="Cancel deleting conversation"
                              className="compact-confirm-btn is-cancel delete-no-btn"
                              onClick={() => setDeletingSessionId(null)}
                              title="Cancel"
                              type="button"
                            >
                              <X aria-hidden="true" size={13} />
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
            <div
              className={`chat-main${isDraggingFiles ? " is-file-dragging" : ""}`}
              onDragEnter={handleChatDragEnter}
              onDragLeave={handleChatDragLeave}
              onDragOver={handleChatDragOver}
              onDrop={handleChatDrop}
            >
              {isDraggingFiles ? (
                <div aria-live="polite" className="chat-drop-overlay" role="status">
                  <div className="chat-drop-overlay-card">
                    <span className="chat-drop-overlay-icon">
                      <UploadCloud aria-hidden="true" size={26} strokeWidth={1.9} />
                    </span>
                    <strong>
                      {loading || preparingAttachments
                        ? "Attachments temporarily unavailable"
                        : "Drop files to attach"}
                    </strong>
                    <span>
                      {loading || preparingAttachments
                        ? "Wait for the current response or file preparation to finish."
                        : `JPG, PNG, WebP, PDF, or PPTX · up to ${MAX_CHAT_ATTACHMENTS} files`}
                    </span>
                  </div>
                </div>
              ) : null}
              <div className="chat-header">
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <button
                    aria-controls="chat-history-drawer"
                    aria-expanded={historyOpen}
                    aria-label={historyOpen ? "Close chat history" : "Open chat history"}
                    className={`history-toggle-btn ${historyOpen ? "is-open" : ""}`}
                    onClick={() => setHistoryOpen((current) => !current)}
                    title={historyOpen ? "Hide chat history" : "Show chat history"}
                    type="button"
                  >
                    {historyOpen ? (
                      <PanelLeftClose aria-hidden="true" size={17} strokeWidth={2.3} />
                    ) : (
                      <PanelLeftOpen aria-hidden="true" size={17} strokeWidth={2.3} />
                    )}
                  </button>
                  <div className="chat-heading-copy">
                    <strong>{activeSessionId ? activeSessionTitle : chatExperience.heading}</strong>
                    <span>{chatExperience.subtitle}</span>
                  </div>
                </div>

                <button aria-label="Close study assistant chat" className="chat-close-btn" onClick={() => setOpen(false)} type="button">
                  <X size={16} />
                </button>
              </div>

              <div className="chat-messages" ref={scrollRef}>
                {messages.map((message) => (
                  <div className={`chat-message ${message.role}`} key={message.id}>
                    {Array.isArray(message.attachments) && message.attachments.length ? (
                      <div className="chat-message-attachments">
                        {message.attachments.map((attachment, index) => {
                          const isImage = attachment.type?.startsWith("image/");
                          return (
                            <div
                              className="chat-message-attachment"
                              key={`${message.id}-${attachment.name}-${index}`}
                            >
                              <span className="chat-message-attachment-preview">
                                {isImage && attachment.dataUrl ? (
                                  <img alt="" aria-hidden="true" src={attachment.dataUrl} />
                                ) : isImage ? (
                                  <ImageIcon aria-hidden="true" size={15} />
                                ) : (
                                  <FileText aria-hidden="true" size={15} />
                                )}
                              </span>
                              <span className="chat-message-attachment-copy">
                                <strong title={attachment.name}>{attachment.name}</strong>
                                <small>{formatChatFileSize(attachment.size)}</small>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                    {formatMessageText(message.text, {
                      linksAllowed: !childMode,
                      youtubeContext: !childMode
                        && message.role === "assistant"
                        && /\byou\s*tube\b|\byoutube\b/iu.test(message.text),
                    })}
                    {!childMode && !assistantContext ? (
                      <ChatMaterialSuggestions
                        academicLevel={academicLevel}
                        academicTrack={academicTrack}
                        materials={message.materials}
                        onOpenMaterials={() => {
                          setOpen(false);
                          navigate("/resources");
                        }}
                        onSaveBookmark={onSaveBookmark}
                        savedMaterialLinks={savedMaterialLinks}
                      />
                    ) : null}
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
                {attachmentError ? (
                  <div className="chat-attachment-error" role="alert">
                    {attachmentError}
                  </div>
                ) : null}

                {!childMode && !assistantContext && (attachments.length || preparingAttachments) ? (
                  <div aria-label="Selected attachments" className="chat-attachment-tray">
                    {attachments.map((attachment) => (
                      <div className="chat-attachment-chip" key={attachment.id}>
                        <span className="chat-attachment-preview">
                          {attachment.type.startsWith("image/") ? (
                            <img alt="" aria-hidden="true" src={attachment.dataUrl} />
                          ) : (
                            <FileText aria-hidden="true" size={16} />
                          )}
                        </span>
                        <span className="chat-attachment-copy">
                          <strong title={attachment.name}>{attachment.name}</strong>
                          <small>{formatChatFileSize(attachment.originalSize || attachment.size)}</small>
                        </span>
                        <button
                          aria-label={`Remove ${attachment.name}`}
                          className="chat-attachment-remove"
                          disabled={preparingAttachments}
                          onClick={() => handleRemoveAttachment(attachment.id)}
                          title="Remove attachment"
                          type="button"
                        >
                          <X aria-hidden="true" size={12} />
                        </button>
                      </div>
                    ))}
                    {preparingAttachments ? (
                      <div className="chat-attachment-chip is-preparing" role="status">
                        <Loader2 aria-hidden="true" className="spinner" size={15} />
                        <span>Preparing file...</span>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="chat-credit-row">
                  <AiCreditCost feature={AI_FEATURES.CHAT} />
                  {hasInsufficientCredits(AI_FEATURES.CHAT) && (
                    <span>Local commands still work. Add credits next month for AI answers.</span>
                  )}
                </div>
                <div className="chat-composer-row">
                <input
                  aria-label="Message study assistant"
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder={
                    childMode
                      ? "Ask a learning question..."
                      : assistantContext
                        ? "Ask about this fictional conceptual exercise..."
                      : (attachments.length ? "Ask about the attached file..." : "Ask anything...")
                  }
                  value={input}
                  className="chat-input-field"
                />
                {!childMode && !assistantContext ? <button
                  aria-label="Attach images, PDF, or PowerPoint files"
                  className={`chat-icon-btn chat-upload-btn${attachments.length ? " has-attachments" : ""}`}
                  disabled={loading || preparingAttachments || attachments.length >= MAX_CHAT_ATTACHMENTS}
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                  title={attachments.length >= MAX_CHAT_ATTACHMENTS ? `Maximum ${MAX_CHAT_ATTACHMENTS} files attached` : "Attach images, PDF, or PowerPoint files"}
                >
                  {preparingAttachments ? <Loader2 aria-hidden="true" className="spinner" size={16} /> : <Paperclip aria-hidden="true" size={16} />}
                  {attachments.length ? <span className="chat-upload-count">{attachments.length}</span> : null}
                </button> : null}
                <button
                  aria-label={isVoiceRecording ? "Stop recording" : "Start voice recording"}
                  className={`chat-icon-btn chat-mic-btn${isVoiceRecording ? " recording" : ""}`}
                  disabled={loading || preparingAttachments}
                  onClick={handleMicClick}
                  type="button"
                  title={isVoiceRecording ? "Stop recording" : "Start voice recording"}
                >
                  {isVoiceRecording ? <Square size={16} /> : <Mic size={16} />}
                </button>
                <button
                  aria-label="Send message"
                  className="chat-icon-btn chat-send-btn"
                  disabled={loading || preparingAttachments || (!input.trim() && !attachments.length) || (attachments.length > 0 && hasInsufficientCredits(AI_FEATURES.CHAT))}
                  onClick={() => sendMessage()}
                  type="button"
                  title={attachments.length > 0 && hasInsufficientCredits(AI_FEATURES.CHAT) ? "Not enough AI credits for this request" : "Send message"}
                >
                  <Send size={16} />
                </button>
                </div>
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
