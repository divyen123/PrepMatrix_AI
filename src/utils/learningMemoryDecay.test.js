import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLearningMemoryPlannerInjections,
  calculateLearningRecallProbability,
  injectLearningMemoryPlannerTasks,
  migrateLearningMemoryRecord,
  normalizeLearningMemoryState,
  selectLearningMemoryCandidates,
  selectLearningMemoryQuizQuestions,
  updateLearningMemoryAfterQuiz,
} from "./learningMemoryDecay.js";
import {
  buildPredictiveMemoryMicroQuiz,
  injectPredictiveMemoryReviews,
} from "./learningMemoryPlanner.js";

function learningNotebook(overrides = {}) {
  return {
    id: "notebook-biology",
    subjectName: "Biology",
    overview: "Cell division preserves genetic information and supports growth.",
    chapters: [{
      id: "chapter-cells",
      title: "Cell biology",
      topics: [
        {
          id: "topic-mitosis",
          title: "Mitosis",
          explanation: "Mitosis separates duplicated chromosomes into two nuclei.",
          keyPoints: ["Chromosomes align at the metaphase plate", "Sister chromatids separate"],
          subtopics: [],
        },
        {
          id: "topic-meiosis",
          title: "Meiosis",
          explanation: "Meiosis produces haploid cells.",
          subtopics: [],
        },
      ],
    }],
    learningState: {
      updatedAt: "2026-07-01T12:00:00.000Z",
      nodes: {},
    },
    ...overrides,
  };
}

function learnedNode(overrides = {}) {
  return {
    nodeId: "topic-mitosis",
    notebookId: "notebook-biology",
    nodeType: "topic",
    parentId: "chapter-cells",
    title: "Mitosis",
    subjectName: "Biology",
    chapterTitle: "Cell biology",
    status: "learned",
    masteryScore: 80,
    confidence: 4,
    lastStudiedAt: "2026-07-01T12:00:00.000Z",
    learnedAt: "2026-07-01T12:00:00.000Z",
    attempts: [{
      id: "attempt-1",
      score: 80,
      confidence: 4,
      answeredAt: "2026-07-01T12:00:00.000Z",
      prompt: "Why do sister chromatids separate?",
    }],
    review: {
      stage: 1,
      intervalDays: 3,
      lastReviewedAt: "2026-07-01T12:00:00.000Z",
      dueAt: "2026-07-04T12:00:00.000Z",
    },
    ...overrides,
  };
}

test("uses an exponential half-life recall curve", () => {
  const record = {
    observedAt: "2026-07-01T00:00:00.000Z",
    halfLifeDays: 2,
  };

  assert.equal(
    calculateLearningRecallProbability(record, { now: "2026-07-01T00:00:00.000Z" }),
    1,
  );
  assert.equal(
    calculateLearningRecallProbability(record, { now: "2026-07-03T00:00:00.000Z" }),
    0.5,
  );
  assert.equal(
    calculateLearningRecallProbability(record, { now: "2026-07-05T00:00:00.000Z" }),
    0.25,
  );
});

test("migrates legacy mastery reviews without changing their due date", () => {
  const node = learnedNode();
  const record = migrateLearningMemoryRecord(node, { targetRecall: 0.75 });

  assert.equal(record.model, "exponential-half-life-v1");
  assert.equal(record.source, "mastery-review-date");
  assert.equal(record.dueAt, node.review.dueAt);
  assert.ok(record.halfLifeDays > 7.2 && record.halfLifeDays < 7.3);
  assert.equal(
    calculateLearningRecallProbability(record, { now: record.dueAt }),
    0.75,
  );
});

