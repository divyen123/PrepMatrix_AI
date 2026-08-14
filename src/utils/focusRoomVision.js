import { FOCUS_ROOM_STATUS } from "./focusRoomState.js";

const DEFAULT_PHONE_LABELS = Object.freeze([
  "cell phone",
  "mobile phone",
  "phone",
  "smartphone",
]);

const DEFAULT_THRESHOLDS = Object.freeze({
  phoneConfidence: 0.45,
  yawDegrees: 28,
  pitchDegrees: 22,
  landmarkYawRatio: 0.2,
  landmarkPitchOffsetRatio: 0.25,
});

const BUILD_ENV = import.meta.env || {};

export class FocusVisionConfigurationError extends Error {
  constructor(message, code = "model_not_configured") {
    super(message);
    this.name = "FocusVisionConfigurationError";
    this.code = code;
  }
}
function baseAssetPath(path) {
  const base = typeof BUILD_ENV.BASE_URL === "string" ? BUILD_ENV.BASE_URL : "/";
  return `${base.replace(/\/?$/, "/")}${String(path).replace(/^\/+/, "")}`;
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function normalizedLabels(labels) {
  const source = Array.isArray(labels) && labels.length > 0
    ? labels
    : DEFAULT_PHONE_LABELS;
  return [...new Set(source
    .map((label) => String(label || "").trim().toLowerCase())
    .filter(Boolean))];
}

function assetOrigin(options = {}) {
  return options.origin || globalThis.location?.origin || "https://prepmatrix.local";
}

/**
 * Only relative, same-origin, blob, and data asset locations are accepted.
 * This prevents an integration mistake from silently loading a vision model
 * from a third-party host.
 */
export function isLocalVisionAssetPath(path, options = {}) {
  if (typeof path !== "string" || !path.trim()) return false;
  const value = path.trim();
  if (/^(blob:|data:)/i.test(value)) return true;
  if (/^\/\//.test(value)) return false;

  const origin = assetOrigin(options);
  try {
    const resolved = new URL(value, `${origin}/`);
    return resolved.origin === new URL(origin).origin;
  } catch {
    return false;
  }
}

function requireLocalAsset(path, label, options = {}) {
  if (!isLocalVisionAssetPath(path, options)) {
    throw new FocusVisionConfigurationError(
      `${label} must use a relative or same-origin browser asset path.`,
      "non_local_model_asset",
    );
  }
}

export function resolveFocusVisionConfig(options = {}) {
  const faceLandmarkerModelPath = options.faceLandmarkerModelPath
    || BUILD_ENV.VITE_FOCUS_FACE_LANDMARKER_MODEL_PATH
    || "";
  const phoneDetectorModelPath = options.phoneDetectorModelPath
    || BUILD_ENV.VITE_FOCUS_PHONE_DETECTOR_MODEL_PATH
    || "";
  const phoneLabels = normalizedLabels(options.phoneLabels);

  return {
    wasmLoaderPath: options.wasmLoaderPath
      || baseAssetPath("mediapipe/vision_wasm_internal.js"),
    wasmBinaryPath: options.wasmBinaryPath
      || baseAssetPath("mediapipe/vision_wasm_internal.wasm"),
    faceLandmarkerModelPath,
    phoneDetectorModelPath,
    phoneLabels,
    delegate: options.delegate === "GPU" ? "GPU" : "CPU",
    thresholds: {
      phoneConfidence: positiveNumber(
        options.phoneConfidence,
        DEFAULT_THRESHOLDS.phoneConfidence,
      ),
      yawDegrees: positiveNumber(options.yawDegrees, DEFAULT_THRESHOLDS.yawDegrees),
      pitchDegrees: positiveNumber(options.pitchDegrees, DEFAULT_THRESHOLDS.pitchDegrees),
      landmarkYawRatio: positiveNumber(
        options.landmarkYawRatio,
        DEFAULT_THRESHOLDS.landmarkYawRatio,
      ),
      landmarkPitchOffsetRatio: positiveNumber(
        options.landmarkPitchOffsetRatio,
        DEFAULT_THRESHOLDS.landmarkPitchOffsetRatio,
      ),
    },
    origin: options.origin,
  };
}

function detectionsFrom(result) {
  return Array.isArray(result?.detections) ? result.detections : [];
}

function categoriesFrom(detection) {
  return Array.isArray(detection?.categories) ? detection.categories : [];
}

function categoryLabel(category) {
  return String(
    category?.categoryName
      || category?.displayName
      || category?.category_name
      || category?.display_name
      || "",
  ).trim().toLowerCase();
}

function phoneEvidence(result, labels, minimumConfidence) {
  const allowed = new Set(normalizedLabels(labels));
  let best;

  for (const detection of detectionsFrom(result)) {
    for (const category of categoriesFrom(detection)) {
      const label = categoryLabel(category);
      const score = finiteNumber(category?.score, 0);
      if (allowed.has(label) && score >= minimumConfidence && (!best || score > best.confidence)) {
        best = { label, confidence: score };
      }
    }
  }

  return best;
}

function radiansToDegrees(value) {
  return value * (180 / Math.PI);
}

function matrixData(matrix) {
  const data = matrix?.data;
  return data && typeof data.length === "number" && data.length >= 11
    ? Array.from(data, Number)
    : null;
}

function poseFromTransformationMatrix(result) {
  const matrices = Array.isArray(result?.facialTransformationMatrixes)
    ? result.facialTransformationMatrixes
    : [];
  const data = matrixData(matrices[0]);
  if (!data || data.some((value) => !Number.isFinite(value))) return null;

  // MediaPipe exposes the 4x4 facial transform in row-major order. Extract
  // Euler pitch/yaw from its rotation block; roll is irrelevant for attention.
  const r00 = data[0];
  const r10 = data[4];
  const r20 = data[8];
  const r21 = data[9];
  const r22 = data[10];
  const horizontalScale = Math.sqrt((r00 * r00) + (r10 * r10));
  const pitchDegrees = radiansToDegrees(Math.atan2(r21, r22));
  const yawDegrees = radiansToDegrees(Math.atan2(-r20, horizontalScale));

  if (!Number.isFinite(pitchDegrees) || !Number.isFinite(yawDegrees)) return null;
  return {
    source: "transformation_matrix",
    pitchDegrees,
    yawDegrees,
  };
}

function averagePoint(...points) {
  const valid = points.filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y));
  if (valid.length === 0) return null;
  return {
    x: valid.reduce((sum, point) => sum + point.x, 0) / valid.length,
    y: valid.reduce((sum, point) => sum + point.y, 0) / valid.length,
  };
}

