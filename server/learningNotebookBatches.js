import {
  MAX_LEARNING_IMPORTANT_QUESTIONS,
  MAX_LEARNING_TOPICS,
  hasGeneratedLearningNotebookDepth,
  normalizeLearningChapterNames,
  normalizeLearningNotebook,
} from "../src/utils/learningNotebook.js";

const MAX_REVISED_NOTES = 24;
const MAX_CAREER_ITEMS = 12;
const MAX_CAREER_SKILLS = 16;

export class LearningNotebookBatchValidationError extends Error {
  constructor(message = "The generated notebook sections were incomplete.") {
    super(message);
    this.name = "LearningNotebookBatchValidationError";
    this.code = "LEARNING_OUTPUT_INVALID";
  }
}

function fail(message) {
  throw new LearningNotebookBatchValidationError(message);
}

function positiveInteger(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function titleKey(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/gu, " ").toLocaleLowerCase() : "";
}

function generatedSource(value) {
  return value?.notebook && typeof value.notebook === "object" ? value.notebook : value;
}

function allocate(total, index, count) {
  return Math.floor(total / count) + (index < total % count ? 1 : 0);
}

function batchDepthTargets(depthTargets, topicCount, questionCount, noteCount) {
  return {
    ...depthTargets,
    expectedChapterCount: 1,
    exactChapterCount: 1,
    topicsPerChapter: topicCount,
    totalTopics: topicCount,
    minimumTopicsPerChapter: topicCount,
    exactTopicsPerChapter: topicCount,
    exactSubtopicsPerTopic: positiveInteger(depthTargets.exactSubtopicsPerTopic,
      positiveInteger(depthTargets.subtopicsPerTopic, positiveInteger(depthTargets.minimumSubtopicsPerTopic))),
    minimumImportantQuestions: questionCount,
    maximumImportantQuestions: questionCount,
    minimumNoteSections: noteCount,
  };
}

export function buildLearningNotebookBatches(chapterNames, depthTargets, { compact = false } = {}) {
  const chapters = normalizeLearningChapterNames(chapterNames);
  if (!chapters.length) return [];
  const topicsPerChapter = positiveInteger(depthTargets?.topicsPerChapter,
    positiveInteger(depthTargets?.minimumTopicsPerChapter));
  if (!topicsPerChapter || chapters.length * topicsPerChapter > MAX_LEARNING_TOPICS) {
    fail("The notebook chapter plan exceeds the supported topic limit.");
  }
  if (depthTargets?.expectedChapterCount && depthTargets.expectedChapterCount !== chapters.length) {
    fail("The notebook chapter plan does not match its required depth.");
  }

  const topicsPerRequest = compact ? 2 : chapters.length <= 2 ? 1 : chapters.length <= 6 ? 2 : 3;
  const batches = chapters.flatMap((chapterName, chapterIndex) => {
    const groups = [];
    for (let topicOffset = 0; topicOffset < topicsPerChapter; topicOffset += topicsPerRequest) {
      groups.push({
        chapterIndex,
        chapterName,
        topicOffset,
        topicCount: Math.min(topicsPerRequest, topicsPerChapter - topicOffset),
      });
    }
    return groups;
  });
  const questionTotal = Math.max(batches.length, positiveInteger(depthTargets?.minimumImportantQuestions));
  const noteTotal = Math.max(batches.length, positiveInteger(depthTargets?.minimumNoteSections));
  const questionLimit = Math.min(MAX_LEARNING_IMPORTANT_QUESTIONS,
    positiveInteger(depthTargets?.maximumImportantQuestions, MAX_LEARNING_IMPORTANT_QUESTIONS));
  if (questionTotal > questionLimit || noteTotal > MAX_REVISED_NOTES) {
    fail("The notebook chapter plan exceeds the supported section limit.");
  }

  return batches.map((batch, index) => {
    const questionCount = allocate(questionTotal, index, batches.length);
    const noteCount = allocate(noteTotal, index, batches.length);
    return {
      ...batch,
      questionCount,
      noteCount,
      depthTargets: batchDepthTargets(depthTargets, batch.topicCount, questionCount, noteCount),
    };
  });
}

