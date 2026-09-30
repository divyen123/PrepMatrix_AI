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
