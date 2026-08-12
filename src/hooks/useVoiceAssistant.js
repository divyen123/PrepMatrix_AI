import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getPlannerMetrics } from "../utils/plannerMetrics";
import api from "../utils/apiClient";
import {
  openExternalVoiceUrl,
  resolveVoiceAssistantCommand,
} from "../utils/voiceAssistantCommands";
import { resolveVoicePlannerAnswer } from "../utils/voicePlannerAnswers";
import { selectVoiceRecognitionTranscript } from "../utils/voiceRecognition";
import {
  AI_FEATURES,
  createAiIdempotencyKey,
  getAiRequestErrorMessage,
  useAiQuota,
} from "../utils/aiQuota";
import {
  WAKE_MODE_STORAGE_KEY,
  VOICE_PREFERENCES_STORAGE_KEY,
  applyVoicePreferencesToUtterance,
  normalizeVoicePreferences,
  observeSpeechVoices,
  readStoredWakeMode,
  readStoredVoicePreferences,
  resolvePreferredVoice,
  storeWakeMode,
  storeVoicePreferences,
} from "../utils/voicePreferences";

const UNSUPPORTED_MESSAGE = "Voice recognition is not supported in this browser. Please try Chrome or Edge.";
const COMMAND_TIMEOUT_MS = 8500;
const WAKE_RESTART_DELAY_MS = 450;

const WAKE_WORDS = [
  "hey prep",
  "prep matrix",
  "hey prepmatrix",
  "hey prep matrix",
  "a prep",
  "hey preb",
  "he prep",
  "hey preps",
  "hay prep",
  "a prep matrix",
  "prep matrices",
  "prep mattress",
];

