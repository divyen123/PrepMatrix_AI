const MOTIVATION_LINES = [
  "You are building real momentum. Stay with it.",
  "Consistency beats intensity. Keep going.",
  "One focused session now will make revision easier later.",
  "You are closer than you think. Finish the next task.",
];

const NAVIGATION_TARGETS = [
  { label: "Dashboard", route: "/dashboard", aliases: ["dashboard", "home", "main page"] },
  { label: "Subjects", route: "/subjects", aliases: ["subjects", "subject", "subject library"] },
  { label: "Planner", route: "/planner", aliases: ["planner", "schedule", "study schedule", "timetable", "time table"] },
  { label: "Analytics", route: "/analytics", aliases: ["analytics", "performance", "signals", "patterns"] },
  { label: "Notes", route: "/notes", aliases: ["notes", "note", "doubts", "doubt board", "left topics"] },
  { label: "Materials", route: "/resources", aliases: ["materials", "resources", "learning materials", "study materials"] },
];

const NAVIGATION_PATTERNS = [
  /\bgo(?:\s+to)?\b/,
  /\bopen\b/,
  /\bshow\b/,
  /\btake\s+me\s+to\b/,
  /\bnavigate(?:\s+to)?\b/,
  /\bswitch(?:\s+to)?\b/,
  /\bmove(?:\s+to)?\b/,
  /\bvisit\b/,
];

export function normalizeAssistantText(text = "") {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatAssistantTime(date = new Date()) {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatAssistantDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function getProgressReply(metrics) {
  return `You have completed ${metrics.completedTasks} of ${metrics.totalTasks} tasks. Current completion is ${metrics.completionRate} percent.`;
}

function getTodayReply(metrics) {
  return metrics.todayTasks.length
    ? `Today's plan includes ${metrics.todayTasks.map((task) => task.task).join(", ")}.`
    : "There are no tasks scheduled for today yet.";
}

function getWeakSubjectReply(metrics) {
  return metrics.weakSubject
    ? `${metrics.weakSubject} needs the most attention right now.`
    : "No weak subject stands out yet.";
}

function resolveNavigationTarget(normalized) {
  const hasNavigationIntent = NAVIGATION_PATTERNS.some((pattern) => pattern.test(normalized));

  if (!hasNavigationIntent) {
    return null;
  }

  return NAVIGATION_TARGETS.find((target) =>
    target.aliases.some((alias) => normalized.includes(alias))
  ) || null;
}

export function resolveLocalAssistantCommand(rawText, options = {}) {
  const {
    metrics,
    setDarkMode,
    onReset,
    navigate,
  } = options;

  const normalized = normalizeAssistantText(rawText);

  if (!normalized) {
    return null;
  }

  const addDoubtMatch = normalized.match(/(?:add|save|create).*doubt(?: about| on| for)? (.+)/);
  if (addDoubtMatch && normalized.includes("note")) {
    const topic = addDoubtMatch[1].replace(/\b(and|then|please)\b/g, "").trim();
    if (topic) {
      window.pendingVoiceNote = { topic };
      navigate?.("/notes");
      return {
        response: `Opening Notes and saving a doubt about ${topic}.`,
        mode: "system",
      };
    }
  }

  if (
    normalized.includes("generate schedule") ||
    normalized.includes("generate timetable") ||
    normalized.includes("create schedule") ||
    normalized.includes("create timetable")
  ) {
    navigate?.("/planner");
    window.plannerAutoGenerateRequested = true;
    window.setTimeout(() => window.plannerActions?.generate?.(), 450);
    return {
      response: "Opening Planner and trying to generate the schedule. If no exam date is selected, choose one first.",
      mode: "system",
    };
  }
  const navigationTarget = resolveNavigationTarget(normalized);

  if (navigationTarget) {
    navigate?.(navigationTarget.route);
    return {
      response: `Opening ${navigationTarget.label}.`,
      mode: "system",
    };
  }



  if (
    normalized.includes("time now") ||
    normalized.includes("current time") ||
    normalized.includes("what time is it") ||
    normalized.includes("time is it")
  ) {
    return {
      response: `The current time is ${formatAssistantTime()}.`,
      mode: "utility",
    };
  }

  if (
    normalized.includes("today s date") ||
    normalized.includes("todays date") ||
    normalized.includes("what is today s date") ||
    normalized.includes("what is the date today") ||
    normalized.includes("date today") ||
    normalized.includes("today date")
  ) {
    return {
      response: `Today is ${formatAssistantDate()}.`,
      mode: "utility",
    };
  }

  if (
    normalized.includes("progress") ||
    normalized.includes("how am i doing")
  ) {
    return { response: getProgressReply(metrics), mode: "planner" };
  }

  if (
    normalized.includes("remaining") ||
    normalized.includes("how many tasks")
  ) {
    return {
      response: `You currently have ${metrics.remainingTasks} tasks remaining.`,
      mode: "planner",
    };
  }

  if (normalized.includes("today") || normalized.includes("study today")) {
    return { response: getTodayReply(metrics), mode: "planner" };
  }

  if (
    normalized.includes("next task") ||
    normalized.includes("what should i do next")
  ) {
    return {
      response: metrics.firstPendingTask
        ? `Your next pending task is ${metrics.firstPendingTask}.`
        : "You do not have any pending tasks right now.",
      mode: "planner",
    };
  }

  if (
    normalized.includes("weak subject") ||
    normalized.includes("needs more focus") ||
    normalized.includes("focus more")
  ) {
    return { response: getWeakSubjectReply(metrics), mode: "planner" };
  }

  if (normalized.includes("motivate") || normalized.includes("motivation")) {
    return {
      response:
        MOTIVATION_LINES[Math.floor(Math.random() * MOTIVATION_LINES.length)],
      mode: "planner",
    };
  }

  if (
    normalized.includes("dark mode") ||
    normalized.includes("switch to dark") ||
    normalized.includes("change to dark") ||
    normalized.includes("turn on dark")
  ) {
    setDarkMode?.(true);
    return {
      response: "Dark theme enabled. The workspace is now in dark mode.",
      mode: "system",
    };
  }

  if (
    normalized.includes("light mode") ||
    normalized.includes("switch to light") ||
    normalized.includes("change to light") ||
    normalized.includes("turn on light")
  ) {
    setDarkMode?.(false);
    return {
      response: "Light theme enabled. The workspace is now in light mode.",
      mode: "system",
    };
  }

  if (
    normalized.includes("reset planner") ||
    normalized.includes("reset all the plan") ||
    normalized.includes("reset all plan") ||
    normalized.includes("reset the plan") ||
    normalized.includes("reset my plan") ||
    normalized.includes("clear planner")
  ) {
    const wasReset = onReset?.();

    return {
      response: wasReset === "pending"
        ? "Reset confirmation is open. Choose Reset to clear the planner or Cancel to keep your progress."
        : wasReset
        ? "Planner reset successfully after confirmation."
        : "Planner reset was cancelled.",
      mode: "system",
    };
  }

  return null;
}

export function buildFallbackReply(message, metrics) {
  return (
    resolveLocalAssistantCommand(message, { metrics })?.response ||
    "The AI chat service is unavailable right now, but your planner data is still available locally."
  );
}






