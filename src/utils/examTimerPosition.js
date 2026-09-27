export const EXAM_TIMER_WIDTH = 110;
export const EXAM_TIMER_HEIGHT = 64;

const EDGE_GAP = 16;

export function clampExamTimerPosition(position, viewportWidth, viewportHeight) {
  const maxLeft = Math.max(EDGE_GAP, viewportWidth - EXAM_TIMER_WIDTH - EDGE_GAP);
  const maxTop = Math.max(EDGE_GAP, viewportHeight - EXAM_TIMER_HEIGHT - EDGE_GAP);
  return {
    left: Math.round(Math.min(maxLeft, Math.max(EDGE_GAP, Number(position?.left) || 0))),
    top: Math.round(Math.min(maxTop, Math.max(EDGE_GAP, Number(position?.top) || 0))),
  };
}

export function getExamTimerDefaultPosition({
  viewportWidth,
  viewportHeight,
  sidebarCollapsed,
  sidebarVisible,
  goalBounds,
}) {
  const docked = !sidebarCollapsed && sidebarVisible
    && Boolean(goalBounds?.width && goalBounds?.height);
  const desired = docked
    ? {
      left: goalBounds.right + 8,
      top: goalBounds.top + (goalBounds.height - EXAM_TIMER_HEIGHT) / 2,
    }
    : {
      left: sidebarCollapsed && sidebarVisible ? 92 : EDGE_GAP,
      top: viewportHeight - EXAM_TIMER_HEIGHT - EDGE_GAP,
    };
  return { ...clampExamTimerPosition(desired, viewportWidth, viewportHeight), docked };
}
