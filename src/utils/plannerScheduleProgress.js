import { getScheduleDateKey, toLocalDateKey } from "./scheduleDates.js";

export const PLANNER_RECHECK_PENDING_FIELD = "recheckPending";
export const MEMORY_REVIEW_RECHECK_REVISION_FIELD = "memoryReviewRecheckRevision";
export const PLANNER_QUIZ_UNLOCK_FIELD = "plannerQuizUnlock";
export const PLANNER_UNLOCK_QUIZ_QUESTION_COUNT = 10;
export const PLANNER_UNLOCK_PASS_PERCENTAGE = 80;

function getTask(schedule, dayIndex, taskIndex) {
  if (!Array.isArray(schedule)) return null;
  const tasks = schedule[dayIndex]?.tasks;
  if (!Array.isArray(tasks)) return null;
  const task = tasks[taskIndex];
  return task && typeof task === "object" ? task : null;
}

function getTaskName(task) {
  if (typeof task?.task !== "string" || !task.task.trim()) return "";
  return task.task;
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function completionKey(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return cleanText(String(value.taskId ?? value.id ?? value.task ?? value.taskName ?? ""));
  }
  return cleanText(String(value ?? ""));
}

function canonicalPlannerTaskId(value) {
  return cleanText(String(value ?? ""))
    .replace(/^memory-decay-/u, "memory-review-");
}

export function getPlannerSessionLabel(value) {
  const label = cleanText(String(value || ""));
  if (!label) return "";

  return label
    .replace(/\s*[·•]\s*\d+\s*(?:min(?:ute)?s?|m)\s*$/iu, "")
    .trim();
}

function getPlannerTaskUnitLabel(task) {
  const explicitTopic = cleanText(task?.topic);
  if (explicitTopic) return explicitTopic;

  const taskName = getTaskName(task);
  const subjectName = cleanText(task?.subjectName);
  if (!taskName) return "";

  if (subjectName) {
    const prefix = subjectName + " - ";
    return taskName.toLocaleLowerCase().startsWith(prefix.toLocaleLowerCase())
      ? taskName.slice(prefix.length).trim()
      : taskName;
  }

  const separatorIndex = taskName.lastIndexOf(" - ");
  const legacyUnitLabel = separatorIndex >= 0
    ? taskName.slice(separatorIndex + 3).trim()
    : "";
  return isGenericPlannerUnitLabel(legacyUnitLabel)
    ? legacyUnitLabel
    : taskName;
}