export function validateLearningNotebookBatch(value, batch) {
  const source = generatedSource(value);
  if (!source || typeof source !== "object" || !batch?.depthTargets) return false;
  if (!Array.isArray(source.chapters) || source.chapters.length !== 1) return false;
  const chapter = source.chapters[0];
  if (!titleKey(batch.chapterName) || titleKey(chapter?.title) !== titleKey(batch.chapterName)) return false;
  if (!Array.isArray(chapter.topics) || chapter.topics.length !== batch.topicCount) return false;
  const subtopicCount = positiveInteger(batch.depthTargets.exactSubtopicsPerTopic,
    positiveInteger(batch.depthTargets.subtopicsPerTopic, positiveInteger(batch.depthTargets.minimumSubtopicsPerTopic)));
  if (!chapter.topics.every((topic) => (
    topic && typeof topic === "object" && Array.isArray(topic.subtopics)
    && topic.subtopics.length === subtopicCount
    && topic.subtopics.every((subtopic) => subtopic && typeof subtopic === "object")
  ))) return false;
  if (!Array.isArray(source.importantQuestions) || source.importantQuestions.length !== batch.questionCount) return false;
  if (!Array.isArray(source.revisedNotes) || source.revisedNotes.length !== batch.noteCount) return false;
  if (!source.importantQuestions.every((question) => (
    question && typeof question === "object" && titleKey(question.question) && titleKey(question.answer)
  ))) return false;
  if (!source.revisedNotes.every((note) => (
    note && typeof note === "object" && titleKey(note.title) && titleKey(note.content)
  ))) return false;
  const topicReferences = new Map();
  chapter.topics.forEach((topic, index) => {
    rememberTopicReference(topicReferences, topic.id, `batch-topic-${index + 1}`);
  });
  if (!source.revisedNotes.every((note) => {
    const references = Array.isArray(note.topicIds) ? note.topicIds : note.topicId ? [note.topicId] : [];
    // Dropping an explicit invalid reference would enable title-based matching
    // to unrelated topics from a later group after the chapter is merged.
    return references.every((reference) => (
      typeof reference === "string" && topicReferences.get(reference.trim())
    ));
  })) return false;
  if (!source.mindMap || typeof source.mindMap !== "object" || !Array.isArray(source.mindMap.nodes)) return false;
  // Depth checks do not depend on provider IDs or optional map extras. Short,
  // unique local IDs keep normalization bounded even for colliding AI IDs.
  const depthSource = {
    title: source.title,
    overview: source.overview,
    importantQuestions: source.importantQuestions,
    revisedNotes: source.revisedNotes,
    chapters: [{
      ...chapter,
      id: "batch-chapter",
      topics: chapter.topics.map((topic, index) => ({
        ...topic,
        id: `batch-chapter-topic-${index + 1}`,
        subtopics: topic.subtopics.map((subtopic, subtopicIndex) => ({
          ...subtopic,
          id: `batch-chapter-topic-${index + 1}-subtopic-${subtopicIndex + 1}`,
        })),
      })),
    }],
    mindMap: { nodes: [{ id: "root", label: batch.chapterName, kind: "root" }], edges: [] },
  };
  try {
    return hasGeneratedLearningNotebookDepth(depthSource, batch.depthTargets);
  } catch {
    return false;
  }
}

function interleave(lists) {
  const merged = [];
  const maximum = Math.max(0, ...lists.map((list) => list.length));
  for (let index = 0; index < maximum; index += 1) {
    lists.forEach((list) => {
      if (index < list.length) merged.push(list[index]);
    });
  }
  return merged;
}

