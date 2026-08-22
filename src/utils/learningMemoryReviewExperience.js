import { getScheduleDateKey, toLocalDateKey } from "./scheduleDates.js";
import {
  buildPredictiveMemoryMicroQuiz,
  injectPredictiveMemoryReviews,
} from "./learningMemoryPlanner.js";
import { applyPredictiveMemoryQuizResult } from "./learningMemoryResults.js";

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asList(value) {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function cleanText(value, maximum = 800) {
  return String(value ?? "").replace(/\s+/gu, " ").trim().slice(0, maximum);
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
    asList(day?.tasks).map((task) => cleanText(task?.id, 220)).filter(Boolean)
  )));
}

/**
 * Reads both the current Planner text contract and an ID-aware completion
 * contract. ID values are exact, so two tasks with the same title stay distinct.
 */
export function isMemoryReviewTaskCompleted(completedValue, taskValue = {}) {
  const task = asObject(taskValue);
  const taskId = cleanText(task.id, 220);
  const taskText = cleanText(task.task, 500);
  return asList(completedValue).some((item) => {
    const key = completionKey(item);
    return Boolean(key) && (key === taskId || key === taskText);
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
  const taskId = cleanText(task.id, 220);
  const taskText = cleanText(task.task, 500);
  const knownTaskIds = scheduleTaskIds(options.schedule);
  const idAware = completed.some((item) => {
    if (item && typeof item === "object") {
      return Boolean(cleanText(item.taskId ?? item.id, 220));
    }
    return knownTaskIds.has(cleanText(item, 220));
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
  const allTasks = asList(targetDay?.tasks).filter((task) => task?.source === "memory_review");
  const entries = allTasks.flatMap((task) => {
    const candidate = findCandidate(projected.dueCandidates, task);
    const notebook = findNotebook(input.notebooks, taskNotebookId(task));
    if (!candidate || !notebook || !cleanText(task?.task, 500)) return [];
    return [{
      task,
      candidate,
      notebook,
      completed: isMemoryReviewTaskCompleted(input.completed, task),
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
  return buildPredictiveMemoryMicroQuiz(entry.notebook, entry.candidate, {
    ...options,
    dateKey: options.dateKey,
  });
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
