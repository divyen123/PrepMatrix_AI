import { normalizeAcademicProfile } from "./academicProfile.js";

export const MAX_LEARNING_NOTEBOOKS_PER_USER = 30;
export const MAX_LEARNING_SOURCES = 3;
export const MAX_LEARNING_CHAPTERS = 30;
export const MAX_LEARNING_IMPORTANT_QUESTIONS = 20;
export const MAX_LEARNING_TOPICS = 24;
export const MAX_LEARNING_SUBTOPICS = 12;
export const MAX_LEARNING_MIND_MAP_NODES = 120;

const CAREER_ELIGIBLE_BANDS = new Set([
  "diploma",
  "undergraduate",
  "postgraduate",
  "doctoral",
  "medical",
  "law",
  "professional",
]);

const CODING_PROFILE_PATTERN = /\b(?:ai|artificial intelligence|computer|computing|data|electronics|engineering|information technology|it|machine learning|programming|software)\b/iu;
const DIFFICULTIES = new Set(["easy", "medium", "hard"]);
const IMPORTANCE_LEVELS = new Set(["high", "medium", "low"]);
const MIND_MAP_KINDS = new Set(["root", "chapter", "topic", "subtopic", "question", "concept"]);
const SOURCE_KINDS = new Set(["pdf", "image", "text"]);
const ANALYSIS_MODES = new Set(["text", "vision", "native", "manual"]);

function cleanInline(value, max = 160) {
  return String(value ?? "")
    .split("")
    .map((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint <= 31 || codePoint === 127 ? " " : character;
    })
    .join("")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, max);
}

function cleanContent(value, max = 4000) {
  return String(value ?? "")
    .split("\u0000").join("")
    .replace(/\r\n?/gu, "\n")
    .replace(/[^\S\n]+/gu, " ")
    .replace(/\n{3,}/gu, "\n\n")
    .trim()
    .slice(0, max);
}

function cleanIdentifier(value, fallback) {
  const cleaned = cleanInline(value, 80)
    .replace(/[^a-z0-9:_-]+/giu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);
  return cleaned || fallback;
}

function normalizeIsoDate(value, fallback) {
  const parsed = new Date(value || fallback);
  return Number.isFinite(parsed.getTime())
    ? parsed.toISOString()
    : new Date(fallback).toISOString();
}

function normalizeStringList(value, { maxItems = 10, maxLength = 360 } = {}) {
  const list = Array.isArray(value) ? value : value == null ? [] : [value];
  const seen = new Set();
  const normalized = [];

  for (const item of list) {
    const text = cleanContent(
      item && typeof item === "object"
        ? item.text ?? item.title ?? item.label ?? item.name
        : item,
      maxLength,
    );
    const key = text.toLocaleLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    normalized.push(text);
    if (normalized.length >= maxItems) break;
  }

  return normalized;
}

export function normalizeLearningChapterNames(value) {
  return normalizeStringList(value, {
    maxItems: MAX_LEARNING_CHAPTERS,
    maxLength: 140,
  });
}

export function getLearningCareerEligibility(profile = {}) {
  const hasExplicitProfile = [
    profile?.academicLevel,
    profile?.academicTrack,
    profile?.degree,
    profile?.department,
  ].some((value) => cleanInline(value, 160));

  if (!hasExplicitProfile) {
    return {
      enabled: false,
      codingRelevant: false,
      field: "",
      reason: "Career preparation needs a completed post-secondary learner profile.",
    };
  }

  const academic = normalizeAcademicProfile(profile);
  const field = cleanInline(
    academic.department
      || academic.degree
      || (academic.academicTrack !== "General" ? academic.academicTrack : "")
      || academic.academicLevel,
    180,
  );
  const enabled = CAREER_ELIGIBLE_BANDS.has(academic.band);
  const codingText = [
    academic.degree,
    academic.department,
    academic.academicTrack,
  ].filter(Boolean).join(" ");
  const codingRelevant = enabled && CODING_PROFILE_PATTERN.test(codingText);

  return {
    enabled,
    codingRelevant,
    field,
    reason: enabled
      ? `Career preparation is tailored to ${field || academic.academicLevel}.`
      : "Career preparation is shown only for post-secondary, vocational, or professional study categories.",
  };
}

