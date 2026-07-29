const DEFAULT_MAX_ITEMS = 200;

const FIELD_LIMITS = Object.freeze({
  academicLevel: 80,
  academicTrack: 120,
  description: 500,
  href: 2048,
  provider: 80,
  subject: 120,
  title: 160,
  id: 128,
  savedAt: 64,
});

const INVISIBLE_FORMAT_CHARACTERS = /[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/gu;

function cleanBoundedString(value, limit) {
  return [...String(value ?? "")]
    .map((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint <= 31 || (codePoint >= 127 && codePoint <= 159)
        ? " "
        : character;
    })
    .join("")
    .replace(INVISIBLE_FORMAT_CHARACTERS, "")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, limit)
    .trim();
}

function normalizeHttpsUrl(value) {
  const rawUrl = cleanBoundedString(value, FIELD_LIMITS.href);
  if (!rawUrl) return "";

  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname) {
      return "";
    }

    const canonicalUrl = url.toString();
    return canonicalUrl.length <= FIELD_LIMITS.href ? canonicalUrl : "";
  } catch {
    return "";
  }
}

function normalizeItemLimit(value) {
  if (value === undefined) return DEFAULT_MAX_ITEMS;

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return 0;
  return Math.floor(numericValue);
}

export function normalizeMaterialBookmark(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const title = cleanBoundedString(raw.title, FIELD_LIMITS.title);
  const href = normalizeHttpsUrl(raw.href);
  if (!title || !href) return null;

  const bookmark = {
    academicLevel: cleanBoundedString(raw.academicLevel, FIELD_LIMITS.academicLevel),
    academicTrack: cleanBoundedString(raw.academicTrack, FIELD_LIMITS.academicTrack),
    description: cleanBoundedString(raw.description, FIELD_LIMITS.description),
    href,
    provider: cleanBoundedString(raw.provider, FIELD_LIMITS.provider),
    subject: cleanBoundedString(raw.subject, FIELD_LIMITS.subject),
    title,
  };
  const id = cleanBoundedString(raw.id, FIELD_LIMITS.id);
  const savedAt = cleanBoundedString(raw.savedAt, FIELD_LIMITS.savedAt);

  if (id) bookmark.id = id;
  if (savedAt) bookmark.savedAt = savedAt;

  return bookmark;
}

export function normalizeMaterialBookmarks(raw, { maxItems = DEFAULT_MAX_ITEMS } = {}) {
  if (!Array.isArray(raw)) return [];

  const itemLimit = normalizeItemLimit(maxItems);
  if (itemLimit === 0) return [];

  const seenUrls = new Set();
  const normalized = [];

  for (const candidate of raw) {
    const bookmark = normalizeMaterialBookmark(candidate);
    if (!bookmark || seenUrls.has(bookmark.href)) continue;

    seenUrls.add(bookmark.href);
    normalized.push(bookmark);
    if (normalized.length >= itemLimit) break;
  }

  return normalized;
}
