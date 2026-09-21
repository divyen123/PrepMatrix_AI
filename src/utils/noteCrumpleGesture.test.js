import assert from "node:assert/strict";
import test from "node:test";

import { getNoteCrumpleEdge } from "./noteCrumpleGesture.js";

const bounds = { left: 300, right: 700, top: 200, bottom: 600, width: 400, height: 400 };
const viewport = { viewportWidth: 1000, viewportHeight: 800 };

test("dismisses a note released at any viewport edge after a deliberate drag", () => {
  const directions = [
    { dx: -270, dy: 0, expected: "left" },
    { dx: 270, dy: 0, expected: "right" },
    { dx: 0, dy: -170, expected: "top" },
    { dx: 0, dy: 170, expected: "bottom" },
  ];

  for (const { dx, dy, expected } of directions) {
    assert.equal(getNoteCrumpleEdge({ bounds, ...viewport, dx, dy }), expected);
  }
});

test("keeps a note open after a slight drag even when released near an edge", () => {
  const nearEdgeBounds = { left: 50, right: 450, top: 50, bottom: 450, width: 400, height: 400 };
  assert.equal(getNoteCrumpleEdge({ bounds: nearEdgeBounds, ...viewport, dx: -60, dy: 0 }), null);
  assert.equal(getNoteCrumpleEdge({ bounds: nearEdgeBounds, ...viewport, dx: 0, dy: -60 }), null);
  assert.equal(getNoteCrumpleEdge({ bounds: nearEdgeBounds, ...viewport, dx: -100, dy: 0, minDistance: 120 }), null);
});

test("keeps a note open when a substantial drag stops away from every edge", () => {
  assert.equal(getNoteCrumpleEdge({ bounds, ...viewport, dx: -120, dy: 0 }), null);
  assert.equal(getNoteCrumpleEdge({ bounds, ...viewport, dx: 0, dy: 120 }), null);
});

test("uses the farther reached edge for a diagonal release", () => {
  assert.equal(getNoteCrumpleEdge({ bounds, ...viewport, dx: -280, dy: -180 }), "left");
  assert.equal(getNoteCrumpleEdge({ bounds, ...viewport, dx: 280, dy: 180 }), "right");
});

test("rejects incomplete or non-finite gesture coordinates", () => {
  assert.equal(getNoteCrumpleEdge({ ...viewport, dx: -270, dy: 0 }), null);
  assert.equal(getNoteCrumpleEdge({ bounds, ...viewport, dx: Number.NaN, dy: 0 }), null);
});
