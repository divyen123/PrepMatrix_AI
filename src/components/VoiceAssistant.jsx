import { useEffect } from "react";
import useVoiceAssistant from "../hooks/useVoiceAssistant";

function VoiceAssistant({
  academicLevel = "College",
  academicTrack = "General",
  completed = [],
  schedule = [],
  hidden = false,
}) {
  const assistant = useVoiceAssistant({ academicLevel, academicTrack, schedule, completed });

  useEffect(() => {
    window.studyVoiceAssistant = {
      askWithVoice: assistant.askWithVoice,
      startRecording: assistant.askWithVoice,
      toggleRecording: assistant.askWithVoice,
      stopRecording: () => {},
      setSpeaking: assistant.setSpeakingEnabled,
      setWakeMode: assistant.setWakeMode,
      startWakeListening: () => assistant.setWakeMode(true),
      stopWakeListening: () => assistant.setWakeMode(false),
    };

    return () => {
      delete window.studyVoiceAssistant;
    };
  }, [assistant.askWithVoice, assistant.setSpeakingEnabled, assistant.setWakeMode]);

  if (hidden) {
    if (assistant.wakeMode) {
      return null;
    }

    return (
      <button
        className="secondary-btn"
        disabled={assistant.isListening || assistant.isProcessing}
        onClick={assistant.askWithVoice}
        type="button"
      >
        {assistant.isListening ? "Listening..." : "Ask with Voice"}
      </button>
    );
  }

  return (
    <section className="card assistant-card">
      <div className="assistant-header">
        <div>
          <span className="section-tag">Voice Control</span>
          <h2>Browser voice assistant</h2>
        </div>
        <div className="assistant-status-row">
          <span className={`status-pill ${assistant.supported ? "online" : "offline"}`}>
            {assistant.supported ? "Browser ready" : "Unsupported"}
          </span>
          <span className={`status-pill ${assistant.isListening ? "online" : "idle"}`}>
            {assistant.isListening ? "Listening" : "Idle"}
          </span>
        </div>
      </div>

      <p className="assistant-summary">
        Use Wake Mode with Hey Prep, Prep Matrix, or Hey PrepMatrix while the app is open, or ask once with the voice button.
      </p>

      <div className="assistant-toolbar">
        {!assistant.wakeMode ? (
          <button
            className={`voice-record-btn ${assistant.isListening ? "recording" : ""}`}
            disabled={assistant.isListening || assistant.isProcessing}
            onClick={assistant.askWithVoice}
            type="button"
          >
            {assistant.isListening ? "Listening..." : "Ask with Voice"}
          </button>
        ) : null}

        <button
          className="secondary-btn"
          onClick={() => assistant.setWakeMode(!assistant.wakeMode)}
          type="button"
        >
          {assistant.wakeMode ? "Turn wake mode off" : "Turn wake mode on"}
        </button>
      </div>

      <div className="assistant-wake-panel">
        <div className="assistant-wake-copy">
          <span className="panel-label">Wake words</span>
          <strong>{assistant.wakeMode ? "Wake Mode is on" : "Wake Mode is off"}</strong>
          <p>Say Hey Prep, Prep Matrix, or Hey PrepMatrix followed by a command or question.</p>
        </div>
        <div className="assistant-wake-controls">
          <span className={`status-pill ${assistant.wakeMode && assistant.isListening ? "online" : "idle"}`}>
            {assistant.wakeMode && assistant.isListening ? "Wake listening" : "Wake paused"}
          </span>
        </div>
      </div>

      <div className="assistant-grid">
        <div className="assistant-panel">
          <span className="panel-label">Latest transcript</span>
          <p>{assistant.transcript || "No transcript captured yet."}</p>
        </div>
        <div className="assistant-panel">
          <span className="panel-label">Assistant response</span>
          <p>{assistant.reply || "Ask a voice question or use a page command."}</p>
        </div>
      </div>

      {assistant.error ? <p className="assistant-error">{assistant.error}</p> : null}
    </section>
  );
}

export default VoiceAssistant;
