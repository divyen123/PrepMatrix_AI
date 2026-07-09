import React from "react";
import { X } from "lucide-react";
import "./VoiceAssistantOverlay.css";

function VoiceAssistantOverlay({
  voiceStatus = "idle",
  lastText = "",
  error = "",
  reply = "",
  onClose,
}) {
  if (voiceStatus === "idle") {
    return null;
  }

  // Get status text
  const getStatusText = () => {
    switch (voiceStatus) {
      case "listening":
        return "Listening...";
      case "awake":
        return "Yes, tell me...";
      case "processing":
        return "Thinking...";
      case "speaking":
        return "Speaking...";
      case "error":
        return error || "Speech assistant error";
      default:
        return "";
    }
  };

  return (
    <div className={`voice-overlay-backdrop active ${voiceStatus}`} onClick={onClose}>
      <div className="voice-overlay-content">
        <button
          className="voice-overlay-close-btn"
          onClick={onClose}
          aria-label="Close voice assistant"
          title="Close"
          type="button"
        >
          <X size={24} />
        </button>

        <div className="voice-assistant-visuals">
          {/* Animated pulse rings */}
          <div className="voice-pulse-ring ring-one" />
          <div className="voice-pulse-ring ring-two" />
          <div className="voice-pulse-ring ring-three" />

          {/* Centered glowing AI orb */}
          <div className={`voice-ai-orb ${voiceStatus}`}>
            <div className="orb-inner" />
            <div className="orb-glow" />
          </div>
        </div>

        {/* Animated Waveform Bars */}
        <div className={`voice-waveform-container ${voiceStatus}`}>
          <div className="voice-wave-bar bar-1" />
          <div className="voice-wave-bar bar-2" />
          <div className="voice-wave-bar bar-3" />
          <div className="voice-wave-bar bar-4" />
          <div className="voice-wave-bar bar-5" />
        </div>

        <div className="voice-overlay-status-box">
          <span className="voice-overlay-status-label">{getStatusText()}</span>
          {lastText && (
            <p className="voice-overlay-transcript">
              &ldquo;{lastText}&rdquo;
            </p>
          )}
        </div>

        {reply && (
          <div className="voice-overlay-reply" aria-live="polite">
            {reply}
          </div>
        )}
      </div>
    </div>
  );
}

export default VoiceAssistantOverlay;
