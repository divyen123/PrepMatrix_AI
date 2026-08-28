import { getScheduleDateKey, toLocalDateKey } from "./scheduleDates.js";
import {
  DEFAULT_MEMORY_MAX_DAILY_QUIZZES,
  DEFAULT_MEMORY_QUIZ_QUESTION_COUNT,
  buildLearningMemoryMicroQuiz,
  injectLearningMemoryPlannerTasks,
  selectLearningMemoryCandidates,
} from "./learningMemoryDecay.js";

export const MEMORY_REVIEW_DISMISSALS_FIELD = "memoryReviewDismissals";

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asList(value) {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function cleanText(value, maximum = 800) {
  return String(value ?? "").replace(/\s+/gu, " ").trim().slice(0, maximum);
}

function scheduleMemoryReviewDismissals(scheduleValue = []) {
  return asList(scheduleValue).flatMap((day) => (
    asList(day?.[MEMORY_REVIEW_DISMISSALS_FIELD])
  ));
}

function normalizedMemoryReviewTask(taskValue = {}) {
  const task = asObject(taskValue);
  if (task.source !== "memory-decay" && task.source !== "memory_review") return task;
  const notebookId = cleanText(
    task.notebookId ?? task.sourceLearningNotebookId ?? task.sourceLearningProjectId,
    180,
  );
  const nodeId = cleanText(task.nodeId ?? task.sourceLearningNodeId, 180);
  return {
    ...task,
    id: cleanText(task.id, 220).replace(/^memory-decay-/u, "memory-review-"),
    source: "memory_review",
    notebookId,
    nodeId,
    sourceLearningNotebookId: notebookId,
    sourceLearningProjectId: notebookId,
    sourceLearningNodeId: nodeId,
    unitKey: cleanText(task.unitKey, 520).replace(/^memory-decay:/u, "memory-review:"),
  };
}

function internalMemoryReviewTask(taskValue = {}) {
  const task = asObject(taskValue);
  return task.source === "memory_review"
    ? {
        ...task,
        source: "memory-decay",
        id: cleanText(task.id, 220).replace(/^memory-review-/u, "memory-decay-"),
        unitKey: cleanText(task.unitKey, 520).replace(/^memory-review:/u, "memory-decay:"),
      }
    : task;
}

function internalSchedule(scheduleValue = []) {
  return asList(scheduleValue).map((day) => ({
    ...asObject(day),
    tasks: asList(day?.tasks).map(internalMemoryReviewTask),
  }));
}

function ensureTodayScheduleBucket(scheduleValue, dateKey, scheduleStartDate) {
  const schedule = internalSchedule(scheduleValue);
  const hasToday = schedule.some((day, index) => (
    getScheduleDateKey(day, index, scheduleStartDate) === dateKey
  ));
  if (!dateKey || hasToday) return { added: false, schedule };
  const highestDay = schedule.reduce((maximum, day, index) => {
    const dayNumber = Number.parseInt(day?.day, 10);
    return Math.max(maximum, Number.isInteger(dayNumber) && dayNumber > 0 ? dayNumber : index + 1);
  }, 0);
  return {
    added: true,
    schedule: [...schedule, {
      day: highestDay + 1,
      date: dateKey,
      tasks: [],
    }],
  };
}

/**
 * PlannerPage integration API. It derives today's due candidates and injects at
 * most maxDaily three-minute review tasks without mutating the supplied schedule.
 */
export function injectPredictiveMemoryReviews(inputValue = {}) {
  const input = asObject(inputValue);
  const today = input.today ?? new Date();
  const dateKey = toLocalDateKey(today);
  const schedule = Array.isArray(input.schedule) ? input.schedule : [];
  const dismissedReviews = scheduleMemoryReviewDismissals(schedule);
  const dueCandidates = selectLearningMemoryCandidates(input.notebooks, {
    now: today,
    dateKey,
    limit: Math.max(12, Number(input.maxDaily) || DEFAULT_MEMORY_MAX_DAILY_QUIZZES),
  });
  const prepared = dueCandidates.length
    ? ensureTodayScheduleBucket(schedule, dateKey, input.scheduleStartDate)
    : { added: false, schedule: internalSchedule(schedule) };
  const injected = injectLearningMemoryPlannerTasks(
    prepared.schedule,
    dueCandidates,
    {
      dateKey,
      now: today,
      scheduleStartDate: input.scheduleStartDate,
      maxPerDay: input.maxDaily ?? DEFAULT_MEMORY_MAX_DAILY_QUIZZES,
      existingInjections: dismissedReviews,
    },
  );

  if (!injected) {
    return {
      schedule,
      tasks: [],
      dueCandidates,
      changed: false,
    };
  }

  const normalizedSchedule = injected.schedule.map((day) => ({
    ...day,
    tasks: asList(day?.tasks).map(normalizedMemoryReviewTask),
  }));
  const tasks = injected.tasks.map(normalizedMemoryReviewTask);
  return {
    schedule: normalizedSchedule,
    tasks,
    dueCandidates,
    changed: prepared.added || tasks.length > 0,
  };
}

function notebookNode(notebookValue, nodeId) {
  const notebook = asObject(notebookValue);
  for (const chapter of asList(notebook.chapters)) {
    if (cleanText(chapter?.id ?? chapter?.nodeId, 180) === nodeId) {
      return { ...asObject(chapter), chapterTitle: chapter?.title };
    }
    for (const topic of asList(chapter?.topics)) {
      if (cleanText(topic?.id ?? topic?.nodeId, 180) === nodeId) {
        return { ...asObject(topic), chapterTitle: chapter?.title };
      }
      for (const subtopic of asList(topic?.subtopics)) {
        if (cleanText(subtopic?.id ?? subtopic?.nodeId, 180) === nodeId) {
          return { ...asObject(subtopic), chapterTitle: chapter?.title };
        }
      }
    }
  }
  return null;
}

function fallbackRecallPrompts(notebook, candidate, needed) {
  const nodeId = cleanText(candidate.nodeId ?? candidate.id, 180);
  const node = notebookNode(notebook, nodeId);
  const title = cleanText(candidate.title ?? node?.title, 180) || "this concept";
  const summary = cleanText(
    node?.summary ?? node?.explanation ?? node?.description ?? notebook?.overview,
    1_600,
  );
  const keyPoints = asList(node?.keyPoints)
    .map((item) => cleanText(item, 700))
    .filter(Boolean);
  const examples = asList(node?.examples)
    .map((item) => cleanText(item, 700))
    .filter(Boolean);
  const rows = [
    ...keyPoints.map((answer, index) => ({
      prompt: `What should you remember for key point ${index + 1} of ${title}?`,
      revealAnswer: answer,
      source: "notebook-key-point",
    })),
    ...(summary ? [{
      prompt: `Explain ${title} in one or two sentences.`,
      revealAnswer: summary,
      source: "notebook-summary",
    }] : []),
    ...examples.map((answer) => ({
      prompt: `Give one worked or real-world example of ${title}.`,
      revealAnswer: answer,
      source: "notebook-example",
    })),
    {
      prompt: `Define ${title} in your own words.`,
      revealAnswer: summary,
      source: "deterministic-recall-fallback",
    },
    {
      prompt: `List two facts you remember about ${title}.`,
      revealAnswer: keyPoints.slice(0, 2).join("\n"),
      source: "deterministic-recall-fallback",
    },
    {
      prompt: `Teach ${title} aloud as if your listener is new to it.`,
      revealAnswer: summary,
      source: "deterministic-recall-fallback",
    },
  ];
  const seen = new Set();
  return rows.flatMap((row, index) => {
    const key = row.prompt.toLocaleLowerCase();
    if (!row.prompt || seen.has(key)) return [];
    seen.add(key);
    return [{
      id: `memory-fallback-${nodeId || "concept"}-${index + 1}`,
      prompt: row.prompt,
      revealAnswer: row.revealAnswer,
      hasRevealableAnswer: Boolean(row.revealAnswer),
      source: row.source,
      repeated: false,
    }];
  }).slice(0, needed);
}

/**
 * Builds exactly three active-recall prompts. Saved questions and model answers
 * are used first; deterministic notebook-content fallbacks fill any remaining slots.
 */
export function buildPredictiveMemoryMicroQuiz(
  notebookValue = {},
  candidateValue = {},
  options = {},
) {
  const notebook = asObject(notebookValue);
  const candidate = asObject(candidateValue);
  const count = Math.min(
    3,
    Math.max(1, Number(options.count) || DEFAULT_MEMORY_QUIZ_QUESTION_COUNT),
  );
  const quiz = buildLearningMemoryMicroQuiz(notebook, candidate, {
    ...options,
    count,
  });
  if (!quiz) return null;

  const savedPrompts = quiz.questions.map((question) => ({
    id: question.id,
    sourceQuestionId: question.sourceQuestionId,
    prompt: question.prompt,
    revealAnswer: question.answer,
    hasRevealableAnswer: Boolean(question.answer),
    source: question.source,
    repeated: question.repeated,
  }));
  const fallbackPrompts = fallbackRecallPrompts(
    notebook,
    candidate,
    count - savedPrompts.length,
  );
  const activeRecallPrompts = [...savedPrompts, ...fallbackPrompts].slice(0, count);

  return {
    ...quiz,
    requestedCount: count,
    activeRecallPrompts,
    questions: activeRecallPrompts,
    reusedNotebookPromptCount: savedPrompts.length,
    fallbackPromptCount: fallbackPrompts.length,
    needsAiGeneration: quiz.missingCount > 0,
  };
}