test("normalizes legacy nodeStates and omits untouched concepts", () => {
  const notebook = learningNotebook({
    learningState: {
      updatedAt: "2026-07-01T12:00:00.000Z",
      nodeStates: {
        "topic-mitosis": {
          completed: true,
          title: "Mitosis",
          nodeType: "topic",
          lastStudiedAt: "2026-07-01T12:00:00.000Z",
          lastReviewedAt: "2026-07-01T12:00:00.000Z",
          nextReviewAt: "2026-07-04T12:00:00.000Z",
          masteryScore: 78,
        },
      },
    },
  });
  const state = normalizeLearningMemoryState({}, {
    notebook,
    now: "2026-07-02T12:00:00.000Z",
  });

  assert.equal(state.version, 1);
  assert.deepEqual(Object.keys(state.records), ["topic-mitosis"]);
  assert.equal(state.records["topic-mitosis"].dueAt, "2026-07-04T12:00:00.000Z");
  assert.equal(state.records["topic-meiosis"], undefined);
});

test("selects only due concepts in a deterministic urgency order", () => {
  const notebook = learningNotebook({
    learningState: {
      updatedAt: "2026-07-01T12:00:00.000Z",
      nodes: {
        "topic-mitosis": learnedNode({
          review: {
            stage: 0,
            intervalDays: 1,
            lastReviewedAt: "2026-07-01T12:00:00.000Z",
            dueAt: "2026-07-02T12:00:00.000Z",
          },
        }),
        "topic-meiosis": learnedNode({
          nodeId: "topic-meiosis",
          title: "Meiosis",
          lastStudiedAt: "2026-07-03T12:00:00.000Z",
          learnedAt: "2026-07-03T12:00:00.000Z",
          attempts: [{
            id: "attempt-2",
            score: 90,
            confidence: 4,
            answeredAt: "2026-07-03T12:00:00.000Z",
          }],
          review: {
            stage: 1,
            intervalDays: 3,
            lastReviewedAt: "2026-07-03T12:00:00.000Z",
            dueAt: "2026-07-06T12:00:00.000Z",
          },
        }),
      },
    },
  });
  const due = selectLearningMemoryCandidates([notebook], {
    now: "2026-07-04T08:00:00.000Z",
    dateKey: "2026-07-04",
  });

  assert.deepEqual(due.map((candidate) => candidate.nodeId), ["topic-mitosis"]);
  assert.equal(due[0].reason, "overdue-review");
  assert.equal(due[0].daysOverdue, 2);
});

test("selects a review on its predicted forgetting calendar day", () => {
  const notebook = learningNotebook({
    learningState: {
      updatedAt: "2026-07-01T12:00:00.000Z",
      nodes: { "topic-mitosis": learnedNode() },
    },
  });
  const due = selectLearningMemoryCandidates([notebook], {
    now: "2026-07-04T01:00:00.000Z",
    dateKey: "2026-07-04",
  });

  assert.equal(due.length, 1);
  assert.equal(due[0].reason, "predicted-forgetting-day");
});

test("builds capped idempotent planner injection records", () => {
  const candidates = [1, 2, 3, 4].map((number) => ({
    notebookId: "notebook-biology",
    nodeId: `topic-${number}`,
    title: `Topic ${number}`,
    subjectName: "Biology",
    nodeType: "topic",
    dueAt: `2026-07-0${number}T12:00:00.000Z`,
    dueDateKey: `2026-07-0${number}`,
    predictedRecall: 0.6 + number / 100,
    targetRecall: 0.75,
    masteryScore: 70,
  }));
  const first = buildLearningMemoryPlannerInjections(candidates, {
    dateKey: "2026-07-05",
    now: "2026-07-05T08:00:00.000Z",
    maxPerDay: 3,
  });
  const second = buildLearningMemoryPlannerInjections(candidates, {
    dateKey: "2026-07-05",
    now: "2026-07-05T09:00:00.000Z",
    maxPerDay: 3,
    existingInjections: first.injections,
  });

  assert.equal(first.injections.length, 3);
  assert.equal(new Set(first.injections.map((item) => item.id)).size, 3);
  assert.equal(first.remainingCapacity, 0);
  assert.equal(second.injections.length, 0);
  assert.equal(second.remainingCapacity, 0);
});