function normalizeImportantQuestions(value) {
  const rows = Array.isArray(value) ? value : [];
  const seen = new Set();
  const questions = [];

  for (const [index, item] of rows.entries()) {
    const source = item && typeof item === "object" ? item : { question: item };
    const question = cleanContent(source.question ?? source.title ?? source.text, 600);
    const key = question.toLocaleLowerCase();
    if (!question || seen.has(key)) continue;
    seen.add(key);
    const rawDifficulty = cleanInline(source.difficulty, 20).toLocaleLowerCase();
    questions.push({
      id: cleanIdentifier(source.id, `question-${index + 1}`),
      question,
      answer: cleanContent(source.answer ?? source.modelAnswer ?? source.explanation, 2400),
      whyItMatters: cleanContent(source.whyItMatters ?? source.reason ?? source.importance, 700),
      difficulty: DIFFICULTIES.has(rawDifficulty) ? rawDifficulty : "medium",
    });
    if (questions.length >= MAX_LEARNING_IMPORTANT_QUESTIONS) break;
  }

  return questions;
}

function reserveScopedIdentifier(value, fallback, scope, usedIdentifiers) {
  const rawId = cleanIdentifier(value, fallback);
  const baseId = scope && !rawId.startsWith(`${scope}-`)
    ? cleanIdentifier(`${scope}-${rawId}`, fallback)
    : rawId;
  let candidate = baseId;
  let suffix = 2;

  while (usedIdentifiers.has(candidate)) {
    candidate = cleanIdentifier(`${baseId}-${suffix}`, `${fallback}-${suffix}`);
    suffix += 1;
  }

  usedIdentifiers.add(candidate);
  return candidate;
}

function normalizeSubtopics(value, topicId, usedIdentifiers) {
  const rows = Array.isArray(value) ? value : [];
  const seen = new Set();
  const subtopics = [];

  for (const [index, item] of rows.entries()) {
    const source = item && typeof item === "object" ? item : { title: item };
    const title = cleanInline(source.title ?? source.name ?? source.label, 180);
    const key = title.toLocaleLowerCase();
    if (!title || seen.has(key)) continue;
    seen.add(key);
    subtopics.push({
      id: reserveScopedIdentifier(
        source.id,
        `${topicId}-subtopic-${index + 1}`,
        topicId,
        usedIdentifiers,
      ),
      title,
      summary: cleanContent(source.summary ?? source.explanation ?? source.content, 1800),
      keyPoints: normalizeStringList(source.keyPoints ?? source.points, {
        maxItems: 10,
        maxLength: 420,
      }),
    });
    if (subtopics.length >= MAX_LEARNING_SUBTOPICS) break;
  }

  return subtopics;
}

function normalizeTopics(
  value,
  maximum = MAX_LEARNING_TOPICS,
  idScope = "",
  usedIdentifiers = new Set(),
) {
  const rows = Array.isArray(value) ? value : [];
  const seen = new Set();
  const topics = [];

  for (const [index, item] of rows.entries()) {
    const source = item && typeof item === "object" ? item : { title: item };
    const title = cleanInline(source.title ?? source.name ?? source.label, 180);
    const key = title.toLocaleLowerCase();
    if (!title || seen.has(key)) continue;
    seen.add(key);
    const rawImportance = cleanInline(source.importance, 20).toLocaleLowerCase();
    const topicId = reserveScopedIdentifier(
      source.id,
      `${idScope ? `${idScope}-` : ""}topic-${index + 1}`,
      idScope,
      usedIdentifiers,
    );
    topics.push({
      id: topicId,
      title,
      summary: cleanContent(source.summary ?? source.explanation ?? source.content, 2600),
      importance: IMPORTANCE_LEVELS.has(rawImportance) ? rawImportance : "medium",
      keyPoints: normalizeStringList(source.keyPoints ?? source.points, {
        maxItems: 12,
        maxLength: 440,
      }),
      revisionTips: normalizeStringList(source.revisionTips ?? source.tips, {
        maxItems: 8,
        maxLength: 420,
      }),
      subtopics: normalizeSubtopics(
        source.subtopics ?? source.children,
        topicId,
        usedIdentifiers,
      ),
    });
    if (topics.length >= maximum) break;
  }

  return topics;
}

