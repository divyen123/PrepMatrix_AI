import {
  buildHomeNavigationRoute,
  resolveHomeNavigationCommand,
} from "./homeNavigationCommands.js";

const MAX_EXTERNAL_QUERY_LENGTH = 300;

const EXTERNAL_SERVICES = Object.freeze([
  Object.freeze({
    id: "youtube",
    label: "YouTube",
    aliasPattern: "youtube|you\\s+tube",
    homeUrl: "https://www.youtube.com/",
    searchUrl: "https://www.youtube.com/results",
    queryParameter: "search_query",
  }),
  Object.freeze({
    id: "google",
    label: "Google",
    aliasPattern: "google",
    homeUrl: "https://www.google.com/",
    searchUrl: "https://www.google.com/search",
    queryParameter: "q",
  }),
  Object.freeze({
    id: "wikipedia",
    label: "Wikipedia",
    aliasPattern: "wikipedia|wiki",
    homeUrl: "https://en.wikipedia.org/",
    searchUrl: "https://en.wikipedia.org/w/index.php",
    queryParameter: "search",
  }),
]);

const ALLOWED_EXTERNAL_TARGETS = new Map([
  ["https://www.youtube.com", new Set(["/", "/results"])],
  ["https://www.google.com", new Set(["/", "/search"])],
  ["https://en.wikipedia.org", new Set(["/", "/w/index.php"])],
]);

const COMMAND_PREFIX_PATTERN = String.raw`(?:hey\s+(?:prep|prep\s*matrix)[,\s]*)?(?:please\s+)?`;
const OPEN_VERB_PATTERN = String.raw`(?:open|launch|visit|go\s+to|take\s+me\s+to)`;
const SEARCH_VERB_PATTERN = String.raw`(?:search|find|look\s+up)`;

