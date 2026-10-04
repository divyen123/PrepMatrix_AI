const TITLE_FILLERS = new Set([
  "a", "an", "the", "and", "of", "on", "for", "in", "to", "with", "chapter", "topic",
  "notes", "note", "revised", "revision", "revise", "introduction", "intro", "basics", "overview", "fundamentals",
]);

function titleWords(value) {
  return [...new Set(String(value || "").normalize("NFKC").toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || [])]
    .filter((word) => !TITLE_FILLERS.has(word));
}

/** Resolve note completion to outline topics, without guessing between ambiguous matches. */
export function getRevisedNoteTopicIds(section, notebook) {
  if (!section || !notebook) return [];
  const topics = (notebook.chapters || []).flatMap((chapter) => (chapter.topics || []).map((topic) => ({
    ...topic, chapterId: chapter.id, chapterTitle: chapter.title,
  }))).filter((topic) => topic.id);
  const inChapter = (topic) => (
    (!section.chapterId || topic.chapterId === section.chapterId)
    && (!section.chapterTitle || String(topic.chapterTitle).toLocaleLowerCase() === String(section.chapterTitle).toLocaleLowerCase())
  );
  const candidates = topics.filter(inChapter);
  const references = Array.isArray(section.topicIds) ? section.topicIds : section.topicId ? [section.topicId] : [];
  if (references.length) {
    return [...new Set(references.flatMap((id) => {
      const exact = candidates.find((topic) => topic.id === id);
      if (exact) return [exact.id];
      const matches = candidates.filter((topic) => topic.id.endsWith(`-${id}`));
      return matches.length === 1 ? [matches[0].id] : [];
    }))];
  }
  const normalizedTitle = (value) => String(value || "").normalize("NFKC").trim().toLocaleLowerCase();
  const exact = candidates.filter((topic) => normalizedTitle(topic.title) === normalizedTitle(section.title));
  if (exact.length) return exact.length === 1 ? [exact[0].id] : [];
  const words = new Set(titleWords(section.title));
  if (!words.size) return [];
  const matches = candidates.flatMap((topic) => {
    const topicWords = titleWords(topic.title);
    if (!topicWords.length) return [];
    const shared = topicWords.filter((word) => words.has(word)).length;
    const topicCoverage = shared / topicWords.length;
    const noteCoverage = shared / words.size;
    return topicCoverage >= 0.75 && noteCoverage >= 0.5
      ? [{ id: topic.id, score: topicCoverage + noteCoverage }]
      : [];
  }).sort((left, right) => right.score - left.score);
  if (!matches.length || (matches[1] && matches[0].score === matches[1].score)) return [];
  return [matches[0].id];
}

export function buildRevisedNoteActionNode(section, notebook) {
  if (!section?.id || !notebook?.id) return null;
  return {
    id: `revised-note:${section.id}`,
    type: "topic",
    title: `Revise: ${section.title || "Revised note"}`,
    subjectName: notebook.subjectName || "General study",
    chapterName: "Revised notes",
    summary: section.content || "",
    explanation: section.content || "",
    keyPoints: Array.isArray(section.keyPoints) ? section.keyPoints : [],
    revisionTips: Array.isArray(section.revisionTips) ? section.revisionTips : [],
    examples: [],
  };
}