function normalizeChapters(value, requestedChapterNames = [], legacyTopics = []) {
  const rows = Array.isArray(value) ? value : [];
  const requested = normalizeLearningChapterNames(requestedChapterNames);
  const maximum = Math.min(MAX_LEARNING_CHAPTERS, requested.length || rows.length);
  const chapters = [];
  const usedOutlineIds = new Set();
  let remainingTopicSlots = MAX_LEARNING_TOPICS;

  for (let index = 0; index < maximum; index += 1) {
    const requestedTitle = requested[index];
    const matchingRow = requestedTitle
      ? rows.find((item) => (
          item
          && typeof item === "object"
          && cleanInline(item.title ?? item.name ?? item.label, 180).toLocaleLowerCase()
            === requestedTitle.toLocaleLowerCase()
        )) || rows[index]
      : rows[index];
    const source = matchingRow && typeof matchingRow === "object"
      ? matchingRow
      : { title: matchingRow };
    const title = requestedTitle || cleanInline(source.title ?? source.name ?? source.label, 180);
    if (!title) continue;
    const chapterId = reserveScopedIdentifier(
      source.id,
      `chapter-${index + 1}`,
      "",
      usedOutlineIds,
    );
    const chapterTopics = normalizeTopics(
      source.topics ?? source.children,
      remainingTopicSlots,
      chapterId,
      usedOutlineIds,
    );
    remainingTopicSlots = Math.max(0, remainingTopicSlots - chapterTopics.length);
    chapters.push({
      id: chapterId,
      title,
      summary: cleanContent(source.summary ?? source.overview ?? source.content, 2600),
      topics: chapterTopics,
    });
  }

  if (!chapters.length && legacyTopics.length) {
    const chapterId = reserveScopedIdentifier("", "chapter-1", "", usedOutlineIds);
    chapters.push({
      id: chapterId,
      title: requested[0] || "Core concepts",
      summary: "",
      topics: normalizeTopics(
        legacyTopics,
        MAX_LEARNING_TOPICS,
        chapterId,
        usedOutlineIds,
      ),
    });
  } else if (
    chapters.length === 1
    && chapters[0].topics.length === 0
    && legacyTopics.length
  ) {
    chapters[0].topics = normalizeTopics(
      legacyTopics,
      MAX_LEARNING_TOPICS,
      chapters[0].id,
      usedOutlineIds,
    );
  }

  return chapters;
}

function normalizeRevisedNotes(value, topics) {
  const rows = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray(value.sections)
      ? value.sections
      : value == null
        ? []
        : [{ title: "Revised notes", content: value }];
  const normalized = rows.slice(0, 24).flatMap((item, index) => {
    const source = item && typeof item === "object" ? item : { content: item };
    const title = cleanInline(source.title ?? source.heading, 180);
    const content = cleanContent(source.content ?? source.summary ?? source.notes, 3200);
    const keyPoints = normalizeStringList(source.keyPoints ?? source.points, {
      maxItems: 12,
      maxLength: 440,
    });
    const revisionTips = normalizeStringList(source.revisionTips ?? source.tips, {
      maxItems: 8,
      maxLength: 420,
    });
    if (!title && !content && !keyPoints.length) return [];
    return [{
      id: cleanIdentifier(source.id, `revised-note-${index + 1}`),
      title: title || `Revision section ${index + 1}`,
      content,
      keyPoints,
      revisionTips,
    }];
  });

  if (normalized.length || !topics.length) return normalized;
  return topics.map((topic, index) => ({
    id: `revised-note-${index + 1}`,
    title: topic.title,
    content: topic.summary,
    keyPoints: topic.keyPoints,
    revisionTips: topic.revisionTips,
  }));
}

