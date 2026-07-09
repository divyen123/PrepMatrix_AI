import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getPlannerMetrics } from "../utils/plannerMetrics";

const API_BASE = import.meta.env.VITE_API_URL || "";
const WAKE_MODE_KEY = "prepmatrix_wake_mode";
const VOICE_REPLIES_KEY = "prepmatrix_voice_replies";
const UNSUPPORTED_MESSAGE = "Voice recognition is not supported in this browser. Please try Chrome or Edge.";
const WAKE_WORDS = ["hey prep", "prep matrix", "hey prepmatrix"];

function getRecognitionConstructor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function normalizeVoiceText(text = "") {
  return text
    .toLowerCase()
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

  const command = normalized
    .replace(new RegExp(`^.*?\\b${wakeWord.replace(/\s+/g, "\\s+")}\\b`), "")
    .trim();

  return { matched: true, command: command || normalized };
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

  const speak = useCallback((text) => {
    if (!text || !speakingEnabledRef.current || !("speechSynthesis" in window)) {
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-IN";
    utterance.rate = 0.96;
    window.speechSynthesis.speak(utterance);
  }, []);

  const stopListening = useCallback(() => {
    wakeRestartRef.current = false;
    setIsListening(false);

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
  }, []);

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
    setError("");

    try {
      const pageCommand = resolvePageCommand(cleanText);

      if (pageCommand?.type === "navigate") {
        navigate(pageCommand.route);
        setReply(pageCommand.response);
        speak(pageCommand.response);
        return;
      }

      if (pageCommand?.type === "scroll") {
        window.scrollBy({ top: pageCommand.top, behavior: "smooth" });
        setReply(pageCommand.response);
        speak(pageCommand.response);
        return;
      }

      const answer = await sendQuestionToAssistant(cleanText);
      setReply(answer);
      speak(answer);
      window.openStudyAssistant?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to complete that voice request.";
      setError(message);
      setReply(message);
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
      return null;
    }

    setSupported(true);
    const recognition = new SpeechRecognition();
    recognition.continuous = continuous;
    recognition.interimResults = false;
    recognition.lang = "en-IN";
    return recognition;
  }, []);

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

        const spokenText = result[0]?.transcript?.trim() || "";
        const wakeCommand = getWakeCommand(spokenText);

        if (wakeCommand.matched) {
          processSpokenText(wakeCommand.command);
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
      }, 250);
    };

    try {
      recognition.start();
      setIsListening(true);
      setError("");
    } catch {
      setError("Microphone permission is required for voice recognition.");
      setWakeMode(false);
      stopListening();
    }
  }, [createRecognition, processSpokenText, setWakeMode, stopListening]);

  const askWithVoice = useCallback(() => {
    stopListening();
    const recognition = createRecognition(false);

    if (!recognition) {
      speak(UNSUPPORTED_MESSAGE);
      return;
    }

    wakeRestartRef.current = false;
    recognitionRef.current = recognition;
    setTranscript("");
    setReply("");
    setError("");

    recognition.onresult = (event) => {
      const spokenText = Array.from(event.results)
        .map((result) => result[0]?.transcript || "")
        .join(" ")
        .trim();

      if (spokenText) {
        processSpokenText(spokenText);
      }
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("Microphone permission is required for voice recognition.");
        return;
      }

      if (event.error !== "no-speech" && event.error !== "aborted") {
        setError(`Voice recognition error: ${event.error}.`);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    try {
      recognition.start();
      setIsListening(true);
    } catch {
      setError("Microphone permission is required for voice recognition.");
      setIsListening(false);
    }
  }, [createRecognition, processSpokenText, speak, stopListening]);

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

  return {
    askWithVoice,
    error,
    isListening,
    isProcessing,
    reply,
    setSpeakingEnabled: (enabled) => {
      window.dispatchEvent(new CustomEvent("prepmatrixVoiceRepliesChange", { detail: { enabled } }));
    },
    setWakeMode,
    supported,
    transcript,
    wakeMode,
  };
}
