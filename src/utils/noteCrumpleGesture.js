const isFiniteNumber = (value) => Number.isFinite(value);

export function getNoteCrumpleEdge({
  bounds,
  dx,
  dy,
  viewportWidth,
  viewportHeight,
  edgeInset = 36,
  minDistance,
}) {
  if (!bounds || ![dx, dy, viewportWidth, viewportHeight].every(isFiniteNumber)) return null;

  const threshold = isFiniteNumber(minDistance)
    ? minDistance
    : Math.max(96, Math.min(bounds.width, bounds.height) * 0.16);
  if (Math.hypot(dx, dy) < threshold) return null;

  const minimumAxisTravel = threshold * 0.7;
  const reached = [
    dx <= -minimumAxisTravel && bounds.left + dx <= edgeInset
      ? { edge: "left", distance: Math.abs(dx) }
      : null,
    dx >= minimumAxisTravel && bounds.right + dx >= viewportWidth - edgeInset
      ? { edge: "right", distance: Math.abs(dx) }
      : null,
    dy <= -minimumAxisTravel && bounds.top + dy <= edgeInset
      ? { edge: "top", distance: Math.abs(dy) }
      : null,
    dy >= minimumAxisTravel && bounds.bottom + dy >= viewportHeight - edgeInset
      ? { edge: "bottom", distance: Math.abs(dy) }
      : null,
  ].filter(Boolean);

  reached.sort((first, second) => second.distance - first.distance);
  return reached[0]?.edge || null;
}