test("injects three-minute tasks without mutating or duplicating the planner", () => {
  const schedule = [
    { day: 1, date: "2026-07-04", tasks: [{ task: "Existing task" }] },
    { day: 2, date: "2026-07-05", tasks: [] },
  ];
  const candidates = [1, 2, 3, 4].map((number) => ({
    notebookId: "notebook-biology",
    nodeId: `topic-${number}`,
    title: `Topic ${number}`,
    subjectName: "Biology",
    nodeType: "topic",
    dueAt: "2026-07-04T12:00:00.000Z",
    dueDateKey: "2026-07-04",
    predictedRecall: 0.6,
    targetRecall: 0.75,
    masteryScore: 70,
  }));
  const first = injectLearningMemoryPlannerTasks(schedule, candidates, {
    dateKey: "2026-07-04",
    now: "2026-07-04T08:00:00.000Z",
  });
  const second = injectLearningMemoryPlannerTasks(first.schedule, candidates, {
    dateKey: "2026-07-04",
    now: "2026-07-04T09:00:00.000Z",
  });

  assert.equal(schedule[0].tasks.length, 1);
  assert.equal(first.tasks.length, 3);
  assert.ok(first.tasks.every((task) => task.durationMinutes === 3));
  assert.equal(first.schedule[0].tasks.length, 4);
  assert.equal(second.tasks.length, 0);
  assert.equal(second.schedule[0].tasks.length, 4);
});

test("PlannerPage API returns memory_review tasks and its required result shape", () => {
  const notebook = learningNotebook({
    learningState: {
      updatedAt: "2026-07-01T12:00:00.000Z",
      nodes: { "topic-mitosis": learnedNode() },
    },
  });
  const schedule = [{ day: 1, date: "2026-07-04", tasks: [] }];
  const first = injectPredictiveMemoryReviews({
    notebooks: [notebook],
    schedule,
    today: "2026-07-04T08:00:00.000Z",
    maxDaily: 3,
  });
  const second = injectPredictiveMemoryReviews({
    notebooks: [notebook],
    schedule: first.schedule,
    today: "2026-07-04T09:00:00.000Z",
    maxDaily: 3,
  });

  assert.equal(first.changed, true);
  assert.equal(first.tasks.length, 1);
  assert.equal(first.dueCandidates.length, 1);
  assert.equal(first.tasks[0].source, "memory_review");
  assert.equal(first.tasks[0].durationMinutes, 3);
  assert.equal(first.tasks[0].notebookId, notebook.id);
  assert.equal(first.tasks[0].nodeId, "topic-mitosis");
  assert.match(first.tasks[0].id, /^memory-review-/u);
  assert.match(first.tasks[0].unitKey, /^memory-review:/u);
  assert.equal(schedule[0].tasks.length, 0);
  assert.equal(second.changed, false);
  assert.equal(second.tasks.length, 0);
  assert.equal(second.schedule[0].tasks.length, 1);
});

test("creates today's planner bucket when a due review has no schedule", () => {
  const notebook = learningNotebook({
    learningState: {
      updatedAt: "2026-07-01T12:00:00.000Z",
      nodes: { "topic-mitosis": learnedNode() },
    },
  });
  const schedule = [];
  const result = injectPredictiveMemoryReviews({
    notebooks: [notebook],
    schedule,
    today: "2026-07-04T08:00:00.000Z",
  });

  assert.equal(schedule.length, 0);
  assert.equal(result.changed, true);
  assert.equal(result.schedule.length, 1);
  assert.equal(result.schedule[0].day, 1);
  assert.equal(result.schedule[0].date, "2026-07-04");
  assert.equal(result.schedule[0].tasks.length, 1);
  assert.equal(result.schedule[0].tasks[0].source, "memory_review");
});

