import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

function speechReady() {
  return typeof window !== "undefined"
    && "speechSynthesis" in window
    && typeof SpeechSynthesisUtterance !== "undefined";
}

export default function KidsPetTutor({
  message,
  state = "idle",
  audioEnabled = true,
  language = "en",
  autoSpeakKey = "",
  compact = false,
}) {
  const [speaking, setSpeaking] = useState(false);
  const lastAutoKeyRef = useRef("");

  const speak = useCallback(() => {
    if (!audioEnabled || !message || !speechReady()) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(String(message));
    utterance.lang = language === "hi" ? "hi-IN" : "en-IN";
    utterance.rate = language === "hi" ? 0.82 : 0.88;
    utterance.pitch = 1.08;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, [audioEnabled, language, message]);

  useEffect(() => {
    if (!audioEnabled || !autoSpeakKey || lastAutoKeyRef.current === autoSpeakKey) return;
    lastAutoKeyRef.current = autoSpeakKey;
    const timer = window.setTimeout(speak, 320);
    return () => window.clearTimeout(timer);
  }, [audioEnabled, autoSpeakKey, speak]);

  useEffect(() => () => {
    if (speechReady()) window.speechSynthesis.cancel();
  }, []);

  return (
    <aside className={`kids-pet-tutor is-${state}${compact ? " is-compact" : ""}`}>
      <div aria-hidden="true" className="kids-pet-avatar">
        <span className="kids-pet-face">{state === "celebrate" ? "🤩" : state === "encourage" ? "😊" : "🦊"}</span>
        <span className="kids-pet-spark">✦</span>
      </div>
      <div className="kids-pet-bubble">
        <p aria-live="polite">{message}</p>
        <button
          aria-label={audioEnabled ? "Read this message aloud" : "Read-aloud is turned off in Parent Corner"}
          className="kids-audio-button"
          disabled={!audioEnabled || !speechReady()}
          onClick={speak}
          title={audioEnabled ? "Read to me" : "Audio is off"}
          type="button"
        >
          {audioEnabled ? <Volume2 aria-hidden="true" size={18} /> : <VolumeX aria-hidden="true" size={18} />}
          {!compact && <span>{speaking ? "Reading…" : "Read to me"}</span>}
        </button>
      </div>
    </aside>
  );
}
