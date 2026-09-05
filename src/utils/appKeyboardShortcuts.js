export const OPEN_SHORTCUT_GUIDE_EVENT = "openPrepMatrixKeyboardShortcutGuide";

export const APP_NAVIGATION_SHORTCUTS = Object.freeze([
  { action: "navigate", key: "1", keys: ["Alt", "1"], label: "Dashboard", route: "/dashboard" },
  { action: "navigate", key: "2", keys: ["Alt", "2"], label: "Subjects", route: "/subjects" },
  { action: "navigate", key: "3", keys: ["Alt", "3"], label: "Start Learning", route: "/learn" },
  { action: "navigate", key: "4", keys: ["Alt", "4"], label: "Planner", route: "/planner" },
  { action: "navigate", key: "5", keys: ["Alt", "5"], label: "Analytics", route: "/analytics" },
  { action: "navigate", key: "6", keys: ["Alt", "6"], label: "Notes", route: "/notes" },
  { action: "navigate", key: "7", keys: ["Alt", "7"], label: "Quiz", route: "/quiz" },
  { action: "navigate", key: "8", keys: ["Alt", "8"], label: "Report", route: "/report" },
  { action: "navigate", key: "9", keys: ["Alt", "9"], label: "Materials", route: "/resources" },
  { action: "navigate", key: "0", keys: ["Alt", "0"], label: "Resume Builder", route: "/resume-builder" },
]);

export const APP_SHORTCUT_GUIDE_GROUPS = Object.freeze([
  {
    id: "workspace",
    label: "Workspace",
    description: "Open the tools you use most without leaving the keyboard.",
    items: [
      { keys: ["Ctrl", "Shift", "M"], label: "Start or stop the assistant microphone" },
      { keys: ["Ctrl", "Shift", "A"], label: "Open or close AI Chat" },
      { keys: ["Ctrl", "K"], label: "Focus the Dashboard Ask AI bar" },
      { keys: ["Ctrl", "Shift", "T"], label: "Open or close Goals & To-Do" },
      { keys: ["Ctrl", ","], label: "Open Settings" },
      { keys: ["Ctrl", "Shift", "H"], label: "View alert history" },
      { keys: ["Esc"], label: "Close the active popup, drawer, or AI Chat" },
      { keys: ["?"], label: "Open this keyboard shortcut guide" },
    ],
  },
  {
    id: "navigation",
    label: "Navigation",
    description: "Jump directly to a main workspace page.",
    items: APP_NAVIGATION_SHORTCUTS.map(({ keys, label }) => ({
      keys,
      label: `Open ${label}`,
    })),
  },
  {
    id: "page-actions",
    label: "Page actions",
    description: "These keys work only on the named page and stay inactive while you type.",
    items: [
      { context: "AI Chat", keys: ["Alt", "N"], label: "Start a new chat" },
      { context: "AI Chat", keys: ["Ctrl", "Enter"], label: "Send the message" },
      { context: "AI Chat", keys: ["Shift", "Enter"], label: "Insert a new line" },
      { context: "Planner schedule", keys: ["N"], label: "Open the new-schedule controls" },
      { context: "Planner schedule", keys: ["T"], label: "Jump to today's schedule card" },
      { context: "Planner schedule", keys: ["C"], label: "Complete the focused task" },
      { context: "Notes", keys: ["N"], label: "Add a new note" },
      { context: "Notes", keys: ["/"], label: "Focus note search" },
      { context: "Quiz", keys: ["1", "2", "3", "4"], label: "Choose an option in the focused question", separator: "or" },
      { context: "Quiz", keys: ["Enter"], label: "Move to the next unanswered question or submit" },
      { context: "Quiz", keys: ["F"], label: "Flag or unflag the focused question" },
    ],
  },
]);

export function isEditableShortcutTarget(target) {
  if (!target || typeof target.closest !== "function") return false;
  return Boolean(target.closest(
    'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]',
  ));
}

export function resolveAppKeyboardShortcut(event) {
  if (!event || event.defaultPrevented || event.repeat) return null;

  const key = String(event.key || "").toLowerCase();
  const primary = Boolean(event.ctrlKey || event.metaKey);

  if (primary && event.shiftKey && !event.altKey && key === "m") {
    return { action: "toggle-microphone" };
  }
  if (primary && event.shiftKey && !event.altKey && key === "a") {
    return { action: "toggle-assistant" };
  }
  if (primary && event.shiftKey && !event.altKey && key === "t") {
    return { action: "toggle-goals" };
  }
  if (primary && event.shiftKey && !event.altKey && key === "h") {
    return { action: "open-alert-history" };
  }
  if (primary && !event.shiftKey && !event.altKey && key === "k") {
    return { action: "focus-ask" };
  }
  if (primary && !event.shiftKey && !event.altKey && key === ",") {
    return { action: "open-settings" };
  }

  if (event.altKey && !primary && !event.shiftKey) {
    const navigation = APP_NAVIGATION_SHORTCUTS.find((shortcut) => shortcut.key === key);
    if (navigation) return navigation;
  }

  if (!primary && !event.altKey && key === "?" && !isEditableShortcutTarget(event.target)) {
    return { action: "open-shortcut-guide" };
  }

  return null;
}

export function openKeyboardShortcutGuide(eventTarget) {
  const target = eventTarget || (typeof window !== "undefined" ? window : null);
  if (!target?.dispatchEvent || typeof CustomEvent === "undefined") return;
  target.dispatchEvent(new CustomEvent(OPEN_SHORTCUT_GUIDE_EVENT));
}
