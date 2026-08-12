const LAYOUT_VERSION = 1;
const MAX_ANALYSIS_EDGE = 768;
const MAX_FACES = 10;
const DEFAULT_TIMEOUT_MS = 8_000;

let localDetectorPromise;

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return undefined;
}

function imageDimensions(image) {
  const width = finiteNumber(image?.naturalWidth, image?.videoWidth, image?.width);
  const height = finiteNumber(image?.naturalHeight, image?.videoHeight, image?.height);
  if (!width || !height || width <= 0 || height <= 0) return undefined;
  return { width, height };
}

function safeLayout(width, height, mode = "contain") {
  const sourceAspect = width > 0 && height > 0 ? width / height : 1;
  return {
    version: LAYOUT_VERSION,
    mode,
    focalX: 0.5,
    focalY: 0.5,
    faceAware: false,
    sourceAspect,
  };
}

function createAnalysisCanvas(image, width, height) {
  const scale = Math.min(1, MAX_ANALYSIS_EDGE / Math.max(width, height));
  if (scale === 1) {
    return { source: image, width, height };
  }

  const analysisWidth = Math.max(1, Math.round(width * scale));
  const analysisHeight = Math.max(1, Math.round(height * scale));
  let canvas;

  if (typeof OffscreenCanvas === "function") {
    canvas = new OffscreenCanvas(analysisWidth, analysisHeight);
  } else if (globalThis.document?.createElement) {
    canvas = globalThis.document.createElement("canvas");
    canvas.width = analysisWidth;
    canvas.height = analysisHeight;
  }

  const context = canvas?.getContext?.("2d");
  if (!context?.drawImage) {
    return { source: image, width, height };
  }

  context.drawImage(image, 0, 0, analysisWidth, analysisHeight);
  return { source: canvas, width: analysisWidth, height: analysisHeight };
}

function baseAssetPath(path) {
  const base = typeof import.meta.env?.BASE_URL === "string"
    ? import.meta.env.BASE_URL
    : "/";
  return `${base.replace(/\/?$/, "/")}${String(path).replace(/^\/+/, "")}`;
}

async function createLocalFaceDetector() {
  const { FaceDetector } = await import("@mediapipe/tasks-vision");
  return FaceDetector.createFromOptions(
    {
      wasmLoaderPath: baseAssetPath("mediapipe/vision_wasm_internal.js"),
      wasmBinaryPath: baseAssetPath("mediapipe/vision_wasm_internal.wasm"),
    },
    {
      baseOptions: {
        modelAssetPath: baseAssetPath("models/blaze-face-full-range.tflite"),
      },
      runningMode: "IMAGE",
      minDetectionConfidence: 0.45,
      minSuppressionThreshold: 0.3,
    },
  );
}

function getLocalFaceDetector() {
  if (!localDetectorPromise) {
    localDetectorPromise = createLocalFaceDetector().catch((error) => {
      localDetectorPromise = undefined;
      throw error;
    });
  }
  return localDetectorPromise;
}

function withTimeout(promise, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("Face detection timed out.")), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function yieldBeforeDetection() {
  return new Promise((resolve) => {
    if (typeof globalThis.requestAnimationFrame === "function") {
      globalThis.requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

function detectionList(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.detections)) return result.detections;
  if (Array.isArray(result?.faces)) return result.faces;
  return [];
}

function boundingBoxFor(detection) {
  return detection?.boundingBox
    || detection?.bounding_box
    || detection?.box
    || detection?.locationData?.boundingBox
    || detection?.location_data?.bounding_box;
}

function normalizeBoundingBox(detection, imageWidth, imageHeight) {
  const box = boundingBoxFor(detection);
  if (!box) return undefined;

  let x = finiteNumber(box.originX, box.origin_x, box.x, box.xMin, box.xmin, box.left);
  let y = finiteNumber(box.originY, box.origin_y, box.y, box.yMin, box.ymin, box.top);
  let width = finiteNumber(box.width);
  let height = finiteNumber(box.height);
  const right = finiteNumber(box.xMax, box.xmax, box.right);
  const bottom = finiteNumber(box.yMax, box.ymax, box.bottom);

  if (width === undefined && x !== undefined && right !== undefined) width = right - x;
  if (height === undefined && y !== undefined && bottom !== undefined) height = bottom - y;
  if ([x, y, width, height].some((value) => value === undefined)) return undefined;

  const explicitlyNormalized = box.normalized === true || box.isNormalized === true;
  const looksNormalized = x >= 0 && y >= 0 && width > 0 && height > 0
    && x <= 1 && y <= 1 && width <= 1 && height <= 1;
  if (explicitlyNormalized || looksNormalized) {
    x *= imageWidth;
    y *= imageHeight;
    width *= imageWidth;
    height *= imageHeight;
  }

  if (width <= 0 || height <= 0) return undefined;
  const left = clamp(x, 0, imageWidth);
  const top = clamp(y, 0, imageHeight);
  const clampedRight = clamp(x + width, 0, imageWidth);
  const clampedBottom = clamp(y + height, 0, imageHeight);
  if (clampedRight <= left || clampedBottom <= top) return undefined;

  return { left, top, right: clampedRight, bottom: clampedBottom };
}

function faceAwareLayout(width, height, boxes) {
  const union = boxes.reduce((result, box) => ({
    left: Math.min(result.left, box.left),
    top: Math.min(result.top, box.top),
    right: Math.max(result.right, box.right),
    bottom: Math.max(result.bottom, box.bottom),
  }), {
    left: width,
    top: height,
    right: 0,
    bottom: 0,
  });

  return {
    version: LAYOUT_VERSION,
    mode: "contain",
    focalX: clamp(((union.left + union.right) / 2) / width),
    focalY: clamp(((union.top + union.bottom) / 2) / height),
    faceAware: true,
    sourceAspect: width / height,
  };
}

/**
 * Analyses a custom background locally and returns framing metadata only.
 * Detection failures deliberately use `contain`, so an upload is never rejected
 * and potentially important image content remains visible.
 */
export async function detectCustomBackgroundLayout(
  image,
  { detectorFactory = getLocalFaceDetector, timeoutMs = DEFAULT_TIMEOUT_MS } = {},
) {
  const dimensions = imageDimensions(image);
  if (!dimensions) return safeLayout(1, 1);

  const { width: sourceWidth, height: sourceHeight } = dimensions;
  const fallback = safeLayout(sourceWidth, sourceHeight);

  try {
    const analysis = createAnalysisCanvas(image, sourceWidth, sourceHeight);
    const duration = Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0
      ? Number(timeoutMs)
      : DEFAULT_TIMEOUT_MS;
    const result = await withTimeout((async () => {
      const detector = typeof detectorFactory === "function"
        ? await detectorFactory()
        : await detectorFactory;
      if (!detector?.detect) throw new Error("Face detector is unavailable.");
      await yieldBeforeDetection();
      return detector.detect(analysis.source);
    })(), duration);

    const detections = detectionList(result);
    const boxes = detections
      .map((detection) => normalizeBoundingBox(detection, analysis.width, analysis.height))
      .filter(Boolean)
      .slice(0, MAX_FACES);

    if (boxes.length > 0) {
      const layout = faceAwareLayout(analysis.width, analysis.height, boxes);
      return { ...layout, sourceAspect: sourceWidth / sourceHeight };
    }

    // A reported face with no usable bounds is ambiguous; preserve the whole
    // image rather than treating it as a trustworthy no-face result.
    if (detections.length > 0) return fallback;
    return fallback;
  } catch {
    return fallback;
  }
}
