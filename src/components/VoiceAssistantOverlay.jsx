import React from "react";
import { X } from "lucide-react";
import "./VoiceAssistantOverlay.css";

function renderInlineFormatting(text = "") {
  const parts = text.split(/(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`)/g).filter(Boolean);

  return parts.map((part, index) => {
    if ((part.startsWith("**") && part.endsWith("**")) || (part.startsWith("__") && part.endsWith("__"))) {
      return <strong key={`${part}-${index}`}>{part.slice(2, -2).trim()}</strong>;
    }

    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={`${part}-${index}`}>{part.slice(1, -1)}</code>;
    }

    return part;
  });
}

function formatReplyBlocks(text = "") {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const numbered = line.match(/^(\d+)\.\s*(.*)$/);
      if (numbered) {
        return (
          <div className="voice-reply-line numbered" key={`${line}-${index}`}>
            <span className="voice-reply-marker">{numbered[1]}.</span>
            <span>{renderInlineFormatting(numbered[2])}</span>
          </div>
        );
      }

      const bullet = line.match(/^[-*•]\s+(.*)$/);
      if (bullet) {
        return (
          <div className="voice-reply-line bullet" key={`${line}-${index}`}>
            <span className="voice-reply-marker">•</span>
            <span>{renderInlineFormatting(bullet[1])}</span>
          </div>
        );
      }

      return (
        <p className="voice-reply-paragraph" key={`${line}-${index}`}>
          {renderInlineFormatting(line)}
        </p>
      );
    });
}

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

  const orbVisualStatus = voiceStatus === "awake" ? "idle" : voiceStatus;

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
          <div className="voice-pulse-ring ring-one" />
          <div className="voice-pulse-ring ring-two" />
          <div className="voice-pulse-ring ring-three" />

          <div className={`voice-ai-orb ${orbVisualStatus}`}>
            <div className="orb-inner" />
            <span className="orb-label" aria-hidden="true">Prep</span>
          </div>
        </div>

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
            {formatReplyBlocks(reply)}
          </div>
        )}
      </div>
    </div>
  );
}

export default VoiceAssistantOverlay;