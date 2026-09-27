export const EXAM_TIMER_WIDTH = 110;
export const EXAM_TIMER_HEIGHT = 64;

const EDGE_GAP = 16;

export function clampExamTimerPosition(position, viewportWidth, viewportHeight, {
  width = EXAM_TIMER_WIDTH,
  height = EXAM_TIMER_HEIGHT,
  edgeGap = 0,
} = {}) {
  const maxLeft = Math.max(0, viewportWidth - width);
  const maxTop = Math.max(0, viewportHeight - height);
  const minLeft = Math.min(edgeGap, maxLeft / 2);
  const minTop = Math.min(edgeGap, maxTop / 2);
  return {
    left: Math.round(Math.min(maxLeft - minLeft, Math.max(minLeft, Number(position?.left) || 0))),
    top: Math.round(Math.min(maxTop - minTop, Math.max(minTop, Number(position?.top) || 0))),
  };
}

export function getExamTimerDefaultPosition({
  viewportWidth,
  viewportHeight,
  sidebarCollapsed,
  sidebarVisible,
  goalBounds,
  timerSize = {},
}) {
  const width = timerSize.width ?? EXAM_TIMER_WIDTH;
  const height = timerSize.height ?? EXAM_TIMER_HEIGHT;
  const docked = !sidebarCollapsed && sidebarVisible
    && Boolean(goalBounds?.width && goalBounds?.height);
  const desired = docked
    ? {
      left: goalBounds.right + 8,
      top: goalBounds.top + (goalBounds.height - height) / 2,
    }
    : {
      left: sidebarCollapsed && sidebarVisible ? 92 : EDGE_GAP,
      top: viewportHeight - height - EDGE_GAP,
    };
  return {
    ...clampExamTimerPosition(desired, viewportWidth, viewportHeight, { width, height, edgeGap: EDGE_GAP }),
    docked,
  };
}