test("appends today's planner bucket without disturbing expired days", () => {
  const notebook = learningNotebook({
    learningState: {
      updatedAt: "2026-07-01T12:00:00.000Z",
      nodes: { "topic-mitosis": learnedNode() },
    },
  });
  const expiredTask = { id: "old-task", task: "Yesterday's work" };
  const schedule = [{ day: 7, date: "2026-07-03", tasks: [expiredTask] }];
  const result = injectPredictiveMemoryReviews({
    notebooks: [notebook],
    schedule,
    scheduleStartDate: "2026-06-27",
    today: "2026-07-04T08:00:00.000Z",
  });

  assert.deepEqual(schedule, [{ day: 7, date: "2026-07-03", tasks: [expiredTask] }]);
  assert.equal(result.schedule.length, 2);
  assert.deepEqual(result.schedule[0], schedule[0]);
  assert.equal(result.schedule[1].day, 8);
  assert.equal(result.schedule[1].date, "2026-07-04");
  assert.equal(result.schedule[1].tasks.length, 1);
});

test("reuses relevant notebook prompts before requesting AI questions", () => {
  const notebook = learningNotebook({
    importantQuestions: [
      {
        id: "global-mitosis",
        question: "Why is mitosis important for growth?",
        answer: "It produces genetically similar cells.",
      },
      {
        id: "global-meiosis",
        question: "How does meiosis create genetic variation?",
        answer: "Crossing over and independent assortment create variation.",
      },
    ],
  });
  notebook.chapters[0].topics[0].reviewQuestions = [
    {
      id: "local-phases",
      question: "Put the main mitosis phases in order.",
      answer: "Prophase, metaphase, anaphase, telophase.",
    },
    {
      id: "local-metaphase",
      question: "Where do chromosomes align during metaphase?",
      answer: "At the metaphase plate.",
    },
  ];
  const candidate = {
    notebookId: notebook.id,
    nodeId: "topic-mitosis",
    title: "Mitosis",
    chapterTitle: "Cell biology",
    subjectName: "Biology",
    dueAt: "2026-07-04T12:00:00.000Z",
    dueDateKey: "2026-07-04",
    targetRecall: 0.75,
    predictedRecall: 0.7,
  };
  const selection = selectLearningMemoryQuizQuestions(notebook, candidate, {
    count: 3,
    dateKey: "2026-07-04",
  });

  assert.equal(selection.questions.length, 3);
  assert.equal(selection.needsAiGeneration, false);
  assert.ok(selection.questions.some((question) => question.sourceQuestionId === "global-mitosis"));
  assert.ok(!selection.questions.some((question) => question.sourceQuestionId === "global-meiosis"));
});

test("builds three active-recall prompts with revealable notebook answers", () => {
  const notebook = learningNotebook({
    importantQuestions: [{
      id: "global-mitosis",
      question: "Why is mitosis important for growth?",
      answer: "It produces genetically similar cells.",
    }],
  });
  const candidate = {
    notebookId: notebook.id,
    nodeId: "topic-mitosis",
    title: "Mitosis",
    subjectName: "Biology",
    dueAt: "2026-07-04T12:00:00.000Z",
    dueDateKey: "2026-07-04",
  };
  const quiz = buildPredictiveMemoryMicroQuiz(notebook, candidate, {
    dateKey: "2026-07-04",
  });

  assert.equal(quiz.durationMinutes, 3);
  assert.equal(quiz.activeRecallPrompts.length, 3);
  assert.ok(quiz.activeRecallPrompts.every((prompt) => prompt.prompt));
  assert.ok(quiz.activeRecallPrompts.every((prompt) => prompt.hasRevealableAnswer));
  assert.ok(quiz.reusedNotebookPromptCount >= 1);
  assert.ok(quiz.fallbackPromptCount >= 1);
});

test("updates half-life upward for strong recall and downward for failure", () => {
  const record = migrateLearningMemoryRecord(learnedNode());
  const successful = updateLearningMemoryAfterQuiz(record, {
    score: 92,
    confidence: 4,
  }, { now: "2026-07-04T12:00:00.000Z" });
  const failed = updateLearningMemoryAfterQuiz(record, {
    score: 30,
    confidence: 2,
  }, { now: "2026-07-04T12:00:00.000Z" });

  assert.ok(successful.halfLifeDays > record.halfLifeDays);
  assert.ok(failed.halfLifeDays < record.halfLifeDays);
  assert.ok(successful.dueAt > successful.observedAt);
  assert.equal(successful.source, "memory-micro-quiz");
});
