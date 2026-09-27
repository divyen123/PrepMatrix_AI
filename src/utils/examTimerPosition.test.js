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
    left: 210, top: 0,
  });
  assert.deepEqual(clampExamTimerPosition({ left: -100, top: 5000 }, 320, 600), {
    left: 0, top: 536,
  });
});

test("dragged positions use the rendered timer size and reach both visible edges", () => {
  assert.deepEqual(clampExamTimerPosition({ left: 5000, top: 5000 }, 320, 600, {
    width: 148,
    height: 86,
  }), {
    left: 172, top: 514,
  });
  assert.deepEqual(clampExamTimerPosition({ left: 5000, top: 5000 }, 100, 50, {
    width: 148,
    height: 86,
  }), {
    left: 0, top: 0,
  });
});
