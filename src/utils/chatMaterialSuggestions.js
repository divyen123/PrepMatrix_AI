import { buildSubjectMaterials } from "./materialRecommendations.js";

const MAX_SUGGESTIONS = 4;
const FIELD_LIMITS = Object.freeze({
  academicLevel: 80,
  academicTrack: 120,
  description: 240,
  href: 2048,
  provider: 60,
  subject: 100,
  title: 120,
});

const MATERIAL_NOUN_PATTERN =
  /\b(?:study\s+|learning\s+)?(?:materials?|resources?|references?|tutorials?|courses?|videos?|books?|notes?|lectures?|worksheets?|practice\s+(?:sets?|questions?))\b/iu;
const MATERIAL_REQUEST_PATTERN =
  /\b(?:suggest|recommend|find|share|give|show|provide|search|look(?:ing)?\s+for|best|good|top)\b/iu;
const MATERIAL_DESIRE_PATTERN = /\b(?:need|want)\b/iu;
const LEARNING_SOURCE_PATTERN =
  /\bwhere\s+(?:can|could|should)\s+i\s+(?:learn|study|read|watch|practise|practice)\b/iu;
const NAVIGATION_ONLY_PATTERN =
  /^(?:(?:can|could|would|will)\s+you\s+)?(?:please\s+)?(?:i\s+want\s+to\s+)?(?:open|go(?:\s+to)?|navigate(?:\s+to)?|take\s+me\s+to|visit|show(?:\s+me)?)\s+(?:the\s+)?(?:materials?|resources?)(?:\s+(?:page|hub|library))?(?:\s+for\s+me)?(?:\s+please)?[?!.]*$/iu;
const MATERIAL_PAGE_PATTERN = /\b(?:materials?|resources?)\s+(?:page|hub|library)\b/iu;
const PAGE_NAVIGATION_PATTERN =
  /\b(?:open|go(?:\s+to)?|navigate(?:\s+to)?|take\s+me\s+to|visit|show|view|access)\b/iu;
const PERSONAL_NOTE_HELP_PATTERN =
  /\b(?:help|understand(?:ing)?|explain|summari[sz]e|review|edit|organize)\b[^.!?]*\b(?:my|these|those|attached|uploaded)\s+notes?\b|\b(?:my|these|those|attached|uploaded)\s+notes?\b[^.!?]*\b(?:help|understand(?:ing)?|explain|summari[sz]e|review|edit|organize)\b/iu;
const TOPIC_CONNECTOR_PATTERN = /\b(about|on|for)\s+/giu;
const LEARNING_VERB_PATTERN = /\b(?:learn|study|read|watch|practise|practice)\s+([^?!.]+)/iu;
const SUBJECT_ACRONYM_STOP_WORDS = new Set(["a", "an", "and", "for", "in", "of", "on", "the", "to", "with"]);
const NON_RECOMMENDATION_ACTION_PATTERN =
  /^\s*(?:explain|summari[sz]e|review|edit|organize|understand)\b/iu;
const TOPIC_FILLER_PATTERN =
  /^(?:(?:(?:can|could|would|will)\s+you|please|i\s+(?:need|want)|(?:suggest|recommend|find|share|give|show|provide|search)|look(?:ing)?\s+for|me|(?:a|an|any|some|the|good|best|top|useful|helpful|study|learning))(?:\s+|$))+/iu;
const GENERIC_TOPIC_PATTERN =
  /^(?:a|an|any|some|the|good|best|top|useful|helpful|general|me|my|us|you|today|tomorrow|tonight|later|beginners?|beginner\s+level|my\s+(?:exam|test|class|assignment)|exam\s+revision)$/iu;

function cleanBoundedString(value, limit) {
  return [...String(value ?? "")]
    .map((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint <= 31 || (codePoint >= 127 && codePoint <= 159)
        ? " "
        : character;
    })
    .join("")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, limit)
    .trim();
}

function normalizeComparableText(value) {
  return cleanBoundedString(value, 500)
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function configuredSubjects(subjects) {
  if (!Array.isArray(subjects)) return [];

  return subjects
    .map((subject) => {
      const name = cleanBoundedString(subject?.name, FIELD_LIMITS.subject);
      if (!name) return null;

      const chapterCount = Number(subject?.chapters);
      return {
        ...subject,
        name,
        chapters: Number.isFinite(chapterCount) && chapterCount > 0
          ? Math.max(1, Math.floor(chapterCount))
          : 1,
      };
    })
    .filter(Boolean);
}

function subjectAliases(subjectName) {
  const fullName = normalizeComparableText(subjectName);
  const baseName = normalizeComparableText(
    String(subjectName ?? "").replace(/\([^)]*\)/gu, " ")
  );
  const parentheticalAliases = [...String(subjectName ?? "").matchAll(/\(([^)]*)\)/gu)]
    .map((match) => normalizeComparableText(match[1]))
    .filter(Boolean);
  const acronymWords = baseName
    .split(" ")
    .filter((word) => word && !SUBJECT_ACRONYM_STOP_WORDS.has(word));
  const acronym = acronymWords.length >= 2
    ? acronymWords.map((word) => word[0]).join("")
    : "";

  return [...new Set([fullName, baseName, ...parentheticalAliases, acronym])]
    .filter((alias) => alias.length >= 2);
}

