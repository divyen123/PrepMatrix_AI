import { isMaterialSuggestionRequest } from "./chatMaterialSuggestions.js";

const NAVIGATION_LEAD_PATTERN = /^(?:(?:please|kindly)\s+)?(?:(?:can|could|would|will)\s+you\s+)?(?:take\s+me(?:\s+to)?|bring\s+me(?:\s+to)?|send\s+me(?:\s+to)?|go(?:\s+to)?|head\s+to|navigate(?:\s+to)?|switch\s+to|move\s+to|open(?:\s+up)?|show(?:\s+me)?|view|visit|launch|access|display|see)\s+/;
const HOME_ALIASES = new Set(["home", "homepage", "home page", "main page"]);
export const GOAL_REMINDER_SHORTCUT_ROUTE = "/dashboard#goals-reminders";
const DEFAULT_SUGGESTION_ROUTE_PRIORITY = Object.freeze([
  "/learn",
  "/planner",
  GOAL_REMINDER_SHORTCUT_ROUTE,
  "/resources",
  "/analytics",
  "/quiz",
  "/subjects",
  "/dashboard",
  "/report",
  "/notes",
  "/resume-builder",
  "/kids",
  "/ai-chat",
  "/settings",
  "/notification-history",
  "/about",
  "/exam",
  "/exam/about",
]);

function defineDestination({
  id,
  route,
  label,
  description,
  aliases,
  content = false,
  defaultShortcut = false,
  intentPatterns = [],
}) {
  const normalizedAliases = Array.from(new Set([label, ...aliases].map(normalizeHomeNavigationInput)));

  return Object.freeze({
    id,
    route,
    label,
    description,
    content,
    defaultShortcut,
    aliases: Object.freeze(normalizedAliases),
    intentPatterns: Object.freeze(intentPatterns),
  });
}

