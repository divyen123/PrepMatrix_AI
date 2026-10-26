import { normalizeStudyPreferences } from "./subjectPlanning.js";

export const CHAT_SUBJECT_OUTLINE_LIMITS = Object.freeze({
  subjectName: 160,
  title: 120,
  chapters: 500,
  topics: 60,
});

const DIFFICULTIES = new Set(["easy", "medium", "hard"]);
const cleanText = (value) => value.replace(/\s+/gu, " ").trim();
const nameKey = (value) => typeof value === "string"
  ? cleanText(value).normalize("NFKC").toLowerCase()
  : "";
const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

function validateTitle(value, label, maximum, errors) {
  if (typeof value !== "string") {
    errors.push(`${label} must be text.`);
    return "";
  }
  const title = cleanText(value);
  if (!title) errors.push(`${label} cannot be empty.`);
  else if (title.length > maximum) errors.push(`${label} must be ${maximum} characters or fewer.`);
  else if (/[\p{Cc}\p{Cf}]/u.test(title)) errors.push(`${label} contains unsupported control characters.`);
  return title;
}

/** Validate the entire draft before showing an actionable import. Never truncate it. */
export function validateChatSubjectOutline(raw) {
  const errors = [];
  if (!isRecord(raw)) return { outline: null, errors: ["A subject outline is required."] };

  const subjectName = validateTitle(raw.subjectName, "Subject name", CHAT_SUBJECT_OUTLINE_LIMITS.subjectName, errors);
  const difficulty = raw.difficulty === undefined
    ? "medium"
    : typeof raw.difficulty === "string" ? raw.difficulty.trim().toLowerCase() : "";
  if (!DIFFICULTIES.has(difficulty)) errors.push("Choose Easy, Medium, or Hard for the subject difficulty.");

  const seen = new Set();
  const readTitles = (value, key, label) => {
    if (value === undefined) return [];
    if (!Array.isArray(value)) {
      errors.push(`${label} must be a list of names.`);
      return [];
    }
    if (value.length > CHAT_SUBJECT_OUTLINE_LIMITS[key]) {
      errors.push(`An outline can contain up to ${CHAT_SUBJECT_OUTLINE_LIMITS[key]} ${label.toLowerCase()}.`);
      return [];
    }
    const titles = [];
    for (const [index, item] of value.entries()) {
      const title = validateTitle(item, `${label === "Chapters" ? "Chapter" : "Topic"} ${index + 1}`, CHAT_SUBJECT_OUTLINE_LIMITS.title, errors);
      const normalized = nameKey(title);
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized);
        titles.push(title);
      }
    }
    return titles;
  };
  const chapterNames = readTitles(raw.chapterNames, "chapters", "Chapters");
  const topics = readTitles(raw.topics, "topics", "Topics");
  if (!chapterNames.length && !topics.length) errors.push("Add at least one chapter or focus topic.");

  return {
    outline: errors.length ? null : { subjectName, difficulty, chapterNames, topics },
    errors,
  };
}

export function normalizeChatSubjectOutline(raw) {
  return validateChatSubjectOutline(raw).outline;
}

/** Outline questions must reach AI even when they mention "today" or "progressions". */
export function isChatSubjectOutlineRequest(message) {
  return typeof message === "string" && /\b(?:chapters?|topics?|syllabus|course\s+outline)\b/iu.test(message);
}

export function formatChatSubjectOutline(raw) {
  const outline = normalizeChatSubjectOutline(raw);
  if (!outline) return "";
  return [
    `AI-suggested outline: ${outline.subjectName}`,
    outline.chapterNames.length
      ? `Chapters\n${outline.chapterNames.map((name, index) => `${index + 1}. ${name}`).join("\n")}` : "",
    outline.topics.length ? `Focus topics\n${outline.topics.map((name) => `- ${name}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");
}

const CONNECTING_WORDS = new Set(["and", "of", "the", "for", "in", "to"]);
const words = (value) => nameKey(value).match(/[\p{L}\p{N}]+/gu) || [];
const meaningfulWords = (value) => words(value).filter((word) => !CONNECTING_WORDS.has(word));
const compactName = (value) => words(value).join("");

function oneEditApart(left, right) {
  if (Math.abs(left.length - right.length) > 1) return false;
  let leftIndex = 0;
  let rightIndex = 0;
  let edits = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
    } else {
      edits += 1;
      if (edits > 1) return false;
      if (left.length <= right.length) rightIndex += 1;
      if (left.length >= right.length) leftIndex += 1;
    }
  }
  return edits + Number(leftIndex < left.length || rightIndex < right.length) <= 1;
}

