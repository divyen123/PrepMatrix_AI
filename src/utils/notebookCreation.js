import { getSubjectNotebookPrefill } from "./subjectPlanning.js";

export const MAX_NOTEBOOK_SCOPE_CHARS = 3000;
export const MAX_NOTEBOOK_TOPICS = 12;

export function notebookRequirementsKey(subjectName) {
  return String(subjectName || "").replace(/\s+/gu, " ").trim().normalize("NFKC").toLocaleLowerCase();
}

export function getNotebookScopeSuggestion(subjects, subjectName) {
  const saved = getSubjectNotebookPrefill(subjects, subjectName);
  return (saved?.topics?.length ? saved.topics : saved?.chapterNames || []).join("\n");
}

export function parseNotebookScope(value) {
  const seen = new Set();
  return String(value || "").split(/[\n,;]+/u).map((name) => name.trim()).filter((name) => {
    const key = name.normalize("NFKC").toLocaleLowerCase();
    if (!name || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildNotebookFocus(subjectName, topicNames) {
  return `Create detailed study notes for ${JSON.stringify(subjectName)} on these topics or chapters: ${JSON.stringify(topicNames)}. Explain each one clearly at my academic level: define the key terms, show how and why it works, give practical real-world examples with explained outcomes, include worked calculations where relevant, and finish with the important key points and revision cues. Focus on these topics and avoid unrelated material.`;
}