function getRecognitionConstructor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function normalizeVoiceText(text = "") {
  return text
    .toLowerCase()
    .replace(/\b(um|uh|hmm|ah|oh)\b/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getWakeCommand(rawText = "") {
  const normalized = normalizeVoiceText(rawText);
  const wakeWord = WAKE_WORDS.find((word) => normalized.includes(word));

  if (!wakeWord) {
    return { matched: false, command: "" };
  }

  const command = normalized
    .replace(new RegExp(`^.*?\\b${wakeWord.replace(/\s+/g, "\\s+")}\\b`), "")
    .trim();

  return { matched: true, command };
}

function buildPlannerContext({ academicLevel, academicTrack, metrics }) {
  return {
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
  };
}

const VOICE_TOPIC_REPLACEMENTS = [
  [/\bcatch\s+memory\b/g, "cache memory"],
  [/\bcash\s+memory\b/g, "cache memory"],
  [/\bcatching\s+memory\b/g, "cache memory"],
  [/\bcashe\s+memory\b/g, "cache memory"],
  [/\bcatch\s+cpu\b/g, "cache cpu"],
  [/\bc\s*p\s*u\b/g, "cpu"],
  [/\bo\s*s\b/g, "operating system"],
  [/\bd\s*b\s*m\s*s\b/g, "dbms"],
  [/\boops\b/g, "object oriented programming"],
  [/\bdata\s+base\b/g, "database"],
  [/\bmongo\s+db\b/g, "mongodb"],
];

function normalizeNoisyStudyQuestion(spokenText = "") {
  let normalized = normalizeVoiceText(spokenText)
    .replace(/\b(please|kindly|can you|could you|tell me|explain me|explain about|what about)\b/g, " ")
    .replace(/\b(the|a|an)\s+(meaning|definition)\s+of\b/g, "definition of");

  VOICE_TOPIC_REPLACEMENTS.forEach(([pattern, replacement]) => {
    normalized = normalized.replace(pattern, replacement);
  });

  return normalized.replace(/\s+/g, " ").trim();
}
function resolveQuickVoiceAnswer(spokenText = "") {
  const normalized = normalizeVoiceText(spokenText);
  const now = new Date();

  if (/\b(what'?s|what is|tell me|current)\s+(the\s+)?time\b/.test(normalized) || /\btime now\b/.test(normalized)) {
    return `The time is ${now.toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })}.`;
  }

  if (/\b(what'?s|what is|tell me|current)\s+(the\s+)?date\b/.test(normalized) || /\btoday'?s date\b/.test(normalized)) {
    return `Today is ${now.toLocaleDateString("en-IN", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    })}.`;
  }

  return "";
}

function cleanAssistantTextForSpeech(text = "") {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/^\s*(\d+)\.\s*/gm, "$1. ")
    .replace(/[*_#>~]/g, "")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}


export default function useVoiceAssistant({
  academicLevel = "College",
  academicTrack = "General",
  schedule = [],
  completed = [],
  allowExternalNavigation = true,
  availableRoutes,
  disabled = false,
  homeRoute = "/dashboard",
  setDarkMode,
} = {}) {
  const navigate = useNavigate();
  const { hasInsufficientCredits } = useAiQuota();
  const wakeRecognitionRef = useRef(null);
  const commandRecognitionRef = useRef(null);
  const wakeRestartTimerRef = useRef(null);
  const commandTimeoutRef = useRef(null);
  const wakeModeRef = useRef(disabled ? false : readStoredWakeMode());
  const processingRef = useRef(false);
  const startWakeListeningRef = useRef(null);
  const activeSpeechRef = useRef(null);
  const previewSpeechRef = useRef(null);

  const metrics = useMemo(() => getPlannerMetrics(schedule, completed), [schedule, completed]);
  const plannerContext = useMemo(
    () => buildPlannerContext({ academicLevel, academicTrack, metrics }),
    [academicLevel, academicTrack, metrics]
  );

  const [wakeMode, setWakeModeState] = useState(readStoredWakeMode);
  const [isListening, setIsListening] = useState(false);
  const [isCommandListening, setIsCommandListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [overlayReply, setOverlayReply] = useState("");
  const [latestChatSessionId, setLatestChatSessionId] = useState(null);
  const [error, setError] = useState("");
  const [supported, setSupported] = useState(() => !disabled && typeof window !== "undefined" && Boolean(getRecognitionConstructor()));
  const [voiceStatus, setVoiceStatusState] = useState("idle");
  const [lastText, setLastText] = useState("");
  const [replySpeechState, setReplySpeechState] = useState("idle");
  const voiceStatusRef = useRef("idle");
  const [voicePreferences, setVoicePreferencesState] = useState(readStoredVoicePreferences);
  const [speechVoices, setSpeechVoices] = useState([]);
  const activeVoiceName = useMemo(
    () => resolvePreferredVoice(speechVoices, voicePreferences)?.name || "",
    [speechVoices, voicePreferences]
  );

  const setVoicePreferences = useCallback((nextPreferences) => {
    setVoicePreferencesState((currentPreferences) => {
      const candidate = typeof nextPreferences === "function"
        ? nextPreferences(currentPreferences)
        : nextPreferences;
      return storeVoicePreferences(candidate);
    });
  }, []);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return undefined;
    return observeSpeechVoices(window.speechSynthesis, setSpeechVoices);
  }, []);

  const emitVoiceRecordingChange = useCallback((isRecording) => {
    window.dispatchEvent(new CustomEvent("voiceRecordingChange", { detail: { isRecording: Boolean(isRecording), source: "voiceAssistant" } }));
  }, []);

  const setVoiceStatus = useCallback((status) => {
    voiceStatusRef.current = status;
    setVoiceStatusState(status);
  }, []);

  const clearWakeRestartTimer = useCallback(() => {
    if (wakeRestartTimerRef.current) {
      window.clearTimeout(wakeRestartTimerRef.current);
      wakeRestartTimerRef.current = null;
    }
  }, []);

  const clearCommandTimeout = useCallback(() => {
    if (commandTimeoutRef.current) {
      window.clearTimeout(commandTimeoutRef.current);
      commandTimeoutRef.current = null;
    }
  }, []);

  const invalidateActiveSpeech = useCallback(() => {
    activeSpeechRef.current = null;
    previewSpeechRef.current = null;
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const detachAndStopRecognition = useCallback((recognition) => {
    if (!recognition) return;
    recognition.onstart = null;
    recognition.onend = null;
    recognition.onerror = null;
    recognition.onresult = null;
    try {
      recognition.stop();
    } catch {
      try {
        recognition.abort?.();
      } catch {
        // Recognition can already be closed by the browser.
      }
    }
  }, []);

  const pauseWakeRecognition = useCallback(() => {
    clearWakeRestartTimer();
    const recognition = wakeRecognitionRef.current;
    wakeRecognitionRef.current = null;
    detachAndStopRecognition(recognition);
    setIsListening(false);
    emitVoiceRecordingChange(false);
  }, [clearWakeRestartTimer, detachAndStopRecognition, emitVoiceRecordingChange]);

  const stopCommandRecognition = useCallback(() => {
    clearCommandTimeout();
    const recognition = commandRecognitionRef.current;
    commandRecognitionRef.current = null;
    detachAndStopRecognition(recognition);
    setIsListening(false);
    setIsCommandListening(false);
    emitVoiceRecordingChange(false);
  }, [clearCommandTimeout, detachAndStopRecognition, emitVoiceRecordingChange]);

  const scheduleWakeRestart = useCallback((delay = WAKE_RESTART_DELAY_MS) => {
    clearWakeRestartTimer();
    if (disabled || !wakeModeRef.current) return;
    wakeRestartTimerRef.current = window.setTimeout(() => {
      startWakeListeningRef.current?.();
    }, delay);
  }, [clearWakeRestartTimer, disabled]);

  const hideOverlay = useCallback(() => {
    setVoiceStatus("idle");
    setOverlayReply("");
    setLatestChatSessionId(null);
    setLastText("");
    setError("");
    setIsListening(false);
    setReplySpeechState("idle");
    emitVoiceRecordingChange(false);
  }, [emitVoiceRecordingChange, setVoiceStatus]);

  const speakWakeReply = useCallback((text, { closeOverlay = false, resumeWake = true } = {}) => {
    if (!text || !("speechSynthesis" in window)) {
      setReplySpeechState("idle");
      if (closeOverlay) {
        hideOverlay();
      } else {
        setVoiceStatus("answered");
      }
      if (resumeWake) scheduleWakeRestart();
      return;
    }

    invalidateActiveSpeech();
    const utterance = new SpeechSynthesisUtterance(text);
    const availableVoices = speechVoices.length > 0
      ? speechVoices
      : window.speechSynthesis.getVoices?.() || [];
    applyVoicePreferencesToUtterance(
      utterance,
      availableVoices,
      voicePreferences
    );
    activeSpeechRef.current = { utterance, closeOverlay, resumeWake };
    setReplySpeechState("playing");

    utterance.onstart = () => {
      if (activeSpeechRef.current?.utterance !== utterance) return;
      setVoiceStatus("speaking");
    };

    const finishSpeech = () => {
      if (activeSpeechRef.current?.utterance !== utterance) return;
      activeSpeechRef.current = null;
      setReplySpeechState("idle");
      if (closeOverlay) {
        hideOverlay();
      } else {
        setVoiceStatus("answered");
      }
      if (resumeWake) scheduleWakeRestart();
    };

    utterance.onend = finishSpeech;
    utterance.onerror = finishSpeech;

    try {
      window.speechSynthesis.speak(utterance);
    } catch {
      finishSpeech();
    }
  }, [
    hideOverlay,
    invalidateActiveSpeech,
    scheduleWakeRestart,
    setVoiceStatus,
    speechVoices,
    voicePreferences,
  ]);


  const previewVoice = useCallback((preferenceOverrides) => {
    if (
      !("speechSynthesis" in window)
      || typeof SpeechSynthesisUtterance === "undefined"
    ) {
      return false;
    }

    const shouldResumeWake = wakeModeRef.current;
    pauseWakeRecognition();
    stopCommandRecognition();
    invalidateActiveSpeech();

    let utterance;
    try {
      utterance = new SpeechSynthesisUtterance(
        "PrepMatrix voice preview. Clear ideas, confident answers, and focused study."
      );
    } catch {
      if (shouldResumeWake && wakeModeRef.current) scheduleWakeRestart(120);
      return false;
    }

    const availableVoices = speechVoices.length > 0
      ? speechVoices
      : window.speechSynthesis.getVoices?.() || [];
    const previewPreferences = preferenceOverrides
      ? normalizeVoicePreferences({
          ...voicePreferences,
          ...preferenceOverrides,
        })
      : voicePreferences;

    applyVoicePreferencesToUtterance(
      utterance,
      availableVoices,
      previewPreferences
    );
    previewSpeechRef.current = utterance;

    const finishPreview = () => {
      if (previewSpeechRef.current !== utterance) return;
      previewSpeechRef.current = null;
      if (shouldResumeWake && wakeModeRef.current) scheduleWakeRestart(120);
    };

    utterance.onend = finishPreview;
    utterance.onerror = finishPreview;

    try {
      window.speechSynthesis.speak(utterance);
      return true;
    } catch {
      finishPreview();
      return false;
    }
  }, [
    invalidateActiveSpeech,
    pauseWakeRecognition,
    scheduleWakeRestart,
    speechVoices,
    stopCommandRecognition,
    voicePreferences,
  ]);
  const muteCurrentReply = useCallback(() => {
    const activeSpeech = activeSpeechRef.current;
    if (!activeSpeech) return;

    activeSpeechRef.current = null;
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setReplySpeechState("muted");

    if (activeSpeech.closeOverlay) {
      hideOverlay();
    } else {
      setVoiceStatus("answered");
    }
    if (activeSpeech.resumeWake) {
      scheduleWakeRestart(120);
    }
  }, [hideOverlay, scheduleWakeRestart, setVoiceStatus]);

  const dismissOverlay = useCallback(() => {
    stopCommandRecognition();
    invalidateActiveSpeech();
    hideOverlay();
    if (wakeModeRef.current) {
      scheduleWakeRestart(120);
    }
  }, [hideOverlay, invalidateActiveSpeech, scheduleWakeRestart, stopCommandRecognition]);

  const openLatestAnswerInChat = useCallback(() => {
    if (!latestChatSessionId) return;
    window.dispatchEvent(new CustomEvent("prepmatrixOpenChatSession", { detail: { sessionId: latestChatSessionId } }));
    dismissOverlay();
  }, [dismissOverlay, latestChatSessionId]);

  const pauseWakeMode = useCallback(() => {
    wakeModeRef.current = false;
    clearWakeRestartTimer();
    stopCommandRecognition();
    pauseWakeRecognition();
    invalidateActiveSpeech();
    hideOverlay();
  }, [clearWakeRestartTimer, hideOverlay, invalidateActiveSpeech, pauseWakeRecognition, stopCommandRecognition]);

  const stopListening = useCallback(() => {
    wakeModeRef.current = false;
    storeWakeMode(false);
    setWakeModeState(false);
    clearWakeRestartTimer();
    stopCommandRecognition();
    pauseWakeRecognition();
    invalidateActiveSpeech();
    hideOverlay();
  }, [clearWakeRestartTimer, hideOverlay, invalidateActiveSpeech, pauseWakeRecognition, stopCommandRecognition]);

  const setWakeMode = useCallback((enabled) => {
    if (disabled) {
      wakeModeRef.current = false;
      return;
    }
    wakeModeRef.current = enabled;
    storeWakeMode(enabled);
    setWakeModeState(enabled);
    window.dispatchEvent(new CustomEvent("prepmatrixWakeModeChange", { detail: { enabled } }));
  }, [disabled]);

  const sendQuestionToAssistant = useCallback(async (question) => {
    if (disabled) {
      const childModeError = new Error("Open-ended voice questions are unavailable in Kids Mode.");
      childModeError.code = "KIDS_OPEN_CHAT_DISABLED";
      throw childModeError;
    }
    if (hasInsufficientCredits(AI_FEATURES.CHAT)) {
      const quotaError = new Error("Not enough AI credits for this voice question.");
      quotaError.code = "AI_USER_QUOTA_EXHAUSTED";
      throw quotaError;
    }
    const normalizedMessage = normalizeNoisyStudyQuestion(question);
    const payload = await api.post("/api/study-assistant/chat", {
      message: question,
      normalizedMessage,
      source: "voice",
      plannerContext,
    }, {
      headers: { "Idempotency-Key": createAiIdempotencyKey() },
    });
    return {
      reply: payload.reply?.trim() || "I could not generate an answer for that question.",
      sessionId: payload.sessionId || null,
    };
  }, [disabled, hasInsufficientCredits, plannerContext]);

  const processSpokenText = useCallback(async (spokenText, { speakReply = true } = {}) => {
    const cleanText = spokenText.trim();
    if (!cleanText || processingRef.current) return;

    invalidateActiveSpeech();
    processingRef.current = true;
    setIsProcessing(true);
    setTranscript(cleanText);
    setLastText(cleanText);
    setOverlayReply("");
    setReplySpeechState("idle");
    setVoiceStatus("processing");
    setError("");

    try {
      const pageCommand = resolveVoiceAssistantCommand(cleanText, {
        allowExternalNavigation,
        availableRoutes,
        homeRoute,
        viewportHeight: window.innerHeight,
      });

      if (pageCommand?.type === "external") {
        setReply(pageCommand.response);
        setOverlayReply(pageCommand.response);
        if (!openExternalVoiceUrl(pageCommand.url)) {
          throw new Error(`I could not safely open ${pageCommand.service}.`);
        }
        return;
      }

      if (pageCommand?.type === "clarify") {
        setReply(pageCommand.response);
        setOverlayReply(pageCommand.response);
        if (speakReply) {
          speakWakeReply(cleanAssistantTextForSpeech(pageCommand.response), { closeOverlay: false, resumeWake: true });
        } else {
          setVoiceStatus("answered");
          scheduleWakeRestart();
        }
        return;
      }

      if (pageCommand?.type === "chat") {
        window.dispatchEvent(new CustomEvent("openPrepMatrixAIChat"));
        setReply(pageCommand.response);
        setOverlayReply(pageCommand.response);
        if (speakReply) {
          speakWakeReply(cleanAssistantTextForSpeech(pageCommand.response), { closeOverlay: true, resumeWake: true });
        } else {
          hideOverlay();
          scheduleWakeRestart();
        }
        return;
      }

      if (pageCommand?.type === "navigate") {
        navigate(pageCommand.route);
        setReply(pageCommand.response);
        setOverlayReply(pageCommand.response);
        if (speakReply) {
          speakWakeReply(cleanAssistantTextForSpeech(pageCommand.response), { closeOverlay: true, resumeWake: true });
        } else {
          hideOverlay();
          scheduleWakeRestart();
        }
        return;
      }

      if (pageCommand?.type === "scroll") {
        const scrollMethod = pageCommand.mode === "to" ? "scrollTo" : "scrollBy";
        window[scrollMethod]({ top: pageCommand.top, behavior: "smooth" });
        setReply(pageCommand.response);
        setOverlayReply(pageCommand.response);
        if (speakReply) {
          speakWakeReply(cleanAssistantTextForSpeech(pageCommand.response), { closeOverlay: true, resumeWake: true });
        } else {
          hideOverlay();
          scheduleWakeRestart();
        }
        return;
      }

      if (pageCommand?.type === "theme") {
        setDarkMode?.(pageCommand.darkMode);
        setReply(pageCommand.response);
        setOverlayReply(pageCommand.response);
        if (speakReply) {
          speakWakeReply(cleanAssistantTextForSpeech(pageCommand.response), { closeOverlay: true, resumeWake: true });
        } else {
          hideOverlay();
          scheduleWakeRestart();
        }
        return;
      }

      const quickAnswer = resolveQuickVoiceAnswer(cleanText) || resolveVoicePlannerAnswer(cleanText, metrics);
      const assistantResult = quickAnswer
        ? { reply: quickAnswer, sessionId: null }
        : await sendQuestionToAssistant(cleanText);
      const answer = assistantResult.reply;
      setLatestChatSessionId(assistantResult.sessionId);
      setReply(answer);
      setOverlayReply(answer);
      if (speakReply) {
        speakWakeReply(cleanAssistantTextForSpeech(answer), { closeOverlay: false, resumeWake: true });
      } else {
        setVoiceStatus("answered");
        scheduleWakeRestart();
      }
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : "Unable to complete that voice request.";
      const aiMessage = getAiRequestErrorMessage(err, rawMessage);
      const message = /failed to fetch|network|abort/i.test(rawMessage)
        ? "I could not reach the AI service right now. Please check the server or internet connection and try again."
        : aiMessage;
      setError(message);
      setReply(message);
      setOverlayReply(message);
      if (speakReply) {
        speakWakeReply(cleanAssistantTextForSpeech(message), { closeOverlay: false, resumeWake: true });
      } else {
        setVoiceStatus("error");
        scheduleWakeRestart(1200);
      }
    } finally {
      processingRef.current = false;
      setIsProcessing(false);
    }
  }, [allowExternalNavigation, availableRoutes, hideOverlay, homeRoute, invalidateActiveSpeech, metrics, navigate, scheduleWakeRestart, sendQuestionToAssistant, setDarkMode, setVoiceStatus, speakWakeReply]);

  const createRecognition = useCallback((continuous, { interimResults = false, maxAlternatives = 5 } = {}) => {
    const SpeechRecognition = getRecognitionConstructor();

    if (!SpeechRecognition) {
      setSupported(false);
      setError(UNSUPPORTED_MESSAGE);
      setVoiceStatus("error");
      return null;
    }

    setSupported(true);
    const recognition = new SpeechRecognition();
    recognition.continuous = continuous;
    recognition.interimResults = interimResults;
    recognition.maxAlternatives = maxAlternatives;
    recognition.lang = "en-IN";
    return recognition;
  }, [setVoiceStatus]);

  const startCommandListening = useCallback(() => {
    if (disabled) return;
    const recognition = createRecognition(false, { interimResults: false, maxAlternatives: 5 });
    if (!recognition) return;

    pauseWakeRecognition();
    stopCommandRecognition();
    commandRecognitionRef.current = recognition;
    setVoiceStatus("listening");
    setLastText("");
    setOverlayReply("");
    setError("");

    let captured = false;

    clearCommandTimeout();
    commandTimeoutRef.current = window.setTimeout(() => {
      const activeRecognition = commandRecognitionRef.current;
      commandRecognitionRef.current = null;
      detachAndStopRecognition(activeRecognition);
      setIsListening(false);
      emitVoiceRecordingChange(false);
      if (!captured) {
        hideOverlay();
        scheduleWakeRestart();
      }
    }, COMMAND_TIMEOUT_MS);

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event) => {
      clearCommandTimeout();
      const spokenText = selectVoiceRecognitionTranscript(event.results, (candidate) => (
        resolveVoiceAssistantCommand(candidate, {
          allowExternalNavigation,
          availableRoutes,
          homeRoute,
          viewportHeight: window.innerHeight,
        }) || resolveQuickVoiceAnswer(candidate) || resolveVoicePlannerAnswer(candidate, metrics)
      ));

      if (spokenText) {
        captured = true;
        commandRecognitionRef.current = null;
        setIsListening(false);
        emitVoiceRecordingChange(false);
        processSpokenText(spokenText, { speakReply: true });
      }
    };

    recognition.onerror = (event) => {
      clearCommandTimeout();
      commandRecognitionRef.current = null;
      setIsListening(false);
      emitVoiceRecordingChange(false);
      if (event.error !== "aborted" && event.error !== "no-speech") {
        setError(`Voice recognition error: ${event.error}.`);
      }
      hideOverlay();
      scheduleWakeRestart(event.error === "no-speech" ? 250 : 900);
    };

    recognition.onend = () => {
      clearCommandTimeout();
      commandRecognitionRef.current = null;
      setIsListening(false);
      emitVoiceRecordingChange(false);
      if (!captured && !processingRef.current) {
        hideOverlay();
        scheduleWakeRestart();
      }
    };

    try {
      recognition.start();
    } catch {
      commandRecognitionRef.current = null;
      setIsListening(false);
      emitVoiceRecordingChange(false);
      hideOverlay();
      scheduleWakeRestart();
    }
  }, [allowExternalNavigation, availableRoutes, clearCommandTimeout, createRecognition, detachAndStopRecognition, disabled, emitVoiceRecordingChange, hideOverlay, homeRoute, metrics, pauseWakeRecognition, processSpokenText, scheduleWakeRestart, setVoiceStatus, stopCommandRecognition]);

  const startWakeListening = useCallback(() => {
    if (disabled || !wakeModeRef.current) return;

    const recognition = createRecognition(true, { interimResults: false, maxAlternatives: 5 });
    if (!recognition) return;

    pauseWakeRecognition();
    wakeRecognitionRef.current = recognition;
    setError("");

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (!result.isFinal) continue;

        let matchedCommand = null;
        for (let altIdx = 0; altIdx < result.length; altIdx += 1) {
          const spokenText = result[altIdx]?.transcript?.trim() || "";
          const wakeCommand = getWakeCommand(spokenText);
          if (wakeCommand.matched) {
            matchedCommand = wakeCommand;
            break;
          }
        }

        if (matchedCommand) {
          pauseWakeRecognition();
          setVoiceStatus("awake");
          setOverlayReply("");
          setLastText(matchedCommand.command || "Listening...");
          if (matchedCommand.command) {
            processSpokenText(matchedCommand.command, { speakReply: true });
          } else {
            startCommandListening();
          }
          return;
        }
      }
    };

    recognition.onerror = (event) => {
      setIsListening(false);
      if (!wakeModeRef.current) return;

      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("Microphone permission is required for voice recognition.");
        pauseWakeMode();
        return;
      }

      if (event.error !== "aborted" && event.error !== "no-speech") {
        setError(`Voice recognition error: ${event.error}.`);
      }
      scheduleWakeRestart(event.error === "no-speech" ? 250 : 900);
    };

    recognition.onend = () => {
      setIsListening(false);
      if (wakeRecognitionRef.current === recognition) {
        wakeRecognitionRef.current = null;
      }
      if (wakeModeRef.current && voiceStatusRef.current === "idle") {
        scheduleWakeRestart();
      }
    };

    try {
      recognition.start();
    } catch {
      wakeRecognitionRef.current = null;
      setIsListening(false);
      scheduleWakeRestart(900);
    }
  }, [createRecognition, disabled, pauseWakeMode, pauseWakeRecognition, processSpokenText, scheduleWakeRestart, setVoiceStatus, startCommandListening]);

  useEffect(() => {
    startWakeListeningRef.current = startWakeListening;
  }, [startWakeListening]);

  const askWithVoice = useCallback((options = {}) => {
    if (disabled) return;
    const onTranscript = typeof options?.onTranscript === "function"
      ? options.onTranscript
      : null;
    const processTranscript = options?.processTranscript !== false;
    const recognition = createRecognition(false, { interimResults: false, maxAlternatives: 5 });
    if (!recognition) return;

    pauseWakeRecognition();
    stopCommandRecognition();
    commandRecognitionRef.current = recognition;
    setTranscript("");
    setReply("");
    setOverlayReply("");
    setError("");
    setVoiceStatus("listening");

    let captured = false;

    recognition.onstart = () => {
      setIsListening(true);
      setIsCommandListening(true);
    };

    recognition.onresult = (event) => {
      if (captured) return;
      const finalResults = Array.from(event.results || [])
        .filter((result) => result?.isFinal !== false);
      if (!finalResults.length) return;

      const spokenText = selectVoiceRecognitionTranscript(finalResults, (candidate) => (
        resolveVoiceAssistantCommand(candidate, {
          allowExternalNavigation,
          availableRoutes,
          homeRoute,
          viewportHeight: window.innerHeight,
        }) || resolveQuickVoiceAnswer(candidate) || resolveVoicePlannerAnswer(candidate, metrics)
      ));

      if (spokenText) {
        captured = true;
        commandRecognitionRef.current = null;
        setIsListening(false);
        setIsCommandListening(false);
        emitVoiceRecordingChange(false);
        try {
          const callbackResult = onTranscript?.(spokenText);
          if (callbackResult && typeof callbackResult.catch === "function") {
            callbackResult.catch(() => undefined);
          }
        } catch {
          // A display callback must never prevent the recognized command from running.
        }

        if (processTranscript) {
          processSpokenText(spokenText, { speakReply: true });
        } else {
          setTranscript(spokenText);
          hideOverlay();
          scheduleWakeRestart();
        }
      }
    };

    recognition.onerror = (event) => {
      if (captured) return;
      commandRecognitionRef.current = null;
      setIsListening(false);
      setIsCommandListening(false);
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("Microphone permission is required for voice recognition.");
        setVoiceStatus("error");
      } else if (event.error !== "aborted" && event.error !== "no-speech") {
        setError(`Voice recognition error: ${event.error}.`);
        setVoiceStatus("error");
      } else {
        hideOverlay();
      }
      scheduleWakeRestart();
    };

    recognition.onend = () => {
      if (commandRecognitionRef.current === recognition) {
        commandRecognitionRef.current = null;
      }
      setIsListening(false);
      setIsCommandListening(false);
      if (!captured && !processingRef.current) {
        hideOverlay();
        scheduleWakeRestart();
      }
    };

    try {
      recognition.start();
    } catch {
      commandRecognitionRef.current = null;
      setIsListening(false);
      setIsCommandListening(false);
      setError("Microphone permission is required for voice recognition.");
      setVoiceStatus("error");
      scheduleWakeRestart();
    }
  }, [allowExternalNavigation, availableRoutes, createRecognition, disabled, emitVoiceRecordingChange, hideOverlay, homeRoute, metrics, pauseWakeRecognition, processSpokenText, scheduleWakeRestart, setVoiceStatus, stopCommandRecognition]);

  useEffect(() => {
    if (disabled) {
      setSupported(false);
      setError("");
      return;
    }
    const nextSupported = Boolean(getRecognitionConstructor());
    setSupported(nextSupported);
    if (!nextSupported) {
      setError(UNSUPPORTED_MESSAGE);
    }
  }, [disabled]);

  useEffect(() => {
    const enabled = readStoredWakeMode();
    setWakeModeState(enabled);
    wakeModeRef.current = disabled ? false : enabled;
  }, [disabled]);

  useEffect(() => {
    const handleWakeModeChange = (event) => {
      const enabled = Boolean(event.detail?.enabled);
      setWakeModeState(enabled);
      wakeModeRef.current = disabled ? false : enabled;
      if (disabled) return;
      if (enabled) {
        scheduleWakeRestart(80);
      } else {
        clearWakeRestartTimer();
        stopCommandRecognition();
        pauseWakeRecognition();
        invalidateActiveSpeech();
        hideOverlay();
      }
    };

    const handleStorage = (event) => {
      if (event.key === WAKE_MODE_STORAGE_KEY) {
        const enabled = event.newValue === "true";
        window.dispatchEvent(new CustomEvent("prepmatrixWakeModeChange", { detail: { enabled } }));
      } else if (event.key === VOICE_PREFERENCES_STORAGE_KEY) {
        setVoicePreferencesState(
          readStoredVoicePreferences(event.storageArea || undefined)
        );
      }
    };

    window.addEventListener("prepmatrixWakeModeChange", handleWakeModeChange);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("prepmatrixWakeModeChange", handleWakeModeChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, [clearWakeRestartTimer, disabled, hideOverlay, invalidateActiveSpeech, pauseWakeRecognition, scheduleWakeRestart, stopCommandRecognition]);

  useEffect(() => {
    if (disabled) {
      wakeModeRef.current = false;
      clearWakeRestartTimer();
      stopCommandRecognition();
      pauseWakeRecognition();
      invalidateActiveSpeech();
      hideOverlay();
      return undefined;
    }
    if (wakeMode) {
      wakeModeRef.current = true;
      scheduleWakeRestart(80);
      return undefined;
    }

    wakeModeRef.current = false;
    clearWakeRestartTimer();
    stopCommandRecognition();
    pauseWakeRecognition();
    invalidateActiveSpeech();
    hideOverlay();
    return undefined;
  }, [clearWakeRestartTimer, disabled, hideOverlay, invalidateActiveSpeech, pauseWakeRecognition, scheduleWakeRestart, stopCommandRecognition, wakeMode]);

  useEffect(() => {
    const isUserCommandRecording = isListening && !wakeMode && (voiceStatus === "listening" || voiceStatus === "awake");
    emitVoiceRecordingChange(isUserCommandRecording);
  }, [emitVoiceRecordingChange, isListening, voiceStatus, wakeMode]);

  useEffect(() => () => {
    clearWakeRestartTimer();
    stopCommandRecognition();
    pauseWakeRecognition();
    invalidateActiveSpeech();
  }, [clearWakeRestartTimer, invalidateActiveSpeech, pauseWakeRecognition, stopCommandRecognition]);

  const isAwake = voiceStatus === "awake" || voiceStatus === "listening" || voiceStatus === "processing" || voiceStatus === "speaking" || voiceStatus === "answered";

  return {
    activeVoiceName,
    askWithVoice,
    dismissOverlay,
    error,
    isListening,
    isCommandListening,
    isProcessing,
    reply,
    overlayReply,
    latestChatSessionId,
    openLatestAnswerInChat,
    muteCurrentReply,
    replySpeechState,
    pauseWakeMode,
    previewVoice,
    setVoicePreferences,
    setWakeMode,
    supported: disabled ? false : supported,
    transcript,
    wakeMode,
    voiceStatus,
    voicePreferences: normalizeVoicePreferences(voicePreferences),
    lastText,
    isAwake,
    stopListening,
  };
}
