import { useCallback, useEffect, useId, useRef, useState } from "react";
import maleSticker from "../assets/assistant/voice-male.png";
import femaleSticker from "../assets/assistant/voice-female.png";

const GREETING_DURATION_MS = 4000;
const VOICE_COMPANIONS = {
  female: {
    image: femaleSticker,
    label: "Female",
    greeting: "Hello, I'm Microsoft Heera",
  },
  male: {
    image: maleSticker,
    label: "Male",
    greeting: "Hello, I'm Microsoft Ravi",
  },
};

export default function AssistantVoiceSticker({ voiceStyle = "female" }) {
  const companion = VOICE_COMPANIONS[voiceStyle] || VOICE_COMPANIONS.female;
  const greetingId = useId();
  const previousVoiceStyle = useRef(voiceStyle);
  const greetingTimer = useRef(null);
  const [automaticGreeting, setAutomaticGreeting] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const greetingVisible = automaticGreeting || hovered || focused;

  const showGreeting = useCallback(() => {
    clearTimeout(greetingTimer.current);
    setAutomaticGreeting(true);
    greetingTimer.current = setTimeout(() => {
      setAutomaticGreeting(false);
      greetingTimer.current = null;
    }, GREETING_DURATION_MS);
  }, []);

  useEffect(() => {
    if (previousVoiceStyle.current !== voiceStyle) {
      previousVoiceStyle.current = voiceStyle;
      showGreeting();
    }
  }, [voiceStyle, showGreeting]);

  useEffect(() => () => clearTimeout(greetingTimer.current), []);

  return (
    <div className="assistant-voice-companion">
      <div
        aria-live="polite"
        aria-atomic="true"
        className="assistant-voice-greeting"
        hidden={!greetingVisible}
        id={greetingId}
        role="status"
      >
        {companion.greeting}
      </div>
      <button
        aria-describedby={greetingVisible ? greetingId : undefined}
        aria-label={`${companion.label} assistant sticker. Show greeting`}
        className="assistant-voice-sticker"
        onBlur={() => setFocused(false)}
        onClick={showGreeting}
        onFocus={() => setFocused(true)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        type="button"
      >
        <img
          alt={`${companion.label} study assistant`}
          draggable="false"
          height="1254"
          src={companion.image}
          width="1254"
        />
      </button>
    </div>
  );
}