function deriveMindMap(subjectName, chapters, topics) {
  const rootId = "root";
  const nodes = [{
    id: rootId,
    label: subjectName || "Learning notebook",
    parentId: null,
    kind: "root",
    order: 0,
  }];

  const appendTopic = (topic, topicIndex, parentId) => {
    const topicId = cleanIdentifier(topic.id, `topic-${topicIndex + 1}`);
    nodes.push({
      id: topicId,
      label: topic.title,
      parentId,
      kind: "topic",
      order: topicIndex,
    });
    topic.subtopics.forEach((subtopic, subtopicIndex) => {
      nodes.push({
        id: cleanIdentifier(subtopic.id, `${topicId}-subtopic-${subtopicIndex + 1}`),
        label: subtopic.title,
        parentId: topicId,
        kind: "subtopic",
        order: subtopicIndex,
      });
    });
  };

  if (chapters.length) {
    let topicIndex = 0;
    chapters.forEach((chapter, chapterIndex) => {
      const chapterId = cleanIdentifier(chapter.id, `chapter-${chapterIndex + 1}`);
      nodes.push({
        id: chapterId,
        label: chapter.title,
        parentId: rootId,
        kind: "chapter",
        order: chapterIndex,
      });
      chapter.topics.forEach((topic) => {
        appendTopic(topic, topicIndex, chapterId);
        topicIndex += 1;
      });
    });
  } else {
    topics.forEach((topic, topicIndex) => appendTopic(topic, topicIndex, rootId));
  }

  return nodes.slice(0, MAX_LEARNING_MIND_MAP_NODES);
}

