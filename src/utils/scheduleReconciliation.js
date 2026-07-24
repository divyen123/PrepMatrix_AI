import { createSubjectScheduleTask } from "./scheduleGenerator.js";
import {
  getSubjectStudyUnitRecords,
  normalizeStudyPreferences,
} from "./subjectPlanning.js";

function cleanText(value) {
  return String(value || "").trim();
}

function normalizeLabel(value) {
  return cleanText(value).toLocaleLowerCase();
}

function isNoteTask(task) {
  return task?.source === "note" || Boolean(cleanText(task?.sourceNoteId));
}

function subjectSignature(subject = {}) {
  return JSON.stringify({
    preferences: normalizeStudyPreferences(subject?.studyPreferences),
    units: getSubjectStudyUnitRecords(subject).map((unit) => ({
      label: unit.label,
      unitKey: unit.unitKey,
    })),
  });
}

function inferUnitKey(task, previousSubject, nextSubject) {
  const explicitKey = cleanText(task?.unitKey);
  if (explicitKey) return explicitKey;

  const unitType = cleanText(task?.unitType).toLowerCase();
  const unitIndex = Number.parseInt(task?.unitIndex, 10);
  if ((unitType === "chapter" || unitType === "topic") && Number.isInteger(unitIndex) && unitIndex >= 0) {
    if (unitType === "chapter") return `chapter:${unitIndex + 1}`;
    const indexedTopic = getSubjectStudyUnitRecords(previousSubject)
      .find((unit) => unit.unitType === "topic" && unit.unitIndex === unitIndex);
    if (indexedTopic) return indexedTopic.unitKey;
  }

  let label = cleanText(task?.topic);
  if (!label) {
    const taskName = cleanText(task?.task);
    const matchingSubjectName = [
      cleanText(previousSubject?.name),
      cleanText(nextSubject?.name),
    ].find((name) => name && taskName.startsWith(`${name} - `));
    if (matchingSubjectName) {
      label = taskName
        .slice(matchingSubjectName.length + 3)
        .replace(/\s+.{1,3}\s+(?:Practice|Revision)$/i, "")
        .trim();
    }
  }
  const rawChapter = /^chapter\s+(\d+)$/i.exec(label);
  if (rawChapter) return `chapter:${Number(rawChapter[1])}`;

  const candidates = [
    ...getSubjectStudyUnitRecords(previousSubject),
    ...getSubjectStudyUnitRecords(nextSubject),
  ];
  const matchingUnit = candidates.find((unit) => (
    (!unitType || unit.unitType === unitType)
    && normalizeLabel(unit.label) === normalizeLabel(label)
  ));
  if (matchingUnit) return matchingUnit.unitKey;

  if (unitType === "topic" && label) return `topic:${normalizeLabel(label)}`;
  return "";
}

function isSubjectTask(task, previousSubject, nextSubject, inferredKey) {
  if (!task || isNoteTask(task)) return false;

  const previousName = cleanText(previousSubject?.name);
  const nextName = cleanText(nextSubject?.name);
  const explicitSubject = cleanText(task?.subjectName);
  if (explicitSubject) {
    return explicitSubject === previousName || explicitSubject === nextName;
  }

  const taskName = cleanText(task?.task);
  return Boolean(
    inferredKey
    && [previousName, nextName].filter(Boolean).some((name) => taskName.startsWith(`${name} - `)),
  );
}

function migrateCompletions(completed, renameMap, removedNames, schedule) {
  const remainingNames = new Set(
    schedule.flatMap((day) => (
      Array.isArray(day?.tasks)
        ? day.tasks.map((task) => cleanText(task?.task)).filter(Boolean)
        : []
    )),
  );
  const nextCompleted = new Set();

  (Array.isArray(completed) ? completed : []).forEach((taskName) => {
    const cleanName = cleanText(taskName);
    const renamedTask = renameMap.get(cleanName);
    if (renamedTask) {
      nextCompleted.add(renamedTask);
      if (remainingNames.has(cleanName)) nextCompleted.add(cleanName);
      return;
    }
    if (removedNames.has(cleanName) && !remainingNames.has(cleanName)) return;
    nextCompleted.add(cleanName);
  });

  return [...nextCompleted];
}

