import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  FLOATING_OVERLAY_STACK_GAP_PX,
  FLOATING_OVERLAY_STACK_PROPERTIES,
  getFloatingOverlayReservedHeight,
} from "./floatingOverlayStack.js";

const appStyles = readFileSync(new URL("../App.css", import.meta.url), "utf8");

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

test("keeps Toastify's bottom-right notifications above every measured dashboard overlay", () => {
  assert.match(
    appStyles,
    /body \.Toastify__toast-container\.Toastify__toast-container--bottom-right\s*\{[\s\S]*?--toastify-toast-bottom:\s*calc\([\s\S]*?var\(--dashboard-setup-stack-height, 0px\)[\s\S]*?var\(--pwa-status-dock-stack-height, 0px\)[\s\S]*?var\(--app-notification-stack-height, 0px\)[\s\S]*?\)[\s\S]*?bottom:\s*var\(--toastify-toast-bottom\);/u,
  );
  assert.match(
    appStyles,
    /@media \(max-width: 820px\)\s*\{[\s\S]*?body \.Toastify__toast-container\.Toastify__toast-container--bottom-right\s*\{[\s\S]*?--toastify-toast-right:\s*12px;[\s\S]*?bottom:\s*var\(--toastify-toast-bottom\);/u,
  );
});
