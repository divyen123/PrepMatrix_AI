import assert from "node:assert/strict";
import test from "node:test";
import {
  FLOATING_OVERLAY_STACK_GAP_PX,
  FLOATING_OVERLAY_STACK_PROPERTIES,
  getFloatingOverlayReservedHeight,
} from "./floatingOverlayStack.js";

test("reserves a visible gap after each floating overlay", () => {
  assert.equal(FLOATING_OVERLAY_STACK_GAP_PX, 14);
  assert.equal(getFloatingOverlayReservedHeight(120), "134px");
  assert.equal(getFloatingOverlayReservedHeight(120.1), "135px");
  assert.equal(getFloatingOverlayReservedHeight(-20), "14px");
  assert.equal(getFloatingOverlayReservedHeight("not a height"), "14px");
});

test("uses independent custom properties for each bottom-right overlay slot", () => {
  assert.deepEqual(FLOATING_OVERLAY_STACK_PROPERTIES, {
    dashboardSetup: "--dashboard-setup-stack-height",
    notification: "--app-notification-stack-height",
    pwaStatus: "--pwa-status-dock-stack-height",
  });
});