function normalizeCommandSurface(value = "") {
  return String(value)
    .normalize("NFKC")
    .replace(/[\u2018\u2019]/gu, "'")
    .replace(/[\u201c\u201d]/gu, '"')
    .replace(/[\r\n\t]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function cleanSearchQuery(value = "") {
  let query = normalizeCommandSurface(value)
    .replace(/\s+(?:please|for\s+me)$/iu, "")
    .replace(/[.!?]+$/u, "")
    .trim();

  const quotePairs = [
    ['"', '"'],
    ["'", "'"],
  ];
  quotePairs.forEach(([opening, closing]) => {
    if (query.startsWith(opening) && query.endsWith(closing) && query.length > 1) {
      query = query.slice(opening.length, -closing.length).trim();
    }
  });

  return Array.from(query).slice(0, MAX_EXTERNAL_QUERY_LENGTH).join("").trim();
}

function resolveServiceRequest(rawText, service) {
  const text = normalizeCommandSurface(rawText);
  if (!text) return null;

  const alias = `(?:${service.aliasPattern})`;
  const serviceSuffix = String.raw`(?:\s+(?:website|site)|\s+dot\s+com|\.com)?`;
  const patterns = [
    new RegExp(
      `^${COMMAND_PREFIX_PATTERN}${OPEN_VERB_PATTERN}\\s+(?:the\\s+)?${alias}${serviceSuffix}(?:\\s+(?:and(?:\\s+then)?|then))?\\s+${SEARCH_VERB_PATTERN}(?:\\s+(?:for|about))?\\s*(.*)$`,
      "iu",
    ),
    new RegExp(
      `^${COMMAND_PREFIX_PATTERN}${SEARCH_VERB_PATTERN}\\s+(?:on\\s+)?(?:the\\s+)?${alias}(?:\\s+(?:for|about))?\\s*(.*)$`,
      "iu",
    ),
    new RegExp(
      `^${COMMAND_PREFIX_PATTERN}${SEARCH_VERB_PATTERN}(?:\\s+(?:for|about))?\\s+(.+?)\\s+(?:on|in|using)\\s+(?:the\\s+)?${alias}${serviceSuffix}$`,
      "iu",
    ),
    new RegExp(
      `^${COMMAND_PREFIX_PATTERN}(?:play|show\\s+me)\\s+(.+?)\\s+(?:on|in)\\s+(?:the\\s+)?${alias}${serviceSuffix}$`,
      "iu",
    ),
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    return {
      kind: "search",
      query: cleanSearchQuery(match[1] || ""),
      service,
    };
  }

  const openPattern = new RegExp(
    `^${COMMAND_PREFIX_PATTERN}${OPEN_VERB_PATTERN}\\s+(?:the\\s+)?${alias}${serviceSuffix}(?:\\s+(?:please|now))?[.!?]*$`,
    "iu",
  );
  if (openPattern.test(text)) {
    return { kind: "open", query: "", service };
  }

  return null;
}

function resolveExternalRequest(rawText) {
  const serviceAliasPattern = EXTERNAL_SERVICES.map((service) => service.aliasPattern).join("|");
  const conflictingServicesPattern = new RegExp(
    `^${COMMAND_PREFIX_PATTERN}(?:${OPEN_VERB_PATTERN}|${SEARCH_VERB_PATTERN})\\s+(?:on\\s+)?(?:the\\s+)?(?:${serviceAliasPattern})\\s+(?:and|or|then)\\s+(?:the\\s+)?(?:${serviceAliasPattern})\\b`,
    "iu",
  );
  if (conflictingServicesPattern.test(normalizeCommandSurface(rawText))) {
    return { kind: "ambiguous", query: "", service: null };
  }

  for (const service of EXTERNAL_SERVICES) {
    const request = resolveServiceRequest(rawText, service);
    if (request) return request;
  }
  return null;
}

export function buildExternalSearchUrl(serviceId, query) {
  const service = EXTERNAL_SERVICES.find((candidate) => candidate.id === serviceId);
  const safeQuery = cleanSearchQuery(query);
  if (!service || !safeQuery) return "";

  const url = new URL(service.searchUrl);
  url.searchParams.set(service.queryParameter, safeQuery);
  return url.toString();
}

export function openExternalVoiceUrl(url, locationObject = globalThis.window?.location) {
  if (!locationObject || typeof locationObject.assign !== "function") return false;

  try {
    const parsed = new URL(String(url));
    const allowedPaths = ALLOWED_EXTERNAL_TARGETS.get(parsed.origin);
    if (parsed.protocol !== "https:" || !allowedPaths?.has(parsed.pathname)) return false;
    locationObject.assign(parsed.toString());
    return true;
  } catch {
    return false;
  }
}

function resolveScrollCommand(rawText, viewportHeight) {
  const normalized = normalizeCommandSurface(rawText)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  const distance = Math.max(240, Math.round((Number(viewportHeight) || 800) * 0.75));

  if (/^(?:please\s+)?(?:scroll|move)(?:\s+the\s+page)?\s+down(?:\s+please)?$/u.test(normalized)) {
    return { type: "scroll", mode: "by", top: distance, response: "Scrolling down." };
  }
  if (/^(?:please\s+)?(?:scroll|move)(?:\s+the\s+page)?\s+up(?:\s+please)?$/u.test(normalized)) {
    return { type: "scroll", mode: "by", top: -distance, response: "Scrolling up." };
  }
  if (/^(?:please\s+)?(?:scroll|go|move)(?:\s+the\s+page)?\s+(?:to\s+the\s+)?top(?:\s+please)?$/u.test(normalized)) {
    return { type: "scroll", mode: "to", top: 0, response: "Going to the top." };
  }
  if (/^(?:please\s+)?(?:scroll|go|move)(?:\s+the\s+page)?\s+(?:to\s+the\s+)?bottom(?:\s+please)?$/u.test(normalized)) {
    return { type: "scroll", mode: "to", top: Number.MAX_SAFE_INTEGER, response: "Going to the bottom." };
  }
  return null;
}

function resolveThemeCommand(rawText) {
  const normalized = normalizeCommandSurface(rawText)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  const lead = String.raw`(?:please\s+)?(?:turn\s+on|enable|use|switch\s+to|change\s+to|set)`;

  if (new RegExp(`^${lead}\\s+(?:the\\s+)?dark(?:\\s+(?:mode|theme))?$`, "u").test(normalized)) {
    return { type: "theme", darkMode: true, response: "Dark theme enabled." };
  }
  if (new RegExp(`^${lead}\\s+(?:the\\s+)?light(?:\\s+(?:mode|theme))?$`, "u").test(normalized)) {
    return { type: "theme", darkMode: false, response: "Light theme enabled." };
  }
  return null;
}

export function resolveVoiceAssistantCommand(rawText, {
  allowExternalNavigation = true,
  availableRoutes,
  homeRoute = "/dashboard",
  viewportHeight = 800,
} = {}) {
  const externalRequest = resolveExternalRequest(rawText);
  if (externalRequest) {
    if (externalRequest.kind === "ambiguous") {
      return {
        type: "clarify",
        response: "I heard more than one website. Please name one: YouTube, Google, or Wikipedia.",
      };
    }
    if (externalRequest.kind === "search" && !externalRequest.query) {
      return {
        type: "clarify",
        response: `What would you like me to search for on ${externalRequest.service.label}?`,
      };
    }
    if (!allowExternalNavigation) {
      return {
        type: "clarify",
        response: "Ask a grown-up to unlock Parent Corner before opening an external website.",
      };
    }

    const url = externalRequest.kind === "search"
      ? buildExternalSearchUrl(externalRequest.service.id, externalRequest.query)
      : externalRequest.service.homeUrl;
    return {
      type: "external",
      service: externalRequest.service.id,
      query: externalRequest.query,
      url,
      response: externalRequest.kind === "search"
        ? `Searching ${externalRequest.service.label} for ${externalRequest.query}.`
        : `Opening ${externalRequest.service.label}.`,
    };
  }

  const scrollCommand = resolveScrollCommand(rawText, viewportHeight);
  if (scrollCommand) return scrollCommand;

  const themeCommand = resolveThemeCommand(rawText);
  if (themeCommand) return themeCommand;

  const navigation = resolveHomeNavigationCommand(rawText, {
    allowContentIntents: false,
    availableRoutes,
    homeRoute,
  });
  if (!navigation) return null;

  const route = buildHomeNavigationRoute(navigation);
  if (route.split(/[?#]/u, 1)[0] === "/ai-chat") {
    return { type: "chat", response: "Opening AI Chat." };
  }
  const label = navigation.route === "/kids" && navigation.label === "Play & Learn"
    ? "Kids Play & Learn"
    : navigation.label;
  return {
    type: "navigate",
    route,
    response: `Opening ${label}.`,
  };
}
