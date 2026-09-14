export const FLOATING_OVERLAY_STACK_GAP_PX = 14;

export const FLOATING_OVERLAY_STACK_PROPERTIES = Object.freeze({
  dashboardSetup: "--dashboard-setup-stack-height",
  notification: "--app-notification-stack-height",
  pwaStatus: "--pwa-status-dock-stack-height",
});

export function getFloatingOverlayReservedHeight(height, gap = FLOATING_OVERLAY_STACK_GAP_PX) {
  const safeHeight = Number.isFinite(Number(height)) ? Math.max(0, Number(height)) : 0;
  const safeGap = Number.isFinite(Number(gap)) ? Math.max(0, Number(gap)) : 0;
  return `${Math.ceil(safeHeight + safeGap)}px`;
}