function likelySameSubject(left, right) {
  const leftWords = meaningfulWords(left);
  const rightWords = meaningfulWords(right);
  const leftCompact = compactName(left);
  const rightCompact = compactName(right);
  if (!leftCompact || !rightCompact) return false;
  if (leftCompact === rightCompact) return true;

  const isInitialism = (shortWords, longWords) => shortWords.length === 1
    && shortWords[0].length >= 2
    && longWords.length >= 2
    && shortWords[0] === longWords.map((word) => [...word][0]).join("");
  if (isInitialism(leftWords, rightWords) || isInitialism(rightWords, leftWords)) return true;

  const leftSet = new Set(leftWords);
  const rightSet = new Set(rightWords);
  const shared = [...leftSet].filter((word) => rightSet.has(word)).length;
  if (shared >= 2 && shared / Math.min(leftSet.size, rightSet.size) >= 0.75) return true;

  // Single-word spelling variants are suggestions only, never automatic matches.
  return leftWords.length === 1 && rightWords.length === 1
    && Math.min(leftCompact.length, rightCompact.length) >= 4
    && oneEditApart(leftCompact, rightCompact);
}

/** Similar names need an explicit choice; only a unique normalized exact match is automatic. */
export function resolveChatSubjectTarget(subjects, subjectName) {
  const key = nameKey(subjectName);
  const candidates = (Array.isArray(subjects) ? subjects : [])
    .map((subject, index) => ({ index, name: isRecord(subject) && typeof subject.name === "string" ? subject.name : "" }))
    .filter((candidate) => nameKey(candidate.name));
  const exact = key ? candidates.filter((candidate) => nameKey(candidate.name) === key) : [];
  if (exact.length === 1) return { status: "existing", index: exact[0].index, candidates: exact };
  if (exact.length > 1) return { status: "ambiguous", index: null, candidates: exact };
  const similar = key ? candidates.filter((candidate) => likelySameSubject(subjectName, candidate.name)) : [];
  return similar.length
    ? { status: "ambiguous", index: null, candidates: similar }
    : { status: "new", index: null, candidates: [] };
}

function existingSubjectContent(subject) {
  const chapters = subject.chapters === undefined ? 0 : Number(subject.chapters);
  if (!Number.isInteger(chapters) || chapters < 0 || chapters > CHAT_SUBJECT_OUTLINE_LIMITS.chapters) {
    throw new Error("This subject has an invalid chapter count. Edit the subject before importing an outline.");
  }
  const chapterNames = subject.chapterNames === undefined ? [] : subject.chapterNames;
  const topics = subject.topics === undefined ? [] : subject.topics;
  if (!Array.isArray(chapterNames) || !Array.isArray(topics)
    || chapterNames.some((title) => typeof title !== "string")
    || topics.some((title) => typeof title !== "string")
    || chapterNames.length > chapters) {
    throw new Error("This subject's chapter or topic list needs review before importing an outline.");
  }
  if (topics.length > CHAT_SUBJECT_OUTLINE_LIMITS.topics) {
    throw new Error("This subject already exceeds 60 focus topics. Edit the subject before importing an outline.");
  }
  return { chapters, chapterNames, topics };
}

