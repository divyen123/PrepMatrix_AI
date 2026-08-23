import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { reduceCompanionBubbleState } from "./kidsPetTutorState";
import { KIDS_PET_ACTION_CYCLE } from "./kidsPetActionCycle";

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
  revealBubble = false,
  showcaseAllActions = false,
}) {
  const [speaking, setSpeaking] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const [interactionKey, setInteractionKey] = useState(0);
  const [bubbleInteraction, setBubbleInteraction] = useState("idle");
  const [showcaseFrameIndex, setShowcaseFrameIndex] = useState(0);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => (
    typeof window !== "undefined"
      && typeof window.matchMedia === "function"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ));
  const bubbleId = useId();
  const lastAutoKeyRef = useRef("");
  const interactionTimerRef = useRef(null);
  const actionShowcase = revealBubble && showcaseAllActions;
  const showcaseFrame = KIDS_PET_ACTION_CYCLE[showcaseFrameIndex] || KIDS_PET_ACTION_CYCLE[0];
  const spokenMessage = speechMessage || message;
  const speaksSeparatePrompt = Boolean(speechMessage && speechMessage !== message);
  const bubbleVisible = !revealBubble || bubbleInteraction === "hover" || bubbleInteraction === "pinned";
  const readAloudLabel = audioEnabled
    ? language === "hi"
      ? speaksSeparatePrompt ? "सवाल सुनें" : "यह संदेश सुनें"
      : speaksSeparatePrompt ? "Read the question aloud" : "Read this message aloud"
    : "Read-aloud is turned off in Parent Corner";
  const companionButtonLabel = language === "hi"
    ? revealBubble
      ? bubbleInteraction === "pinned"
        ? "साथी संदेश छिपाएँ"
        : bubbleInteraction === "hover"
          ? "साथी संदेश खुला रखें"
          : "साथी संदेश दिखाएँ और कुत्ते के साथ खेलें"
      : "अपने कुत्ते साथी के साथ खेलें"
    : revealBubble
      ? bubbleInteraction === "pinned"
        ? "Hide companion message"
        : bubbleInteraction === "hover"
          ? "Keep companion message open"
          : "Show companion message and play with your dog"
      : "Play with your dog companion";
  const companionButtonTitle = revealBubble
    ? language === "hi"
      ? bubbleInteraction === "pinned"
        ? "संदेश छिपाएँ"
        : bubbleInteraction === "hover"
          ? "संदेश खुला रखें"
          : "संदेश दिखाएँ"
      : bubbleInteraction === "pinned"
        ? "Hide message"
        : bubbleInteraction === "hover"
          ? "Keep message open"
          : "Show message"
    : language === "hi" ? "मुझे टैप करें" : "Tap me";

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

  const updateBubbleInteraction = useCallback((action) => {
    if (!revealBubble) return;
    setBubbleInteraction((currentState) => reduceCompanionBubbleState(currentState, action));
  }, [revealBubble]);

  const playWithCompanion = useCallback(() => {
    const isClosingBubble = revealBubble && bubbleInteraction === "pinned";
    updateBubbleInteraction("click");
    if (isClosingBubble) {
      if (interactionTimerRef.current) window.clearTimeout(interactionTimerRef.current);
      setInteracting(false);
      return;
    }
    setInteracting(true);
    setInteractionKey((value) => value + 1);
    if (interactionTimerRef.current) window.clearTimeout(interactionTimerRef.current);
    interactionTimerRef.current = window.setTimeout(() => setInteracting(false), 1100);
    speak();
  }, [bubbleInteraction, revealBubble, speak, updateBubbleInteraction]);

  useEffect(() => {
    if (!actionShowcase || typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleMotionPreference = (event) => setPrefersReducedMotion(event.matches);
    if (typeof motionPreference.addEventListener === "function") {
      motionPreference.addEventListener("change", handleMotionPreference);
      return () => motionPreference.removeEventListener("change", handleMotionPreference);
    }
    motionPreference.addListener(handleMotionPreference);
    return () => motionPreference.removeListener(handleMotionPreference);
  }, [actionShowcase]);

  useEffect(() => {
    if (!actionShowcase || prefersReducedMotion || interacting) return undefined;
    const timer = window.setTimeout(() => {
      setShowcaseFrameIndex((currentIndex) => (currentIndex + 1) % KIDS_PET_ACTION_CYCLE.length);
    }, showcaseFrame.durationMs);
    return () => window.clearTimeout(timer);
  }, [actionShowcase, interacting, prefersReducedMotion, showcaseFrame.durationMs, showcaseFrameIndex]);

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
    <aside
      className={`kids-pet-tutor is-${state}${compact ? " is-compact" : ""}${actionShowcase ? " is-action-showcase" : ""}${interacting ? " is-interacting" : ""}${revealBubble ? " is-bubble-revealable" : ""}${revealBubble && bubbleVisible ? " is-bubble-visible" : ""}`}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) updateBubbleInteraction("blur");
      }}
      onFocusCapture={() => updateBubbleInteraction("focus")}
      onMouseLeave={() => updateBubbleInteraction("leave")}
    >
      <button
        aria-controls={revealBubble ? bubbleId : undefined}
        aria-expanded={revealBubble ? bubbleVisible : undefined}
        aria-label={companionButtonLabel}
        className="kids-pet-avatar"
        onClick={playWithCompanion}
        onMouseEnter={() => updateBubbleInteraction("enter")}
        title={companionButtonTitle}
        type="button"
      >
        <span
          aria-hidden="true"
          className="kids-pet-sprite"
          data-action-frame={actionShowcase ? showcaseFrame.id : undefined}
          key={actionShowcase ? "action-showcase" : interactionKey}
          style={actionShowcase ? {
            "--kids-dog-clip": showcaseFrame.clip,
            "--kids-dog-position": showcaseFrame.position,
          } : undefined}
        />
        <span aria-hidden="true" className="kids-pet-action-hint">
          {language === "hi" ? "मुझे टैप करें" : "Tap me"}
        </span>
      </button>
      <div
        aria-hidden={revealBubble ? !bubbleVisible : undefined}
        className="kids-pet-bubble"
        id={bubbleId}
      >
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
    </aside>
  );
}
