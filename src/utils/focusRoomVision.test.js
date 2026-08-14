import assert from "node:assert/strict";
import test from "node:test";
import { FOCUS_ROOM_STATUS } from "./focusRoomState.js";
import {
  FocusVisionConfigurationError,
  classifyFocusVisionResults,
  createLocalFocusVisionAdapter,
  isLocalVisionAssetPath,
} from "./focusRoomVision.js";

function matrixForYaw(degrees) {
  const radians = degrees * (Math.PI / 180);
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    rows: 4,
    columns: 4,
    data: [
      cosine, 0, sine, 0,
      0, 1, 0, 0,
      -sine, 0, cosine, 0,
      0, 0, 0, 1,
    ],
  };
}

const faceWithYaw = (degrees) => ({
  faceLandmarks: [[{ x: 0.5, y: 0.5 }]],
  facialTransformationMatrixes: [matrixForYaw(degrees)],
});
test("phone detection takes priority over an otherwise attentive face", () => {
  const result = classifyFocusVisionResults({
    capabilities: { headPose: true, phoneDetection: true },
    faceResult: faceWithYaw(0),
    objectResult: {
      detections: [{
        categories: [{ categoryName: "cell phone", score: 0.91 }],
      }],
    },
  });

  assert.equal(result.status, FOCUS_ROOM_STATUS.DISTRACTED);
  assert.equal(result.reason, "phone_detected");
  assert.deepEqual(result.evidence, {
    phoneConfidence: 0.91,
    phoneLabel: "cell phone",
  });
  assert.equal("detections" in result, false);
});

test("head transform classifies frontal and turned faces without retaining landmarks", () => {
  const frontal = classifyFocusVisionResults({
    capabilities: { headPose: true, phoneDetection: false },
    faceResult: faceWithYaw(0),
  });
  const turned = classifyFocusVisionResults({
    capabilities: { headPose: true, phoneDetection: false },
    faceResult: faceWithYaw(36),
  });

  assert.equal(frontal.status, FOCUS_ROOM_STATUS.ATTENTIVE);
  assert.equal(frontal.reason, "attentive");
  assert.equal(turned.status, FOCUS_ROOM_STATUS.DISTRACTED);
  assert.equal(turned.reason, "looking_away");
  assert.equal(turned.evidence.yawDegrees, 36);
  assert.equal("faceLandmarks" in turned, false);
});

test("missing faces and missing head-pose capability remain unknown", () => {
  const noFace = classifyFocusVisionResults({
    capabilities: { headPose: true, phoneDetection: false },
    faceResult: { faceLandmarks: [], facialTransformationMatrixes: [] },
  });
  const phoneOnlyNoMatch = classifyFocusVisionResults({
    capabilities: { headPose: false, phoneDetection: true },
    objectResult: { detections: [] },
  });

  assert.deepEqual(noFace, {
    status: FOCUS_ROOM_STATUS.UNKNOWN,
    reason: "face_not_visible",
    evidence: {},
  });
  assert.equal(phoneOnlyNoMatch.status, FOCUS_ROOM_STATUS.UNKNOWN);
  assert.equal(phoneOnlyNoMatch.reason, "head_pose_model_unavailable");
});

test("accepts only local model and runtime paths", () => {
  const options = { origin: "https://app.prepmatrix.test" };
  assert.equal(isLocalVisionAssetPath("/models/face.task", options), true);
  assert.equal(isLocalVisionAssetPath("models/phone.tflite", options), true);
  assert.equal(
    isLocalVisionAssetPath("https://app.prepmatrix.test/models/face.task", options),
    true,
  );
  assert.equal(
    isLocalVisionAssetPath("https://models.example.com/face.task", options),
    false,
  );
  assert.equal(isLocalVisionAssetPath("//models.example.com/face.task", options), false);
});

test("adapter invokes configured local tasks, uses monotonic timestamps, and closes both", async () => {
  const timestamps = [];
  const closed = [];
  const visionModuleLoader = async () => ({
    FaceLandmarker: {
      createFromOptions: async () => ({
        detectForVideo: (_frame, timestamp) => {
          timestamps.push(timestamp);
          return faceWithYaw(0);
        },
        close: () => closed.push("face"),
      }),
    },
    ObjectDetector: {
      createFromOptions: async () => ({
        detectForVideo: (_frame, timestamp) => {
          timestamps.push(timestamp);
          return { detections: [] };
        },
        close: () => closed.push("phone"),
      }),
    },
  });

  const adapter = await createLocalFocusVisionAdapter({
    origin: "https://app.prepmatrix.test",
    wasmLoaderPath: "/mediapipe/vision_wasm_internal.js",
    wasmBinaryPath: "/mediapipe/vision_wasm_internal.wasm",
    faceLandmarkerModelPath: "/models/face_landmarker.task",
    phoneDetectorModelPath: "/models/efficientdet_lite0.tflite",
    visionModuleLoader,
  });

  const first = adapter.detect({}, 100);
  const second = adapter.detect({}, 90);
  assert.equal(first.status, FOCUS_ROOM_STATUS.ATTENTIVE);
  assert.equal(second.status, FOCUS_ROOM_STATUS.ATTENTIVE);
  assert.deepEqual(adapter.capabilities, { headPose: true, phoneDetection: true });
  assert.deepEqual(timestamps.slice(0, 2), [100, 100]);
  assert.ok(timestamps[2] > 100);
  assert.equal(timestamps[2], timestamps[3]);

  await adapter.close();
  await adapter.close();
  assert.deepEqual(closed.sort(), ["face", "phone"]);
  assert.throws(() => adapter.detect({}, 200), /closed/u);
});

test("adapter refuses missing or cross-origin model configuration", async () => {
  await assert.rejects(
    createLocalFocusVisionAdapter({ visionModuleLoader: async () => ({}) }),
    (error) => error instanceof FocusVisionConfigurationError
      && error.code === "model_not_configured",
  );

  await assert.rejects(
    createLocalFocusVisionAdapter({
      origin: "https://app.prepmatrix.test",
      faceLandmarkerModelPath: "https://third-party.test/face.task",
      visionModuleLoader: async () => ({}),
    }),
    (error) => error instanceof FocusVisionConfigurationError
      && error.code === "non_local_model_asset",
  );
});
