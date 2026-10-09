import { getSubjectNotebookPrefill } from "./subjectPlanning.js";

function uniqueNames(names) {
  const seen = new Set();

  return names
    .map((name) => String(name || "").trim().replace(/\s+/g, " "))
    .filter((name) => {
      const key = name.toLocaleLowerCase();
      if (!name || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function getQuizSubjectContent(subjects, selectedSubjectName) {
  const savedContent = getSubjectNotebookPrefill(subjects, selectedSubjectName);
  const chapterNames = uniqueNames(savedContent?.chapterNames || []);
  const topics = uniqueNames(savedContent?.topics || []);

  return {
    chapterNames,
    topics,
    topicText: uniqueNames([...chapterNames, ...topics]).join("; "),
  };
}

export function syncQuizSubjectTopic({
  currentTopic,
  previousSubjectName,
  previousPrefill,
  subjectName,
  prefill,
}) {
  const previousSubjectKey = String(previousSubjectName || "").trim().toLocaleLowerCase();
  const subjectKey = String(subjectName || "").trim().toLocaleLowerCase();
  const currentValue = String(currentTopic ?? "");
  const previousValue = String(previousPrefill ?? "");
  const nextValue = String(prefill ?? "");

  if (previousSubjectKey !== subjectKey) return nextValue;
  if (nextValue !== previousValue && currentValue === previousValue) return nextValue;
  return currentValue;
}
