import assert from "node:assert/strict";
import test from "node:test";
import { detectCustomBackgroundLayout } from "./customBackgroundFaceDetection.js";

const detectorWith = (result) => async () => ({ detect: () => result });

test("returns exact face-aware contain framing around the union of detected faces", async () => {
  const layout = await detectCustomBackgroundLayout(
    { width: 800, height: 400 },
    {
      detectorFactory: detectorWith({
        detections: [
          { boundingBox: { originX: 100, originY: 50, width: 100, height: 100 } },
          { bounding_box: { left: 500, top: 100, right: 600, bottom: 200 } },
        ],
      }),
    },
  );

  assert.deepEqual(layout, {
    version: 1,
    mode: "contain",
    focalX: 0.4375,
    focalY: 0.3125,
    faceAware: true,
    sourceAspect: 2,
  });
});

test("keeps the full frame visible when no face is detected", async () => {
  const landscape = await detectCustomBackgroundLayout(
    { naturalWidth: 800, naturalHeight: 450 },
    { detectorFactory: detectorWith({ detections: [] }) },
  );
  const portrait = await detectCustomBackgroundLayout(
    { naturalWidth: 600, naturalHeight: 900 },
    { detectorFactory: detectorWith({ detections: [] }) },
  );

  assert.deepEqual(landscape, {
    version: 1,
    mode: "contain",
    focalX: 0.5,
    focalY: 0.5,
    faceAware: false,
    sourceAspect: 800 / 450,
  });
  assert.deepEqual(portrait, {
    version: 1,
    mode: "contain",
    focalX: 0.5,
    focalY: 0.5,
    faceAware: false,
    sourceAspect: 600 / 900,
  });
});

test("downsamples large images to a maximum 768px edge before detection", async () => {
  const previousDocument = globalThis.document;
  const previousOffscreenCanvas = globalThis.OffscreenCanvas;
  const drawCalls = [];
  let detectedSource;

  globalThis.OffscreenCanvas = undefined;
  globalThis.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage: (...args) => drawCalls.push(args),
      }),
    }),
  };

  try {
    const layout = await detectCustomBackgroundLayout(
      { width: 1920, height: 1080 },
      {
        detectorFactory: async () => ({
          detect: (source) => {
            detectedSource = source;
            return { detections: [] };
          },
        }),
      },
    );

    assert.equal(detectedSource.width, 768);
    assert.equal(detectedSource.height, 432);
    assert.equal(drawCalls.length, 1);
    assert.equal(layout.mode, "contain");
    assert.equal(layout.sourceAspect, 1920 / 1080);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousOffscreenCanvas === undefined) delete globalThis.OffscreenCanvas;
    else globalThis.OffscreenCanvas = previousOffscreenCanvas;
  }
});

test("caps valid detections at ten and accepts normalized box aliases", async () => {
  const detections = Array.from({ length: 10 }, () => ({
    box: { x: 0.1, y: 0.2, width: 0.1, height: 0.2, normalized: true },
  }));
  detections.push({
    box: { x: 0.8, y: 0.8, width: 0.1, height: 0.1, normalized: true },
  });

  const layout = await detectCustomBackgroundLayout(
    { width: 500, height: 500 },
    { detectorFactory: detectorWith({ faces: detections }) },
  );

  assert.equal(layout.faceAware, true);
  assert.equal(layout.focalX, 0.15);
  assert.equal(layout.focalY, 0.3);
});

test("never rejects uploads when detection fails, is malformed, or times out", async () => {
  const errorLayout = await detectCustomBackgroundLayout(
    { width: 1200, height: 600 },
    { detectorFactory: async () => { throw new Error("unavailable"); } },
  );
  const malformedLayout = await detectCustomBackgroundLayout(
    { width: 1200, height: 600 },
    { detectorFactory: detectorWith({ detections: [{ boundingBox: { width: -1 } }] }) },
  );
  const timeoutLayout = await detectCustomBackgroundLayout(
    { width: 400, height: 200 },
    { detectorFactory: () => new Promise(() => {}), timeoutMs: 5 },
  );

  for (const layout of [errorLayout, malformedLayout, timeoutLayout]) {
    assert.equal(layout.mode, "contain");
    assert.equal(layout.faceAware, false);
    assert.equal(layout.focalX, 0.5);
    assert.equal(layout.focalY, 0.5);
  }
});
