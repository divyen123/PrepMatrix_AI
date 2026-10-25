import {
  PLANNER_RECHECK_PENDING_FIELD,
  PLANNER_QUIZ_UNLOCK_FIELD,
  getPlannerDayIdentity,
  isPlannerTaskCompleted,
} from "./plannerScheduleProgress.js";
import { getSubjectStudyUnitRecords } from "./subjectPlanning.js";

export const PLANNER_SCHEDULE_REORDER_MODES = Object.freeze({
  PRIORITY: "priority",
  SEQUENCE: "sequence",
});

const DIFFICULTY_RANK = Object.freeze({
  hard: 0,
  medium: 1,
  easy: 2,
});

const DIFFICULTY_RANK_MEDIUM = DIFFICULTY_RANK.medium;

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedKey(value) {
  return cleanText(value).toLocaleLowerCase();
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function isTask(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getProtectedUnlockSourceDayIndexes(schedule, scheduleStartDate) {
  const protectedDayKeys = new Set();

  schedule.forEach((day) => {
    const proof = day?.[PLANNER_QUIZ_UNLOCK_FIELD];
    const sourceDayKey = cleanText(proof?.sourceDayKey);
    if (sourceDayKey) protectedDayKeys.add(sourceDayKey);
  });

  if (protectedDayKeys.size === 0) return new Set();

  return new Set(
    schedule.flatMap((day, dayIndex) => (
      protectedDayKeys.has(getPlannerDayIdentity(day, dayIndex, scheduleStartDate))
        ? [dayIndex]
        : []
    )),
  );
}

function buildSubjectOrder(subjects) {
  const byName = new Map();

  safeArray(subjects).forEach((subject, subjectIndex) => {
    if (!isTask(subject)) return;

    const subjectName = normalizedKey(subject.name);
    if (!subjectName || byName.has(subjectName)) return;

    const unitOrder = new Map();
    const unitLabelOrder = new Map();
    getSubjectStudyUnitRecords(subject).forEach((unit, unitIndex) => {
      const unitKey = normalizedKey(unit?.unitKey);
      if (unitKey && !unitOrder.has(unitKey)) unitOrder.set(unitKey, unitIndex);

      const unitLabel = normalizedKey(unit?.label);
      const unitType = normalizedKey(unit?.unitType);
      if (unitLabel && unitType) {
        unitLabelOrder.set(unitType + ":" + unitLabel, unitIndex);
      }
    });

    const difficulty = normalizedKey(subject.difficulty);
    byName.set(subjectName, {
      difficultyRank: DIFFICULTY_RANK[difficulty] ?? DIFFICULTY_RANK_MEDIUM,
      subjectIndex,
      unitLabelOrder,
      unitOrder,
    });
  });

  return byName;
}

function getTaskUnitIndex(task, subjectOrder) {
  const unitKey = normalizedKey(task.unitKey);
  if (unitKey && subjectOrder.unitOrder.has(unitKey)) {
    return subjectOrder.unitOrder.get(unitKey);
  }

  const unitType = normalizedKey(task.unitType);
  const topic = normalizedKey(task.topic);
  const labelKey = unitType && topic ? unitType + ":" + topic : "";
  if (labelKey && subjectOrder.unitLabelOrder.has(labelKey)) {
    return subjectOrder.unitLabelOrder.get(labelKey);
  }

  return null;
}

function getReorderableTaskEntry(
  task,
  dayIndex,
  taskIndex,
  completed,
  subjectOrderByName,
  protectedUnlockSourceDayIndexes,
) {
  if (
    protectedUnlockSourceDayIndexes.has(dayIndex)
    || !isTask(task)
    || task.source !== "subject"
    || !cleanText(task.task)
    || task[PLANNER_RECHECK_PENDING_FIELD] === true
    || isPlannerTaskCompleted(task, completed)
  ) {
    return null;
  }

  const subjectOrder = subjectOrderByName.get(normalizedKey(task.subjectName));
  if (!subjectOrder) return null;

  const unitIndex = getTaskUnitIndex(task, subjectOrder);
  if (unitIndex === null) return null;

  return {
    dayIndex,
    difficultyRank: subjectOrder.difficultyRank,
    originalIndex: dayIndex * 1_000_000 + taskIndex,
    subjectIndex: subjectOrder.subjectIndex,
    task,
    taskIndex,
    unitIndex,
  };
}

function compareSequence(left, right) {
  return left.subjectIndex - right.subjectIndex
    || left.unitIndex - right.unitIndex
    || left.originalIndex - right.originalIndex;
}

function comparePriority(left, right) {
  return left.difficultyRank - right.difficultyRank
    || compareSequence(left, right);
}

function withDestinationSlot(task, destination) {
  const destinationTask = destination.task;
  let nextTask = task;

  ["time", "durationMinutes"].forEach((field) => {
    const taskHasField = Object.prototype.hasOwnProperty.call(task, field);
    const destinationHasField = Object.prototype.hasOwnProperty.call(destinationTask, field);
    const isAlreadyInDestinationSlot = taskHasField === destinationHasField
      && (!taskHasField || Object.is(task[field], destinationTask[field]));
    if (isAlreadyInDestinationSlot) return;

    if (nextTask === task) nextTask = { ...task };
    if (destinationHasField) nextTask[field] = destinationTask[field];
    else delete nextTask[field];
  });

  return nextTask;
}

/**
 * Reorders only unfinished generated subject tasks. Every other task and all
 * day-level data remain in the exact same position, which keeps completion,
 * memory-review, and quiz-unlock semantics stable.
 */
export function reorderPlannerSchedule(
  schedule = [],
  completed = [],
  subjects = [],
  {
    mode = PLANNER_SCHEDULE_REORDER_MODES.SEQUENCE,
    scheduleStartDate = "",
  } = {},
) {
  if (!Array.isArray(schedule) || schedule.length === 0) {
    return { changed: false, movedTaskCount: 0, schedule };
  }

  const safeCompleted = safeArray(completed);
  const subjectOrderByName = buildSubjectOrder(subjects);
  if (subjectOrderByName.size === 0) {
    return { changed: false, movedTaskCount: 0, schedule };
  }

  const protectedUnlockSourceDayIndexes = getProtectedUnlockSourceDayIndexes(
    schedule,
    scheduleStartDate,
  );
  const eligibleEntries = [];

  schedule.forEach((day, dayIndex) => {
    safeArray(day?.tasks).forEach((task, taskIndex) => {
      const entry = getReorderableTaskEntry(
        task,
        dayIndex,
        taskIndex,
        safeCompleted,
        subjectOrderByName,
        protectedUnlockSourceDayIndexes,
      );
      if (entry) eligibleEntries.push(entry);
    });
  });

  if (eligibleEntries.length < 2) {
    return { changed: false, movedTaskCount: 0, schedule };
  }

  const sortedEntries = [...eligibleEntries].sort(
    mode === PLANNER_SCHEDULE_REORDER_MODES.PRIORITY
      ? comparePriority
      : compareSequence,
  );
  const nextTasksByPosition = new Map();
  let movedTaskCount = 0;

  eligibleEntries.forEach((destination, index) => {
    const source = sortedEntries[index];
    const nextTask = withDestinationSlot(source.task, destination);
    nextTasksByPosition.set(destination.dayIndex + ":" + destination.taskIndex, nextTask);
    if (nextTask !== destination.task) movedTaskCount += 1;
  });

  if (movedTaskCount === 0) {
    return { changed: false, movedTaskCount: 0, schedule };
  }

  const nextSchedule = schedule.map((day, dayIndex) => {
    const tasks = safeArray(day?.tasks);
    let dayChanged = false;
    const nextTasks = tasks.map((task, taskIndex) => {
      const nextTask = nextTasksByPosition.get(dayIndex + ":" + taskIndex);
      if (!nextTask || nextTask === task) return task;
      dayChanged = true;
      return nextTask;
    });

    return dayChanged ? { ...day, tasks: nextTasks } : day;
  });

  return {
    changed: true,
    movedTaskCount,
    schedule: nextSchedule,
  };
}
