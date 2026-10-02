import { normalizeSubjectChapterNames, normalizeSubjectTopics } from "./subjectPlanning.js";

function normalizeSearchText(value) {
  return String(value || "").replace(/\s+/gu, " ").trim();
}

function uniqueSearchParts(values) {
  const seen = new Set();
  return values.map(normalizeSearchText).filter((value) => {
    const key = value.toLocaleLowerCase("en");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getMaterialSearchOptions(subject = {}) {
  const parsedChapterCount = Number.parseInt(subject?.chapters, 10);
  const chapterCount = Number.isFinite(parsedChapterCount) ? parsedChapterCount : 0;

  return {
    chapters: uniqueSearchParts(normalizeSubjectChapterNames(subject?.chapterNames, chapterCount)),
    topics: uniqueSearchParts(normalizeSubjectTopics(subject?.topics)),
  };
}

export function buildMaterialSearchUrl({
  subjectName = "",
  searchTerm = "",
  institutionName = "",
  includeInstitution = false,
} = {}) {
  const institution = includeInstitution ? normalizeSearchText(institutionName) : "";
  const query = uniqueSearchParts([
    subjectName,
    searchTerm,
    institution,
    institution ? "materials" : "materials pdf",
  ]).join(" ");
  const url = new URL("https://www.google.com/search");
  url.searchParams.set("q", query);
  return url.href;
}
