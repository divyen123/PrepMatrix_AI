import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getPlannerMetrics } from "../utils/plannerMetrics";

const API_BASE = import.meta.env.VITE_API_URL || "";
const WAKE_MODE_KEY = "prepmatrix_wake_mode";
const VOICE_REPLIES_KEY = "prepmatrix_voice_replies";
const UNSUPPORTED_MESSAGE = "Voice recognition is not supported in this browser. Please try Chrome or Edge.";
const LISTENING_TIMEOUT_MS = 8500;

// Primary wake words + phonetic near-matches that speech engines commonly return
const WAKE_WORDS = [
  "hey prep",
  "prep matrix",
  "hey prepmatrix",
  "hey prep matrix",
  // phonetic variations browsers commonly output
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
    // strip filler sounds um / uh / hmm
    .replace(/\b(um|uh|hmm|ah|oh)\b/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readStoredWakeMode() {
  return localStorage.getItem(WAKE_MODE_KEY) === "true";
}

function readStoredSpeaking() {
  const stored = localStorage.getItem(VOICE_REPLIES_KEY);
  return stored === null ? true : stored === "true";
}

function getWakeCommand(rawText = "") {
  const normalized = normalizeVoiceText(rawText);
  const wakeWord = WAKE_WORDS.find((word) => normalized.includes(word));

  if (!wakeWord) {
    return { matched: false, command: "" };
  }

  // Strip everything up to and including the wake word, keep only the command that follows
  const command = normalized
    .replace(new RegExp(`^.*?\\b${wakeWord.replace(/\s+/g, "\\s+")}\\b`), "")
    .trim();

  // Return empty command if only the wake word was said — caller should prompt for command
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

function resolvePageCommand(spokenText = "") {
  const normalized = normalizeVoiceText(spokenText);

  if (/\b(open|go to)\s+(home|dashboard)\b/.test(normalized)) {
    return { type: "navigate", route: "/dashboard", response: normalized.includes("home") ? "Opening home page." : "Opening dashboard page." };
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
  const recognitionRef = useRef(null);
  const wakeRestartRef = useRef(false);
  const processingRef = useRef(false);
  const speakingEnabledRef = useRef(readStoredSpeaking());
  const wakeModeRef = useRef(readStoredWakeMode());
  const commandTimeoutRef = useRef(null);

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
  const [error, setError] = useState("");
  const [supported, setSupported] = useState(() => typeof window !== "undefined" && Boolean(getRecognitionConstructor()));
  const [voiceStatus, setVoiceStatusState] = useState("idle");
  const voiceStatusRef = useRef("idle");
  const setVoiceStatus = useCallback((status) => {
    voiceStatusRef.current = status;
    setVoiceStatusState(status);
  }, []);

  const [lastText, setLastText] = useState("");
  const [overlayReply, setOverlayReply] = useState("");

  const clearCommandTimeout = useCallback(() => {
    if (commandTimeoutRef.current) {
      window.clearTimeout(commandTimeoutRef.current);
      commandTimeoutRef.current = null;
    }
  }, []);

  const speak = useCallback((text) => {
    if (!text || !speakingEnabledRef.current || !("speechSynthesis" in window)) {
      setVoiceStatus("idle");
      // Resume wake listening immediately if wake mode is on and speech is skipped/disabled
      if (wakeModeRef.current) {
        startWakeListeningRef.current?.();
      }
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
      setVoiceStatus("idle");
      // Resume wake listening once the speech completes
      if (wakeModeRef.current) {
        startWakeListeningRef.current?.();
      }
    };

    utterance.onerror = () => {
      setVoiceStatus("idle");
      // Resume wake listening if speaking fails
      if (wakeModeRef.current) {
        startWakeListeningRef.current?.();
      }
    };

    window.speechSynthesis.speak(utterance);
  }, []);

  const stopListening = useCallback(() => {
    wakeRestartRef.current = false;
    clearCommandTimeout();
    setIsListening(false);
    setVoiceStatus("idle");

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.onerror = null;
      recognitionRef.current.onresult = null;
      try {
        recognitionRef.current.stop();
      } catch {
        // Recognition may already be stopped by the browser.
      }
      recognitionRef.current = null;
    }
  }, [clearCommandTimeout]);

  const setWakeMode = useCallback((enabled) => {
    wakeModeRef.current = enabled;
    localStorage.setItem(WAKE_MODE_KEY, enabled ? "true" : "false");
    setWakeModeState(enabled);
    window.dispatchEvent(new CustomEvent("prepmatrixWakeModeChange", { detail: { enabled } }));
  }, []);

  const sendQuestionToAssistant = useCallback(async (question) => {
    const response = await fetch(`${API_BASE}/api/study-assistant/chat`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: question, plannerContext }),
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload?.error || "Unable to reach the AI assistant.");
    }

    return payload.reply?.trim() || "I could not generate an answer for that question.";
  }, [plannerContext]);

  const processSpokenText = useCallback(async (spokenText) => {
    const cleanText = spokenText.trim();
    if (!cleanText || processingRef.current) {
      return;
    }

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
        speak(pageCommand.response);
        return;
      }

      if (pageCommand?.type === "scroll") {
        window.scrollBy({ top: pageCommand.top, behavior: "smooth" });
        setReply(pageCommand.response);
        setOverlayReply(pageCommand.response);
        speak(pageCommand.response);
        return;
      }

      const quickAnswer = resolveQuickVoiceAnswer(cleanText);
      const answer = quickAnswer || await sendQuestionToAssistant(cleanText);
      setReply(answer);
      setOverlayReply(answer);
      speak(answer);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to complete that voice request.";
      setError(message);
      setReply(message);
      setOverlayReply(message);
      setVoiceStatus("error");
      speak(message);
    } finally {
      processingRef.current = false;
      setIsProcessing(false);
    }
  }, [navigate, sendQuestionToAssistant, speak]);

  const createRecognition = useCallback((continuous) => {
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
    // Interim results only for wake-mode so we can react faster
    recognition.interimResults = false;
    recognition.maxAlternatives = 5;
    // Try device locale first, fall back to en-US for better accuracy on Indian accents
    recognition.lang = "en-IN";
    return recognition;
  }, []);

  const startCommandListening = useCallback(() => {
    // After wake word fires, start a dedicated one-shot command recognition session
    const SpeechRecognition = getRecognitionConstructor();
    if (!SpeechRecognition) return;

    // Briefly stop the wake recognition so it doesn't fight the command session
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.onerror = null;
      recognitionRef.current.onresult = null;
      try { recognitionRef.current.stop(); } catch { /* already stopped */ }
      recognitionRef.current = null;
    }

    const cmdRecognition = new SpeechRecognition();
    cmdRecognition.continuous = false;
    cmdRecognition.interimResults = false;
    cmdRecognition.maxAlternatives = 3;
    cmdRecognition.lang = "en-IN";

    setVoiceStatus("listening");
    setLastText("");
    setOverlayReply("");

    clearCommandTimeout();
    commandTimeoutRef.current = window.setTimeout(() => {
      try {
        cmdRecognition.stop();
      } catch {
        // The browser may have already closed this session.
      }
      if (voiceStatusRef.current === "listening") {
        const prompt = "I did not catch that. Please try again.";
        setLastText(prompt);
        setOverlayReply(prompt);
        speak(prompt);
      }
    }, LISTENING_TIMEOUT_MS);

    cmdRecognition.onresult = (event) => {
      clearCommandTimeout();
      const spokenText = Array.from(event.results)
        .map((r) => r[0]?.transcript || "")
        .join(" ")
        .trim();

      if (spokenText) {
        processSpokenText(spokenText);
      } else {
        if (event.error === "no-speech") {
          setOverlayReply("I did not catch that. Please try again.");
        }
        setVoiceStatus("idle");
      }
    };

    cmdRecognition.onerror = (event) => {
      clearCommandTimeout();
      if (event.error !== "no-speech" && event.error !== "aborted") {
        setError(`Voice recognition error: ${event.error}.`);
      } else if (event.error === "no-speech") {
        const prompt = "I did not catch that. Please try again.";
        setLastText(prompt);
        setOverlayReply(prompt);
        speak(prompt);
        return;
      }
      setVoiceStatus("idle");
    };

    cmdRecognition.onend = () => {
      clearCommandTimeout();
      setIsListening(false);
      // Resume wake listening once command session ends, ONLY if we didn't transition to a processing/speaking state
      if (wakeModeRef.current && (voiceStatusRef.current === "idle" || voiceStatusRef.current === "listening")) {
        window.setTimeout(() => {
          if (wakeModeRef.current && (voiceStatusRef.current === "idle" || voiceStatusRef.current === "listening")) {
            startWakeListeningRef.current?.();
          }
        }, 400);
      }
    };

    try {
      cmdRecognition.start();
      setIsListening(true);
    } catch {
      setVoiceStatus("idle");
      if (wakeModeRef.current) {
        window.setTimeout(() => startWakeListeningRef.current?.(), 400);
      }
    }
  }, [clearCommandTimeout, processSpokenText, speak]);

  // Stable ref so startCommandListening can call startWakeListening without circular dependency
  const startWakeListeningRef = useRef(null);

  const startWakeListening = useCallback(() => {
    stopListening();
    const recognition = createRecognition(true);

    if (!recognition) {
      return;
    }

    wakeRestartRef.current = true;
    recognitionRef.current = recognition;

    recognition.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (!result.isFinal) continue;

        // Check every alternative transcript the engine produced
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
          setVoiceStatus("awake");
          setOverlayReply("");
          if (matchedCommand.command) {
            // Wake word + inline command (e.g. "Hey Prep, what's my progress?")
            processSpokenText(matchedCommand.command);
          } else {
            // Wake word only (e.g. just "Hey Prep") → wait for command
            startCommandListening();
          }
        }
      }
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("Microphone permission is required for voice recognition.");
        setWakeMode(false);
        stopListening();
        return;
      }

      if (event.error !== "no-speech" && event.error !== "aborted") {
        setError(`Voice recognition error: ${event.error}.`);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      if (!wakeRestartRef.current || !wakeModeRef.current) {
        return;
      }

      window.setTimeout(() => {
        try {
          recognition.start();
          setIsListening(true);
        } catch {
          setError("Voice recognition could not restart. Toggle Wake Mode off and on to try again.");
        }
      }, 300);
    };

    try {
      recognition.start();
      setIsListening(true);
      setError("");
      startWakeListeningRef.current = startWakeListening;
    } catch {
      setError("Microphone permission is required for voice recognition.");
      setWakeMode(false);
      stopListening();
    }
  }, [createRecognition, processSpokenText, setWakeMode, startCommandListening, stopListening]);

  const askWithVoice = useCallback(() => {
    stopListening();
    const recognition = createRecognition(false);

    if (!recognition) {
      speak(UNSUPPORTED_MESSAGE);
      setVoiceStatus("error");
      return;
    }

    wakeRestartRef.current = false;
    recognitionRef.current = recognition;
    setTranscript("");
    setReply("");
    setOverlayReply("");
    setError("");
    setVoiceStatus("listening");

    recognition.onstart = () => {
      setIsListening(true);
      setVoiceStatus("listening");
    };

    recognition.onresult = (event) => {
      clearCommandTimeout();
      const spokenText = Array.from(event.results)
        .map((result) => result[0]?.transcript || "")
        .join(" ")
        .trim();

      if (spokenText) {
        processSpokenText(spokenText);
      } else {
        if (event.error === "no-speech") {
          setOverlayReply("I did not catch that. Please try again.");
        }
        setVoiceStatus("idle");
      }
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("Microphone permission is required for voice recognition.");
        setVoiceStatus("error");
        return;
      }

      if (event.error !== "no-speech" && event.error !== "aborted") {
        setError(`Voice recognition error: ${event.error}.`);
        setVoiceStatus("error");
      } else {
        if (event.error === "no-speech") {
          setOverlayReply("I did not catch that. Please try again.");
        }
        setVoiceStatus("idle");
      }
    };

    recognition.onend = () => {
      clearCommandTimeout();
      setIsListening(false);
      recognitionRef.current = null;
      // Resume wake listening once manual session ends, ONLY if we didn't transition to a processing/speaking state
      if (wakeModeRef.current && (voiceStatusRef.current === "idle" || voiceStatusRef.current === "listening")) {
        window.setTimeout(() => {
          if (wakeModeRef.current && (voiceStatusRef.current === "idle" || voiceStatusRef.current === "listening")) {
            startWakeListeningRef.current?.();
          }
        }, 400);
      }
    };

    try {
      recognition.start();
      setIsListening(true);
      clearCommandTimeout();
      commandTimeoutRef.current = window.setTimeout(() => {
        try {
          recognition.stop();
        } catch {
          // The browser may have already closed this session.
        }
      }, LISTENING_TIMEOUT_MS);
    } catch {
      setError("Microphone permission is required for voice recognition.");
      setVoiceStatus("error");
      setIsListening(false);
    }
  }, [clearCommandTimeout, createRecognition, processSpokenText, speak, stopListening]);

  useEffect(() => {
    const nextSupported = Boolean(getRecognitionConstructor());
    setSupported(nextSupported);
    if (!nextSupported) {
      setError(UNSUPPORTED_MESSAGE);
    }
  }, []);

  useEffect(() => {
    speakingEnabledRef.current = readStoredSpeaking();

    const handleSpeakingChange = (event) => {
      const enabled = Boolean(event.detail?.enabled);
      speakingEnabledRef.current = enabled;
      localStorage.setItem(VOICE_REPLIES_KEY, enabled ? "true" : "false");
      if (!enabled && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };

    window.addEventListener("prepmatrixVoiceRepliesChange", handleSpeakingChange);
    return () => window.removeEventListener("prepmatrixVoiceRepliesChange", handleSpeakingChange);
  }, []);

  useEffect(() => {
    const handleWakeModeChange = (event) => {
      const enabled = Boolean(event.detail?.enabled);
      wakeModeRef.current = enabled;
      setWakeModeState(enabled);
    };

    const handleStorage = (event) => {
      if (event.key === WAKE_MODE_KEY) {
        const enabled = event.newValue === "true";
        wakeModeRef.current = enabled;
        setWakeModeState(enabled);
      }
    };

    window.addEventListener("prepmatrixWakeModeChange", handleWakeModeChange);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("prepmatrixWakeModeChange", handleWakeModeChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    if (wakeMode) {
      wakeModeRef.current = true;
      startWakeListening();
      return undefined;
    }

    wakeModeRef.current = false;
    stopListening();
    return undefined;
  }, [startWakeListening, stopListening, wakeMode]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("voiceRecordingChange", { detail: { isRecording: isListening && !wakeMode } }));
  }, [isListening, wakeMode]);

  useEffect(() => () => {
    stopListening();
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }, [stopListening]);

  const isAwake = voiceStatus === "awake" || voiceStatus === "processing" || voiceStatus === "speaking";

  return {
    askWithVoice,
    error,
    isListening,
    isProcessing,
    reply,
    overlayReply,
    setSpeakingEnabled: (enabled) => {
      window.dispatchEvent(new CustomEvent("prepmatrixVoiceRepliesChange", { detail: { enabled } }));
    },
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
