import {
  formatScheduleDayHeading,
  getScheduleDateKey,
  toLocalDateKey,
} from "./scheduleDates.js";

const LEARNING_UNIT_TYPES = new Set(["chapter", "topic", "subtopic"]);

function cleanText(value) {
  return String(value || "").trim();
}

function getProjectId(projectOrId) {
  if (typeof projectOrId === "string") return cleanText(projectOrId);
  return cleanText(projectOrId?.id || projectOrId?.projectId);
}

function getNodeId(nodeOrId) {
  if (typeof nodeOrId === "string") return cleanText(nodeOrId);
  return cleanText(nodeOrId?.id || nodeOrId?.nodeId);
}

function getNodeTitle(node = {}) {
  return cleanText(node?.title || node?.label || node?.name);
}

function getSubjectName(project = {}, node = {}) {
  return cleanText(
    node?.subjectName
    || project?.subjectName
    || project?.subject?.name
    || project?.subject,
  );
}

function getUnitType(node = {}) {
  const unitType = cleanText(node?.unitType || node?.type).toLowerCase();
  return LEARNING_UNIT_TYPES.has(unitType) ? unitType : "topic";
}

function isMatchingLearningTask(task, projectId, nodeId) {
  return Boolean(
    task
    && cleanText(task.sourceLearningProjectId) === projectId
    && cleanText(task.sourceLearningNodeId) === nodeId,
  );
}

function getTaskName(task) {
  return cleanText(task?.task);
}

function chooseUniqueTaskName(schedule, preferredName, projectId, nodeId) {
  const occupiedNames = new Set(
    schedule.flatMap((day) => (
      Array.isArray(day?.tasks)
        ? day.tasks
          .filter((task) => !isMatchingLearningTask(task, projectId, nodeId))
          .map(getTaskName)
          .filter(Boolean)
        : []
    )),
  );
  if (!occupiedNames.has(preferredName)) return preferredName;

  let duplicateNumber = 2;
  let candidate = `${preferredName} (${duplicateNumber})`;
  while (occupiedNames.has(candidate)) {
    duplicateNumber += 1;
    candidate = `${preferredName} (${duplicateNumber})`;
  }
  return candidate;
}

export function buildLearningPlannerTaskName(project = {}, node = {}) {
  const title = getNodeTitle(node);
  if (!title) return "";

  const subjectName = getSubjectName(project, node);
  return subjectName ? `${subjectName} - ${title}` : `Learn - ${title}`;
}

export function getLearningScheduleDateOptions(
  schedule = [],
  scheduleStartDate = "",
  today = new Date(),
) {
  const safeSchedule = Array.isArray(schedule) ? schedule : [];
  const todayKey = toLocalDateKey(today);
  const seenDates = new Set();

  return safeSchedule.flatMap((day, index) => {
    const dateKey = getScheduleDateKey(day, index, scheduleStartDate);
    if (!dateKey || seenDates.has(dateKey) || (todayKey && dateKey < todayKey)) {
      return [];
    }
    seenDates.add(dateKey);

    return [{
      dateKey,
      dayIndex: index,
      dayNumber: Number.parseInt(day?.day, 10) || index + 1,
      label: formatScheduleDayHeading(day, index, scheduleStartDate),
      taskCount: Array.isArray(day?.tasks) ? day.tasks.length : 0,
    }];
  });
}

export function findLearningPlannerTask(
  schedule = [],
  projectOrId = {},
  nodeOrId = {},
) {
  const projectId = getProjectId(projectOrId);
  const nodeId = getNodeId(nodeOrId);
  if (!projectId || !nodeId || !Array.isArray(schedule)) return null;

  for (let dayIndex = 0; dayIndex < schedule.length; dayIndex += 1) {
    const tasks = Array.isArray(schedule[dayIndex]?.tasks)
      ? schedule[dayIndex].tasks
      : [];
    const taskIndex = tasks.findIndex((task) => (
      isMatchingLearningTask(task, projectId, nodeId)
    ));
    if (taskIndex >= 0) {
      return {
        day: schedule[dayIndex],
        dayIndex,
        task: tasks[taskIndex],
        taskIndex,
      };
    }
  }
  return null;
}

export function upsertLearningPlannerTask(
  schedule = [],
  project = {},
  node = {},
  targetDateKey = "",
  scheduleStartDate = "",
  today = new Date(),
) {
  const projectId = getProjectId(project);
  const nodeId = getNodeId(node);
  const title = getNodeTitle(node);
  const preferredTaskName = buildLearningPlannerTaskName(project, node);
  const normalizedTargetDate = toLocalDateKey(targetDateKey);

  if (
    !Array.isArray(schedule)
    || !projectId
    || !nodeId
    || !title
    || !normalizedTargetDate
  ) {
    return null;
  }

  const targetDate = getLearningScheduleDateOptions(
    schedule,
    scheduleStartDate,
    today,
  ).find((option) => option.dateKey === normalizedTargetDate);
  if (!targetDate) return null;

  const nextSchedule = structuredClone(schedule);
  const existingLink = findLearningPlannerTask(nextSchedule, projectId, nodeId);
  const existingTask = existingLink?.task || {};
  const taskName = chooseUniqueTaskName(
    nextSchedule,
    preferredTaskName,
    projectId,
    nodeId,
  );
  const previousTaskName = getTaskName(existingTask);
  const unitType = getUnitType(node);
  const subjectName = getSubjectName(project, node);
  const chapterName = cleanText(
    node?.chapterName
    || node?.chapterTitle
    || node?.parentChapterTitle
    || (unitType === "chapter" ? title : ""),
  );

  if (existingLink) {
    nextSchedule[existingLink.dayIndex].tasks.splice(existingLink.taskIndex, 1);
  }
  if (!Array.isArray(nextSchedule[targetDate.dayIndex].tasks)) {
    nextSchedule[targetDate.dayIndex].tasks = [];
  }

  const task = {
    ...existingTask,
    id: cleanText(existingTask.id) || `learning-${projectId}-${nodeId}`,
    source: "learning",
    sourceLearningProjectId: projectId,
    sourceLearningNodeId: nodeId,
    subjectName,
    topic: title,
    task: taskName,
    time: cleanText(existingTask.time || node?.time) || "Morning",
    unitKey: `learning:${projectId}:${nodeId}`,
    unitType,
    ...(chapterName ? { chapterName } : {}),
  };
  nextSchedule[targetDate.dayIndex].tasks.push(task);

  return {
    dateKey: normalizedTargetDate,
    moved: Boolean(existingLink && existingLink.dayIndex !== targetDate.dayIndex),
    renamedFrom: previousTaskName && previousTaskName !== taskName
      ? previousTaskName
      : "",
    schedule: nextSchedule,
    targetDayIndex: targetDate.dayIndex,
    task,
  };
}
