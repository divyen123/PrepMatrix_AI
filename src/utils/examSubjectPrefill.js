import { getSubjectStudyUnitRecords, normalizeSubjectNames } from "./subjectPlanning.js";

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function labelOf(value) {
  return typeof value === "string"
    ? cleanText(value)
    : cleanText(value?.title || value?.name || value?.label);
}

function comparisonKey(value) {
  return cleanText(value).toLocaleLowerCase();
}

function stripTaskControls(value) {
  return cleanText(value)
    .replace(/^(?:(?:\d+[ -]minute\s+)?(?:memory|knowledge)\s+check|check|revision|review|practice|quiz)\s*:\s*/iu, "")
    .replace(/\s*[·•]\s*(?:practice|revision|coverage)\s*$/iu, "")
    .trim();
}

function legacyTaskTopic(task, subjectName) {
  const taskText = stripTaskControls(task?.task);
  const prefix = subjectName + " - ";
  return taskText.toLocaleLowerCase().startsWith(prefix.toLocaleLowerCase())
    ? stripTaskControls(taskText.slice(prefix.length))
    : "";
}

/** Resolve a saved subject and its study scope without including another subject's tasks. */
export function getExamSubjectPrefill(requestedSubject, subjects = [], schedule = []) {
  const requestedName = cleanText(requestedSubject);
  if (!requestedName) return null;

  const safeSubjects = Array.isArray(subjects) ? subjects : [];
  const tasks = (Array.isArray(schedule) ? schedule : []).flatMap((day) => (
    Array.isArray(day?.tasks) ? day.tasks : []
  )).filter((task) => task && typeof task === "object");
  const savedNames = normalizeSubjectNames(safeSubjects);
  const scheduledNames = tasks.map((task) => cleanText(task.subjectName)
    || stripTaskControls(task.task).split(" - ")[0]).filter(Boolean);
  const subjectName = savedNames.find((name) => name === requestedName)
    || savedNames.find((name) => comparisonKey(name) === comparisonKey(requestedName))
    || scheduledNames.find((name) => name === requestedName)
    || scheduledNames.find((name) => comparisonKey(name) === comparisonKey(requestedName));
  if (!subjectName) return null;

  const subject = safeSubjects.find((item) => normalizeSubjectNames([item])[0] === subjectName);
  const scope = [];
  const seen = new Set();
  const addLabel = (value) => {
    const label = labelOf(value);
    const key = comparisonKey(label);
    if (!key || key === comparisonKey(subjectName) || seen.has(key)) return;
    seen.add(key);
    scope.push(label);
  };
  const addCurriculum = (items) => {
    if (!Array.isArray(items)) return;
    items.forEach((item) => {
      addLabel(item);
      addCurriculum(item?.topics);
      addCurriculum(item?.subtopics);
    });
  };

  if (subject && typeof subject === "object") {
    if (Array.isArray(subject.chapters)) {
      addCurriculum(subject.chapters);
    } else {
      getSubjectStudyUnitRecords(subject)
        .filter((unit) => unit.unitType === "chapter")
        .forEach((unit) => addLabel(unit.label));
    }
    addCurriculum(subject.topics);
  }

  tasks.forEach((task) => {
    const explicitSubject = cleanText(task.subjectName);
    const legacyTopic = legacyTaskTopic(task, subjectName);
    const matchesSubject = explicitSubject
      ? comparisonKey(explicitSubject) === comparisonKey(subjectName)
      : Boolean(legacyTopic);
    if (!matchesSubject) return;
    addLabel(task.chapterName || task.chapterTitle);
    const topic = labelOf(task.topic || task.topicName || task.topicTitle);
    addLabel(topic || legacyTopic);
  });

  return { subjectName, scopeText: scope.join("\n") };
}
