import assert from "node:assert/strict";
import test from "node:test";
import { getMaterialSearchPopoverPosition } from "./materialSearchPopover.js";

const position = (overrides = {}) => getMaterialSearchPopoverPosition({
  anchorRect: { left: 200, top: 100, bottom: 140 },
  width: 304,
  height: 200,
  viewportWidth: 1000,
  viewportHeight: 800,
  ...overrides,
});

test("anchors the compact popup below its triggering button when it fits", () => {
  assert.deepEqual(position(), { left: 200, top: 148, placement: "below" });
});

test("opens above buttons near the bottom of the viewport", () => {
  assert.deepEqual(position({ anchorRect: { left: 200, top: 680, bottom: 720 } }), {
    left: 200, top: 472, placement: "above",
  });
});

test("keeps the popup within narrow screen edges and clamps a tall popup", () => {
  assert.deepEqual(position({
    anchorRect: { left: 230, top: 80, bottom: 120 }, width: 296, viewportWidth: 320,
  }), { left: 12, top: 128, placement: "below" });
  assert.deepEqual(position({
    anchorRect: { left: 0, top: 40, bottom: 80 }, height: 230, viewportHeight: 260,
  }), { left: 12, top: 18, placement: "below" });
});

test("uses the visible viewport after a mobile keyboard or viewport pan", () => {
  assert.deepEqual(position({
    anchorRect: { left: 60, top: 460, bottom: 500 },
    viewportWidth: 360, viewportHeight: 360, viewportLeft: 50, viewportTop: 200,
  }), { left: 62, top: 252, placement: "above" });
});
