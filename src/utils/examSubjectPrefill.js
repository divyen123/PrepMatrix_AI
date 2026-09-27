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
export function getExamSubjectPrefill(
  requestedSubject,
  subjects = [],
  schedule = [],
  { includeUnnamedChapters = true } = {},
) {
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
        .forEach((unit) => {
          if (includeUnnamedChapters || labelOf(subject.chapterNames?.[unit.unitIndex])) {
            addLabel(unit.label);
          }
        });
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

/** Keep each subject's suggested scope separate so selection changes preserve custom text. */
export function getExamPaperScopeBlocks(selectedSubjects, subjects = [], schedule = []) {
  if (!Array.isArray(selectedSubjects) || !selectedSubjects.length) return [];
  const entries = selectedSubjects
    .map((name) => getExamSubjectPrefill(name, subjects, schedule, {
      includeUnnamedChapters: false,
    }))
    .filter((entry) => entry?.scopeText);
  const multipleSubjects = selectedSubjects.length > 1;

  return entries.map(({ subjectName, scopeText }) => ({
    subjectName,
    text: multipleSubjects
      ? `${subjectName}:\n${scopeText.split("\n").map((line) => `- ${line}`).join("\n")}`
      : scopeText,
  }));
}

export function getExamPaperScopePrefill(selectedSubjects, subjects = [], schedule = []) {
  return getExamPaperScopeBlocks(selectedSubjects, subjects, schedule)
    .map((block) => block.text).join("\n\n");
}

function replaceIntactScopeBlock(text, previousBlock, nextBlock) {
  let searchFrom = 0;
  while (searchFrom < text.length) {
    const index = text.indexOf(previousBlock, searchFrom);
    if (index < 0) return text;
    const before = text.slice(0, index);
    const after = text.slice(index + previousBlock.length);
    if ((index === 0 || before.endsWith("\n\n"))
      && (!after || after.startsWith("\n\n"))) {
      if (nextBlock) return before + nextBlock + after;
      if (!before) return after.slice(2);
      if (!after) return before.slice(0, -2);
      return before + after.slice(2);
    }
    searchFrom = index + previousBlock.length;
  }
  return text;
}

/** Replace only intact generated blocks; typed additions and edits remain untouched. */
export function mergeExamPaperScope(currentText, previousBlocks, nextBlocks) {
  const current = typeof currentText === "string" ? currentText : "";
  const previous = Array.isArray(previousBlocks) ? previousBlocks : [];
  const next = Array.isArray(nextBlocks) ? nextBlocks : [];
  const previousText = previous.map((block) => block.text).join("\n\n");
  const nextText = next.map((block) => block.text).join("\n\n");
  if (current === previousText) return nextText;

  let merged = current;
  const previousNames = new Set(previous.map((block) => comparisonKey(block.subjectName)));
  previous.forEach((block) => {
    const replacement = next.find((candidate) => (
      comparisonKey(candidate.subjectName) === comparisonKey(block.subjectName)
    ));
    merged = replaceIntactScopeBlock(merged, block.text, replacement?.text || "");
  });

  next.forEach((block) => {
    if (previousNames.has(comparisonKey(block.subjectName))) return;
    if (merged === block.text || merged.includes(`\n\n${block.text}\n\n`)
      || merged.endsWith(`\n\n${block.text}`)
      || merged.startsWith(`${block.text}\n\n`)) return;
    const separator = merged.endsWith("\n\n") ? "" : merged.endsWith("\n") ? "\n" : merged ? "\n\n" : "";
    merged += separator + block.text;
  });

  return merged;
}