/** Name empty chapter slots, then append content without shifting existing chapters. */
export function mergeChatSubjectOutline(subjects, rawOutline, {
  targetIndex,
  expectedTargetName,
} = {}) {
  if (!Array.isArray(subjects)) throw new Error("Your subjects are not ready. Reopen the Subjects page and try again.");
  const { outline, errors } = validateChatSubjectOutline(rawOutline);
  if (!outline) throw new Error(errors.join(" "));
  const match = resolveChatSubjectTarget(subjects, outline.subjectName);
  let subjectIndex = targetIndex;
  if (subjectIndex === undefined) {
    if (match.status === "ambiguous") throw new Error("Choose the subject to add this outline to.");
    subjectIndex = match.index;
  } else if (subjectIndex === null) {
    const exactMatches = subjects.filter((subject) => nameKey(subject?.name) === nameKey(outline.subjectName));
    if (exactMatches.length) throw new Error("A subject with this name already exists. Choose that subject to avoid a duplicate.");
  } else if (!Number.isInteger(subjectIndex) || subjectIndex < 0 || subjectIndex >= subjects.length) {
    throw new Error("The selected subject is no longer available. Choose a subject again.");
  }

  const created = subjectIndex === null;
  const previousSubject = created ? null : subjects[subjectIndex];
  if (!created && (!isRecord(previousSubject) || !nameKey(previousSubject.name))) {
    throw new Error("The selected subject is no longer available. Choose a subject again.");
  }
  if (!created && expectedTargetName !== undefined && nameKey(previousSubject.name) !== nameKey(expectedTargetName)) {
    throw new Error("The selected subject changed. Choose a subject again.");
  }
  const existing = created ? { chapters: 0, chapterNames: [], topics: [] } : existingSubjectContent(previousSubject);
  const usedNames = new Set([...existing.chapterNames, ...existing.topics].map(nameKey).filter(Boolean));
  const newChapters = [];
  const newTopics = [];
  const inputCount = (rawOutline.chapterNames?.length || 0) + (rawOutline.topics?.length || 0);
  let skippedCount = inputCount - outline.chapterNames.length - outline.topics.length;
  for (const [incoming, additions] of [[outline.chapterNames, newChapters], [outline.topics, newTopics]]) {
    for (const title of incoming) {
      const key = nameKey(title);
      if (usedNames.has(key)) skippedCount += 1;
      else {
        usedNames.add(key);
        additions.push(title);
      }
    }
  }
  const chapterNames = [...existing.chapterNames];
  if (newChapters.length) {
    while (chapterNames.length < existing.chapters) chapterNames.push("");
    let incomingIndex = 0;
    for (let index = 0; index < existing.chapters && incomingIndex < newChapters.length; index += 1) {
      if (!nameKey(chapterNames[index])) chapterNames[index] = newChapters[incomingIndex++];
    }
    chapterNames.push(...newChapters.slice(incomingIndex));
  }
  const nextChapterCount = Math.max(existing.chapters, chapterNames.length);
  if (nextChapterCount > CHAT_SUBJECT_OUTLINE_LIMITS.chapters) {
    throw new Error("Adding this outline would exceed 500 chapters. Remove some draft chapters and try again.");
  }
  if (existing.topics.length + newTopics.length > CHAT_SUBJECT_OUTLINE_LIMITS.topics) {
    throw new Error("Adding this outline would exceed 60 focus topics. Remove some draft topics and try again.");
  }
  const changed = created || newChapters.length > 0 || newTopics.length > 0;
  if (!changed) {
    return {
      subjects, subject: previousSubject, subjectIndex, created: false, changed: false,
      addedChapters: 0, addedTopics: 0, skippedCount, undoReceipt: null,
    };
  }
  const subject = {
    ...(previousSubject || {
      name: outline.subjectName,
      difficulty: outline.difficulty,
      studyPreferences: normalizeStudyPreferences(),
    }),
    chapters: nextChapterCount,
    chapterNames,
    topics: [...existing.topics, ...newTopics],
  };
  const nextSubjects = [...subjects];
  if (created) {
    subjectIndex = nextSubjects.length;
    nextSubjects.push(subject);
  } else nextSubjects[subjectIndex] = subject;
  return {
    subjects: nextSubjects, subject, subjectIndex, created, changed,
    addedChapters: newChapters.length, addedTopics: newTopics.length, skippedCount,
    undoReceipt: {
      beforeSubject: previousSubject ? structuredClone(previousSubject) : null,
      afterSubject: structuredClone(subject),
    },
  };
}

/** Undo only the imported subject, and refuse to overwrite subsequent edits to it. */
export function undoChatSubjectOutline(subjects, receipt) {
  if (!Array.isArray(subjects) || !isRecord(receipt?.afterSubject)) {
    throw new Error("This subject import can no longer be undone.");
  }
  const expected = JSON.stringify(receipt.afterSubject);
  const matches = subjects.map((subject, index) => ({ subject, index }))
    .filter(({ subject }) => nameKey(subject?.name) === nameKey(receipt.afterSubject.name));
  if (matches.length !== 1 || JSON.stringify(matches[0].subject) !== expected) {
    throw new Error("This subject has changed since the import. Undo is no longer available.");
  }
  const nextSubjects = [...subjects];
  if (receipt.beforeSubject === null) nextSubjects.splice(matches[0].index, 1);
  else if (isRecord(receipt.beforeSubject)) nextSubjects[matches[0].index] = structuredClone(receipt.beforeSubject);
  else throw new Error("This subject import can no longer be undone.");
  return nextSubjects;
}
