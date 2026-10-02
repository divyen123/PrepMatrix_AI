export function getMaterialSearchPopoverPosition({
  anchorRect,
  width,
  height,
  viewportWidth,
  viewportHeight,
  viewportLeft = 0,
  viewportTop = 0,
}) {
  const margin = 12;
  const gap = 8;
  const right = viewportLeft + viewportWidth - margin;
  const bottom = viewportTop + viewportHeight - margin;
  const below = bottom - anchorRect.bottom - gap;
  const above = anchorRect.top - viewportTop - margin - gap;
  const placement = below < height && above > below ? "above" : "below";
  const left = Math.max(viewportLeft + margin, Math.min(anchorRect.left, right - width));
  const preferredTop = placement === "above"
    ? anchorRect.top - gap - height
    : anchorRect.bottom + gap;
  const top = Math.max(viewportTop + margin, Math.min(preferredTop, bottom - height));

  return { left, top, placement };
}