function poseFromLandmarks(result) {
  const landmarks = Array.isArray(result?.faceLandmarks?.[0])
    ? result.faceLandmarks[0]
    : null;
  if (!landmarks || landmarks.length < 264) return null;

  const leftEye = averagePoint(landmarks[33], landmarks[133]);
  const rightEye = averagePoint(landmarks[362], landmarks[263]);
  const nose = landmarks[1];
  if (!leftEye || !rightEye || !Number.isFinite(nose?.x) || !Number.isFinite(nose?.y)) {
    return null;
  }

  const eyeDx = rightEye.x - leftEye.x;
  const eyeDy = rightEye.y - leftEye.y;
  const eyeSpan = Math.sqrt((eyeDx * eyeDx) + (eyeDy * eyeDy));
  if (!Number.isFinite(eyeSpan) || eyeSpan < 0.01) return null;

  const eyeMidpoint = averagePoint(leftEye, rightEye);
  const yawRatio = (nose.x - eyeMidpoint.x) / eyeSpan;
  const noseDropRatio = (nose.y - eyeMidpoint.y) / eyeSpan;

  return {
    source: "landmark_geometry",
    yawRatio,
    // A frontal face normally places the nose about half an eye-span below the
    // eye line. This value is deliberately a proxy, not a claimed angle.
    pitchOffsetRatio: noseDropRatio - 0.5,
  };
}

function faceCount(result) {
  return Array.isArray(result?.faceLandmarks) ? result.faceLandmarks.length : 0;
}

function classifyPose(pose, thresholds) {
  if (!pose) return { status: FOCUS_ROOM_STATUS.UNKNOWN, reason: "head_pose_unavailable" };

  if (pose.source === "transformation_matrix") {
    const lookingAway = Math.abs(pose.yawDegrees) > thresholds.yawDegrees
      || Math.abs(pose.pitchDegrees) > thresholds.pitchDegrees;
    return {
      status: lookingAway ? FOCUS_ROOM_STATUS.DISTRACTED : FOCUS_ROOM_STATUS.ATTENTIVE,
      reason: lookingAway ? "looking_away" : "attentive",
      evidence: {
        poseSource: pose.source,
        pitchDegrees: Math.round(pose.pitchDegrees * 10) / 10,
        yawDegrees: Math.round(pose.yawDegrees * 10) / 10,
      },
    };
  }

  const lookingAway = Math.abs(pose.yawRatio) > thresholds.landmarkYawRatio
    || Math.abs(pose.pitchOffsetRatio) > thresholds.landmarkPitchOffsetRatio;
  return {
    status: lookingAway ? FOCUS_ROOM_STATUS.DISTRACTED : FOCUS_ROOM_STATUS.ATTENTIVE,
    reason: lookingAway ? "looking_away" : "attentive",
    evidence: {
      poseSource: pose.source,
      pitchOffsetRatio: Math.round(pose.pitchOffsetRatio * 100) / 100,
      yawRatio: Math.round(pose.yawRatio * 100) / 100,
    },
  };
}

/**
 * Reduces raw MediaPipe results to the minimum local attention signal. Raw
 * frames, landmarks, bounding boxes, and detections are intentionally omitted.
 */
