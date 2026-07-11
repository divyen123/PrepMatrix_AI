import React from "react";
import { X } from "lucide-react";
import Strands from "./Strands";
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

/* Strand color palettes per voice state */
const STATE_STRAND_PROPS = {
  listening: {
    colors: ["#06B6D4", "#3B82F6", "#8B5CF6"],
    speed: 0.55,
    amplitude: 1.2,
    glow: 2.8,
    intensity: 0.7,
    thickness: 0.8,
  },
  awake: {
    colors: ["#A855F7", "#EC4899", "#F97316"],
    speed: 0.35,
    amplitude: 0.7,
    glow: 2.4,
    intensity: 0.55,
    thickness: 0.65,
  },
  processing: {
    colors: ["#EC4899", "#8B5CF6", "#06B6D4"],
    speed: 0.9,
    amplitude: 0.9,
    glow: 3.0,
    intensity: 0.75,
    thickness: 0.75,
  },
  speaking: {
    colors: ["#10B981", "#06B6D4", "#3B82F6"],
    speed: 0.7,
    amplitude: 1.0,
    glow: 2.6,
    intensity: 0.65,
    thickness: 0.72,
  },
  error: {
    colors: ["#EF4444", "#F97316", "#FB7185"],
    speed: 0.4,
    amplitude: 0.5,
    glow: 2.2,
    intensity: 0.5,
    thickness: 0.6,
  },
};

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
      case "answered":
        return "Answer ready";
      case "error":
        return error || "Speech assistant error";
      default:
        return "";
    }
  };

  const strandProps = STATE_STRAND_PROPS[voiceStatus] || STATE_STRAND_PROPS.awake;
  const hasReply = Boolean(reply);

  return (
    <div
      className={`voice-overlay-backdrop active ${voiceStatus}`}
      onClick={onClose}
    >
      {/* Strands background animation — full backdrop */}
      <div className="voice-strands-bg" aria-hidden="true">
        <Strands
          colors={strandProps.colors}
          count={3}
          speed={strandProps.speed}
          amplitude={strandProps.amplitude}
          waviness={1}
          thickness={strandProps.thickness}
          glow={strandProps.glow}
          taper={3}
          spread={1.2}
          hueShift={0}
          intensity={strandProps.intensity}
          saturation={1.4}
          opacity={0.85}
          scale={1.6}
          glass={false}
        />
      </div>

      <div
        className="voice-overlay-content"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="voice-overlay-close-btn"
          onClick={onClose}
          aria-label="Close voice assistant"
          title="Close"
          type="button"
        >
          <X size={20} />
        </button>

        {/* Status */}
        <div className="voice-overlay-top">
          <div className="voice-overlay-status-box">
            <div className={`voice-waveform-container ${voiceStatus}`} aria-hidden="true">
              <div className="voice-wave-bar bar-1" />
              <div className="voice-wave-bar bar-2" />
              <div className="voice-wave-bar bar-3" />
              <div className="voice-wave-bar bar-4" />
              <div className="voice-wave-bar bar-5" />
            </div>
            <span className={`voice-overlay-status-label voice-status--${voiceStatus}`}>
              {getStatusText()}
            </span>
            {lastText && (
              <p className="voice-overlay-transcript">
                &ldquo;{lastText}&rdquo;
              </p>
            )}
          </div>
        </div>

        {/* Reply panel — slides up when answer arrives */}
        {hasReply && (
          <div className="voice-overlay-reply" aria-live="polite">
            <div className="voice-reply-header">
              <span className="voice-reply-badge">PrepMatrix AI</span>
            </div>
            <div className="voice-reply-body">
              {formatReplyBlocks(reply)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default VoiceAssistantOverlay;

