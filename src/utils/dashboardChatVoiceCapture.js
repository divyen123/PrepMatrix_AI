const DEFAULT_SILENCE_MS = 4000;
const RESTART_DELAY_MS = 150;

const normalizeText = (value) => String(value || "").replace(/\s+/gu, " ").trim();
const combineText = (...parts) => normalizeText(parts.filter(Boolean).join(" "));

function readResults(results) {
  return combineText(...Array.from(results || [], (result) => result?.[0]?.transcript || ""));
}

function recognitionErrorMessage(code) {
  if (code === "not-allowed" || code === "service-not-allowed") {
    return "Microphone access was denied. Allow microphone access to dictate a question.";
  }
  if (code === "audio-capture") return "No microphone was found. Check your microphone and try again.";
  return `Voice recognition error: ${code || "unknown"}.`;
}

/**
 * Captures one dashboard question through the browser's SpeechRecognition API.
 *
 * start() returns false if recognition cannot start. onTranscript receives the
 * current final + interim text. onSubmit receives one nonempty final question
 * after silenceMs without speech (or finish()). cancel() discards it. onStop
 * receives { reason, transcript, submitted } for every started capture, and
 * for start failures, so callers can release a paused wake-word listener.
 *
 * A recognition engine may end before the silence threshold. In that case the
 * capture restarts recognition while keeping its transcript and deadline.
 */
export function createDashboardChatVoiceCapture({
  onStart = () => undefined,
  onTranscript = () => undefined,
  onSubmit = () => undefined,
  onError = () => undefined,
  onStop = () => undefined,
  silenceMs = DEFAULT_SILENCE_MS,
  recognitionConstructor,
  setTimeoutFn = globalThis.setTimeout,
  clearTimeoutFn = globalThis.clearTimeout,
} = {}) {
  let active = false;
  let recognizer = null;
  let silenceTimer = null;
  let restartTimer = null;
  let completedText = "";
  let sessionText = "";
  let speechActive = false;

  const transcript = () => combineText(completedText, sessionText);

  const clearTimers = () => {
    if (silenceTimer !== null) clearTimeoutFn(silenceTimer);
    if (restartTimer !== null) clearTimeoutFn(restartTimer);
    silenceTimer = null;
    restartTimer = null;
  };

  const releaseRecognizer = () => {
    if (!recognizer) return;
    const previous = recognizer;
    recognizer = null;
    previous.onstart = null;
    previous.onspeechstart = null;
    previous.onspeechend = null;
    previous.onresult = null;
    previous.onerror = null;
    previous.onend = null;
    try {
      if (typeof previous.abort === "function") previous.abort();
      else previous.stop?.();
    } catch {
      // The browser may already have ended recognition.
    }
  };

  const end = (reason, submit = false) => {
    if (!active) return;
    const finalText = transcript();
    active = false;
    clearTimers();
    releaseRecognizer();
    const submitted = submit && Boolean(finalText);
    try {
      if (submitted) onSubmit(finalText);
    } finally {
      onStop({ reason, transcript: finalText, submitted });
    }
  };

  const armSilenceTimer = () => {
    if (!active) return;
    if (silenceTimer !== null) clearTimeoutFn(silenceTimer);
    silenceTimer = setTimeoutFn(() => {
      silenceTimer = null;
      end("silence", true);
    }, silenceMs);
  };

  const startRecognition = (Constructor) => {
    if (!active) return false;
    try {
      const next = new Constructor();
      next.continuous = true;
      next.interimResults = true;
      next.maxAlternatives = 1;
      next.lang = "en-IN";
      recognizer = next;
      next.onstart = () => {
        if (active && silenceTimer === null && !speechActive) armSilenceTimer();
      };
      next.onspeechstart = () => {
        if (!active) return;
        speechActive = true;
        if (silenceTimer !== null) clearTimeoutFn(silenceTimer);
        silenceTimer = null;
      };
      next.onspeechend = () => {
        if (!active) return;
        speechActive = false;
        armSilenceTimer();
      };
      next.onresult = (event) => {
        if (!active) return;
        sessionText = readResults(event?.results);
        onTranscript(transcript());
        if (!speechActive) armSilenceTimer();
      };
      next.onerror = (event) => {
        if (!active) return;
        const code = event?.error || "unknown";
        if (code === "no-speech") return;
        onError(recognitionErrorMessage(code), code);
        end("error");
      };
      next.onend = () => {
        if (!active || recognizer !== next) return;
        completedText = transcript();
        sessionText = "";
        speechActive = false;
        recognizer = null;
        if (silenceTimer === null) armSilenceTimer();
        restartTimer = setTimeoutFn(() => {
          restartTimer = null;
          if (active) startRecognition(Constructor);
        }, RESTART_DELAY_MS);
      };
      next.start();
      return true;
    } catch (error) {
      if (!active) return false;
      onError("Voice recognition could not start. Check microphone access and try again.", error);
      end("error");
      return false;
    }
  };

  return {
    start() {
      if (active) return true;
      const Constructor = recognitionConstructor
        || globalThis.SpeechRecognition
        || globalThis.webkitSpeechRecognition;
      if (!Constructor) {
        const message = "Voice recognition is not supported in this browser.";
        onError(message, "unsupported");
        onStop({ reason: "unsupported", transcript: "", submitted: false });
        return false;
      }

      completedText = "";
      sessionText = "";
      speechActive = false;
      active = true;
      const started = startRecognition(Constructor);
      if (started) {
        armSilenceTimer();
        onStart();
      }
      return started;
    },
    finish() {
      if (transcript()) end("manual", true);
      else end("cancel");
    },
    cancel() {
      end("cancel");
    },
    isActive() {
      return active;
    },
    getTranscript: transcript,
  };
}