function findExplicitSubject(message, subjects) {
  const normalizedMessage = ` ${normalizeComparableText(message)} `;
  let bestMatch = null;

  subjects.forEach((subject, subjectIndex) => {
    const fullName = normalizeComparableText(subject.name);
    subjectAliases(subject.name).forEach((alias) => {
      if (!normalizedMessage.includes(` ${alias} `)) return;
      const score = (alias === fullName ? 10_000 : 0)
        + alias.split(" ").length * 100
        + alias.length;
      if (
        !bestMatch
        || score > bestMatch.score
        || (score === bestMatch.score && subjectIndex < bestMatch.subjectIndex)
      ) {
        bestMatch = { score, subject, subjectIndex };
      }
    });
  });

  return bestMatch?.subject || null;
}

function findWeakSubject(subjects, weakSubject) {
  const normalizedWeakSubject = normalizeComparableText(weakSubject);
  if (!normalizedWeakSubject) return null;

  return subjects.find(
    (subject) => normalizeComparableText(subject.name) === normalizedWeakSubject
  ) || null;
}

function cleanTopicCandidate(value) {
  const topic = cleanBoundedString(value, FIELD_LIMITS.subject)
    .replace(TOPIC_FILLER_PATTERN, "")
    .replace(/\b(?:please|thanks|thank\s+you)\b.*$/iu, "")
    .replace(/^[\s,;:??-]+|[\s,;:??-]+$/gu, "")
    .trim();

  return topic && !GENERIC_TOPIC_PATTERN.test(topic) ? topic : "";
}

function connectorSegments(source) {
  const matches = [...source.matchAll(TOPIC_CONNECTOR_PATTERN)];

  return matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const nextConnectorIndex = matches[index + 1]?.index ?? source.length;
    const punctuationOffset = source.slice(start, nextConnectorIndex).search(/[?!.]/u);
    const end = punctuationOffset >= 0 ? start + punctuationOffset : nextConnectorIndex;
    return {
      connector: match[1].toLocaleLowerCase("en"),
      topic: cleanTopicCandidate(source.slice(start, end)),
    };
  });
}

function extractTopicBeforeMaterialNoun(source) {
  const materialMatch = MATERIAL_NOUN_PATTERN.exec(source);
  return materialMatch
    ? cleanTopicCandidate(source.slice(0, materialMatch.index))
    : "";
}

function extractAdHocTopic(message) {
  const source = cleanBoundedString(message, 500);
  const segments = connectorSegments(source);
  const descriptiveConnectorTopic = [...segments]
    .reverse()
    .find((segment) => (segment.connector === "about" || segment.connector === "on") && segment.topic)
    ?.topic;
  if (descriptiveConnectorTopic) return descriptiveConnectorTopic;

  const beforeMaterialTopic = extractTopicBeforeMaterialNoun(source);
  if (beforeMaterialTopic) return beforeMaterialTopic;

  const forTopic = segments.find(
    (segment) => segment.connector === "for" && segment.topic
  )?.topic;
  if (forTopic) return forTopic;

  return LEARNING_SOURCE_PATTERN.test(source)
    ? cleanTopicCandidate(source.match(LEARNING_VERB_PATTERN)?.[1] || "")
    : "";
}

function statsForSubject(metrics, subject) {
  const subjectStats = metrics?.subjectStats;
  if (!subjectStats || typeof subjectStats !== "object") {
    return { done: 0, pending: subject.chapters, total: subject.chapters };
  }

  const directStats = subjectStats[subject.name];
  if (directStats && typeof directStats === "object") return directStats;

  const normalizedSubject = normalizeComparableText(subject.name);
  const matchingKey = Object.keys(subjectStats).find(
    (key) => normalizeComparableText(key) === normalizedSubject
  );

  return matchingKey
    ? subjectStats[matchingKey]
    : { done: 0, pending: subject.chapters, total: subject.chapters };
}

