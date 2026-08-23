import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

function speechReady() {
  return typeof window !== "undefined"
    && "speechSynthesis" in window
    && typeof SpeechSynthesisUtterance !== "undefined";
}

export default function KidsPetTutor({
  message,
  speechMessage = "",
  state = "idle",
  audioEnabled = true,
  language = "en",
  autoSpeakKey = "",
  compact = false,
}) {
  const [speaking, setSpeaking] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const [interactionKey, setInteractionKey] = useState(0);
  const lastAutoKeyRef = useRef("");
  const interactionTimerRef = useRef(null);
  const spokenMessage = speechMessage || message;
  const speaksSeparatePrompt = Boolean(speechMessage && speechMessage !== message);
  const readAloudLabel = audioEnabled
    ? language === "hi"
      ? speaksSeparatePrompt ? "सवाल सुनें" : "यह संदेश सुनें"
      : speaksSeparatePrompt ? "Read the question aloud" : "Read this message aloud"
    : "Read-aloud is turned off in Parent Corner";

  const speak = useCallback(() => {
    if (!audioEnabled || !spokenMessage || !speechReady()) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(String(spokenMessage));
    utterance.lang = language === "hi" ? "hi-IN" : "en-IN";
    utterance.rate = language === "hi" ? 0.82 : 0.88;
    utterance.pitch = 1.08;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, [audioEnabled, language, spokenMessage]);

  const playWithCompanion = useCallback(() => {
    setInteracting(true);
    setInteractionKey((value) => value + 1);
    if (interactionTimerRef.current) window.clearTimeout(interactionTimerRef.current);
    interactionTimerRef.current = window.setTimeout(() => setInteracting(false), 1100);
    speak();
  }, [speak]);

  useEffect(() => {
    if (!audioEnabled || !autoSpeakKey || lastAutoKeyRef.current === autoSpeakKey) return;
    lastAutoKeyRef.current = autoSpeakKey;
    const timer = window.setTimeout(speak, 320);
    return () => window.clearTimeout(timer);
  }, [audioEnabled, autoSpeakKey, speak]);

  useEffect(() => () => {
    if (interactionTimerRef.current) window.clearTimeout(interactionTimerRef.current);
    if (speechReady()) window.speechSynthesis.cancel();
  }, []);

  return (
    <aside className={`kids-pet-tutor is-${state}${compact ? " is-compact" : ""}${interacting ? " is-interacting" : ""}`}>
      <div className="kids-pet-bubble">
        <p aria-live="polite">{message}</p>
        <button
          aria-label={readAloudLabel}
          className="kids-audio-button"
          disabled={!audioEnabled || !speechReady()}
          onClick={speak}
          title={audioEnabled ? (speaksSeparatePrompt ? "Hear question" : "Read to me") : "Audio is off"}
          type="button"
        >
          {audioEnabled ? <Volume2 aria-hidden="true" size={18} /> : <VolumeX aria-hidden="true" size={18} />}
          {!compact && <span>{speaking ? "Reading…" : speaksSeparatePrompt ? "Hear question" : "Read to me"}</span>}
        </button>
      </div>
      <button
        aria-label={language === "hi" ? "अपने कुत्ते साथी के साथ खेलें" : "Play with your dog companion"}
        className="kids-pet-avatar"
        onClick={playWithCompanion}
        title={language === "hi" ? "मुझे टैप करें" : "Tap me"}
        type="button"
      >
        <span aria-hidden="true" className="kids-pet-sprite" key={interactionKey} />
        <span aria-hidden="true" className="kids-pet-action-hint">
          {language === "hi" ? "मुझे टैप करें" : "Tap me"}
        </span>
      </button>
    </aside>
  );
}