function uniqueStrings(values) {
  const seen = new Set();
  return values.filter((value) => {
    const key = titleKey(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function rememberTopicReference(map, sourceId, finalId) {
  if (typeof sourceId !== "string" || !sourceId.trim()) return;
  const key = sourceId.trim();
  map.set(key, map.has(key) ? null : finalId);
}

function uniqueObjects(values, field) {
  const seen = new Set();
  return values.flatMap((value) => {
    const source = value && typeof value === "object" ? value : { [field]: value };
    const text = source[field] ?? (field === "question" ? source.title ?? source.text : source.name ?? source.label);
    const key = titleKey(text);
    if (!key || seen.has(key)) return [];
    seen.add(key);
    return [{ ...source, [field]: text }];
  });
}

export function mergeLearningNotebookBatches(results, { subjectName, depthTargets } = {}) {
  if (!Array.isArray(results) || !results.length || !depthTargets) fail();
  const expectedChapterCount = positiveInteger(depthTargets.expectedChapterCount,
    positiveInteger(depthTargets.planningChapterCount));
  const topicsPerChapter = positiveInteger(depthTargets.topicsPerChapter,
    positiveInteger(depthTargets.minimumTopicsPerChapter));
  if (!expectedChapterCount || !topicsPerChapter || expectedChapterCount * topicsPerChapter > MAX_LEARNING_TOPICS) fail();
  const ordered = [...results].sort((left, right) => (
    (left?.batch?.chapterIndex ?? -1) - (right?.batch?.chapterIndex ?? -1)
    || (left?.batch?.topicOffset ?? -1) - (right?.batch?.topicOffset ?? -1)
  ));
  const chapters = [];
  const chapterQuestions = Array.from({ length: expectedChapterCount }, () => []);
  const chapterNotes = Array.from({ length: expectedChapterCount }, () => []);
  const chapterSummaries = Array.from({ length: expectedChapterCount }, () => []);
  const overviews = [];
  const warnings = [];
  const chapterCareers = Array.from({ length: expectedChapterCount }, () => []);
  let questionTotal = 0;
  let noteTotal = 0;

  for (const result of ordered) {
    const batch = result?.batch;
    if (
      !batch
      || !Number.isInteger(batch.chapterIndex) || batch.chapterIndex < 0 || batch.chapterIndex >= expectedChapterCount
      || !Number.isInteger(batch.topicOffset) || batch.topicOffset < 0
      || !positiveInteger(batch.topicCount) || !positiveInteger(batch.questionCount) || !positiveInteger(batch.noteCount)
    ) fail();
    const source = generatedSource(result.generated);
    const validationBatch = {
      ...batch,
      depthTargets: batchDepthTargets(depthTargets, batch.topicCount, batch.questionCount, batch.noteCount),
    };
    if (!validateLearningNotebookBatch(source, validationBatch)) fail();
    if (batch.chapterIndex > chapters.length) fail();
    const chapterId = `chapter-${batch.chapterIndex + 1}`;
    let chapter = chapters[batch.chapterIndex];
    if (!chapter) {
      if (batch.topicOffset !== 0 || batch.chapterIndex !== chapters.length) fail();
      chapter = { id: chapterId, title: batch.chapterName, summary: source.chapters[0].summary, topics: [] };
      chapters.push(chapter);
    }
    if (titleKey(chapter.title) !== titleKey(batch.chapterName) || batch.topicOffset !== chapter.topics.length) fail();
    if (batch.topicOffset + batch.topicCount > topicsPerChapter) fail();

    const topicIds = new Map();
    source.chapters[0].topics.forEach((topic, index) => {
      const id = `${chapterId}-topic-${batch.topicOffset + index + 1}`;
      rememberTopicReference(topicIds, topic.id, id);
      chapter.topics.push({
        ...topic,
        id,
        subtopics: topic.subtopics.map((subtopic, subtopicIndex) => ({
          ...subtopic,
          id: `${id}-subtopic-${subtopicIndex + 1}`,
        })),
      });
    });
    chapterQuestions[batch.chapterIndex].push(...source.importantQuestions);
    chapterSummaries[batch.chapterIndex].push(source.chapters[0].summary);
    source.revisedNotes.forEach((note) => {
      const references = Array.isArray(note.topicIds) ? note.topicIds : note.topicId ? [note.topicId] : [];
      const remapped = [...new Set(references.map((reference) => (
        typeof reference === "string" ? topicIds.get(reference.trim()) : null
      )).filter(Boolean))];
      chapterNotes[batch.chapterIndex].push({
        title: note.title,
        content: note.content,
        keyPoints: note.keyPoints,
        revisionTips: note.revisionTips,
        chapterId,
        chapterTitle: chapter.title,
        ...(remapped.length ? { topicIds: remapped } : {}),
      });
    });
    questionTotal += batch.questionCount;
    noteTotal += batch.noteCount;
    overviews.push(source.overview);
    warnings.push(...(Array.isArray(source.coverageWarnings) ? source.coverageWarnings : []));
    if (source.careerPreparation && typeof source.careerPreparation === "object") {
      chapterCareers[batch.chapterIndex].push(source.careerPreparation);
    }
  }

  if (chapters.length !== expectedChapterCount || chapters.some((chapter) => chapter.topics.length !== topicsPerChapter)) fail();
  if (questionTotal > MAX_LEARNING_IMPORTANT_QUESTIONS || noteTotal > MAX_REVISED_NOTES) fail();
  chapters.forEach((chapter, index) => { chapter.summary = uniqueStrings(chapterSummaries[index]).join("\n\n"); });
  const careers = chapterCareers.flat();
  const merged = {
    title: subjectName || "Learning notebook",
    overview: uniqueStrings(overviews).join("\n\n"),
    chapters,
    importantQuestions: interleave(chapterQuestions).slice(0, MAX_LEARNING_IMPORTANT_QUESTIONS)
      .map((question, index) => ({ ...question, id: `question-${index + 1}` })),
    revisedNotes: interleave(chapterNotes).slice(0, MAX_REVISED_NOTES)
      .map((note, index) => ({ ...note, id: `revised-note-${index + 1}` })),
    mindMap: { nodes: [{ id: "root", label: subjectName || "Learning notebook", kind: "root", parentId: null, order: 0 }], edges: [] },
    coverageWarnings: uniqueStrings(warnings),
    careerPreparation: {
      focus: uniqueStrings(careers.map((career) => career.focus)).join("\n\n"),
      skills: uniqueStrings(interleave(chapterCareers.map((entries) => entries.flatMap((career) => (
        Array.isArray(career.skills) ? career.skills : []
      ))))).slice(0, MAX_CAREER_SKILLS),
      interviewQuestions: uniqueObjects(interleave(chapterCareers.map((entries) => entries.flatMap((career) => (
        Array.isArray(career.interviewQuestions) ? career.interviewQuestions : []
      )))), "question").slice(0, MAX_CAREER_ITEMS)
        .map((question, index) => ({ ...question, id: `career-question-${index + 1}` })),
      codingTopics: uniqueObjects(interleave(chapterCareers.map((entries) => entries.flatMap((career) => (
        Array.isArray(career.codingTopics) ? career.codingTopics : []
      )))), "title").slice(0, MAX_CAREER_ITEMS)
        .map((topic, index) => ({ ...topic, id: `coding-topic-${index + 1}` })),
    },
  };
  const normalized = normalizeLearningNotebook(merged, { subjectName, chapterNames: chapters.map((chapter) => chapter.title) });
  if (
    normalized.importantQuestions.length !== questionTotal
    || normalized.revisedNotes.length !== noteTotal
    || !hasGeneratedLearningNotebookDepth(merged, depthTargets)
  ) fail("The generated notebook did not meet the complete chapter requirements.");
  return { ...merged, mindMap: normalized.mindMap };
}
