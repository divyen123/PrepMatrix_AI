export function resolveCodeMatrixShortcut(event) {
  if (!event || event.defaultPrevented || event.repeat || event.altKey || event.shiftKey) return null;
  if (Boolean(event.ctrlKey) === Boolean(event.metaKey)) return null;

  const key = String(event.key || "").toLowerCase();
  if (key === "enter") return "run";
  if (key === "s") return "save";
  return null;
}