function isGenericPlannerUnitLabel(value) {
  const normalized = cleanText(value)
    .replace(/\s*[·•]\s*(?:practice|revision|coverage)\s*$/iu, "")
    .trim();

  return /^(?:chapter|unit|module|lesson|topic|section|part)\s*(?:(?:number|no\.?|#)\s*)?(?:\d+[a-z]?|[ivxlcdm]+)$/iu.test(normalized);
}

function getPlannerQuizTopicRecord(task) {
  const taskName = getTaskName(task);
  const unitLabel = getPlannerTaskUnitLabel(task);
  const isGeneric = isGenericPlannerUnitLabel(unitLabel);
  const legacySeparatorIndex = taskName.lastIndexOf(" - ");
  const subjectName = cleanText(task?.subjectName)
    || (
      isGeneric && legacySeparatorIndex > 0
        ? taskName.slice(0, legacySeparatorIndex).trim()
        : ""
    );

  return {
    isGeneric,
    label: isGeneric && subjectName
      ? subjectName + " — " + unitLabel
      : unitLabel || getTaskName(task),
  };
}

function getStudyTasks(day) {
  return Array.isArray(day?.tasks)
    ? day.tasks.filter((task) => getTaskName(task))
    : [];
}

function stablePlannerSignature(value) {
  let hash = 2166136261;
  const source = String(value || "");

  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return "v1-" + (hash >>> 0).toString(36);
}

function updateTask(schedule, dayIndex, taskIndex, update) {
  const task = getTask(schedule, dayIndex, taskIndex);
  if (!task || typeof update !== "function") return schedule;

  const nextTask = update(task);
  if (!nextTask || nextTask === task) return schedule;

  return schedule.map((day, currentDayIndex) => {
    if (currentDayIndex !== dayIndex) return day;
    return {
      ...day,
      tasks: day.tasks.map((candidate, currentTaskIndex) => (
        currentTaskIndex === taskIndex ? nextTask : candidate
      )),
    };
  });
}

export function isPlannerTaskCompleted(task, completed = []) {
  const taskName = cleanText(getTaskName(task));
  const taskId = canonicalPlannerTaskId(task?.id);
  if ((!taskName && !taskId) || !Array.isArray(completed)) return false;
  return completed.some((item) => {
    const key = completionKey(item);
    return Boolean(
      key
      && (
        key === taskName
        || (taskId && canonicalPlannerTaskId(key) === taskId)
      )
    );
  });
}

export function isPlannerTaskRecheckPending(task) {
  return task?.[PLANNER_RECHECK_PENDING_FIELD] === true;
}

export function isPlannerTaskPending(task, completed = []) {
  return !isPlannerTaskCompleted(task, completed) || isPlannerTaskRecheckPending(task);
}

export function isPlannerDayCompleted(day, completed = []) {
  const tasks = getStudyTasks(day);
  return tasks.length > 0 && tasks.every((task) => isPlannerTaskCompleted(task, completed));
}

export function isPlannerRevisionDay(day) {
  return getStudyTasks(day).length === 0;
}

export function getPreviousPlannerStudyDayIndex(schedule, targetDayIndex) {
  if (!Array.isArray(schedule)) return -1;
  const safeTargetIndex = Math.min(
    schedule.length,
    Math.max(0, Number.parseInt(targetDayIndex, 10) || 0),
  );

  for (let index = safeTargetIndex - 1; index >= 0; index -= 1) {
    if (!isPlannerRevisionDay(schedule[index])) return index;
  }

  return -1;
}

export function getPlannerDayIdentity(day, dayIndex = 0, scheduleStartDate = "") {
  const safeDayIndex = Math.max(0, Number.parseInt(dayIndex, 10) || 0);
  const dateKey = getScheduleDateKey(day, safeDayIndex, scheduleStartDate);
  if (dateKey) return "date:" + dateKey;

  const dayNumber = Number.parseInt(day?.day, 10);
  return "day:" + (
    Number.isFinite(dayNumber) && dayNumber > 0
      ? dayNumber
      : safeDayIndex + 1
  );
}

export function getPlannerStudyDaySignature(
  day,
  dayIndex = 0,
  scheduleStartDate = "",
) {
  const tasks = getStudyTasks(day).map((task) => ({
    source: cleanText(task.source),
    subjectName: cleanText(task.subjectName),
    task: getTaskName(task),
    topic: cleanText(task.topic),
    unitKey: cleanText(task.unitKey),
  }));

  return stablePlannerSignature(JSON.stringify({
    dayKey: getPlannerDayIdentity(day, dayIndex, scheduleStartDate),
    tasks,
  }));
}

export function getPlannerUnlockQuizContext(
  schedule,
  targetDayIndex,
  scheduleStartDate = "",
) {
  if (!Array.isArray(schedule)) return null;
  const safeTargetIndex = Number.parseInt(targetDayIndex, 10);
  if (
    !Number.isFinite(safeTargetIndex)
    || safeTargetIndex < 0
    || safeTargetIndex >= schedule.length
  ) {
    return null;
  }

  const sourceDayIndex = getPreviousPlannerStudyDayIndex(schedule, safeTargetIndex);
  if (sourceDayIndex < 0) return null;

  const sourceDay = schedule[sourceDayIndex];
  const targetDay = schedule[safeTargetIndex];
  const sourceTasks = getStudyTasks(sourceDay);
  const subjects = [...new Set(sourceTasks
    .map((task) => cleanText(task.subjectName))
    .filter(Boolean))];
  const topicRecords = sourceTasks.map(getPlannerQuizTopicRecord);
  const topicKeys = new Set();
  const topics = topicRecords
    .map(({ label }) => cleanText(label))
    .filter((label) => {
      const key = label.toLocaleLowerCase();
      if (!key || topicKeys.has(key)) return false;
      topicKeys.add(key);
      return true;
    })
    .slice(0, 12);
  const genericTopics = topicRecords
    .filter(({ isGeneric }) => isGeneric)
    .map(({ label }) => label)
    .filter(Boolean);
  const subjectName = subjects.length === 1
    ? subjects[0]
    : subjects.join(", ") || "Mixed study topics";
  const topic = topics.join("; ").slice(0, 900);

  return {
    sourceDayIndex,
    sourceDayKey: getPlannerDayIdentity(sourceDay, sourceDayIndex, scheduleStartDate),
    sourceDayNumber: Number.parseInt(sourceDay?.day, 10) || sourceDayIndex + 1,
    sourceTaskSignature: getPlannerStudyDaySignature(
      sourceDay,
      sourceDayIndex,
      scheduleStartDate,
    ),
    genericTopics,
    needsTopicDetails: genericTopics.length > 0,
    subjectName,
    subjects,
    targetDayIndex: safeTargetIndex,
    targetDayKey: getPlannerDayIdentity(targetDay, safeTargetIndex, scheduleStartDate),
    targetDayNumber: Number.parseInt(targetDay?.day, 10) || safeTargetIndex + 1,
    topic,
    topics,
  };
}

export function isPlannerDayQuizUnlocked(day, context) {
  const proof = day?.[PLANNER_QUIZ_UNLOCK_FIELD];
  if (!proof || typeof proof !== "object" || Array.isArray(proof) || !context) {
    return false;
  }

  const score = Number(proof.score);
  const total = Number(proof.total);
  const percentage = total > 0 ? Math.round((score / total) * 100) : 0;

  return proof.version === 1
    && total === PLANNER_UNLOCK_QUIZ_QUESTION_COUNT
    && score >= (PLANNER_UNLOCK_PASS_PERCENTAGE / 100) * total
    && percentage >= PLANNER_UNLOCK_PASS_PERCENTAGE
    && proof.sourceDayKey === context.sourceDayKey
    && proof.sourceTaskSignature === context.sourceTaskSignature
    && proof.targetDayKey === context.targetDayKey;
}

/**
 * The complete plan remains visible, but dated days unlock only when their
 * local calendar date arrives. Day 1 is intentionally available immediately,
 * including schedules generated after the evening cutoff for the next day.
 */
export function getPlannerDayAvailability(
  day,
  dayIndex = 0,
  scheduleStartDate = "",
  today = new Date(),
) {
  const safeDayIndex = Math.max(0, Number.parseInt(dayIndex, 10) || 0);
  const dateKey = getScheduleDateKey(day, safeDayIndex, scheduleStartDate);
  const todayKey = toLocalDateKey(today);
  const isFirstDay = safeDayIndex === 0;
  const hasUsableDate = Boolean(dateKey && todayKey);
  const isUnlocked = isFirstDay || (hasUsableDate && dateKey <= todayKey);

  return {
    dateKey,
    isFirstDay,
    isLocked: !isUnlocked,
    isUnlocked,
  };
}

/**
 * Combines the normal calendar gate with optional early progression. Study
 * days may be unlocked early by passing the prior study day's quiz. Empty
 * revision days never require a quiz and become available once the nearest
 * prior study day is complete.
 */
export function getPlannerDayProgression(
  schedule,
  completed,
  dayIndex = 0,
  scheduleStartDate = "",
  today = new Date(),
) {
  const safeDayIndex = Math.max(0, Number.parseInt(dayIndex, 10) || 0);
  const day = Array.isArray(schedule) ? schedule[safeDayIndex] : null;
  const availability = getPlannerDayAvailability(
    day,
    safeDayIndex,
    scheduleStartDate,
    today,
  );
  const isRevisionDay = isPlannerRevisionDay(day);
  const quizContext = getPlannerUnlockQuizContext(
    schedule,
    safeDayIndex,
    scheduleStartDate,
  );
  const sourceDayCompleted = Boolean(
    quizContext
    && isPlannerDayCompleted(schedule[quizContext.sourceDayIndex], completed),
  );
  const isQuizUnlocked = !isRevisionDay
    && isPlannerDayQuizUnlocked(day, quizContext);
  const isRevisionAutoUnlocked = isRevisionDay
    && sourceDayCompleted;
  const isUnlocked = availability.isUnlocked
    || isQuizUnlocked
    || isRevisionAutoUnlocked;

  return {
    ...availability,
    canAttemptUnlockQuiz: !isUnlocked
      && !isRevisionDay
      && Boolean(quizContext)
      && sourceDayCompleted,
    isLocked: !isUnlocked,
    isQuizUnlocked,
    isRevisionAutoUnlocked,
    isRevisionDay,
    isUnlocked,
    quizContext,
    sourceDayCompleted,
    sourceDayIndex: quizContext?.sourceDayIndex ?? -1,
  };
}

export function getPlannerNextUnlockCandidateIndex(
  schedule,
  completed,
  scheduleStartDate = "",
  today = new Date(),
) {
  if (!Array.isArray(schedule)) return -1;

  for (let dayIndex = 1; dayIndex < schedule.length; dayIndex += 1) {
    const progression = getPlannerDayProgression(
      schedule,
      completed,
      dayIndex,
      scheduleStartDate,
      today,
    );

    if (progression.isRevisionDay || !progression.isLocked) continue;

    return progression.canAttemptUnlockQuiz ? dayIndex : -1;
  }

  return -1;
}

export function completePlannerUnlockQuiz(
  schedule,
  completed,
  targetDayIndex,
  result = {},
  {
    now = new Date(),
    scheduleStartDate = "",
    today = new Date(),
  } = {},
) {
  const score = Number(result.score);
  const total = Number(result.total);
  const percentage = total > 0 ? Math.round((score / total) * 100) : 0;
  const progression = getPlannerDayProgression(
    schedule,
    completed,
    targetDayIndex,
    scheduleStartDate,
    today,
  );

  if (
    !Number.isInteger(score)
    || !Number.isInteger(total)
    || total !== PLANNER_UNLOCK_QUIZ_QUESTION_COUNT
    || score < 0
    || score > total
  ) {
    return {
      passed: false,
      percentage: 0,
      reason: "invalid-result",
      schedule,
      score: 0,
      total: PLANNER_UNLOCK_QUIZ_QUESTION_COUNT,
      unlocked: false,
    };
  }

  if (!progression.canAttemptUnlockQuiz || !progression.quizContext) {
    return {
      passed: false,
      percentage,
      reason: "not-eligible",
      schedule,
      score,
      total,
      unlocked: false,
    };
  }

  const passed = percentage >= PLANNER_UNLOCK_PASS_PERCENTAGE;
  if (!passed) {
    return {
      passed,
      percentage,
      reason: "score-below-threshold",
      schedule,
      score,
      total,
      unlocked: false,
    };
  }

  const passedAtDate = now instanceof Date ? now : new Date(now);
  const passedAt = Number.isFinite(passedAtDate.getTime())
    ? passedAtDate.toISOString()
    : new Date().toISOString();
  const proof = {
    passedAt,
    score,
    sourceDayKey: progression.quizContext.sourceDayKey,
    sourceTaskSignature: progression.quizContext.sourceTaskSignature,
    targetDayKey: progression.quizContext.targetDayKey,
    total,
    version: 1,
  };
  const nextSchedule = schedule.map((day, index) => (
    index === progression.quizContext.targetDayIndex
      ? { ...day, [PLANNER_QUIZ_UNLOCK_FIELD]: proof }
      : day
  ));

  return {
    passed,
    percentage,
    proof,
    reason: "passed",
    schedule: nextSchedule,
    score,
    total,
    unlocked: true,
  };
}

export function reopenPlannerTask(schedule, completed, dayIndex, taskIndex) {
  const task = getTask(schedule, dayIndex, taskIndex);
  if (
    !isPlannerTaskCompleted(task, completed)
    || isPlannerTaskRecheckPending(task)
  ) {
    return schedule;
  }

  return updateTask(schedule, dayIndex, taskIndex, (currentTask) => {
    const reopenedTask = {
      ...currentTask,
      [PLANNER_RECHECK_PENDING_FIELD]: true,
    };
    if (currentTask.source === "memory_review" || currentTask.source === "memory-decay") {
      const previousRevision = Number.parseInt(
        currentTask[MEMORY_REVIEW_RECHECK_REVISION_FIELD],
        10,
      );
      reopenedTask[MEMORY_REVIEW_RECHECK_REVISION_FIELD] = Math.min(
        Number.isInteger(previousRevision) && previousRevision > 0 ? previousRevision + 1 : 1,
        1_000_000,
      );
    }
    return reopenedTask;
  });
}

/**
 * Completes a task without ever removing historical completion. A repeated
 * completion only clears its per-occurrence recheck flag, keeping analytics
 * and eligibility counts stable and preventing duplicate completion entries.
 */
export function completePlannerTask(schedule, completed, dayIndex, taskIndex) {
  const safeCompleted = Array.isArray(completed) ? completed : [];
  const task = getTask(schedule, dayIndex, taskIndex);
  const taskName = getTaskName(task);

  if (!taskName) {
    return { completed: safeCompleted, schedule };
  }

  if (isPlannerTaskRecheckPending(task)) {
    const nextSchedule = updateTask(schedule, dayIndex, taskIndex, (currentTask) => {
      const nextTask = { ...currentTask };
      delete nextTask[PLANNER_RECHECK_PENDING_FIELD];
      return nextTask;
    });

    return { completed: safeCompleted, schedule: nextSchedule };
  }

  if (isPlannerTaskCompleted(task, safeCompleted)) {
    return { completed: safeCompleted, schedule };
  }

  return {
    completed: [...safeCompleted, taskName],
    schedule,
  };
}

export function clearPlannerScheduleState(state = {}) {
  return {
    ...state,
    completed: [],
    schedule: [],
    scheduleStartDate: null,
  };
}
