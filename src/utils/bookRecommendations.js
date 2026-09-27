import { normalizeAcademicProfile } from "./academicProfile.js";

const OPEN_LIBRARY_SEARCH = "https://openlibrary.org/search.json";
const SEARCH_FIELDS = [
  "key",
  "title",
  "subtitle",
  "author_name",
  "description",
  "first_sentence",
  "subject",
  "cover_i",
  "edition_count",
  "editions",
  "editions.key",
  "editions.title",
  "editions.isbn",
  "editions.cover_i",
  "editions.edition_name",
].join(",");
const MAX_BOOKS = 6;
const SEARCH_LIMIT = 30;
const CACHE_TTL_MS = 20 * 60 * 1000;
const CACHE_SIZE = 30;
const cache = new Map();

const SUBJECT_ALIASES = Object.freeze({
  ai: "artificial intelligence",
  cn: "computer networks",
  coa: "computer organization and architecture",
  daa: "design and analysis of algorithms",
  dbms: "database management systems",
  dl: "deep learning",
  dsa: "data structures and algorithms",
  ds: "data science",
  evs: "environmental science",
  ml: "machine learning",
  oop: "object oriented programming",
  oops: "object oriented programming",
  os: "operating systems",
  toc: "theory of computation",
});
const STOP_WORDS = new Set(["a", "an", "and", "for", "in", "of", "on", "the", "to", "with"]);
const EDUCATIONAL_TERMS = /\b(?:textbook|study guide|handbook|manual|coursebook|reference|workbook|exercise|exam|introduction|fundamentals|principles)\b/iu;
const FICTION_TERMS = /\b(?:fiction|novel|romance|fantasy|thriller)\b/iu;
const GENERIC_SUBJECT = /^(?:textbooks?|nonfiction|education|computers?|general|study and teaching|juvenile literature|open_syllabus_project|protected daisy|accessible book)$/iu;
const BIBLIOGRAPHIC_DESCRIPTION = /\b\d+\s*p\.\s*(?::|;|$)|\b\d+\s*cm\b|^includes bibliograph/iu;
const FORMAT_CHARACTERS = /[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/gu;

function cleanText(value, limit = 500) {
  const raw = typeof value === "string" ? value : "";
  return [...raw]
    .map((character) => {
      const point = character.codePointAt(0);
      return point <= 31 || (point >= 127 && point <= 159) ? " " : character;
    })
    .join("")
    .replace(FORMAT_CHARACTERS, "")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, limit)
    .trim();
}

function subjectName(subject) {
  return cleanText(typeof subject === "string" ? subject : subject?.name, 120);
}

function words(value) {
  return cleanText(value, 1200).toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
}

function subjectWords(subject) {
  const alias = SUBJECT_ALIASES[subject.toLocaleLowerCase()];
  return [...new Set(words(alias || subject).filter((word) => !STOP_WORDS.has(word)))];
}

function tokenMatches(candidate, sought) {
  if (candidate === sought) return true;
  // Match ordinary plurals without merging distinct subjects such as physics and physical education.
  const singular = (word) => word.endsWith("ies") && word.length > 4
    ? `${word.slice(0, -3)}y`
    : word.endsWith("s") && word.length > 4
      ? word.slice(0, -1)
      : word;
  return singular(candidate) === singular(sought);
}

function matchingTokenCount(tokens, sought) {
  return sought.filter((word) => tokens.some((candidate) => tokenMatches(candidate, word))).length;
}

function namedClassNumber(title) {
  const labelled = title.match(/\b(?:class|grade|standard)\s*[-:]?\s*(\d{1,2})\b/iu);
  const ordinal = title.match(/\b(\d{1,2})(?:st|nd|rd|th)\s+(?:class|grade|standard)\b/iu);
  return Number(labelled?.[1] || ordinal?.[1]) || null;
}

function descriptionText(raw) {
  const value = typeof raw === "string" ? raw
    : typeof raw?.value === "string" ? raw.value
      : Array.isArray(raw) ? raw.find((item) => typeof item === "string") : "";
  const cleaned = cleanText(value, 1000);
  if (cleaned.length <= 420) return cleaned;
  const excerpt = cleaned.slice(0, 420);
  const sentenceEnd = Math.max(excerpt.lastIndexOf(". "), excerpt.lastIndexOf("! "), excerpt.lastIndexOf("? "));
  if (sentenceEnd >= 100) return excerpt.slice(0, sentenceEnd + 1);
  return `${excerpt.slice(0, 417).replace(/\s+\S*$/u, "")}…`;
}