export function reconcileSubjectSchedule(
  schedule = [],
  completed = [],
  previousSubject = {},
  nextSubject = {},
) {
  if (!Array.isArray(schedule) || schedule.length === 0) {
    return { changed: false, completed, schedule };
  }

  const desiredUnits = getSubjectStudyUnitRecords(nextSubject);
  const desiredByKey = new Map(desiredUnits.map((unit) => [unit.unitKey, unit]));
  const usedKeys = new Set();
  const renameMap = new Map();
  const removedNames = new Set();
  const targetLocations = [];

  schedule.forEach((day, dayIndex) => {
    const tasks = Array.isArray(day?.tasks) ? day.tasks : [];
    tasks.forEach((task, taskIndex) => {
      const inferredKey = inferUnitKey(task, previousSubject, nextSubject);
      if (!isSubjectTask(task, previousSubject, nextSubject, inferredKey)) return;
      targetLocations.push({ dayIndex, inferredKey, task, taskIndex });
    });
  });

  const replacements = new Map();
  const openLocations = [];

  targetLocations.forEach((location) => {
    const unit = desiredByKey.get(location.inferredKey);
    if (!unit || usedKeys.has(unit.unitKey)) {
      openLocations.push(location);
      return;
    }

    const generatedTask = createSubjectScheduleTask(nextSubject, unit, location.taskIndex);
    const replacement = {
      ...location.task,
      ...generatedTask,
      time: cleanText(location.task?.time) || generatedTask.time,
    };
    replacements.set(`${location.dayIndex}:${location.taskIndex}`, replacement);
    usedKeys.add(unit.unitKey);

    const previousName = cleanText(location.task?.task);
    if (previousName && previousName !== replacement.task) {
      renameMap.set(previousName, replacement.task);
      removedNames.add(previousName);
    }
  });

  const missingUnits = desiredUnits.filter((unit) => !usedKeys.has(unit.unitKey));
  openLocations.forEach((location) => {
    const unit = missingUnits.shift();
    const locationKey = `${location.dayIndex}:${location.taskIndex}`;
    const previousName = cleanText(location.task?.task);
    if (previousName) removedNames.add(previousName);

    if (!unit) {
      replacements.set(locationKey, null);
      return;
    }

    const generatedTask = createSubjectScheduleTask(nextSubject, unit, location.taskIndex);
    replacements.set(locationKey, {
      ...location.task,
      ...generatedTask,
      time: cleanText(location.task?.time) || generatedTask.time,
    });
  });

  const nextSchedule = schedule.map((day, dayIndex) => ({
    ...day,
    tasks: (Array.isArray(day?.tasks) ? day.tasks : []).flatMap((task, taskIndex) => {
      const locationKey = `${dayIndex}:${taskIndex}`;
      if (!replacements.has(locationKey)) return [task];
      const replacement = replacements.get(locationKey);
      return replacement ? [replacement] : [];
    }),
  }));

  while (missingUnits.length > 0 && nextSchedule.length > 0) {
    const studyDayIndexes = nextSchedule
      .map((day, dayIndex) => ({ dayIndex, taskCount: day.tasks.length }))
      .filter(({ taskCount }) => taskCount > 0);
    const candidates = studyDayIndexes.length
      ? studyDayIndexes
      : nextSchedule.map((day, dayIndex) => ({ dayIndex, taskCount: day.tasks.length }));
    candidates.sort((left, right) => left.taskCount - right.taskCount || left.dayIndex - right.dayIndex);
    const targetDay = nextSchedule[candidates[0].dayIndex];
    const unit = missingUnits.shift();
    targetDay.tasks.push(createSubjectScheduleTask(nextSubject, unit, targetDay.tasks.length));
  }

  const nextCompleted = migrateCompletions(completed, renameMap, removedNames, nextSchedule);
  const changed = JSON.stringify(nextSchedule) !== JSON.stringify(schedule)
    || JSON.stringify(nextCompleted) !== JSON.stringify(completed);

  return {
    changed,
    completed: changed ? nextCompleted : completed,
    schedule: changed ? nextSchedule : schedule,
  };
}

export function reconcileScheduleWithSubjects(
  schedule = [],
  completed = [],
  previousSubjects = [],
  nextSubjects = [],
) {
  const previousByName = new Map(
    previousSubjects.map((subject) => [normalizeLabel(subject?.name), subject]),
  );
  let nextSchedule = schedule;
  let nextCompleted = completed;
  let changed = false;

  nextSubjects.forEach((nextSubject) => {
    const previousSubject = previousByName.get(normalizeLabel(nextSubject?.name));
    if (!previousSubject || subjectSignature(previousSubject) === subjectSignature(nextSubject)) return;

    const result = reconcileSubjectSchedule(
      nextSchedule,
      nextCompleted,
      previousSubject,
      nextSubject,
    );
    if (!result.changed) return;
    changed = true;
    nextSchedule = result.schedule;
    nextCompleted = result.completed;
  });

  return {
    changed,
    completed: changed ? nextCompleted : completed,
    schedule: changed ? nextSchedule : schedule,
  };
}
