import { useCallback, useEffect, useRef, useState } from "react";
import {
  FOCUS_ROOM_STATUS,
  createFocusRoomState,
  getFocusRoomProgress,
  transitionFocusRoomState,
} from "../utils/focusRoomState.js";
import { createLocalFocusVisionAdapter } from "../utils/focusRoomVision.js";

const DEFAULT_MEDIA_CONSTRAINTS = Object.freeze({
  audio: false,
  video: {
    facingMode: "user",
    width: { ideal: 640 },
    height: { ideal: 480 },
  },
});

const DEFAULT_ANALYSIS_INTERVAL_MS = 500;

function currentTime(clock) {
  const value = Number(clock?.());
  if (Number.isFinite(value)) return value;
  return globalThis.performance?.now?.() || Date.now();
}

function errorWithCode(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function failureFor(error, fallbackCode = "model_error") {
  const name = String(error?.name || "");
  const explicitCode = typeof error?.code === "string" ? error.code : "";

  if (name === "NotAllowedError" || name === "SecurityError") {
    return {
      code: "camera_permission_denied",
      message: "Camera access was not granted. You can retry whenever you are ready.",
    };
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return {
      code: "camera_unavailable",
      message: "No usable camera was found on this device.",
    };
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return {
      code: "camera_in_use",
      message: "The camera is unavailable or already being used by another app.",
    };
  }
  if (explicitCode === "document_hidden") {
    return {
      code: explicitCode,
      message: "Focus monitoring paused when this tab was hidden. Resume it when you return.",
    };
  }
  if (explicitCode === "camera_unsupported") {
    return {
      code: explicitCode,
      message: "This browser does not support private webcam monitoring.",
    };
  }
  if (explicitCode === "model_not_configured") {
    return {
      code: explicitCode,
      message: error?.message || "Local focus-detection models have not been configured.",
    };
  }
  if (explicitCode === "non_local_model_asset") {
    return {
      code: explicitCode,
      message: "Focus monitoring only accepts local, same-origin model assets.",
    };
  }

  return {
    code: explicitCode || fallbackCode,
    message: error?.message || "The local focus detector could not continue.",
  };
}

async function closeAdapter(adapter) {
  try {
    await adapter?.close?.();
  } catch {
    // Cleanup must remain best-effort and must never keep a camera alive.
  }
}

function stopStream(stream) {
  for (const track of stream?.getTracks?.() || []) {
    try {
      track.stop();
    } catch {
      // A track may already have ended or been revoked by the browser.
    }
  }
}

/**
 * Owns the local webcam/model lifecycle for distraction monitoring.
 *
 * The hook never calls fetch, WebSocket, analytics, or a server endpoint. The
 * only values leaving the MediaPipe adapter are a status, reason, and compact
 * numeric confidence/pose evidence for local UI behavior.
 */
export function useDistractionMonitor({
  onNudge,
  visionConfig,
  adapterFactory = createLocalFocusVisionAdapter,
  analysisIntervalMs = DEFAULT_ANALYSIS_INTERVAL_MS,
  mediaConstraints = DEFAULT_MEDIA_CONSTRAINTS,
  mediaDevices,
  clock,
  distractionThresholdMs,
  distractionHysteresisMs,
  recoveryHysteresisMs,
  unknownHysteresisMs,
  missingFaceGraceMs,
  nudgeCooldownMs,
} = {}) {
  const initialMachineRef = useRef(null);
  if (!initialMachineRef.current) {
    initialMachineRef.current = createFocusRoomState({
      now: currentTime(clock),
      distractionThresholdMs,
      distractionHysteresisMs,
      recoveryHysteresisMs,
      unknownHysteresisMs,
      missingFaceGraceMs,
      nudgeCooldownMs,
    });
  }

  const [machine, setMachine] = useState(initialMachineRef.current);
  const [isStarting, setIsStarting] = useState(false);
  const [failure, setFailure] = useState(null);
  const [capabilities, setCapabilities] = useState(null);
  const [streamActive, setStreamActive] = useState(false);
  const videoRef = useRef(null);
  const machineRef = useRef(initialMachineRef.current);
  const adapterRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const startPromiseRef = useRef(null);
  const sessionRef = useRef(0);
  const runningRef = useRef(false);
  const mountedRef = useRef(true);
  const onNudgeRef = useRef(onNudge);
  const clockRef = useRef(clock);
  onNudgeRef.current = onNudge;
  clockRef.current = clock;

  const advance = useCallback((event) => {
    const previous = machineRef.current;
    const next = transitionFocusRoomState(previous, event);
    machineRef.current = next;
    if (mountedRef.current) setMachine(next);

    if (next.nudgeSequence > previous.nudgeSequence && next.lastNudge) {
      try {
        const result = onNudgeRef.current?.({
          ...next.lastNudge,
          sequence: next.nudgeSequence,
          status: next.status,
        });
        Promise.resolve(result).catch(() => {});
      } catch {
        // A voice/UI callback failure must not stop privacy monitoring.
      }
    }

    return next;
  }, []);

  const cleanupResources = useCallback(() => {
    runningRef.current = false;
    if (timerRef.current != null) {
      globalThis.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const stream = streamRef.current;
    streamRef.current = null;
    stopStream(stream);

    const adapter = adapterRef.current;
    adapterRef.current = null;
    void closeAdapter(adapter);

    const video = videoRef.current;
    if (video && (!stream || video.srcObject === stream)) {
      try {
        video.pause?.();
        video.srcObject = null;
      } catch {
        // Detached video elements can throw while a page is unloading.
      }
    }

    if (mountedRef.current) setStreamActive(false);
  }, []);

  const pauseWithReason = useCallback((reason = "user_paused", nextFailure = null) => {
    sessionRef.current += 1;
    cleanupResources();
    advance({
      type: "PAUSE",
      reason,
      now: currentTime(clockRef.current),
    });
    if (mountedRef.current) {
      setIsStarting(false);
      setFailure(nextFailure);
    }
  }, [advance, cleanupResources]);

  const start = useCallback(() => {
    if (startPromiseRef.current) return startPromiseRef.current;
    if (runningRef.current) return Promise.resolve(true);

    const operation = (async () => {
      const sessionId = sessionRef.current + 1;
      sessionRef.current = sessionId;
      cleanupResources();
      if (mountedRef.current) {
        setIsStarting(true);
        setFailure(null);
      }
      advance({
        type: "PAUSE",
        reason: "loading_model",
        now: currentTime(clockRef.current),
      });

      try {
        if (globalThis.document?.hidden) {
          throw errorWithCode("document_hidden", "The page is hidden.");
        }

        const adapter = await adapterFactory(visionConfig || {});
        if (sessionRef.current !== sessionId || !mountedRef.current) {
          await closeAdapter(adapter);
          return false;
        }
        adapterRef.current = adapter;
        setCapabilities({
          headPose: Boolean(adapter?.capabilities?.headPose),
          phoneDetection: Boolean(adapter?.capabilities?.phoneDetection),
        });

        const availableMediaDevices = mediaDevices || globalThis.navigator?.mediaDevices;
        if (!availableMediaDevices?.getUserMedia) {
          throw errorWithCode("camera_unsupported", "getUserMedia is unavailable.");
        }

        // This is the only permission prompt and it only runs after `start()` is
        // called from the panel's explicit opt-in button.
        const stream = await availableMediaDevices.getUserMedia({
          ...mediaConstraints,
          audio: false,
        });
        if (sessionRef.current !== sessionId || !mountedRef.current) {
          stopStream(stream);
          return false;
        }

        const videoTrack = stream.getVideoTracks?.()[0];
        if (!videoTrack) {
          stopStream(stream);
          throw errorWithCode("camera_unavailable", "No video track was returned.");
        }
        streamRef.current = stream;

        const video = videoRef.current || globalThis.document?.createElement?.("video");
        if (!video) {
          throw errorWithCode("camera_unsupported", "A browser video element is unavailable.");
        }
        if (!videoRef.current) videoRef.current = video;
        video.muted = true;
        video.playsInline = true;
        video.autoplay = true;
        video.srcObject = stream;
        await video.play?.();

        if (sessionRef.current !== sessionId || !mountedRef.current) return false;
        runningRef.current = true;
        setStreamActive(true);
        setIsStarting(false);
        advance({
          type: "ACTIVATE",
          reason: "warming_up",
          now: currentTime(clockRef.current),
        });

        videoTrack.addEventListener?.("ended", () => {
          if (!runningRef.current || sessionRef.current !== sessionId) return;
          pauseWithReason("camera_ended", {
            code: "camera_ended",
            message: "Camera access ended. Resume monitoring to reconnect it.",
          });
        }, { once: true });

        const interval = Math.max(200, Number(analysisIntervalMs) || DEFAULT_ANALYSIS_INTERVAL_MS);
        const analyzeFrame = async () => {
          timerRef.current = null;
          if (!runningRef.current || sessionRef.current !== sessionId) return;
          if (globalThis.document?.hidden) {
            pauseWithReason("document_hidden", failureFor(
              errorWithCode("document_hidden", "The page is hidden."),
            ));
            return;
          }

          try {
            // HAVE_CURRENT_DATA is 2. Waiting avoids treating camera warm-up as
            // a model error or a distraction.
            if (video.readyState >= 2) {
              const result = await Promise.resolve(
                adapter.detect(video, currentTime(clockRef.current)),
              );
              if (!runningRef.current || sessionRef.current !== sessionId) return;
              advance({
                type: "SAMPLE",
                status: result?.status || FOCUS_ROOM_STATUS.UNKNOWN,
                reason: result?.reason || "detection_uncertain",
                now: currentTime(clockRef.current),
              });
            }
          } catch (error) {
            if (sessionRef.current === sessionId) {
              pauseWithReason("model_error", failureFor(error));
            }
            return;
          }

          if (runningRef.current && sessionRef.current === sessionId) {
            timerRef.current = globalThis.setTimeout(analyzeFrame, interval);
          }
        };

        timerRef.current = globalThis.setTimeout(analyzeFrame, 0);
        return true;
      } catch (error) {
        if (sessionRef.current === sessionId && mountedRef.current) {
          const nextFailure = failureFor(error);
          pauseWithReason(nextFailure.code, nextFailure);
        }
        return false;
      }
    })();

    startPromiseRef.current = operation;
    void operation.finally(() => {
      if (startPromiseRef.current === operation) startPromiseRef.current = null;
    });
    return operation;
  }, [
    adapterFactory,
    advance,
    analysisIntervalMs,
    cleanupResources,
    mediaConstraints,
    mediaDevices,
    pauseWithReason,
    visionConfig,
  ]);

  const pause = useCallback(() => {
    pauseWithReason("user_paused", null);
  }, [pauseWithReason]);

  useEffect(() => {
    mountedRef.current = true;
    const handleVisibilityChange = () => {
      if (!globalThis.document?.hidden || (!runningRef.current && !startPromiseRef.current)) return;
      pauseWithReason("document_hidden", {
        code: "document_hidden",
        message: "Focus monitoring paused when this tab was hidden. Resume it when you return.",
      });
    };
    const handlePageHide = () => {
      if (runningRef.current || startPromiseRef.current) {
        pauseWithReason("page_hidden", null);
      }
    };

    globalThis.document?.addEventListener?.("visibilitychange", handleVisibilityChange);
    globalThis.addEventListener?.("pagehide", handlePageHide);
    return () => {
      mountedRef.current = false;
      sessionRef.current += 1;
      globalThis.document?.removeEventListener?.("visibilitychange", handleVisibilityChange);
      globalThis.removeEventListener?.("pagehide", handlePageHide);
      cleanupResources();
    };
  }, [cleanupResources, pauseWithReason]);

  const progress = getFocusRoomProgress(machine, machine.lastSampleAt);
  const browserHasCameraApi = typeof globalThis.navigator === "undefined"
    || Boolean(globalThis.navigator?.mediaDevices?.getUserMedia);

  return {
    status: machine.status,
    statusReason: machine.statusReason,
    active: machine.active,
    isStarting,
    isSupported: browserHasCameraApi && typeof globalThis.WebAssembly !== "undefined",
    streamActive,
    failure,
    capabilities,
    videoRef,
    progress,
    nudgeCount: machine.nudgeSequence,
    lastNudge: machine.lastNudge,
    start,
    retry: start,
    pause,
    stop: pause,
  };
}

export default useDistractionMonitor;
