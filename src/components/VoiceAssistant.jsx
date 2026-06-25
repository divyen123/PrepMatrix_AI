import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getPlannerMetrics } from "../utils/plannerMetrics";
import {
  formatAssistantTime,
  normalizeAssistantText,
  resolveLocalAssistantCommand,
} from "../utils/assistantCommands";

const API_BASE = import.meta.env.VITE_API_URL || "";

const TRANSCRIPTION_PROMPT =
  "Transcribe spoken study-planner commands accurately. Preserve subject names, chapter numbers, timer durations, and short task phrases.";

const QUICK_COMMANDS = [
  "What is my progress?",
  "What should I study today?",
  "Which subject needs more focus?",
  "What is the time now?",
  "What is today's date?",
];

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.split(",")[1] || "");
    };
    reader.onerror = () => reject(new Error("Unable to read recorded audio."));
    reader.readAsDataURL(blob);
  });
}

function readWakeWord() {
  return "Hey Jarvis";
}

function escapeWakeWord(text = "") {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractWakeCommand(rawText, wakeWord) {
  const pattern = new RegExp(
    `\\b${escapeWakeWord(wakeWord.trim()).replace(/\s+/g, "\\s+")}\\b[\\s,:-]*(.*)`,
    "i"
  );

  const match = rawText.match(pattern);
  return match?.[1]?.trim() || "";
}

function VoiceAssistant({ onReset, schedule = [], completed = [], setDarkMode }) {
  const navigate = useNavigate();
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const wakeRecognitionRef = useRef(null);
  const wakeRestartRef = useRef(false);
  const wakeTimeoutRef = useRef(null);
  const wakeWordRef = useRef(readWakeWord());
  const awaitingWakeCommandRef = useRef(false);
  const processWakeTranscriptRef = useRef(() => {});

  const metrics = useMemo(
    () => getPlannerMetrics(schedule, completed),
    [schedule, completed]
  );

  const [assistantReady, setAssistantReady] = useState({
    available: false,
    model: "whisper-large-v3-turbo",
    message: "",
  });
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [speakingEnabled, setSpeakingEnabled] = useState(true);
  const [transcript, setTranscript] = useState("");
  const [assistantReply, setAssistantReply] = useState(
    "Ready to capture study commands, theme changes, and quick time or date questions."
  );
  const [history, setHistory] = useState([]);
  const [error, setError] = useState("");
  const [wakeWord, setWakeWord] = useState(readWakeWord);
  const [wakeSupported, setWakeSupported] = useState(false);
  const [wakeListening, setWakeListening] = useState(false);
  const [awaitingWakeCommand, setAwaitingWakeCommand] = useState(false);

  const speak = (text) => {
    if (!speakingEnabled || !("speechSynthesis" in window) || !text) {
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.96;
    utterance.pitch = 0.92;
    utterance.lang = "en-US";

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const toggleSpeaking = () => {
    setSpeakingEnabled((value) => {
      const nextValue = !value;

      if (!nextValue && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }

      return nextValue;
    });
  };

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const clearWakeTimeout = () => {
    if (wakeTimeoutRef.current) {
      clearTimeout(wakeTimeoutRef.current);
      wakeTimeoutRef.current = null;
    }
  };

  const stopWakeListening = (options = {}) => {
    wakeRestartRef.current = false;
    clearWakeTimeout();
    setAwaitingWakeCommand(false);
    setWakeListening(false);

    if (wakeRecognitionRef.current) {
      wakeRecognitionRef.current.onend = null;
      wakeRecognitionRef.current.stop();
      wakeRecognitionRef.current = null;
    }

    if (options.silent) {
      return;
    }

    setAssistantReply(`Wake mode paused. Use the record button or say "${wakeWord}" after re-enabling wake mode.`);
  };

  const addHistoryEntry = (spokenText, responseText, mode) => {
    setHistory((current) => [
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        spokenText,
        responseText,
        mode,
        createdAt: formatAssistantTime(),
      },
      ...current,
    ].slice(0, 5));
  };

  const getHistoryModeLabel = (mode) => {
    if (mode === "planner") {
      return "Planner command";
    }

    if (mode === "utility") {
      return "Utility answer";
    }

    if (mode === "system") {
      return "Workspace action";
    }

    return "Chat route";
  };

  const armWakeWindow = () => {
    clearWakeTimeout();
    setAwaitingWakeCommand(true);
    awaitingWakeCommandRef.current = true;
    setAssistantReply(`Wake phrase heard. Say your command now after "${wakeWord}".`);
    wakeTimeoutRef.current = setTimeout(() => {
      setAwaitingWakeCommand(false);
      awaitingWakeCommandRef.current = false;
      setAssistantReply(`Wake window expired. Say "${wakeWord}" again when you are ready.`);
    }, 8000);
  };

  const handlePlannerCommand = (spokenText) => {
    clearWakeTimeout();
    setAwaitingWakeCommand(false);
    awaitingWakeCommandRef.current = false;

    const localCommand = resolveLocalAssistantCommand(spokenText, {
      metrics,
      onReset,
      setDarkMode,
      navigate,
    });

    if (localCommand) {
      setAssistantReply(localCommand.response);
      addHistoryEntry(spokenText, localCommand.response, localCommand.mode);
      speak(localCommand.response);
      return;
    }

    const mode = "chat";
    window.openStudyAssistant?.();
    window.sendToChatbot?.(spokenText);
    const response =
      "I sent that request to the study assistant chat for a more detailed answer.";

    setAssistantReply(response);
    addHistoryEntry(spokenText, response, mode);
    speak(response);
  };

  const processWakeTranscript = (spokenText) => {
    const normalizedTranscript = normalizeAssistantText(spokenText);
    const activeWakeWord = wakeWordRef.current;
    const normalizedWakeWord = normalizeAssistantText(activeWakeWord);

    if (!normalizedWakeWord) {
      return;
    }

    if (awaitingWakeCommandRef.current) {
      if (normalizedTranscript === normalizedWakeWord) {
        armWakeWindow();
        return;
      }

      setTranscript(spokenText);
      handlePlannerCommand(spokenText);
      return;
    }

    if (!normalizedTranscript.includes(normalizedWakeWord)) {
      return;
    }

    const inlineCommand = extractWakeCommand(spokenText, activeWakeWord);

    if (inlineCommand) {
      setTranscript(inlineCommand);
      handlePlannerCommand(inlineCommand);
      return;
    }

    setTranscript(spokenText);
    armWakeWindow();
  };

  const startWakeListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setWakeSupported(false);
      setError("Wake mode needs browser speech recognition support. Use Chrome or Edge for hands-free wake.");
      return;
    }

    if (wakeListening) {
      return;
    }

    setWakeSupported(true);
    setError("");

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-IN";

    recognition.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];

        if (result.isFinal) {
          processWakeTranscriptRef.current(result[0]?.transcript?.trim() || "");
        }
      }
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("Microphone permission is required for wake mode.");
        stopWakeListening({ silent: true });
        return;
      }

      if (event.error !== "no-speech" && event.error !== "aborted") {
        setError(`Wake mode error: ${event.error}.`);
      }
    };

    recognition.onend = () => {
      if (!wakeRestartRef.current) {
        setWakeListening(false);
        return;
      }

      try {
        recognition.start();
      } catch {
        window.setTimeout(() => {
          try {
            recognition.start();
          } catch {
            setError("Wake mode could not restart automatically.");
            stopWakeListening({ silent: true });
          }
        }, 250);
      }
    };

    wakeRecognitionRef.current = recognition;
    wakeRestartRef.current = true;

    try {
      recognition.start();
      setWakeListening(true);
      setAssistantReply(`Wake mode enabled. Say "${wakeWord}" to start talking hands-free.`);
    } catch {
      setError("Wake mode could not start. Check browser microphone permission and try again.");
      stopWakeListening({ silent: true });
    }
  };

  const transcribeAudio = async (blob) => {
    setIsTranscribing(true);
    setError("");

    try {
      const audio = await blobToBase64(blob);

      const response = await fetch(`${API_BASE}/api/voice-assistant/transcribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          audio,
          mimeType: blob.type || "audio/webm",
          language: "en",
          prompt: TRANSCRIPTION_PROMPT,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || "Unable to transcribe audio.");
      }

      const spokenText = payload.text?.trim();

      if (!spokenText) {
        throw new Error("Whisper did not return any transcript.");
      }

      setTranscript(spokenText);
      handlePlannerCommand(spokenText);
    } catch (transcriptionError) {
      const message =
        transcriptionError instanceof Error
          ? transcriptionError.message
          : "Unexpected transcription failure.";

      setError(message);
      setAssistantReply("I could not complete that voice request.");
    } finally {
      setIsTranscribing(false);
    }
  };

  const startRecording = async () => {
    if (isRecording || isTranscribing) {
      return;
    }

    if (wakeListening) {
      stopWakeListening({ silent: true });
    }

    if (!assistantReady.available) {
      setError(
        assistantReady.message ||
        "Voice transcription is not connected. Add GROQ_API_KEY and run npm run server."
      );
      return;
    }

    try {
      setError("");
      setTranscript("");
      chunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType });

      streamRef.current = stream;
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        setIsRecording(false);
        stopStream();
        setError("Microphone capture failed. Check browser permissions.");
      };

      recorder.onstop = async () => {
        setIsRecording(false);

        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });

        stopStream();
        chunksRef.current = [];

        if (blob.size) {
          await transcribeAudio(blob);
        }
      };

      recorder.start();
      setAssistantReply("Listening for your study command...");
      setIsRecording(true);
    } catch (mediaError) {
      setError(
        mediaError instanceof Error
          ? mediaError.message
          : "Microphone access was not granted."
      );
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
      return;
    }

    setIsRecording(false);
    stopStream();
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
      return;
    }

    startRecording();
  };

  useEffect(() => {
    const checkAssistantStatus = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/voice-assistant/status`);
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload?.error || "Unable to reach voice assistant service.");
        }

        setAssistantReady({
          available: Boolean(payload.available),
          model: payload.model || "whisper-large-v3-turbo",
          message: payload.message || "",
        });
      } catch {
        setAssistantReady({
          available: false,
          model: "whisper-large-v3-turbo",
          message: "Unable to reach the voice assistant service.",
        });
      }
    };

    checkAssistantStatus();
  }, []);

  useEffect(() => {
    setWakeSupported(Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));
  }, []);

  useEffect(() => {
    wakeWordRef.current = wakeWord;
  }, [wakeWord]);

  useEffect(() => {
    awaitingWakeCommandRef.current = awaitingWakeCommand;
  }, [awaitingWakeCommand]);

  processWakeTranscriptRef.current = processWakeTranscript;

  useEffect(() => {
    window.studyVoiceAssistant = {
      startRecording,
      stopRecording,
      toggleRecording,
    };
  }, [assistantReady.available, isRecording, isTranscribing, transcript, startRecording, stopRecording, toggleRecording]);

  useEffect(() => () => {
    delete window.studyVoiceAssistant;
    stopWakeListening({ silent: true });
    stopStream();

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  return (
    <section className="card assistant-card">
      <div className="assistant-header">
        <div>
          <span className="section-tag">Voice Control</span>
          <h2>Whisper assistant</h2>
        </div>

        <div className="assistant-status-row">
          <span className={`status-pill ${assistantReady.available ? "online" : "offline"}`}>
            {assistantReady.available ? assistantReady.model : "Server required"}
          </span>
          <span className={`status-pill ${isTranscribing ? "busy" : "idle"}`}>
            {isTranscribing ? "Transcribing" : isRecording ? "Recording" : "Idle"}
          </span>
        </div>
      </div>

      <p className="assistant-summary">
        Record a spoken request with Whisper, or enable wake mode and say your
        assistant name for a hands-free flow into planner commands, or
        the assistant chat.
      </p>

      <div className="assistant-toolbar">
        <button
          className={`voice-record-btn ${isRecording ? "recording" : ""}`}
          onClick={toggleRecording}
          type="button"
        >
          {isRecording ? "Stop recording" : "Start recording"}
        </button>

        <button
          className="secondary-btn"
          onClick={toggleSpeaking}
          type="button"
        >
          {speakingEnabled ? "Voice replies on" : "Voice replies off"}
        </button>

        <button
          className="secondary-btn"
          onClick={() => (wakeListening ? stopWakeListening() : startWakeListening())}
          type="button"
        >
          {wakeListening ? "Stop wake mode" : "Start wake mode"}
        </button>
      </div>

      <div className="assistant-wake-panel">
        <div className="assistant-wake-copy">
          <span className="panel-label">Wake phrase</span>
          <strong>{wakeSupported ? "Hands-free mode is available" : "Browser support required"}</strong>
          <p>
            Say <strong>{wakeWord}</strong> to wake the assistant. You can say the
            wake phrase by itself, then speak your command, or say both in one sentence.
          </p>
        </div>

        <div className="assistant-wake-controls">
          <label htmlFor="wakeWordInput">Assistant name</label>
          <input
            id="wakeWordInput"
            maxLength={40}
            onChange={(event) => setWakeWord(event.target.value || "Hey Jarvis")}
            placeholder="Hey Jarvis"
            value={wakeWord}
          />
          <span className={`status-pill ${wakeListening ? "online" : "idle"}`}>
            {wakeListening
              ? awaitingWakeCommand
                ? "Awaiting command"
                : "Wake listening"
              : "Wake paused"}
          </span>
        </div>
      </div>

      <div className="assistant-grid">
        <div className="assistant-panel">
          <span className="panel-label">Latest transcript</span>
          <p>{transcript || "No transcript captured yet."}</p>
        </div>

        <div className="assistant-panel">
          <span className="panel-label">Assistant response</span>
          <p>{assistantReply}</p>
        </div>
      </div>

      {error ? <p className="assistant-error">{error}</p> : null}

      <div className="command-strip">
        {QUICK_COMMANDS.map((command) => (
          <button
            className="command-chip"
            key={command}
            onClick={() => handlePlannerCommand(command)}
            type="button"
          >
            {command}
          </button>
        ))}
      </div>

      <div className="assistant-history">
        <div className="assistant-history-header">
          <div className="assistant-history-title">
            <h3>Recent interactions</h3>
            <span>
              {metrics.completedTasks}/{metrics.totalTasks} tasks complete
            </span>
          </div>

          <button
            className="secondary-btn assistant-clear-btn"
            onClick={() => setHistory([])}
            type="button"
          >
            Clear recent
          </button>
        </div>

        {history.length === 0 ? (
          <p className="assistant-empty">
            Your last voice transcripts and responses will appear here.
          </p>
        ) : (
          history.map((item) => (
            <div className="assistant-history-item" key={item.id}>
              <div className="assistant-history-meta">
                <span>{getHistoryModeLabel(item.mode)}</span>
                <span>{item.createdAt}</span>
              </div>
              <strong>{item.spokenText}</strong>
              <p>{item.responseText}</p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export default VoiceAssistant;