function safeResultUrl(value) {
  const rawUrl = cleanBoundedString(value, FIELD_LIMITS.href);
  if (!rawUrl) return "";

  try {
    const url = new URL(rawUrl);
    if (
      url.protocol !== "https:"
      || url.username
      || url.password
      || url.port
      || url.hash
    ) {
      return "";
    }

    const hostname = url.hostname.toLocaleLowerCase("en");
    const isGoogleResult =
      (hostname === "google.com" || hostname === "www.google.com")
      && url.pathname === "/search"
      && Boolean(url.searchParams.get("q")?.trim());
    const isYoutubeResult =
      (hostname === "youtube.com" || hostname === "www.youtube.com")
      && url.pathname === "/results"
      && Boolean(url.searchParams.get("search_query")?.trim());

    return isGoogleResult || isYoutubeResult ? url.toString() : "";
  } catch {
    return "";
  }
}

export function isMaterialSuggestionRequest(text) {
  const cleanText = cleanBoundedString(text, 500);
  if (
    !cleanText
    || NAVIGATION_ONLY_PATTERN.test(cleanText)
    || (MATERIAL_PAGE_PATTERN.test(cleanText) && PAGE_NAVIGATION_PATTERN.test(cleanText))
    || PERSONAL_NOTE_HELP_PATTERN.test(cleanText)
  ) {
    return false;
  }

  const hasMaterialNoun = MATERIAL_NOUN_PATTERN.test(cleanText);
  const isTopicLedMaterialRequest = hasMaterialNoun
    && !NON_RECOMMENDATION_ACTION_PATTERN.test(cleanText)
    && Boolean(extractTopicBeforeMaterialNoun(cleanText));

  return (
    (
      hasMaterialNoun
      && (
        MATERIAL_REQUEST_PATTERN.test(cleanText)
        || MATERIAL_DESIRE_PATTERN.test(cleanText)
        || isTopicLedMaterialRequest
      )
    )
    || LEARNING_SOURCE_PATTERN.test(cleanText)
  );
}

export function normalizeChatMaterialSuggestions(raw) {
  const candidates = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.materials)
      ? raw.materials
      : [];
  const seenUrls = new Set();
  const normalized = [];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;

    const href = safeResultUrl(candidate.href);
    const title = cleanBoundedString(candidate.title, FIELD_LIMITS.title);
    if (!href || !title || seenUrls.has(href)) continue;

    const url = new URL(href);
    const defaultProvider = url.hostname.includes("youtube") ? "YouTube" : "Web search";
    const item = {
      subject: cleanBoundedString(candidate.subject, FIELD_LIMITS.subject) || "General study",
      title,
      provider:
        cleanBoundedString(candidate.provider, FIELD_LIMITS.provider) || defaultProvider,
      description: cleanBoundedString(candidate.description, FIELD_LIMITS.description),
      href,
    };
    const academicLevel = cleanBoundedString(
      candidate.academicLevel,
      FIELD_LIMITS.academicLevel
    );
    const academicTrack = cleanBoundedString(
      candidate.academicTrack,
      FIELD_LIMITS.academicTrack
    );

    if (academicLevel) item.academicLevel = academicLevel;
    if (academicTrack) item.academicTrack = academicTrack;

    seenUrls.add(href);
    normalized.push(item);
    if (normalized.length === MAX_SUGGESTIONS) break;
  }

  return normalized;
}

export function buildChatMaterialSuggestions({
  message = "",
  subjects = [],
  metrics = {},
  academicLevel = "College",
  academicTrack = "General",
} = {}) {
  if (!isMaterialSuggestionRequest(message)) return [];

  const availableSubjects = configuredSubjects(subjects);
  const explicitSubject = findExplicitSubject(message, availableSubjects);
  const requestedTopic = explicitSubject ? "" : extractAdHocTopic(message);
  const weakSubject = findWeakSubject(availableSubjects, metrics?.weakSubject);
  const selectedSubject = explicitSubject
    || (requestedTopic ? { name: requestedTopic, chapters: 1 } : null)
    || weakSubject
    || availableSubjects[0]
    || { name: "General study", chapters: 1 };

  const safeAcademicLevel =
    cleanBoundedString(academicLevel, FIELD_LIMITS.academicLevel) || "College";
  const safeAcademicTrack =
    cleanBoundedString(academicTrack, FIELD_LIMITS.academicTrack) || "General";
  const materials = buildSubjectMaterials(
    selectedSubject,
    statsForSubject(metrics, selectedSubject),
    safeAcademicLevel,
    safeAcademicTrack
  );

  return normalizeChatMaterialSuggestions(
    materials.lanes.map((lane) => ({
      academicLevel: safeAcademicLevel,
      academicTrack: safeAcademicTrack,
      description: lane.description,
      href: lane.href,
      provider: lane.provider,
      subject: materials.subject,
      title: lane.title,
    }))
  );
}