function normalizeMindMap(value, subjectName, chapters, topics) {
  const source = value && typeof value === "object" ? value : {};
  const rawNodes = Array.isArray(source.nodes) ? source.nodes : [];
  const nodes = [];
  const ids = new Set();

  rawNodes.slice(0, MAX_LEARNING_MIND_MAP_NODES).forEach((item, index) => {
    const raw = item && typeof item === "object" ? item : { label: item };
    const label = cleanInline(raw.label ?? raw.title ?? raw.name, 180);
    if (!label) return;
    let id = cleanIdentifier(raw.id, `node-${index + 1}`);
    if (ids.has(id)) id = `node-${index + 1}`;
    while (ids.has(id)) id = `${id}-next`;
    ids.add(id);
    const rawKind = cleanInline(raw.kind ?? raw.type, 24).toLocaleLowerCase();
    nodes.push({
      id,
      label,
      rawParentId: cleanIdentifier(raw.parentId ?? raw.parent, ""),
      kind: MIND_MAP_KINDS.has(rawKind) ? rawKind : index === 0 ? "root" : "concept",
      order: Math.max(0, Math.min(999, Number.parseInt(raw.order, 10) || index)),
    });
  });

  const candidateNodes = nodes.length ? nodes : deriveMindMap(subjectName, chapters, topics);
  const resolvedNodes = candidateNodes.map((node) => {
    if (!("rawParentId" in node)) return node;
    const parentId = node.rawParentId
      && node.rawParentId !== node.id
      && candidateNodes.some((candidate) => candidate.id === node.rawParentId)
      ? node.rawParentId
      : null;
    return {
      id: node.id,
      label: node.label,
      parentId,
      kind: node.kind,
      order: node.order,
    };
  });

  if (resolvedNodes.length > 1) {
    const root = resolvedNodes.find((node) => node.kind === "root" && !node.parentId)
      || resolvedNodes.find((node) => !node.parentId)
      || resolvedNodes[0];
    root.kind = "root";
    root.parentId = null;
    resolvedNodes.forEach((node) => {
      if (node.id !== root.id && !node.parentId) node.parentId = root.id;
    });
  }

  const edgeKeys = new Set();
  const edges = [];
  const addEdge = (from, to, fallbackId) => {
    if (!from || !to || from === to || !resolvedNodes.some((node) => node.id === from) || !resolvedNodes.some((node) => node.id === to)) return;
    const key = `${from}:${to}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ id: cleanIdentifier(fallbackId, `edge-${edges.length + 1}`), from, to });
  };

  (Array.isArray(source.edges) ? source.edges : []).slice(0, 200).forEach((edge, index) => {
    addEdge(
      cleanIdentifier(edge?.from ?? edge?.source, ""),
      cleanIdentifier(edge?.to ?? edge?.target, ""),
      edge?.id ?? `edge-${index + 1}`,
    );
  });
  resolvedNodes.forEach((node) => {
    if (node.parentId) addEdge(node.parentId, node.id, `edge-${edges.length + 1}`);
  });

  return { nodes: resolvedNodes, edges: edges.slice(0, 200) };
}

function normalizeSources(value) {
  const rows = Array.isArray(value) ? value : [];
  return rows.slice(0, MAX_LEARNING_SOURCES).flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const name = cleanInline(item.name, 140) || `Source ${index + 1}`;
    const rawKind = cleanInline(item.kind, 20).toLocaleLowerCase();
    const rawMode = cleanInline(item.analysisMode, 20).toLocaleLowerCase();
    const totalPages = Math.max(0, Math.min(100000, Number.parseInt(item.totalPages, 10) || 0));
    const pagesRead = Math.max(0, Math.min(totalPages || 100000, Number.parseInt(item.pagesRead, 10) || 0));
    return [{
      name,
      type: cleanInline(item.type, 100) || "text/plain",
      size: Math.max(0, Math.min(15 * 1024 * 1024, Number.parseInt(item.size, 10) || 0)),
      kind: SOURCE_KINDS.has(rawKind) ? rawKind : "text",
      analysisMode: ANALYSIS_MODES.has(rawMode) ? rawMode : "text",
      ...(totalPages ? { totalPages } : {}),
      ...(pagesRead ? { pagesRead } : {}),
      truncated: Boolean(item.truncated),
    }];
  });
}

function normalizeCareerQuestions(value) {
  const rows = Array.isArray(value) ? value : [];
  return rows.slice(0, 12).flatMap((item, index) => {
    const source = item && typeof item === "object" ? item : { question: item };
    const question = cleanContent(source.question ?? source.title ?? source.text, 600);
    if (!question) return [];
    return [{
      id: cleanIdentifier(source.id, `career-question-${index + 1}`),
      question,
      guidance: cleanContent(source.guidance ?? source.answer ?? source.explanation, 1800),
    }];
  });
}

function normalizeCodingTopics(value) {
  const rows = Array.isArray(value) ? value : [];
  return rows.slice(0, 12).flatMap((item, index) => {
    const source = item && typeof item === "object" ? item : { title: item };
    const title = cleanInline(source.title ?? source.name ?? source.label, 180);
    if (!title) return [];
    return [{
      id: cleanIdentifier(source.id, `coding-topic-${index + 1}`),
      title,
      whyItMatters: cleanContent(source.whyItMatters ?? source.summary ?? source.reason, 900),
      practiceSteps: normalizeStringList(source.practiceSteps ?? source.steps, {
        maxItems: 8,
        maxLength: 420,
      }),
    }];
  });
}

function normalizeCareerPreparation(value, profile) {
  const eligibility = getLearningCareerEligibility(profile);
  if (!eligibility.enabled) {
    return {
      enabled: false,
      codingRelevant: false,
      field: eligibility.field,
      reason: eligibility.reason,
      focus: "",
      skills: [],
      interviewQuestions: [],
      codingTopics: [],
    };
  }

  const source = value && typeof value === "object" ? value : {};
  return {
    enabled: true,
    codingRelevant: eligibility.codingRelevant,
    field: eligibility.field,
    reason: eligibility.reason,
    focus: cleanContent(source.focus ?? source.summary, 1200),
    skills: normalizeStringList(source.skills, { maxItems: 16, maxLength: 360 }),
    interviewQuestions: normalizeCareerQuestions(source.interviewQuestions ?? source.questions),
    codingTopics: eligibility.codingRelevant
      ? normalizeCodingTopics(source.codingTopics ?? source.codingPreparation)
      : [],
  };
}

export function hasLearningNotebookShape(value) {
  const source = value?.notebook && typeof value.notebook === "object" ? value.notebook : value;
  return Boolean(
    source
    && typeof source === "object"
    && typeof source.overview === "string"
    && Array.isArray(source.importantQuestions)
    && Array.isArray(source.revisedNotes)
    && Array.isArray(source.chapters)
    && source.chapters.every((chapter) => (
      chapter
      && typeof chapter === "object"
      && typeof chapter.title === "string"
      && chapter.title.trim().length > 0
      && Array.isArray(chapter.topics)
    ))
    && source.mindMap
    && source.chapters.length > 0
    && typeof source.mindMap === "object"
    && Array.isArray(source.mindMap.nodes),
  );
}

export function normalizeLearningNotebook(value = {}, options = {}) {
  const source = value?.notebook && typeof value.notebook === "object" ? value.notebook : value;
  const now = options.now || new Date();
  const subjectName = cleanInline(options.subjectName ?? source?.subjectName, 140) || "General study";
  const requestedChapterNames = normalizeLearningChapterNames(
    options.chapterNames
      ?? (Array.isArray(source?.chapters) && source.chapters.length
        ? source.chapters
        : source?.chapterNames),
  );
  const legacyTopics = normalizeTopics(source?.topics);
  const chapters = normalizeChapters(
    source?.chapters,
    requestedChapterNames,
    source?.topics,
  );
  const chapterNames = chapters.length
    ? chapters.map((chapter) => chapter.title)
    : requestedChapterNames;
  const topics = chapters.length
    ? chapters.flatMap((chapter) => chapter.topics).slice(0, MAX_LEARNING_TOPICS)
    : legacyTopics;
  const createdAt = normalizeIsoDate(
    options.createdAt ?? source?.createdAt,
    now,
  );
  const updatedAt = normalizeIsoDate(
    options.updatedAt ?? source?.updatedAt,
    now,
  );

  return {
    ...(options.id ?? source?.id ? { id: cleanInline(options.id ?? source.id, 80) } : {}),
    title: cleanInline(source?.title, 180)
      || `${subjectName}${chapterNames.length === 1 ? ` - ${chapterNames[0]}` : ""}`,
    subjectName,
    chapterNames,
    importantQuestions: normalizeImportantQuestions(source?.importantQuestions ?? source?.questions),
    overview: cleanContent(source?.overview ?? source?.summary, 6000),
    revisedNotes: normalizeRevisedNotes(source?.revisedNotes ?? source?.notes, topics),
    chapters,
    topics,
    mindMap: normalizeMindMap(source?.mindMap, subjectName, chapters, topics),
    coverageWarnings: normalizeStringList(
      [
        ...(Array.isArray(source?.coverageWarnings) ? source.coverageWarnings : []),
        ...(Array.isArray(options.coverageWarnings) ? options.coverageWarnings : []),
      ],
      { maxItems: 12, maxLength: 520 },
    ),
    careerPreparation: normalizeCareerPreparation(
      source?.careerPreparation,
      options.profile || {},
    ),
    sources: normalizeSources(options.sources ?? source?.sources ?? source?.sourceFiles),
    model: cleanInline(options.model ?? source?.model, 120),
    createdAt,
    updatedAt,
  };
}