const DESTINATIONS = Object.freeze([
  defineDestination({
    id: "dashboard",
    route: "/dashboard",
    label: "Dashboard",
    description: "Overview, momentum, and today's work",
    aliases: ["home", "homepage", "home page", "overview", "main page"],
    intentPatterns: [
      /\b(?:show|view|check|see)\s+(?:me\s+)?(?:my\s+)?(?:dashboard|overview|home\s+page)\b/,
      /\bwhat\s+(?:do\s+i\s+have|is\s+planned)\s+(?:for\s+)?today\b/,
    ],
  }),
  defineDestination({
    id: "smart-suggestions",
    route: "/dashboard#smart-suggestions",
    label: "Smart Suggestions",
    description: "Recommended next study actions",
    content: true,
    aliases: ["smart suggestions", "study suggestions", "suggestions", "recommendations", "recommended actions"],
    intentPatterns: [
      /\b(?:show|give|find|view)\s+(?:me\s+)?(?:my\s+|some\s+)?(?:smart\s+|study\s+)?(?:suggestions|recommendations|recommended\s+actions)\b/,
      /\bwhat\s+should\s+i\s+(?:study|do)\s+next\b/,
    ],
  }),
  defineDestination({
    id: "progress-status",
    route: "/dashboard#progress-status",
    label: "Progress Status",
    description: "A quick completion and momentum summary",
    content: true,
    aliases: ["progress status", "dashboard progress", "completion status", "momentum status"],
    intentPatterns: [
      /\b(?:show|check|view|see)\s+(?:me\s+)?(?:my\s+)?(?:progress|completion|momentum)\s+status\b/,
    ],
  }),
  defineDestination({
    id: "weekly-review",
    route: "/dashboard#weekly-review",
    label: "Weekly Review",
    description: "This week's study completion review",
    content: true,
    aliases: ["weekly review", "week review", "this week", "weekly summary"],
    intentPatterns: [
      /\b(?:show|open|view|check|review)\s+(?:me\s+)?(?:my\s+|the\s+)?(?:weekly\s+review|week(?:ly)?\s+summary|this\s+week)\b/,
    ],
  }),
  defineDestination({
    id: "goals-reminders",
    route: GOAL_REMINDER_SHORTCUT_ROUTE,
    label: "Goals & Reminders",
    description: "Goals, scheduled reminders, and quick to-dos",
    content: true,
    defaultShortcut: true,
    aliases: [
      "goal",
      "goals",
      "reminder",
      "reminders",
      "goal reminder",
      "goal reminders",
      "goals and reminders",
      "goals reminders",
      "quick to dos",
    ],
    intentPatterns: [
      /\b(?:open|show|view|check|manage|add|create)\s+(?:my\s+|the\s+|a\s+)?(?:goals?|reminders?|goals?\s+(?:and\s+)?reminders?)\b/,
    ],
  }),
  defineDestination({
    id: "kids",
    route: "/kids",
    label: "Play & Learn",
    description: "Games, daily adventures, and rewards",
    aliases: [
      "kids",
      "kids zone",
      "kids mode",
      "play and learn",
      "learning games",
      "game world",
      "adventure map",
      "daily adventure",
      "knowledge quest",
    ],
    intentPatterns: [
      /\b(?:play|start|open|show)\s+(?:a\s+|the\s+)?(?:learning\s+)?(?:game|adventure|knowledge\s+quest)\b/,
    ],
  }),
  defineDestination({
    id: "ai-chat",
    route: "/ai-chat",
    label: "AI Chat",
    description: "Age-appropriate learning questions and explanations",
    aliases: [
      "ai chat",
      "kids ai chat",
      "learning helper",
      "study chat",
      "chat helper",
    ],
    intentPatterns: [
      /\b(?:open|show|start|launch)\s+(?:the\s+)?(?:kids\s+)?(?:ai\s+|study\s+)?chat\b/,
      /\b(?:open|show|start)\s+(?:my\s+)?learning\s+helper\b/,
    ],
  }),
  defineDestination({
    id: "subject-library",
    route: "/subjects#subject-library",
    label: "Subject Library",
    description: "Saved subjects and their chapters",
    content: true,
    aliases: ["subject library", "subjects library", "saved subjects", "chapter library"],
    intentPatterns: [
      /\b(?:show|open|view|browse)\s+(?:me\s+)?(?:my\s+|the\s+)?(?:subject|chapter)s?\s+library\b/,
      /\b(?:show|open|view)\s+(?:my\s+)?saved\s+subjects\b/,
    ],
  }),
  defineDestination({
    id: "subjects",
    route: "/subjects",
    label: "Subjects",
    description: "Subjects, chapters, and academic profile",
    aliases: ["subject", "my subjects", "courses", "course list", "subject manager"],
    intentPatterns: [
      /\b(?:add|edit|manage|show|view|change)\s+(?:my\s+|a\s+)?subjects?\b(?!\s+mastery\b)/,
      /\b(?:add|edit|manage)\s+(?:a\s+)?chapters?\b/,
    ],
  }),
  defineDestination({
    id: "learn",
    route: "/learn",
    label: "Start Learning",
    description: "Build notebooks, upload sources, and study topics",
    aliases: [
      "learn",
      "learning",
      "start learning",
      "study workspace",
      "notebook",
      "notebooks",
      "notebook builder",
      "notebook preparation",
      "upload sources",
    ],
    intentPatterns: [
      /\b(?:start|begin|continue)\s+(?:my\s+)?(?:learning|studying)\b/,
      /\b(?:build|create|prepare|open)\s+(?:me\s+)?(?:a\s+|my\s+)?(?:study\s+)?notebook\b/,
      /\b(?:upload|add)\s+(?:a\s+|my\s+)?(?:study\s+)?(?:file|source|pdf)\b/,
      /\b(?:learn|study)\s+(?:a\s+|this\s+|my\s+)?topic\b/,
    ],
  }),
  defineDestination({
    id: "subject-mastery",
    route: "/learn#subject-mastery",
    label: "Subject Mastery",
    description: "Notebook coverage and learned-topic progress",
    content: true,
    aliases: ["subject mastery", "learning mastery", "notebook mastery", "mastery overview"],
    intentPatterns: [
      /\b(?:show|open|view|check|review)\s+(?:me\s+)?(?:my\s+|the\s+)?(?:subject|learning|notebook)\s+mastery\b/,
      /\b(?:show|open|view|check)\s+(?:my\s+)?mastery\s+overview\b/,
    ],
  }),
  defineDestination({
    id: "placement-prep",
    route: "/learn#placement-prep",
    label: "Placement Prep",
    description: "Role-focused placement and interview preparation",
    content: true,
    aliases: [
      "placement prep",
      "placement preparation",
      "interview prep",
      "interview preparation",
      "career preparation",
      "job preparation",
    ],
    intentPatterns: [
      /\b(?:show|open|view|start|begin)\s+(?:my\s+|the\s+)?(?:placement|interview|career|job)\s+(?:prep|preparation)\b/,
      /\bprepare\s+(?:me\s+)?for\s+(?:placements?|interviews?)\b/,
    ],
  }),
  defineDestination({
    id: "medical-training",
    route: "/learn#medical-training",
    label: "Medical Training",
    description: "Interactive conceptual reasoning, fictional cases, and viva practice",
    content: true,
    aliases: [
      "medical training",
      "medical reasoning",
      "clinical reasoning",
      "health sciences training",
    ],
    intentPatterns: [
      /\b(?:show|open|view|start|begin)\s+(?:my\s+|the\s+)?(?:medical\s+training|(?:medical|clinical)\s+reasoning|health\s+sciences?\s+training)\b/,
      /\bpractice\s+(?:medical|clinical)\s+(?:concepts?|reasoning)\b/,
    ],
  }),
  defineDestination({
    id: "planner",
    route: "/planner",
    label: "Planner",
    description: "Study plan, schedule, timetable, and tasks",
    aliases: [
      "plan",
      "planner",
      "my planner",
      "study planner",
      "schedule",
      "my schedule",
      "study schedule",
      "timetable",
      "calendar",
      "planned tasks",
      "today tasks",
    ],
    intentPatterns: [
      /\b(?:make|create|build|generate|show|check|review|update)\s+(?:me\s+)?(?:my\s+|a\s+)?(?:study\s+)?(?:plan|planner|schedule|timetable|calendar|tasks?)\b/,
      /\bwhat(?:'s|\s+is)\s+(?:on\s+)?my\s+(?:plan|schedule|timetable|calendar)\b/,
    ],
  }),
  defineDestination({
    id: "analytics",
    route: "/analytics",
    label: "Analytics",
    description: "Progress, readiness, performance, and study trends",
    aliases: [
      "analytics",
      "progress",
      "progress status",
      "statistics",
      "stats",
      "performance",
      "study trends",
      "readiness",
    ],
    intentPatterns: [
      /\b(?:show|check|view|see|review|track)\s+(?:me\s+)?(?:my\s+)?(?:progress|performance|analytics|statistics|stats|study\s+trends?|readiness)\b/,
      /\bhow\s+am\s+i\s+doing\b/,
    ],
  }),
  defineDestination({
    id: "topic-progress",
    route: "/analytics#topic-progress",
    label: "Topic Progress",
    description: "Completion and mastery by topic",
    content: true,
    aliases: ["topic progress", "topic mastery", "mastery by topic", "learning coverage"],
    intentPatterns: [
      /\b(?:show|check|view|see|review)\s+(?:me\s+)?(?:my\s+)?(?:topic\s+progress|topic\s+mastery|learning\s+coverage)\b/,
    ],
  }),
  defineDestination({
    id: "notes",
    route: "/notes",
    label: "Notes",
    description: "Study notes, doubts, and topics to revisit",
    aliases: ["note", "notes", "my notes", "study notes", "doubts", "left topics", "revision notes"],
    intentPatterns: [
      /\b(?:add|write|open|show|view|review)\s+(?:a\s+|my\s+)?(?:study\s+|revision\s+)?notes?\b/,
      /\b(?:show|review|open)\s+(?:my\s+)?(?:doubts|left\s+topics)\b/,
    ],
  }),
  defineDestination({
    id: "quiz",
    route: "/quiz",
    label: "Quiz",
    description: "Topic quizzes and practice questions",
    aliases: ["quiz", "quizzes", "practice quiz", "practice test", "practice questions", "test me"],
    intentPatterns: [
      /\b(?:start|take|do|play|practice|open)\s+(?:a\s+|my\s+)?(?:practice\s+)?(?:quiz|test)\b/,
      /\btest\s+me\b/,
    ],
  }),
  defineDestination({
    id: "exam-about",
    route: "/exam/about",
    label: "Exam Guide",
    description: "Exam eligibility, requirements, and instructions",
    aliases: ["exam guide", "exam information", "exam info", "exam eligibility", "exam requirements", "about exam"],
    intentPatterns: [
      /\b(?:show|open|check|explain|view)\s+(?:my\s+|the\s+)?exam\s+(?:guide|information|info|eligibility|requirements|instructions)\b/,
      /\b(?:am\s+i|when\s+am\s+i)\s+(?:eligible|ready)\s+for\s+(?:the\s+)?exam\b/,
    ],
  }),
  defineDestination({
    id: "exam",
    route: "/exam",
    label: "Exam",
    description: "Secure exam mode",
    aliases: ["exam", "exam mode", "secure exam", "assessment", "final exam"],
    intentPatterns: [
      /\b(?:start|take|sit|launch|open|begin)\s+(?:my\s+|the\s+|an\s+)?(?:secure\s+|final\s+)?exam\b/,
    ],
  }),
  defineDestination({
    id: "report",
    route: "/report",
    label: "Report",
    description: "Planner report and recommended next actions",
    aliases: ["report", "reports", "planner report", "study report", "learning report", "weekly report"],
    intentPatterns: [
      /\b(?:show|open|view|check|review)\s+(?:me\s+)?(?:my\s+|the\s+)?(?:planner\s+|study\s+|learning\s+|weekly\s+)?reports?\b/,
    ],
  }),
  defineDestination({
    id: "resources",
    route: "/resources",
    label: "Materials",
    description: "Study materials, resources, and saved bookmarks",
    aliases: [
      "material",
      "materials",
      "resources",
      "study material",
      "study materials",
      "learning resources",
      "resource bank",
      "library",
      "bookmarks",
      "saved bookmarks",
      "saved materials",
    ],
    intentPatterns: [
      /\b(?:find|show|open|view|see|browse|use)\s+(?:me\s+)?(?:my\s+|the\s+)?(?:saved\s+)?(?:study\s+|learning\s+)?(?:materials?|resources?|bookmarks?)\b/,
      /\bwhere\s+(?:are|is)\s+(?:my\s+)?(?:saved\s+)?(?:materials?|resources?|bookmarks?)\b/,
    ],
  }),
  defineDestination({
    id: "resume-builder",
    route: "/resume-builder",
    label: "Resume Builder",
    description: "Create, edit, and export a professional resume",
    aliases: [
      "resume",
      "resume builder",
      "cv",
      "cv builder",
      "curriculum vitae",
    ],
    intentPatterns: [
      /\b(?:build|create|make|edit|update|export|download|open|show)\s+(?:me\s+)?(?:my\s+|a\s+)?(?:resume|cv)\b(?!\s+(?:history|versions?)\b)/,
    ],
  }),
  defineDestination({
    id: "resume-history",
    route: "/resume-builder#resume-history",
    label: "Resume History",
    description: "Saved and previously generated resume versions",
    content: true,
    aliases: ["resume history", "saved resumes", "resume versions", "saved resume versions"],
    intentPatterns: [
      /\b(?:show|open|view|check|review)\s+(?:me\s+)?(?:my\s+|the\s+)?(?:resume\s+history|saved\s+resumes?|resume\s+versions?)\b/,
    ],
  }),
  defineDestination({
    id: "settings",
    route: "/settings",
    label: "Settings",
    description: "Profile, preferences, appearance, and voice settings",
    aliases: [
      "setting",
      "settings",
      "preferences",
      "profile",
      "my profile",
      "account",
      "account settings",
      "appearance",
      "voice settings",
      "wake mode settings",
    ],
    intentPatterns: [
      /\b(?:change|edit|update|open|show|view)\s+(?:my\s+|the\s+)?(?:settings|preferences|profile|account|appearance)\b/,
      /\b(?:change|configure|turn\s+(?:on|off))\s+(?:my\s+|the\s+)?(?:voice|wake\s+mode|theme|background)\b/,
    ],
  }),
  defineDestination({
    id: "notification-history",
    route: "/notification-history",
    label: "Alert History",
    description: "Actionable planner, goal, credit, and learning alerts",
    aliases: ["notifications", "notification history", "past notifications", "alerts", "alert history", "reminder history"],
    intentPatterns: [
      /\b(?:show|open|view|check|review)\s+(?:me\s+)?(?:my\s+|the\s+)?(?:past\s+)?(?:notifications?|alerts?|reminder\s+history)\b/,
    ],
  }),
  defineDestination({
    id: "about",
    route: "/about",
    label: "About PrepMatrix",
    description: "Application information and product details",
    aliases: ["about", "about page", "about prepmatrix", "app information", "application information", "product information"],
    intentPatterns: [
      /\b(?:show|open|view|tell\s+me)\s+(?:the\s+)?(?:about\s+(?:page|prepmatrix)|app(?:lication)?\s+information|product\s+information)\b/,
    ],
  }),
]);

export const HOME_NAVIGATION_DESTINATIONS = Object.freeze(
  DESTINATIONS.map((destination) => Object.freeze({
    id: destination.id,
    route: destination.route,
    label: destination.label,
    description: destination.description,
    content: destination.content,
    defaultShortcut: destination.defaultShortcut,
    aliases: destination.aliases,
  }))
);

export function normalizeHomeNavigationInput(value = "") {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getGoalReminderShortcutRoutes({
  hasDashboard = false,
  isKidsLearner = false,
} = {}) {
  return hasDashboard && !isKidsLearner
    ? [GOAL_REMINDER_SHORTCUT_ROUTE]
    : [];
}

export function buildHomeNavigationRoute(result = {}) {
  const route = typeof result.route === "string" ? result.route : "";
  const subject = String(
    result.query?.subject ?? result.metadata?.query?.subject ?? "",
  ).trim();
  const baseRoute = route.split(/[?#]/u, 1)[0];
  if (!subject || (baseRoute !== "/resources" && baseRoute !== "/quiz")) {
    return route;
  }

  const [routeWithoutHash, hash = ""] = route.split("#", 2);
  const separator = routeWithoutHash.includes("?") ? "&" : "?";
  return `${routeWithoutHash}${separator}subject=${encodeURIComponent(subject)}${hash ? `#${hash}` : ""}`;
}

function normalizeTarget(input) {
  let target = normalizeHomeNavigationInput(input);
  target = target
    .replace(/^(?:hey|hello)\s+(?:prep(?:matrix)?\s+)?/, "")
    .replace(/^(?:please|kindly)\s+/, "")
    .replace(/^i\s+(?:want|need|would\s+like)\s+to\s+/, "")
    .replace(/^let\s+me\s+/, "");

  const navigationMatch = target.match(NAVIGATION_LEAD_PATTERN);
  if (navigationMatch) target = target.slice(navigationMatch[0].length);

  target = target
    .replace(/^(?:please\s+)?(?:my|the|our)\s+/, "")
    .replace(/\s+(?:page|screen|section|tab|area)(?:\s+for\s+me)?$/, "")
    .replace(/\s+(?:please|now)$/, "")
    .trim();

  return {
    explicitNavigation: Boolean(navigationMatch),
    normalizedInput: normalizeHomeNavigationInput(input),
    target,
  };
}

function getAvailableRouteEntries(availableRoutes) {
  if (availableRoutes === undefined || availableRoutes === null || typeof availableRoutes === "function") {
    return [];
  }

  return typeof availableRoutes === "string"
    ? [availableRoutes]
    : Array.isArray(availableRoutes) || availableRoutes instanceof Set
      ? Array.from(availableRoutes)
      : Object.entries(availableRoutes)
        .filter(([, isAvailable]) => Boolean(isAvailable))
        .map(([route, value]) => (
          value && typeof value === "object" ? { route, ...value } : route
        ));
}

function getAvailableRouteSet(availableRoutes) {
  if (availableRoutes === undefined || availableRoutes === null || typeof availableRoutes === "function") {
    return null;
  }

  return new Set(getAvailableRouteEntries(availableRoutes).map((entry) => {
    if (typeof entry === "string") return entry;
    return entry?.route || entry?.to || "";
  }).filter(Boolean));
}

function getAvailableRouteOverrides(availableRoutes) {
  const overrides = new Map();
  getAvailableRouteEntries(availableRoutes).forEach((entry) => {
    if (!entry || typeof entry !== "object") return;
    const route = entry.route || entry.to;
    if (!route) return;
    const label = typeof entry.label === "string" ? entry.label.trim().slice(0, 80) : "";
    const rawDescription = entry.description ?? entry.helper;
    const description = typeof rawDescription === "string"
      ? rawDescription.trim().slice(0, 180)
      : "";
    if (label || description) overrides.set(route, { label, description });
  });
  return overrides;
}

function destinationIsAvailable(destination, availableRoutes, routeSet) {
  const baseRoute = getBaseRoute(destination.route);
  if (typeof availableRoutes === "function") {
    if (availableRoutes(destination.route, destination) === true) return true;
    return !destination.content
      && baseRoute !== destination.route
      && availableRoutes(baseRoute, destination) === true;
  }
  if (routeSet === null || routeSet.has(destination.route)) return true;
  return !destination.content && routeSet.has(baseRoute);
}

function getBaseRoute(route) {
  return String(route).split(/[?#]/, 1)[0];
}

function getAvailableDestinations(availableRoutes) {
  const routeSet = getAvailableRouteSet(availableRoutes);
  const overrides = getAvailableRouteOverrides(availableRoutes);
  return DESTINATIONS
    .filter((destination) => destinationIsAvailable(destination, availableRoutes, routeSet))
    .map((destination) => {
      const override = overrides.get(destination.route)
        || (!destination.content ? overrides.get(getBaseRoute(destination.route)) : null);
      if (!override) return destination;
      return {
        ...destination,
        label: override.label || destination.label,
        description: override.description || destination.description,
      };
    });
}

function levenshteinDistance(left, right) {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + substitutionCost
      );
    }
    previous = current;
  }
  return previous[right.length];
}

function tokenIsClose(left, right) {
  if (left === right) return true;
  const longestLength = Math.max(left.length, right.length);
  if (longestLength < 4) return false;
  const allowedDistance = longestLength >= 9 ? 2 : 1;
  return levenshteinDistance(left, right) <= allowedDistance;
}

function phraseMatchScore(target, alias, { allowPartial = false } = {}) {
  if (!target || !alias) return { matchType: "none", score: 0, sameTokenCount: false };
  if (target === alias) return { matchType: "exact", score: 1, sameTokenCount: true };

  const targetTokens = target.split(" ");
  const aliasTokens = alias.split(" ");
  const sameTokenCount = targetTokens.length === aliasTokens.length;

  if (sameTokenCount && targetTokens.every((token, index) => tokenIsClose(token, aliasTokens[index]))) {
    const distance = levenshteinDistance(target, alias);
    const score = Math.max(0.8, 1 - distance / Math.max(target.length, alias.length));
    return { matchType: "fuzzy", score, sameTokenCount };
  }

  const paddedTarget = ` ${target} `;
  if (paddedTarget.includes(` ${alias} `)) {
    return { matchType: "contains", score: 0.94, sameTokenCount };
  }

  const usedTargetIndexes = new Set();
  let matchedTokens = 0;
  aliasTokens.forEach((aliasToken) => {
    const targetIndex = targetTokens.findIndex(
      (targetToken, index) => !usedTargetIndexes.has(index) && tokenIsClose(targetToken, aliasToken)
    );
    if (targetIndex >= 0) {
      usedTargetIndexes.add(targetIndex);
      matchedTokens += 1;
    }
  });

  const recall = matchedTokens / aliasTokens.length;
  const precision = matchedTokens / targetTokens.length;
  let score = recall * 0.58 + precision * 0.42;

  if (allowPartial && target.length >= 2 && alias.startsWith(target)) {
    score = Math.max(score, 0.76);
    return { matchType: "prefix", score, sameTokenCount };
  }

  if (allowPartial && targetTokens.every((targetToken) => (
    aliasTokens.some((aliasToken) => aliasToken.startsWith(targetToken) || tokenIsClose(targetToken, aliasToken))
  ))) {
    score = Math.max(score, 0.64);
    return { matchType: "partial", score, sameTokenCount };
  }

  return { matchType: matchedTokens ? "fuzzy" : "none", score, sameTokenCount };
}

function bestAliasMatch(target, destination, options) {
  return destination.aliases.reduce((best, alias) => {
    const match = phraseMatchScore(target, alias, options);
    if (match.score <= best.score) return best;
    return { ...match, alias };
  }, { alias: "", matchType: "none", score: 0, sameTokenCount: false });
}

function containsOnlyNavigationFillers(target, alias) {
  const remaining = ` ${target} `.replace(` ${alias} `, " ").trim();
  if (!remaining) return true;
  const fillers = new Set(["academic", "app", "application", "course", "learning", "my", "saved", "study"]);
  return remaining.split(" ").every((token) => fillers.has(token));
}

function isLikelyExplanatoryRequest(normalizedInput) {
  if (
    normalizedInput === "how am i doing"
    || /^what\s+should\s+i\s+(?:study|do)\s+next$/.test(normalizedInput)
  ) {
    return false;
  }
  return /^(?:(?:please|kindly)\s+)?(?:(?:(?:can|could|would|will)\s+you\s+)?(?:explain|describe|teach\s+me|tell\s+me\s+how|show\s+me\s+how)\b|how\s+to\b|how\s+(?:do|can|could|should|would|will)\s+(?:i|we|you)\b|what(?:\s+is|'s)\s+(?:the\s+)?(?:best|right|proper|easiest|recommended)\s+(?:way|method)\s+(?:to|for)\b|(?:why|when)\s+(?:should|would|do|does|is|are|can|could)\b|where\s+(?:can|could|should|would|do|does)\s+(?:i|we|you)\b|(?:can|could|should|would|will)\s+i\b)/.test(normalizedInput);
}

function findHomeAlias(normalizedInput) {
  const paddedInput = ` ${normalizedInput} `;
  return [...HOME_ALIASES]
    .sort((left, right) => right.length - left.length)
    .find((alias) => paddedInput.includes(` ${alias} `)) || "";
}

function isSavedMaterialsNavigationRequest(normalizedInput) {
  return /\b(?:where\s+(?:are|is)\s+(?:my\s+)?saved\s+(?:materials?|resources?|bookmarks?)|(?:find|show|open|view|see|browse)\s+(?:me\s+)?(?:my\s+|the\s+)?saved\s+(?:materials?|resources?|bookmarks?))\b/.test(normalizedInput);
}

function getContentIntentMatch(normalizedInput, destinations) {
  let best = null;
  destinations.forEach((destination) => {
    destination.intentPatterns.forEach((pattern) => {
        if (!pattern.test(normalizedInput)) return;
        const homeAlias = destination.id === "dashboard"
          ? findHomeAlias(normalizedInput)
          : "";
        const candidate = {
          alias: homeAlias || destination.label,
        destination,
        matchType: "content-intent",
        score: 0.98,
        sameTokenCount: false,
      };
      if (!best) best = candidate;
    });
  });
  return best;
}

function getScopedContentMatch(normalizedInput, destinations) {
  const scopedPatterns = [
    {
      baseRoute: "/resources",
      pattern: /^(?:(?:please|kindly)\s+)?(?:(?:can|could|would|will)\s+you\s+)?(?:open|go(?:\s+to)?|navigate(?:\s+to)?|visit|view|access)\s+(?:the\s+)?(?:materials?|resources?)(?:\s+(?:page|hub|library))?\s+(?:for|on)\s+(.+)$/,
    },
    {
      baseRoute: "/quiz",
      pattern: /^(?:(?:please|kindly)\s+)?(?:quiz|test)\s+me\s+(?:on|about)\s+(.+)$/,
    },
    {
      baseRoute: "/quiz",
      pattern: /^(?:(?:please|kindly)\s+)?(?:start|take|open|begin)\s+(?:a\s+|the\s+)?(?:practice\s+)?(?:quiz|test)\s+(?:on|about|for)\s+(.+)$/,
    },
  ];

  for (const { baseRoute, pattern } of scopedPatterns) {
    const match = normalizedInput.match(pattern);
    const subject = match?.[1]?.replace(/\s+(?:please|now)$/, "").trim().slice(0, 100);
    if (!subject) continue;
    const destination = destinations.find(
      (candidate) => !candidate.content && getBaseRoute(candidate.route) === baseRoute
    );
    if (!destination) return null;
    return {
      alias: destination.label,
      destination,
      matchType: "scoped-content",
      query: { subject },
      score: 0.99,
      sameTokenCount: false,
    };
  }
  return null;
}

function remapHomeDestination(destination, match, destinations, homeRoute) {
  if (
    destination.id !== "dashboard"
    || !HOME_ALIASES.has(match.alias)
    || !homeRoute
    || homeRoute === destination.route
  ) {
    return destination;
  }

  return destinations.find(
    (candidate) => !candidate.content && candidate.route === homeRoute
  ) || destination;
}

function toNavigationResult(destination, match, normalizedInput) {
  const confidence = Number(Math.min(1, Math.max(0, match.score)).toFixed(2));
  const matchedAlias = match.alias || destination.label;

  const result = {
    type: "navigate",
    route: destination.route,
    label: destination.label,
    confidence,
    matchType: match.matchType,
    matchedAlias,
    normalizedInput,
    metadata: {
      destinationId: destination.id,
      matchType: match.matchType,
      matchedAlias,
      normalizedInput,
    },
  };
  if (match.query) {
    result.query = { ...match.query };
    result.metadata.query = { ...match.query };
  }
  return result;
}

/**
 * Resolves a local, deterministic navigation command. Pass the current account's
 * accessible route paths so hidden or restricted destinations can never win.
 */
export function resolveHomeNavigationCommand(input, {
  availableRoutes,
  allowContentIntents = true,
  homeRoute = "/dashboard",
} = {}) {
  const parsed = normalizeTarget(input);
  if (!parsed.target) return null;

  const destinations = getAvailableDestinations(availableRoutes);
  if (!destinations.length) return null;

  const scopedContent = getScopedContentMatch(parsed.normalizedInput, destinations);
  if (scopedContent) {
    return toNavigationResult(
      scopedContent.destination,
      scopedContent,
      parsed.normalizedInput
    );
  }

  const contentIntent = allowContentIntents && !isLikelyExplanatoryRequest(parsed.normalizedInput)
    ? getContentIntentMatch(parsed.normalizedInput, destinations)
    : null;
  if (contentIntent) {
    contentIntent.destination = remapHomeDestination(
      contentIntent.destination,
      contentIntent,
      destinations,
      homeRoute
    );
    if (
      getBaseRoute(contentIntent.destination.route) === "/resources"
      && isMaterialSuggestionRequest(input)
      && !isSavedMaterialsNavigationRequest(parsed.normalizedInput)
    ) {
      return null;
    }
    return toNavigationResult(contentIntent.destination, contentIntent, parsed.normalizedInput);
  }

  const rankedMatches = destinations
    .map((destination) => ({
      destination,
      ...bestAliasMatch(parsed.target, destination),
    }))
    .sort((left, right) => right.score - left.score);
  const best = rankedMatches[0];
  if (!best) return null;

  const isSafeBareMatch = best.matchType === "exact";
  const meetsNavigationThreshold = parsed.explicitNavigation && (
    best.matchType === "exact"
    || (best.matchType === "fuzzy" && best.sameTokenCount && best.score >= 0.78)
    || (best.matchType === "contains" && containsOnlyNavigationFillers(parsed.target, best.alias))
  );
  if (!isSafeBareMatch && !meetsNavigationThreshold) return null;

  best.destination = remapHomeDestination(
    best.destination,
    best,
    destinations,
    homeRoute
  );
  if (
    getBaseRoute(best.destination.route) === "/resources"
    && isMaterialSuggestionRequest(input)
  ) {
    return null;
  }
  return toNavigationResult(best.destination, best, parsed.normalizedInput);
}

/**
 * Returns account-safe autocomplete destinations for the homepage command bar.
 */
export function getHomeNavigationSuggestions(input = "", {
  availableRoutes,
  currentRoute = "",
  homeRoute = "/dashboard",
  limit = 6,
} = {}) {
  const availableDestinations = getAvailableDestinations(availableRoutes);
  const parsed = normalizeTarget(input);
  if (isLikelyExplanatoryRequest(parsed.normalizedInput)) return [];

  const scopedContent = getScopedContentMatch(parsed.normalizedInput, availableDestinations);
  if (scopedContent && scopedContent.destination.route !== currentRoute) {
    return [{
      ...toNavigationResult(
        scopedContent.destination,
        scopedContent,
        parsed.normalizedInput
      ),
      description: scopedContent.destination.description,
    }];
  }

  const materialSuggestionRequest = isMaterialSuggestionRequest(input);
  const savedMaterialsNavigationRequest = isSavedMaterialsNavigationRequest(
    parsed.normalizedInput
  );
  const currentBaseRoute = getBaseRoute(currentRoute);
  const destinations = availableDestinations.filter(
    (destination) => (
      destination.route !== currentRoute
      && (destination.content || getBaseRoute(destination.route) !== currentBaseRoute)
      && (
        !materialSuggestionRequest
        || savedMaterialsNavigationRequest
        || getBaseRoute(destination.route) !== "/resources"
      )
    )
  );
  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 6;
  if (!safeLimit || !destinations.length) return [];

  if (!parsed.target) {
    const pageDestinations = destinations.filter(
      ({ content, defaultShortcut }) => !content || defaultShortcut
    );
    const configuredHome = pageDestinations.find(({ route }) => route === homeRoute);
    const priorityIndex = (route) => {
      const index = DEFAULT_SUGGESTION_ROUTE_PRIORITY.indexOf(route);
      return index < 0 ? DEFAULT_SUGGESTION_ROUTE_PRIORITY.length : index;
    };
    const prioritizedDestinations = [...pageDestinations].sort(
      (left, right) => priorityIndex(left.route) - priorityIndex(right.route)
    );
    const shouldLeadWithHome = configuredHome && homeRoute !== "/dashboard";
    const defaultDestinations = shouldLeadWithHome
      ? [configuredHome, ...prioritizedDestinations.filter(({ route }) => route !== homeRoute)]
      : prioritizedDestinations;
    return defaultDestinations.slice(0, safeLimit).map((destination) => ({
      type: "navigate",
      route: destination.route,
      label: destination.label,
      description: destination.description,
      confidence: 0.5,
      matchType: "default",
      matchedAlias: destination.label,
      metadata: { destinationId: destination.id, matchType: "default" },
    }));
  }

  const intentMatch = getContentIntentMatch(parsed.normalizedInput, destinations);
  const rankedSuggestions = destinations
    .map((destination, index) => {
      const aliasMatch = bestAliasMatch(parsed.target, destination, { allowPartial: true });
      const match = intentMatch?.destination.id === destination.id
        ? intentMatch
        : aliasMatch;
      return {
        index,
        ...match,
        destination: remapHomeDestination(destination, match, destinations, homeRoute),
      };
    })
    .filter((match) => match.score >= 0.32)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .filter((match, index, matches) => (
      matches.findIndex(({ destination }) => destination.route === match.destination.route) === index
    ))
    .slice(0, safeLimit)
    .map(({ destination, ...match }) => ({
      ...toNavigationResult(destination, match, parsed.normalizedInput),
      description: destination.description,
    }));
  return rankedSuggestions;
}
