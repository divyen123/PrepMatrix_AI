import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getPlannerMetrics } from "../utils/plannerMetrics";
import api from "../utils/apiClient";

const WAKE_MODE_KEY = "prepmatrix_wake_mode";
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

function readStoredWakeMode() {
  return localStorage.getItem(WAKE_MODE_KEY) === "true";
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

function resolvePageCommand(spokenText = "") {
  const normalized = normalizeVoiceText(spokenText);

  if (/\b(open|go to)\s+(home|dashboard)\b/.test(normalized)) {
    return { type: "navigate", route: "/dashboard", response: normalized.includes("home") ? "Opening home page." : "Opening dashboard page." };
  }

  if (/\b(open|go to)\s+planner\b/.test(normalized)) {
    return { type: "navigate", route: "/planner", response: "Opening planner page." };
  }

  if (/\b(open|go to)\s+subjects?\b/.test(normalized)) {
    return { type: "navigate", route: "/subjects", response: "Opening subjects page." };
  }

  if (/\b(open|go to)\s+analytics\b/.test(normalized)) {
    return { type: "navigate", route: "/analytics", response: "Opening analytics page." };
  }

  if (/\b(open|go to)\s+quiz\b/.test(normalized)) {
    return { type: "navigate", route: "/quiz", response: "Opening quiz page." };
  }

  if (/\b(open|go to)\s+notes?\b/.test(normalized)) {
    return { type: "navigate", route: "/notes", response: "Opening notes page." };
  }

  if (/\b(open|go to)\s+profile\b/.test(normalized)) {
    return { type: "navigate", route: "/settings", response: "Opening profile settings." };
  }

  if (/\b(open|go to)\s+settings\b/.test(normalized)) {
    return { type: "navigate", route: "/settings", response: "Opening settings page." };
  }

  if (/\bscroll\s+down\b/.test(normalized)) {
    return { type: "scroll", top: Math.round(window.innerHeight * 0.75), response: "Scrolling down." };
  }

  if (/\bscroll\s+up\b/.test(normalized)) {
    return { type: "scroll", top: -Math.round(window.innerHeight * 0.75), response: "Scrolling up." };
  }

  return null;
}

export default function useVoiceAssistant({
  academicLevel = "College",
  academicTrack = "General",
  schedule = [],
  completed = [],
} = {}) {
  const navigate = useNavigate();
  const wakeRecognitionRef = useRef(null);
  const commandRecognitionRef = useRef(null);
  const wakeRestartTimerRef = useRef(null);
  const commandTimeoutRef = useRef(null);
  const wakeModeRef = useRef(readStoredWakeMode());
  const processingRef = useRef(false);
  const startWakeListeningRef = useRef(null);

  const metrics = useMemo(() => getPlannerMetrics(schedule, completed), [schedule, completed]);
  const plannerContext = useMemo(
    () => buildPlannerContext({ academicLevel, academicTrack, metrics }),
    [academicLevel, academicTrack, metrics]
  );

  const [wakeMode, setWakeModeState] = useState(readStoredWakeMode);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [overlayReply, setOverlayReply] = useState("");
  const [error, setError] = useState("");
  const [supported, setSupported] = useState(() => typeof window !== "undefined" && Boolean(getRecognitionConstructor()));
  const [voiceStatus, setVoiceStatusState] = useState("idle");
  const [lastText, setLastText] = useState("");
  const voiceStatusRef = useRef("idle");

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
  }, [clearWakeRestartTimer, detachAndStopRecognition]);

  const stopCommandRecognition = useCallback(() => {
    clearCommandTimeout();
    const recognition = commandRecognitionRef.current;
    commandRecognitionRef.current = null;
    detachAndStopRecognition(recognition);
  }, [clearCommandTimeout, detachAndStopRecognition]);

  const scheduleWakeRestart = useCallback((delay = WAKE_RESTART_DELAY_MS) => {
    clearWakeRestartTimer();
    if (!wakeModeRef.current) return;
    wakeRestartTimerRef.current = window.setTimeout(() => {
      startWakeListeningRef.current?.();
    }, delay);
  }, [clearWakeRestartTimer]);

  const hideOverlay = useCallback(() => {
    setVoiceStatus("idle");
    setOverlayReply("");
    setLastText("");
    setError("");
  }, [setVoiceStatus]);

  const speakWakeReply = useCallback((text, { closeOverlay = false, resumeWake = true } = {}) => {
    if (!text || !("speechSynthesis" in window)) {
      if (closeOverlay) hideOverlay();
      if (resumeWake) scheduleWakeRestart();
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-IN";
    utterance.rate = 0.96;

    utterance.onstart = () => {
      setVoiceStatus("speaking");
    };

    utterance.onend = () => {
      if (closeOverlay) {
        hideOverlay();
      } else {
        setVoiceStatus("idle");
      }
      if (resumeWake) scheduleWakeRestart();
    };

    utterance.onerror = () => {
      if (closeOverlay) {
        hideOverlay();
      } else {
        setVoiceStatus("idle");
      }
      if (resumeWake) scheduleWakeRestart();
    };

    window.speechSynthesis.speak(utterance);
  }, [hideOverlay, scheduleWakeRestart, setVoiceStatus]);

  const dismissOverlay = useCallback(() => {
    stopCommandRecognition();
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    hideOverlay();
    if (wakeModeRef.current) {
      scheduleWakeRestart(120);
    }
  }, [hideOverlay, scheduleWakeRestart, stopCommandRecognition]);

  const pauseWakeMode = useCallback(() => {
    wakeModeRef.current = false;
    setWakeModeState(false);
    clearWakeRestartTimer();
    stopCommandRecognition();
    pauseWakeRecognition();
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    hideOverlay();
  }, [clearWakeRestartTimer, hideOverlay, pauseWakeRecognition, stopCommandRecognition]);

  const stopListening = useCallback(() => {
    wakeModeRef.current = false;
    localStorage.setItem(WAKE_MODE_KEY, "false");
    setWakeModeState(false);
    clearWakeRestartTimer();
    stopCommandRecognition();
    pauseWakeRecognition();
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    hideOverlay();
  }, [clearWakeRestartTimer, hideOverlay, pauseWakeRecognition, stopCommandRecognition]);

  const setWakeMode = useCallback((enabled) => {
    wakeModeRef.current = enabled;
    localStorage.setItem(WAKE_MODE_KEY, enabled ? "true" : "false");
    setWakeModeState(enabled);
    window.dispatchEvent(new CustomEvent("prepmatrixWakeModeChange", { detail: { enabled } }));
  }, []);

  const sendQuestionToAssistant = useCallback(async (question) => {
    const payload = await api.post("/api/study-assistant/chat", { message: question, plannerContext });
    return payload.reply?.trim() || "I could not generate an answer for that question.";
  }, [plannerContext]);

  const processSpokenText = useCallback(async (spokenText, { speakReply = true } = {}) => {
    const cleanText = spokenText.trim();
    if (!cleanText || processingRef.current) return;

    processingRef.current = true;
    setIsProcessing(true);
    setTranscript(cleanText);
    setLastText(cleanText);
    setOverlayReply("");
    setVoiceStatus("processing");
    setError("");

    try {
      const pageCommand = resolvePageCommand(cleanText);

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
        window.scrollBy({ top: pageCommand.top, behavior: "smooth" });
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

      const quickAnswer = resolveQuickVoiceAnswer(cleanText);
      const answer = quickAnswer || await sendQuestionToAssistant(cleanText);
      setReply(answer);
      setOverlayReply(answer);
      if (speakReply) {
        speakWakeReply(cleanAssistantTextForSpeech(answer), { closeOverlay: false, resumeWake: true });
      } else {
        setVoiceStatus("answered");
        scheduleWakeRestart();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to complete that voice request.";
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
  }, [hideOverlay, navigate, scheduleWakeRestart, sendQuestionToAssistant, setVoiceStatus, speakWakeReply]);

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
      const spokenText = Array.from(event.results)
        .map((result) => result[0]?.transcript || "")
        .join(" ")
        .trim();

      if (spokenText) {
        captured = true;
        commandRecognitionRef.current = null;
        processSpokenText(spokenText, { speakReply: true });
      }
    };

    recognition.onerror = (event) => {
      clearCommandTimeout();
      commandRecognitionRef.current = null;
      setIsListening(false);
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
      hideOverlay();
      scheduleWakeRestart();
    }
  }, [clearCommandTimeout, createRecognition, detachAndStopRecognition, hideOverlay, pauseWakeRecognition, processSpokenText, scheduleWakeRestart, setVoiceStatus, stopCommandRecognition]);

  const startWakeListening = useCallback(() => {
    if (!wakeModeRef.current) return;

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
        setWakeMode(false);
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
  }, [createRecognition, pauseWakeRecognition, processSpokenText, scheduleWakeRestart, setVoiceStatus, setWakeMode, startCommandListening]);

  useEffect(() => {
    startWakeListeningRef.current = startWakeListening;
  }, [startWakeListening]);

  const askWithVoice = useCallback(() => {
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

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event) => {
      const spokenText = Array.from(event.results)
        .map((result) => result[0]?.transcript || "")
        .join(" ")
        .trim();

      if (spokenText) {
        commandRecognitionRef.current = null;
        processSpokenText(spokenText, { speakReply: false });
      }
    };

    recognition.onerror = (event) => {
      commandRecognitionRef.current = null;
      setIsListening(false);
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
      commandRecognitionRef.current = null;
      setIsListening(false);
      if (!processingRef.current) {
        scheduleWakeRestart();
      }
    };

    try {
      recognition.start();
    } catch {
      commandRecognitionRef.current = null;
      setIsListening(false);
      setError("Microphone permission is required for voice recognition.");
      setVoiceStatus("error");
      scheduleWakeRestart();
    }
  }, [createRecognition, hideOverlay, pauseWakeRecognition, processSpokenText, scheduleWakeRestart, setVoiceStatus, stopCommandRecognition]);

  useEffect(() => {
    const nextSupported = Boolean(getRecognitionConstructor());
    setSupported(nextSupported);
    if (!nextSupported) {
      setError(UNSUPPORTED_MESSAGE);
    }
  }, []);

  useEffect(() => {
    const handleWakeModeChange = (event) => {
      const enabled = Boolean(event.detail?.enabled);
      wakeModeRef.current = enabled;
      setWakeModeState(enabled);
      if (enabled) {
        scheduleWakeRestart(80);
      } else {
        clearWakeRestartTimer();
        stopCommandRecognition();
        pauseWakeRecognition();
        hideOverlay();
        if ("speechSynthesis" in window) {
          window.speechSynthesis.cancel();
        }
      }
    };

    const handleStorage = (event) => {
      if (event.key === WAKE_MODE_KEY) {
        const enabled = event.newValue === "true";
        window.dispatchEvent(new CustomEvent("prepmatrixWakeModeChange", { detail: { enabled } }));
      }
    };

    window.addEventListener("prepmatrixWakeModeChange", handleWakeModeChange);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("prepmatrixWakeModeChange", handleWakeModeChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, [clearWakeRestartTimer, hideOverlay, pauseWakeRecognition, scheduleWakeRestart, stopCommandRecognition]);

  useEffect(() => {
    if (wakeMode) {
      wakeModeRef.current = true;
      scheduleWakeRestart(80);
      return undefined;
    }

    wakeModeRef.current = false;
    clearWakeRestartTimer();
    stopCommandRecognition();
    pauseWakeRecognition();
    hideOverlay();
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    return undefined;
  }, [clearWakeRestartTimer, hideOverlay, pauseWakeRecognition, scheduleWakeRestart, stopCommandRecognition, wakeMode]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("voiceRecordingChange", { detail: { isRecording: isListening && !wakeMode } }));
  }, [isListening, wakeMode]);

  useEffect(() => () => {
    clearWakeRestartTimer();
    stopCommandRecognition();
    pauseWakeRecognition();
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }, [clearWakeRestartTimer, pauseWakeRecognition, stopCommandRecognition]);

  const isAwake = voiceStatus === "awake" || voiceStatus === "listening" || voiceStatus === "processing" || voiceStatus === "speaking" || voiceStatus === "answered";

  return {
    askWithVoice,
    dismissOverlay,
    error,
    isListening,
    isProcessing,
    reply,
    overlayReply,
    pauseWakeMode,
    setWakeMode,
    supported,
    transcript,
    wakeMode,
    voiceStatus,
    lastText,
    isAwake,
    stopListening,
  };
}

