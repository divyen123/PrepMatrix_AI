import {
  formatScheduleDayHeading,
  getScheduleDateKey,
  toLocalDateKey,
} from "./scheduleDates.js";

function cleanText(value) {
  return String(value || "").trim();
}

export function buildRevisionTask(note) {
  const topic = cleanText(note?.topic) || "Untitled";
  const legacyTopics = Array.isArray(note?.leftTopics)
    ? note.leftTopics.map(cleanText).filter(Boolean).slice(0, 3)
    : [];
  const legacySuffix = legacyTopics.length ? `: ${legacyTopics.join(", ")}` : "";
  return `Revise ${topic} doubt${legacySuffix}`;
}

function getTaskName(task) {
  return cleanText(task?.task);
}

function isTaskLinkedToNote(task, note) {
  if (!task || !note) return false;
  if (cleanText(task.sourceNoteId)) {
    return cleanText(task.sourceNoteId) === cleanText(note.id);
  }
  return Boolean(note.plannedTask && getTaskName(task) === cleanText(note.plannedTask));
}

export function findNotePlannerTask(schedule = [], note = {}) {
  for (let dayIndex = 0; dayIndex < schedule.length; dayIndex += 1) {
    const tasks = Array.isArray(schedule[dayIndex]?.tasks) ? schedule[dayIndex].tasks : [];
    for (let taskIndex = 0; taskIndex < tasks.length; taskIndex += 1) {
      if (isTaskLinkedToNote(tasks[taskIndex], note)) {
        return {
          day: schedule[dayIndex],
          dayIndex,
          task: tasks[taskIndex],
          taskIndex,
        };
      }
    }
  }
  return null;
}

export function getScheduleDateOptions(
  schedule = [],
  scheduleStartDate = "",
  today = new Date(),
) {
  const todayKey = toLocalDateKey(today);
  const seenDates = new Set();

  return schedule.flatMap((day, index) => {
    const dateKey = getScheduleDateKey(day, index, scheduleStartDate);
    if (!dateKey || seenDates.has(dateKey)) return [];
    seenDates.add(dateKey);

    return [{
      dateKey,
      dayIndex: index,
      dayNumber: Number.parseInt(day?.day, 10) || index + 1,
      isPast: Boolean(todayKey && dateKey < todayKey),
      label: formatScheduleDayHeading(day, index, scheduleStartDate),
      taskCount: Array.isArray(day?.tasks) ? day.tasks.length : 0,
    }];
  });
}

function addDuplicateSuffix(taskName, duplicateNumber) {
  const doubtIndex = taskName.toLowerCase().indexOf(" doubt");
  if (doubtIndex < 0) return `${taskName} (${duplicateNumber})`;
  return `${taskName.slice(0, doubtIndex)} (${duplicateNumber})${taskName.slice(doubtIndex)}`;
}

function chooseTaskName(schedule, note, existingLink) {
  if (existingLink?.task) return getTaskName(existingLink.task);

  const occupiedNames = new Set(
    schedule.flatMap((day) => (
      Array.isArray(day?.tasks)
        ? day.tasks
          .filter((task) => cleanText(task?.sourceNoteId) !== cleanText(note?.id))
          .map(getTaskName)
          .filter(Boolean)
        : []
    )),
  );
  const preferredName = cleanText(note?.plannedTask) || buildRevisionTask(note);
  if (!occupiedNames.has(preferredName)) return preferredName;

  const baseName = buildRevisionTask(note);
  let duplicateNumber = 2;
  let candidate = addDuplicateSuffix(baseName, duplicateNumber);
  while (occupiedNames.has(candidate)) {
    duplicateNumber += 1;
    candidate = addDuplicateSuffix(baseName, duplicateNumber);
  }
  return candidate;
}

export function upsertNotePlannerTask(
  schedule = [],
  note = {},
  targetDateKey = "",
  scheduleStartDate = "",
) {
  const normalizedTargetDate = toLocalDateKey(targetDateKey);
  const targetDayIndex = schedule.findIndex(
    (day, index) => getScheduleDateKey(day, index, scheduleStartDate) === normalizedTargetDate,
  );
  if (!normalizedTargetDate || targetDayIndex < 0) return null;

  const nextSchedule = structuredClone(schedule);
  const existingLink = findNotePlannerTask(nextSchedule, note);
  const taskName = chooseTaskName(nextSchedule, note, existingLink);
  const existingTask = existingLink?.task || {};
  const taskId = cleanText(existingTask.id) || `note-${cleanText(note.id)}`;

  if (existingLink) {
    nextSchedule[existingLink.dayIndex].tasks.splice(existingLink.taskIndex, 1);
  }

  if (!Array.isArray(nextSchedule[targetDayIndex].tasks)) {
    nextSchedule[targetDayIndex].tasks = [];
  }

  const task = {
    ...existingTask,
    id: taskId,
    source: "note",
    sourceNoteId: cleanText(note.id),
    task: taskName,
    time: cleanText(existingTask.time) || "Morning",
  };
  nextSchedule[targetDayIndex].tasks.push(task);

  return {
    dateKey: normalizedTargetDate,
    moved: Boolean(existingLink && existingLink.dayIndex !== targetDayIndex),
    schedule: nextSchedule,
    targetDayIndex,
    task,
  };
}

export function getNotePlannerState(
  note,
  schedule = [],
  completed = [],
  scheduleStartDate = "",
) {
  const link = findNotePlannerTask(schedule, note);
  const taskName = getTaskName(link?.task) || cleanText(note?.plannedTask);
  const isCompleted = Boolean(taskName && completed.includes(taskName));

  return {
    dateKey: link
      ? getScheduleDateKey(link.day, link.dayIndex, scheduleStartDate)
      : cleanText(note?.plannedDate),
    link,
    state: isCompleted ? "completed" : link ? "added" : "unscheduled",
    taskName,
  };
}

export function removeNotesFromPlanner(schedule = [], notes = []) {
  const noteIds = new Set(notes.map((note) => cleanText(note?.id)).filter(Boolean));
  const legacyTaskNames = new Set(
    notes.map((note) => cleanText(note?.plannedTask)).filter(Boolean),
  );
  const removedTaskNames = [];
  let changed = false;

  const nextSchedule = schedule.map((day) => {
    const tasks = Array.isArray(day?.tasks) ? day.tasks : [];
    const nextTasks = tasks.filter((task) => {
      const sourceNoteId = cleanText(task?.sourceNoteId);
      const taskName = getTaskName(task);
      const shouldRemove = sourceNoteId
        ? noteIds.has(sourceNoteId)
        : legacyTaskNames.has(taskName);

      if (shouldRemove) {
        changed = true;
        if (taskName) removedTaskNames.push(taskName);
      }
      return !shouldRemove;
    });
    return nextTasks.length === tasks.length ? day : { ...day, tasks: nextTasks };
  });

  return {
    changed,
    removedTaskNames: [...new Set(removedTaskNames)],
    schedule: changed ? nextSchedule : schedule,
  };
}

export function pruneRemovedTaskCompletions(
  completed = [],
  removedTaskNames = [],
  remainingSchedule = [],
) {
  const removed = new Set(removedTaskNames);
  if (removed.size === 0) return completed;

  const remainingNames = new Set(
    remainingSchedule.flatMap((day) => (
      Array.isArray(day?.tasks) ? day.tasks.map(getTaskName).filter(Boolean) : []
    )),
  );
  return completed.filter((taskName) => !removed.has(taskName) || remainingNames.has(taskName));
}
