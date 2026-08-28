import { getScheduleDateKey, toLocalDateKey } from "./scheduleDates.js";
import {
  MEMORY_REVIEW_DISMISSALS_FIELD,
  buildPredictiveMemoryMicroQuiz,
  injectPredictiveMemoryReviews,
} from "./learningMemoryPlanner.js";
import { applyPredictiveMemoryQuizResult } from "./learningMemoryResults.js";
import {
  MEMORY_REVIEW_RECHECK_REVISION_FIELD,
  PLANNER_RECHECK_PENDING_FIELD,
  isPlannerTaskRecheckPending,
} from "./plannerScheduleProgress.js";

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asList(value) {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function cleanText(value, maximum = 800) {
  return String(value ?? "").replace(/\s+/gu, " ").trim().slice(0, maximum);
}

function stableHash(value) {
  let hash = 2_166_136_261;
  for (const character of String(value ?? "")) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}

function normalizedIso(value) {
  const parsed = new Date(value || new Date());
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : "";
}

function taskNotebookId(task = {}) {
  return cleanText(
    task.notebookId ?? task.sourceLearningNotebookId ?? task.sourceLearningProjectId,
    180,
  );
}

function taskNodeId(task = {}) {
  return cleanText(task.nodeId ?? task.sourceLearningNodeId, 180);
}

function canonicalMemoryReviewTaskId(value) {
  return cleanText(value, 220).replace(/^memory-decay-/u, "memory-review-");
}

function canonicalMemoryReviewUnitKey(value) {
  return cleanText(value, 520).replace(/^memory-decay:/u, "memory-review:");
}

function findNotebook(notebooks, notebookId) {
  return asList(notebooks).find((notebook) => (
    cleanText(notebook?.id ?? notebook?._id, 180) === notebookId
  )) || null;
}

function findCandidate(candidates, task) {
  const notebookId = taskNotebookId(task);
  const nodeId = taskNodeId(task);
  return asList(candidates).find((candidate) => (
    cleanText(candidate?.notebookId, 180) === notebookId
    && cleanText(candidate?.nodeId ?? candidate?.id, 180) === nodeId
  )) || null;
}

function completionKey(value) {
  if (value && typeof value === "object") {
    return cleanText(value.taskId ?? value.id ?? value.task ?? value.taskName, 500);
  }
  return cleanText(value, 500);
}

function scheduleTaskIds(scheduleValue) {
  return new Set(asList(scheduleValue).flatMap((day) => (
    asList(day?.tasks).map((task) => canonicalMemoryReviewTaskId(task?.id)).filter(Boolean)
  )));
}

function isScheduledMemoryReview(taskValue = {}) {
  const source = asObject(taskValue).source;
  return source === "memory_review" || source === "memory-decay";
}

function memoryReviewTaskKey(taskValue = {}) {
  const task = asObject(taskValue);
  const taskId = canonicalMemoryReviewTaskId(task.id);
  if (taskId) return `id:${taskId}`;
  const unitKey = canonicalMemoryReviewUnitKey(task.unitKey);
  if (unitKey) return `unit:${unitKey}`;
  const notebookId = taskNotebookId(task);
  const nodeId = taskNodeId(task);
  const occurrence = cleanText(task.dateKey ?? task.dueAt, 120);
  if (notebookId && nodeId) return `node:${notebookId}:${nodeId}:${occurrence}`;
  return `task:${cleanText(task.task, 500)}`;
}

function uniqueMemoryReviewTasks(tasksValue = []) {
  const seen = new Set();
  return asList(tasksValue).filter((task) => {
    if (!isScheduledMemoryReview(task)) return false;
    const key = memoryReviewTaskKey(task);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function scheduledCandidate(taskValue, notebookValue) {
  const task = asObject(taskValue);
  const notebook = asObject(notebookValue);
  const notebookId = taskNotebookId(task)
    || cleanText(notebook.id ?? notebook._id, 180);
  const nodeId = taskNodeId(task);
  if (!notebookId || !nodeId) return null;
  const taskName = cleanText(task.task, 500);
  const separatorIndex = taskName.lastIndexOf(" - ");
  const title = cleanText(
    task.topic
      ?? task.title
      ?? (separatorIndex >= 0 ? taskName.slice(separatorIndex + 3) : taskName),
    180,
  );
  const dueAt = cleanText(task.dueAt, 80);

  return {
    id: `${notebookId}:${nodeId}`,
    notebookId,
    nodeId,
    nodeType: cleanText(task.unitType, 80) || "concept",
    subjectName: cleanText(task.subjectName ?? notebook.subjectName, 160) || "General study",
    chapterTitle: cleanText(task.chapterName, 180),
    title: title || "Memory review",
    dueAt,
    dueDateKey: toLocalDateKey(task.dateKey ?? dueAt),
    predictedRecall: Number(task.predictedRecall) || 0,
    targetRecall: Number(task.targetRecall) || undefined,
    reason: "manual-recheck",
  };
}

function recheckRevision(taskValue = {}) {
  const revision = Number.parseInt(
    asObject(taskValue)[MEMORY_REVIEW_RECHECK_REVISION_FIELD],
    10,
  );
  return Number.isInteger(revision) && revision > 0 ? revision : 0;
}

function sameMemoryReviewTask(leftValue, rightValue) {
  const left = asObject(leftValue);
  const right = asObject(rightValue);
  const leftId = canonicalMemoryReviewTaskId(left.id);
  const rightId = canonicalMemoryReviewTaskId(right.id);
  if (leftId || rightId) return Boolean(leftId && rightId && leftId === rightId);
  const leftUnitKey = canonicalMemoryReviewUnitKey(left.unitKey);
  const rightUnitKey = canonicalMemoryReviewUnitKey(right.unitKey);
  if (leftUnitKey || rightUnitKey) {
    return Boolean(leftUnitKey && rightUnitKey && leftUnitKey === rightUnitKey);
  }
  const leftOccurrence = cleanText(left.dateKey ?? left.dueAt, 120);
  const rightOccurrence = cleanText(right.dateKey ?? right.dueAt, 120);
  return Boolean(
    taskNotebookId(left)
    && taskNotebookId(left) === taskNotebookId(right)
    && taskNodeId(left)
    && taskNodeId(left) === taskNodeId(right)
    && cleanText(left.task, 500) === cleanText(right.task, 500)
    && (
      (!leftOccurrence && !rightOccurrence)
      || (leftOccurrence && rightOccurrence && leftOccurrence === rightOccurrence)
    )
  );
}

/**
 * Reads both the current Planner text contract and an ID-aware completion
 * contract. ID values are exact, so two tasks with the same title stay distinct.
 */
export function isMemoryReviewTaskCompleted(completedValue, taskValue = {}) {
  const task = asObject(taskValue);
  const taskId = canonicalMemoryReviewTaskId(task.id);
  const taskText = cleanText(task.task, 500);
  return asList(completedValue).some((item) => {
    const key = completionKey(item);
    return Boolean(key) && (
      canonicalMemoryReviewTaskId(key) === taskId
      || key === taskText
    );
  });
}

export function isMemoryReviewTaskPending(completedValue, taskValue = {}) {
  return !isMemoryReviewTaskCompleted(completedValue, taskValue)
    || isPlannerTaskRecheckPending(taskValue);
}

/** Clears only the submitted memory-review occurrence after its save succeeds. */
export function clearMemoryReviewTaskRecheck(scheduleValue, taskValue = {}) {
  const schedule = Array.isArray(scheduleValue) ? scheduleValue : [];
  const targetTask = asObject(taskValue);
  const targetRevision = recheckRevision(targetTask);
  const matches = [];
  schedule.forEach((day, dayIndex) => {
    asList(day?.tasks).forEach((task, taskIndex) => {
      if (
        isScheduledMemoryReview(task)
        && isPlannerTaskRecheckPending(task)
        && sameMemoryReviewTask(task, targetTask)
        && (targetRevision === 0 || recheckRevision(task) === targetRevision)
      ) {
        matches.push({ dayIndex, taskIndex });
      }
    });
  });
  if (matches.length !== 1) return schedule;

  const [{ dayIndex, taskIndex }] = matches;
  return schedule.map((day, currentDayIndex) => {
    if (currentDayIndex !== dayIndex) return day;
    return {
      ...day,
      tasks: day.tasks.map((task, currentTaskIndex) => {
        if (currentTaskIndex !== taskIndex) return task;
        const nextTask = { ...task };
        delete nextTask[PLANNER_RECHECK_PENDING_FIELD];
        if (!recheckRevision(nextTask)) {
          nextTask[MEMORY_REVIEW_RECHECK_REVISION_FIELD] = 1;
        }
        return nextTask;
      }),
    };
  });
}

/**
 * Removes one exact Planner occurrence while retaining a date-scoped dismissal
 * record. The record stops the predictive injector from recreating the card on
 * the same day, without erasing completion or notebook learning history.
 */
export function dismissMemoryReviewTask(scheduleValue, taskValue = {}, options = {}) {
  const schedule = Array.isArray(scheduleValue) ? scheduleValue : [];
  const targetTask = asObject(taskValue);
  const dateKey = toLocalDateKey(options.dateKey ?? options.now);
  const notebookId = taskNotebookId(targetTask);
  const nodeId = taskNodeId(targetTask);
  if (!dateKey || !notebookId || !nodeId) return schedule;

  const matches = [];
  schedule.forEach((day, dayIndex) => {
    asList(day?.tasks).forEach((task, taskIndex) => {
      if (isScheduledMemoryReview(task) && sameMemoryReviewTask(task, targetTask)) {
        matches.push({ dayIndex, taskIndex });
      }
    });
  });
  if (matches.length !== 1) return schedule;

  const [{ dayIndex, taskIndex }] = matches;
  const taskId = canonicalMemoryReviewTaskId(targetTask.id);
  const unitKey = canonicalMemoryReviewUnitKey(targetTask.unitKey);
  const dismissedAt = normalizedIso(options.dismissedAt ?? options.now);
  const dismissal = {
    ...(taskId ? { id: taskId } : {}),
    ...(unitKey ? { unitKey } : {}),
    dateKey,
    dismissedAt,
    memoryDecayStatus: "dismissed",
    nodeId,
    notebookId,
    source: "memory_review",
  };

  return schedule.map((day, currentDayIndex) => {
    if (currentDayIndex !== dayIndex) return day;
    const currentDismissals = asList(day?.[MEMORY_REVIEW_DISMISSALS_FIELD]);
    const dismissalExists = currentDismissals.some((item) => (
      toLocalDateKey(item?.dateKey) === dateKey
      && sameMemoryReviewTask(item, dismissal)
    ));
    return {
      ...day,
      tasks: day.tasks.filter((task, currentTaskIndex) => currentTaskIndex !== taskIndex),
      [MEMORY_REVIEW_DISMISSALS_FIELD]: dismissalExists
        ? currentDismissals
        : [...currentDismissals, dismissal],
    };
  });
}

/**
 * Preserves the active completion representation. PrepMatrix currently stores
 * task text, while an already ID-aware caller receives the collision-safe ID.
 */
export function addMemoryReviewTaskCompletion(
  completedValue,
  taskValue = {},
  options = {},
) {
  const completed = asList(completedValue);
  const task = asObject(taskValue);
  if (isMemoryReviewTaskCompleted(completed, task)) return completed;
  const taskId = canonicalMemoryReviewTaskId(task.id);
  const taskText = cleanText(task.task, 500);
  const knownTaskIds = scheduleTaskIds(options.schedule);
  const idAware = completed.some((item) => {
    if (item && typeof item === "object") {
      return Boolean(cleanText(item.taskId ?? item.id, 220));
    }
    return knownTaskIds.has(canonicalMemoryReviewTaskId(item));
  });
  const nextValue = idAware && taskId ? taskId : taskText;
  return nextValue ? [...completed, nextValue] : completed;
}

/** Builds the render state and injects today's capped tasks without mutating inputs. */
export function buildMemoryReviewExperience(inputValue = {}) {
  const input = asObject(inputValue);
  const today = input.today ?? new Date();
  const dateKey = toLocalDateKey(today);
  const projected = injectPredictiveMemoryReviews({
    notebooks: input.notebooks,
    schedule: input.schedule,
    scheduleStartDate: input.scheduleStartDate,
    today,
    maxDaily: input.maxDaily,
  });
  const targetDay = projected.schedule.find((day, index) => (
    getScheduleDateKey(day, index, input.scheduleStartDate) === dateKey
  ));
  const todayTasks = asList(targetDay?.tasks).filter((task) => task?.source === "memory_review");
  const reopenedTasks = projected.schedule.flatMap((day) => (
    asList(day?.tasks).filter((task) => (
      task?.source === "memory_review" && isPlannerTaskRecheckPending(task)
    ))
  ));
  const allTasks = uniqueMemoryReviewTasks([...todayTasks, ...reopenedTasks]);
  const entries = allTasks.flatMap((task) => {
    const notebook = findNotebook(input.notebooks, taskNotebookId(task));
    const recheckPending = isPlannerTaskRecheckPending(task);
    const candidate = findCandidate(projected.dueCandidates, task)
      || (recheckPending ? scheduledCandidate(task, notebook) : null);
    if (!candidate || !notebook || !cleanText(task?.task, 500)) return [];
    const historicallyCompleted = isMemoryReviewTaskCompleted(input.completed, task);
    return [{
      task,
      candidate,
      notebook,
      historicallyCompleted,
      recheckPending,
      completed: historicallyCompleted && !recheckPending,
    }];
  });

  return {
    ...projected,
    dateKey,
    allTasks,
    entries,
    pendingEntries: entries.filter((entry) => !entry.completed),
  };
}

/**
 * Resolves a due-review projection against the latest Planner state supplied by
 * React's functional state updater. Returning the same reference when no task
 * is added keeps repeated effects idempotent.
 */
export function mergeMemoryReviewSchedule(currentScheduleValue = [], inputValue = {}) {
  const currentSchedule = Array.isArray(currentScheduleValue) ? currentScheduleValue : [];
  const latestExperience = buildMemoryReviewExperience({
    ...asObject(inputValue),
    schedule: currentSchedule,
  });
  return latestExperience.changed ? latestExperience.schedule : currentSchedule;
}

export function createMemoryReviewQuiz(entryValue = {}, options = {}) {
  const entry = asObject(entryValue);
  const quiz = buildPredictiveMemoryMicroQuiz(entry.notebook, entry.candidate, {
    ...options,
    dateKey: options.dateKey,
  });
  if (!quiz || !isPlannerTaskRecheckPending(entry.task)) return quiz;
  const revision = recheckRevision(entry.task) || 1;
  const occurrenceToken = stableHash(memoryReviewTaskKey(entry.task));
  return {
    ...quiz,
    id: `${quiz.id}-recheck-${revision}-${occurrenceToken}`,
  };
}

function normalizedRatings(value) {
  if (value instanceof Map) return new Map(value);
  return new Map(Object.entries(asObject(value)));
}

function recalled(value) {
  return value === true || value === "recalled" || value === "correct";
}

/**
 * Validates a completed self-check and creates the callback payload. It updates
 * both the notebook mastery and half-life state but performs no network request.
 */
export function buildMemoryReviewSubmission(inputValue = {}) {
  const input = asObject(inputValue);
  const entry = asObject(input.entry);
  const quiz = asObject(input.quiz);
  const questions = asList(quiz.activeRecallPrompts ?? quiz.questions);
  const ratings = normalizedRatings(input.ratings);
  if (!entry.notebook || !entry.candidate || !entry.task || !questions.length) return null;
  if (questions.some((question) => !ratings.has(cleanText(question?.id, 220)))) return null;

  const correctCount = questions.filter((question) => (
    recalled(ratings.get(cleanText(question?.id, 220)))
  )).length;
  const score = Math.round((correctCount / questions.length) * 100);
  const confidence = Math.min(5, Math.max(1, Math.round(Number(input.confidence) || 3)));
  const completedAt = normalizedIso(input.completedAt);
  const applied = applyPredictiveMemoryQuizResult(entry.notebook, {
    quizId: quiz.id,
    nodeId: entry.candidate.nodeId ?? entry.candidate.id,
    score,
    confidence,
    correctCount,
    questionCount: questions.length,
    durationMinutes: quiz.durationMinutes ?? 3,
    completedAt,
    prompts: questions.map((question) => cleanText(question?.prompt, 700)).filter(Boolean),
  }, { now: completedAt });
  if (!applied) return null;

  return {
    quizId: quiz.id,
    nodeId: entry.candidate.nodeId ?? entry.candidate.id,
    durationMinutes: quiz.durationMinutes ?? 3,
    notebook: applied.notebook,
    candidate: entry.candidate,
    score,
    confidence,
    completedAt,
    task: entry.task,
  };
}