function readDescription(doc, subject = "") {
  for (const candidate of [doc.description, doc.first_sentence]) {
    const description = descriptionText(candidate);
    if (description.length >= 20 && !BIBLIOGRAPHIC_DESCRIPTION.test(description)) return description;
  }

  // Search data often has no prose description. These topics come from the book's own record.
  const seen = new Set();
  const topics = (Array.isArray(doc.subject) ? doc.subject : [])
    .map((tag) => cleanText(tag, 80).replace(/[.]+$/u, ""))
    .filter((tag) => {
      const key = tag.toLocaleLowerCase();
      if (!tag || key === subject.toLocaleLowerCase() || GENERIC_SUBJECT.test(tag) ||
          /^https?:\/\//iu.test(tag) || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
  return topics.length ? `Topics: ${topics.join(", ")}.` : "";
}

function firstValidIsbn(values) {
  if (!Array.isArray(values)) return "";
  const clean = values
    .filter((value) => typeof value === "string")
    .map((value) => value.replace(/[-\s]/gu, "").toUpperCase());
  return clean.find((value) => /^97[89]\d{10}$/u.test(value)) ||
    clean.find((value) => /^\d{9}[\dX]$/u.test(value)) || "";
}

function workId(key) {
  const match = String(key || "").match(/^(?:\/works\/)?(OL\d+W)$/u);
  return match?.[1] || "";
}

function selectedEdition(doc) {
  return Array.isArray(doc?.editions?.docs) ? doc.editions.docs[0] || {} : {};
}

function scoreDoc(doc, sought, academicProfile) {
  const title = cleanText(doc?.title, 220);
  const author = Array.isArray(doc?.author_name)
    ? doc.author_name.map((name) => cleanText(name, 100)).find(Boolean)
    : "";
  if (!workId(doc?.key) || !title || !author) return Number.NEGATIVE_INFINITY;

  const titleTokens = words(title);
  const subjects = Array.isArray(doc.subject)
    ? doc.subject.filter((item) => typeof item === "string").slice(0, 100).join(" ")
    : "";
  const subjectTokens = words(subjects);
  const matchedTitle = matchingTokenCount(titleTokens, sought);
  const matchedSubject = matchingTokenCount(subjectTokens, sought);
  const allMatched = matchingTokenCount([...titleTokens, ...subjectTokens], sought);
  if (!matchedTitle || allMatched < Math.min(2, sought.length)) return Number.NEGATIVE_INFINITY;

  const fiction = FICTION_TERMS.test(subjects) || FICTION_TERMS.test(title);
  if (fiction && !EDUCATIONAL_TERMS.test(title)) return Number.NEGATIVE_INFINITY;

  let score = matchedTitle * 12 + matchedSubject * 5;
  if (matchedTitle === sought.length) score += 10;
  if (EDUCATIONAL_TERMS.test(title)) score += 4;
  if (/\b(?:textbook|study guide|education)\b/iu.test(subjects)) score += 3;
  if (Number.isSafeInteger(doc.cover_i) && doc.cover_i > 0) score += 2;
  if (readDescription(doc)) score += 2;
  if (firstValidIsbn(selectedEdition(doc).isbn)) score += 2;
  score += Math.min(3, Math.log2(Math.max(1, Number(doc.edition_count) || 1)));

  const classNumber = academicProfile.classNumber;
  if (classNumber) {
    const statedClass = namedClassNumber(title);
    if (statedClass && statedClass !== classNumber) return Number.NEGATIVE_INFINITY;
    if (statedClass) score += 12;
  }
  return score;
}

function retailerSearches(book) {
  const query = cleanText(book?.title, 180);
  if (!query) return [];
  const amazon = new URL("https://www.amazon.in/s");
  amazon.searchParams.set("k", query);
  const flipkart = new URL("https://www.flipkart.com/search");
  flipkart.searchParams.set("q", query);
  return [
    { name: "Amazon", href: amazon.toString(), mode: "search" },
    { name: "Flipkart", href: flipkart.toString(), mode: "search" },
  ];
}

function safeRetailer(retailer) {
  if (!retailer?.name || !["product", "search"].includes(retailer.mode)) return false;
  try {
    const url = new URL(retailer.href);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

/** Rebuilds marketplace searches for saved books while retaining direct product links. */
export function resolveBookRetailers(book) {
  const searches = retailerSearches(book);
  if (!searches.length) return [];
  const existing = Array.isArray(book?.retailers) ? book.retailers.filter(safeRetailer) : [];
  const searchNames = new Set(searches.map(({ name }) => name));
  const resolved = searches.map((search) => existing.find(
    (retailer) => retailer.name === search.name && retailer.mode === "product"
  ) || search);
  return [...resolved, ...existing.filter((retailer) => !searchNames.has(retailer.name))];
}

function toBook(doc, subject) {
  const edition = selectedEdition(doc);
  const coverId = Number.isSafeInteger(edition.cover_i) && edition.cover_i > 0
    ? edition.cover_i
    : Number.isSafeInteger(doc.cover_i) && doc.cover_i > 0
      ? doc.cover_i
      : null;
  const author = (Array.isArray(doc.author_name) ? doc.author_name : [])
    .map((name) => cleanText(name, 100))
    .filter(Boolean)
    .slice(0, 3)
    .join(", ")
    .slice(0, 180);
  const book = {
    kind: "book",
    bookId: workId(doc.key),
    subject,
    title: cleanText(doc.title, 180),
    author,
    description: readDescription(doc, subject),
    cover: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg?default=false` : "",
    isbn: firstValidIsbn(edition.isbn),
    edition: cleanText(edition.edition_name, 100),
    href: "",
    provider: "Amazon",
    retailers: [],
  };
  book.retailers = resolveBookRetailers(book);
  book.href = book.retailers[0].href;
  return book;
}

function searchUrl(subject, profile) {
  const alias = SUBJECT_ALIASES[subject.toLocaleLowerCase()] || subject;
  const query = [alias, profile.grade].filter(Boolean).join(" ");
  const url = new URL(OPEN_LIBRARY_SEARCH);
  url.searchParams.set("q", query);
  url.searchParams.set("fields", SEARCH_FIELDS);
  url.searchParams.set("limit", String(SEARCH_LIMIT));
  url.searchParams.set("lang", "en");
  return url.toString();
}

function cloneBooks(books) {
  return books.map((book) => ({ ...book, retailers: book.retailers.map((retailer) => ({ ...retailer })) }));
}

/** Returns actual Open Library book records and retailer search links for a subject. */
export async function fetchSubjectBooks(subject, academicProfile = {}, { signal } = {}) {
  if (signal?.aborted) throw signal.reason || new DOMException("Aborted", "AbortError");
  const subjectLabel = subjectName(subject);
  if (!subjectLabel) return [];
  const profile = normalizeAcademicProfile(academicProfile);
  const sought = subjectWords(subjectLabel);
  if (!sought.length) return [];

  const cacheKey = `${subjectLabel.toLocaleLowerCase()}|${profile.grade}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cloneBooks(cached.books);

  const response = await fetch(searchUrl(subjectLabel, profile), { signal });
  if (!response.ok) throw new Error("Unable to load books right now.");
  const payload = await response.json();
  if (signal?.aborted) throw signal.reason || new DOMException("Aborted", "AbortError");
  const docs = Array.isArray(payload?.docs) ? payload.docs : [];
  const seen = new Set();
  let ranked = docs
    .map((doc, index) => ({ doc, index, score: scoreDoc(doc, sought, profile) }))
    .filter(({ score }) => Number.isFinite(score))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  if (profile.classNumber) {
    const classBooks = ranked.filter(({ doc }) => namedClassNumber(doc.title) === profile.classNumber);
    if (classBooks.length >= 2) ranked = classBooks;
  }
  const books = ranked
    .filter(({ doc }) => {
      const id = workId(doc.key);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .slice(0, MAX_BOOKS)
    .map(({ doc }) => toBook(doc, subjectLabel));

  if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value);
  cache.set(cacheKey, { books, expiresAt: Date.now() + CACHE_TTL_MS });
  return cloneBooks(books);
}
