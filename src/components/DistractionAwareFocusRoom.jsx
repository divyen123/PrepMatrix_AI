import { useCallback } from "react";
import {
  AlertTriangle,
  Camera,
  CameraOff,
  Eye,
  EyeOff,
  LoaderCircle,
  Pause,
  RotateCcw,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import useDistractionMonitor from "../hooks/useDistractionMonitor.js";
import { FOCUS_ROOM_STATUS } from "../utils/focusRoomState.js";
import { buildFocusNudgeMessage, speakFocusNudge } from "../utils/focusRoomNudge.js";
import "./DistractionAwareFocusRoom.css";

const STATUS_COPY = Object.freeze({
  [FOCUS_ROOM_STATUS.ATTENTIVE]: {
    label: "Focused",
    detail: "You are in the study zone.",
    icon: Eye,
  },
  [FOCUS_ROOM_STATUS.DISTRACTED]: {
    label: "Refocus check",
    detail: "A possible distraction is continuing.",
    icon: EyeOff,
  },
  [FOCUS_ROOM_STATUS.UNKNOWN]: {
    label: "Checking locally",
    detail: "Stay comfortably visible while the model checks the frame.",
    icon: LoaderCircle,
  },
  [FOCUS_ROOM_STATUS.PAUSED]: {
    label: "Monitor paused",
    detail: "Your camera is off.",
    icon: CameraOff,
  },
});

const PAUSE_DETAIL = Object.freeze({
  camera_ended: "Camera access ended. Resume when you are ready.",
  camera_in_use: "The camera is currently unavailable.",
  camera_permission_denied: "Camera permission was not granted.",
  camera_unavailable: "No usable camera was found.",
  document_hidden: "Monitoring paused when this tab was hidden.",
  loading_model: "Loading private on-device models…",
  model_error: "The local detector stopped safely.",
  model_not_configured: "Local focus models need to be configured.",
  non_local_model_asset: "Only same-origin model assets are allowed.",
  not_started: "Your camera stays off until you opt in.",
  page_hidden: "Monitoring stopped when this page was left.",
  user_paused: "Your camera is off.",
});

function monitorDetail({ failure, status, statusReason }) {
  if (failure?.message) return failure.message;
  if (status === FOCUS_ROOM_STATUS.PAUSED) {
    return PAUSE_DETAIL[statusReason] || STATUS_COPY[FOCUS_ROOM_STATUS.PAUSED].detail;
  }
  if (status === FOCUS_ROOM_STATUS.DISTRACTED) {
    if (statusReason === "phone_detected") return "A phone may be in use.";
    if (statusReason === "looking_away") return "Your attention may be away from the screen.";
    if (statusReason === "face_not_visible") return "No clear face has been visible for several seconds.";
  }
  if (status === FOCUS_ROOM_STATUS.UNKNOWN && statusReason === "face_not_visible") {
    return "Your face is briefly out of view; a local grace check is running.";
  }
  return STATUS_COPY[status]?.detail || STATUS_COPY[FOCUS_ROOM_STATUS.UNKNOWN].detail;
}
function capabilityLabel(capabilities, capability, activeLabel, unavailableLabel) {
  if (!capabilities) return "Loads after opt-in";
  return capabilities[capability] ? activeLabel : unavailableLabel;
}
export function FocusRoomPanel({
  monitor,
  className = "",
  title = "Private focus monitor",
  subject = "this topic",
  showPreview = true,
}) {
  const {
    status = FOCUS_ROOM_STATUS.PAUSED,
    statusReason = "not_started",
    active = false,
    isStarting = false,
    isSupported = true,
    streamActive = false,
    failure = null,
    capabilities = null,
    videoRef: cameraVideoRef,
    progress = {},
    start,
    retry,
    pause,
  } = monitor || {};
  const statusCopy = STATUS_COPY[status] || STATUS_COPY[FOCUS_ROOM_STATUS.UNKNOWN];
  const StatusIcon = statusCopy.icon;
  const isBusy = Boolean(isStarting);
  const isActive = Boolean(active);
  const canStart = isSupported !== false && !isBusy;
  const remainingSeconds = Math.max(
    0,
    Math.ceil((progress.remainingUntilNudgeMs || 0) / 1_000),
  );
  const progressPercent = Math.max(
    0,
    Math.min(100, (progress.progress || 0) * 100),
  );

  return (
    <section
      className={`focus-room-panel focus-room-panel--${status} ${className}`.trim()}
      aria-labelledby="focus-room-title"
      data-focus-status={status}
    >
      <div className="focus-room-heading">
        <div className="focus-room-heading-icon" aria-hidden="true">
          <ShieldCheck size={20} strokeWidth={2.2} />
        </div>
        <div>
          <span className="focus-room-eyebrow">Focus Room</span>
          <h2 id="focus-room-title">{title}</h2>
        </div>
        <span className="focus-room-local-badge">
          <span aria-hidden="true" />
          On-device only
        </span>
      </div>

      <div className={`focus-room-body${showPreview ? "" : " focus-room-body--no-preview"}`}>
        {showPreview && (
          <div className={`focus-room-preview${streamActive ? " is-live" : ""}`}>
            <video
              ref={cameraVideoRef}
              className="focus-room-video"
              aria-label="Private camera preview"
              autoPlay
              muted
              playsInline
            />
            {!streamActive && (
              <div className="focus-room-preview-placeholder">
                <CameraOff aria-hidden="true" size={28} />
                <span>Camera off</span>
              </div>
            )}
            {streamActive && (
              <span className="focus-room-live-pill">
                <span aria-hidden="true" />
                Local analysis
              </span>
            )}
          </div>
        )}

        <div className="focus-room-summary">
          <div className="focus-room-status" role="status" aria-live="polite">
            <span className="focus-room-status-icon" aria-hidden="true">
              <StatusIcon
                className={isBusy || status === FOCUS_ROOM_STATUS.UNKNOWN ? "is-spinning" : ""}
                size={21}
              />
            </span>
            <div>
              <strong>{isBusy ? "Starting privately" : statusCopy.label}</strong>
              <p>{monitorDetail({ failure, status, statusReason })}</p>
            </div>
          </div>

          {status === FOCUS_ROOM_STATUS.DISTRACTED && (
            <div className="focus-room-countdown" aria-label={`${remainingSeconds} seconds until focus reminder`}>
              <div className="focus-room-progress-track" aria-hidden="true">
                <span style={{ width: `${progressPercent}%` }} />
              </div>
              <span>
                {remainingSeconds > 0
                  ? `Gentle reminder in ${remainingSeconds}s if this continues`
                  : "Reminder cooldown active"}
              </span>
            </div>
          )}

          {failure && (
            <div className="focus-room-error" role="alert">
              <AlertTriangle aria-hidden="true" size={17} />
              <span>{failure.message}</span>
            </div>
          )}

          <div className="focus-room-capabilities" aria-label="Local detection capabilities">
            <span>
              <Eye aria-hidden="true" size={15} />
              {capabilityLabel(
                capabilities,
                "headPose",
                "Look-away active",
                "Look-away model unavailable",
              )}
            </span>
            <span>
              <Smartphone aria-hidden="true" size={15} />
              {capabilityLabel(
                capabilities,
                "phoneDetection",
                "Phone detection active",
                "Phone model unavailable",
              )}
            </span>
          </div>

          <div className="focus-room-actions">
            {isActive ? (
              <button className="focus-room-button focus-room-button--secondary" type="button" onClick={pause}>
                <Pause aria-hidden="true" size={17} />
                Pause &amp; turn off camera
              </button>
            ) : (
              <button
                className="focus-room-button focus-room-button--primary"
                type="button"
                disabled={!canStart}
                onClick={failure ? retry : start}
              >
                {isBusy ? (
                  <LoaderCircle className="is-spinning" aria-hidden="true" size={17} />
                ) : failure ? (
                  <RotateCcw aria-hidden="true" size={17} />
                ) : (
                  <Camera aria-hidden="true" size={17} />
                )}
                {isBusy ? "Loading local models…" : failure ? "Retry private monitor" : "Enable private focus monitor"}
              </button>
            )}
          </div>
        </div>
      </div>

      <p className="focus-room-privacy-note">
        <ShieldCheck aria-hidden="true" size={15} />
        Camera frames and detections stay in this browser. Nothing is recorded, uploaded, or saved.
        Switching tabs pauses monitoring and turns the camera off.
      </p>
      <span className="focus-room-subject" aria-hidden="true">Studying {subject}</span>
    </section>
  );
}

export default function DistractionAwareFocusRoom({
  userName,
  subject = "this topic",
  onNudge,
  speakNudges = true,
  visionConfig,
  monitorOptions,
  ...panelProps
}) {
  const handleNudge = useCallback((event) => {
    const message = buildFocusNudgeMessage(userName, subject);
    if (typeof onNudge === "function") {
      return onNudge({ ...event, message, subject });
    }
    if (speakNudges) speakFocusNudge(message);
    return undefined;
  }, [onNudge, speakNudges, subject, userName]);

  const monitor = useDistractionMonitor({
    ...(monitorOptions || {}),
    visionConfig,
    onNudge: handleNudge,
  });

  return (
    <FocusRoomPanel
      {...panelProps}
      monitor={monitor}
      subject={subject}
    />
  );
}