export function classifyFocusVisionResults({
  faceResult,
  objectResult,
  capabilities = {},
  phoneLabels = DEFAULT_PHONE_LABELS,
  thresholds = DEFAULT_THRESHOLDS,
} = {}) {
  const mergedThresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const phone = capabilities.phoneDetection
    ? phoneEvidence(objectResult, phoneLabels, mergedThresholds.phoneConfidence)
    : null;

  if (phone) {
    return {
      status: FOCUS_ROOM_STATUS.DISTRACTED,
      reason: "phone_detected",
      evidence: {
        phoneConfidence: Math.round(phone.confidence * 100) / 100,
        phoneLabel: phone.label,
      },
    };
  }

  if (!capabilities.headPose) {
    return {
      status: FOCUS_ROOM_STATUS.UNKNOWN,
      reason: "head_pose_model_unavailable",
      evidence: {},
    };
  }

  if (faceCount(faceResult) === 0) {
    return {
      status: FOCUS_ROOM_STATUS.UNKNOWN,
      reason: "face_not_visible",
      evidence: {},
    };
  }

  const pose = poseFromTransformationMatrix(faceResult) || poseFromLandmarks(faceResult);
  return classifyPose(pose, mergedThresholds);
}

async function safeClose(task) {
  if (!task?.close) return;
  await task.close();
}

/**
 * Creates an on-device MediaPipe adapter. It never uploads frames or detection
 * output; `detect` synchronously evaluates the supplied HTMLVideoElement and
 * immediately reduces results to a small attention classification.
 */
export async function createLocalFocusVisionAdapter(options = {}) {
  const config = resolveFocusVisionConfig(options);
  if (!config.faceLandmarkerModelPath && !config.phoneDetectorModelPath) {
    throw new FocusVisionConfigurationError(
      "Add a local face-landmarker or phone-detector model before enabling focus monitoring.",
    );
  }

  requireLocalAsset(config.wasmLoaderPath, "MediaPipe WASM loader", config);
  requireLocalAsset(config.wasmBinaryPath, "MediaPipe WASM binary", config);
  if (config.faceLandmarkerModelPath) {
    requireLocalAsset(config.faceLandmarkerModelPath, "Face landmarker model", config);
  }
  if (config.phoneDetectorModelPath) {
    requireLocalAsset(config.phoneDetectorModelPath, "Phone detector model", config);
  }

  const moduleLoader = options.visionModuleLoader
    || (() => import("@mediapipe/tasks-vision"));
  const vision = await moduleLoader();
  const wasmFileset = {
    wasmLoaderPath: config.wasmLoaderPath,
    wasmBinaryPath: config.wasmBinaryPath,
  };

  let faceLandmarker;
  let phoneDetector;
  try {
    if (config.faceLandmarkerModelPath) {
      if (!vision?.FaceLandmarker?.createFromOptions) {
        throw new Error("MediaPipe FaceLandmarker is unavailable.");
      }
      faceLandmarker = await vision.FaceLandmarker.createFromOptions(wasmFileset, {
        baseOptions: {
          modelAssetPath: config.faceLandmarkerModelPath,
          delegate: config.delegate,
        },
        runningMode: "VIDEO",
        numFaces: 1,
        minFaceDetectionConfidence: 0.55,
        minFacePresenceConfidence: 0.55,
        minTrackingConfidence: 0.5,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: true,
      });
    }

    if (config.phoneDetectorModelPath) {
      if (!vision?.ObjectDetector?.createFromOptions) {
        throw new Error("MediaPipe ObjectDetector is unavailable.");
      }
      phoneDetector = await vision.ObjectDetector.createFromOptions(wasmFileset, {
        baseOptions: {
          modelAssetPath: config.phoneDetectorModelPath,
          delegate: config.delegate,
        },
        runningMode: "VIDEO",
        scoreThreshold: config.thresholds.phoneConfidence,
        categoryAllowlist: config.phoneLabels,
        maxResults: 3,
      });
    }
  } catch (error) {
    await Promise.allSettled([safeClose(faceLandmarker), safeClose(phoneDetector)]);
    throw error;
  }

  let closed = false;
  let lastTimestamp = -1;
  const capabilities = Object.freeze({
    headPose: Boolean(faceLandmarker),
    phoneDetection: Boolean(phoneDetector),
  });

  return {
    capabilities,
    detect(videoFrame, timestamp) {
      if (closed) throw new Error("The focus vision adapter is closed.");
      if (!videoFrame) throw new TypeError("A browser video frame is required.");

      const requestedTimestamp = finiteNumber(timestamp, globalThis.performance?.now?.() || 0);
      const frameTimestamp = Math.max(requestedTimestamp, lastTimestamp + 0.01);
      lastTimestamp = frameTimestamp;

      const faceResult = faceLandmarker?.detectForVideo(videoFrame, frameTimestamp);
      const objectResult = phoneDetector?.detectForVideo(videoFrame, frameTimestamp);
      return classifyFocusVisionResults({
        faceResult,
        objectResult,
        capabilities,
        phoneLabels: config.phoneLabels,
        thresholds: config.thresholds,
      });
    },
    async close() {
      if (closed) return;
      closed = true;
      await Promise.allSettled([safeClose(faceLandmarker), safeClose(phoneDetector)]);
      faceLandmarker = undefined;
      phoneDetector = undefined;
    },
  };
}
