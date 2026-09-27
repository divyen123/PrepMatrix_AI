import assert from "node:assert/strict";
import test from "node:test";
import { clampExamTimerPosition, getExamTimerDefaultPosition } from "./examTimerPosition.js";

test("expanded sidebar places the timer beside and level with the goal icon", () => {
  assert.deepEqual(getExamTimerDefaultPosition({
    viewportWidth: 1920,
    viewportHeight: 1200,
    sidebarCollapsed: false,
    sidebarVisible: true,
    goalBounds: { right: 196, top: 850, width: 60, height: 62 },
  }), { left: 204, top: 849, docked: true });
});

test("collapsed sidebar keeps the timer near the bottom", () => {
  assert.deepEqual(getExamTimerDefaultPosition({
    viewportWidth: 1920,
    viewportHeight: 1200,
    sidebarCollapsed: true,
    sidebarVisible: true,
    goalBounds: { right: 196, top: 850, width: 60, height: 62 },
  }), { left: 92, top: 1120, docked: false });
});

test("dragged positions stay within the viewport", () => {
  assert.deepEqual(clampExamTimerPosition({ left: 5000, top: -100 }, 320, 600), {
    left: 194, top: 16,
  });
});
