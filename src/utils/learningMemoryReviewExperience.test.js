import test from "node:test";
import assert from "node:assert/strict";
import {
  addMemoryReviewTaskCompletion,
  buildMemoryReviewExperience,
  buildMemoryReviewSubmission,
  clearMemoryReviewTaskRecheck,
  createMemoryReviewQuiz,
  isMemoryReviewTaskCompleted,
  isMemoryReviewTaskPending,
  mergeMemoryReviewSchedule,
} from "./learningMemoryReviewExperience.js";
import {
  MEMORY_REVIEW_RECHECK_REVISION_FIELD,
  PLANNER_RECHECK_PENDING_FIELD,
  reopenPlannerTask,
} from "./plannerScheduleProgress.js";

function notebook() {
  return {
    id: "notebook-biology",
    subjectName: "Biology",
    overview: "Mitosis creates genetically similar cells for growth and repair.",
    importantQuestions: [{
      id: "mitosis-purpose",
      question: "Why is mitosis important for growth?",
      answer: "It produces genetically similar cells.",
    }],
    chapters: [{
      id: "chapter-cells",
      title: "Cell biology",
      topics: [{
        id: "topic-mitosis",
        title: "Mitosis",
        explanation: "Mitosis separates duplicated chromosomes into two nuclei.",
        keyPoints: ["Chromosomes align at the metaphase plate", "Sister chromatids separate"],
        subtopics: [],
      }],
    }],
    learningState: {
      updatedAt: "2026-07-01T12:00:00.000Z",
      nodes: {
        "topic-mitosis": {
          nodeId: "topic-mitosis",
          notebookId: "notebook-biology",
          parentId: "chapter-cells",
          nodeType: "topic",
          title: "Mitosis",
          subjectName: "Biology",
          chapterTitle: "Cell biology",
          status: "learned",
          masteryScore: 75,
          confidence: 3,
          learnedAt: "2026-07-01T12:00:00.000Z",
          lastStudiedAt: "2026-07-01T12:00:00.000Z",
          attempts: [{
            id: "attempt-1",
            score: 75,
            confidence: 3,
            answeredAt: "2026-07-01T12:00:00.000Z",
          }],
          misconceptions: [],
          review: {
            stage: 1,
            intervalDays: 3,
            lastReviewedAt: "2026-07-01T12:00:00.000Z",
            dueAt: "2026-07-04T12:00:00.000Z",
          },
        },
      },
      sessions: [],
      activeSessionId: "",
    },
  };
}

test("creates today's pending Planner experience without mutating the schedule", () => {
  const schedule = [{ day: 1, date: "2026-07-04", tasks: [] }];
  const result = buildMemoryReviewExperience({
    notebooks: [notebook()],
    schedule,
    scheduleStartDate: "2026-07-04",
    completed: [],
    today: "2026-07-04T08:00:00.000Z",
    maxDaily: 3,
  });

  assert.equal(schedule[0].tasks.length, 0);
  assert.equal(result.changed, true);
  assert.equal(result.entries.length, 1);
  assert.equal(result.pendingEntries.length, 1);
  assert.equal(result.entries[0].task.source, "memory_review");
  assert.equal(result.entries[0].task.durationMinutes, 3);
  assert.equal(result.entries[0].candidate.nodeId, "topic-mitosis");
});

test("keeps an existing memory task idempotent and respects completed task names", () => {
  const first = buildMemoryReviewExperience({
    notebooks: [notebook()],
    schedule: [{ day: 1, date: "2026-07-04", tasks: [] }],
    today: "2026-07-04T08:00:00.000Z",
  });
  const taskName = first.entries[0].task.task;
  const second = buildMemoryReviewExperience({
    notebooks: [notebook()],
    schedule: first.schedule,
    completed: [taskName],
    today: "2026-07-04T09:00:00.000Z",
  });

  assert.equal(second.changed, false);
  assert.equal(second.entries.length, 1);
  assert.equal(second.pendingEntries.length, 0);
  assert.equal(second.entries[0].completed, true);
});

test("a completed memory check becomes actionable when explicitly rescheduled", () => {
  const completedAt = "2026-07-04T08:03:00.000Z";
  const first = buildMemoryReviewExperience({
    notebooks: [notebook()],
    schedule: [{ day: 1, date: "2026-07-04", tasks: [] }],
    scheduleStartDate: "2026-07-04",
    completed: [],
    today: "2026-07-04T08:00:00.000Z",
  });
  const originalEntry = first.entries[0];
  const originalQuiz = createMemoryReviewQuiz(originalEntry, { dateKey: first.dateKey });
  const firstResult = buildMemoryReviewSubmission({
    entry: originalEntry,
    quiz: originalQuiz,
    ratings: Object.fromEntries(originalQuiz.activeRecallPrompts.map((question) => (
      [question.id, "recalled"]
    ))),
    confidence: 4,
    completedAt,
  });
  const completed = Object.freeze(["Unrelated completed lesson", originalEntry.task.task]);
  const taskIndex = first.schedule[0].tasks.findIndex((task) => (
    task.id === originalEntry.task.id
  ));
  const reopenedSchedule = reopenPlannerTask(
    first.schedule,
    completed,
    0,
    taskIndex,
  );
  const reopenedTask = reopenedSchedule[0].tasks[taskIndex];

  const reopened = buildMemoryReviewExperience({
    notebooks: [firstResult.notebook],
    schedule: reopenedSchedule,
    scheduleStartDate: "2026-07-04",
    completed,
    today: "2026-07-05T08:00:00.000Z",
  });

  assert.equal(reopened.dueCandidates.length, 0, "the predictive model moved the concept forward");
  assert.equal(reopened.entries.length, 1, "a manual recheck overrides predictive due gating");
  assert.equal(reopened.pendingEntries.length, 1);
  assert.equal(reopened.entries[0].task.id, originalEntry.task.id);
  assert.equal(reopened.entries[0].historicallyCompleted, true);
  assert.equal(reopened.entries[0].recheckPending, true);
  assert.equal(reopened.entries[0].completed, false);
  assert.equal(isMemoryReviewTaskCompleted(completed, reopenedTask), true);
  assert.equal(isMemoryReviewTaskPending(completed, reopenedTask), true);
  assert.equal(
    reopenedTask[MEMORY_REVIEW_RECHECK_REVISION_FIELD],
    1,
  );
  assert.deepEqual(completed, ["Unrelated completed lesson", originalEntry.task.task]);

  const recheckQuiz = createMemoryReviewQuiz(reopened.entries[0], {
    dateKey: reopened.dateKey,
  });
  assert.match(recheckQuiz.id, /-recheck-1-[a-z0-9]+$/u);
  assert.equal(
    createMemoryReviewQuiz(reopened.entries[0], { dateKey: reopened.dateKey }).id,
    recheckQuiz.id,
    "retries of one intentional recheck stay idempotent",
  );
  assert.notEqual(recheckQuiz.id, originalQuiz.id);

  const anotherOccurrence = createMemoryReviewQuiz({
    ...reopened.entries[0],
    task: {
      ...reopened.entries[0].task,
      id: "memory-review-another-occurrence",
      unitKey: "memory-review:notebook-biology:topic-mitosis:another-occurrence",
    },
  }, { dateKey: reopened.dateKey });
  assert.notEqual(
    anotherOccurrence.id,
    recheckQuiz.id,
    "same-concept rechecks from distinct Planner occurrences must both be recorded",
  );
});

test("finishing a recheck clears only its exact memory task occurrence", () => {
  const task = {
    id: "memory-review-a",
    source: "memory_review",
    notebookId: "notebook-biology",
    nodeId: "topic-mitosis",
    task: "3-minute memory check: Biology - Mitosis",
    [PLANNER_RECHECK_PENDING_FIELD]: true,
    [MEMORY_REVIEW_RECHECK_REVISION_FIELD]: 2,
  };
  const sameTitle = {
    ...task,
    id: "memory-review-b",
    unitKey: "memory-review:notebook-biology:topic-mitosis:another-day",
    [MEMORY_REVIEW_RECHECK_REVISION_FIELD]: 7,
  };
  const unrelated = { id: "lesson-cells", task: "Biology - Cells" };
  const schedule = [{ day: 1, tasks: [task, sameTitle, unrelated] }];

  const cleared = clearMemoryReviewTaskRecheck(schedule, task);

  assert.notStrictEqual(cleared, schedule);
  assert.equal(cleared[0].tasks[0][PLANNER_RECHECK_PENDING_FIELD], undefined);
  assert.equal(
    cleared[0].tasks[0][MEMORY_REVIEW_RECHECK_REVISION_FIELD],
    2,
  );
  assert.strictEqual(cleared[0].tasks[1], sameTitle);
  assert.equal(cleared[0].tasks[1][PLANNER_RECHECK_PENDING_FIELD], true);
  assert.strictEqual(cleared[0].tasks[2], unrelated);
  assert.strictEqual(clearMemoryReviewTaskRecheck(cleared, task), cleared);
  assert.equal(schedule[0].tasks[0][PLANNER_RECHECK_PENDING_FIELD], true);

  const legacyTask = {
    ...task,
    id: "memory-decay-a",
    source: "memory-decay",
    unitKey: "memory-decay:notebook-biology:topic-mitosis:2026-07-04",
  };
  delete legacyTask[MEMORY_REVIEW_RECHECK_REVISION_FIELD];
  const legacySchedule = [{ day: 1, tasks: [legacyTask] }];
  const projectedLegacyTask = { ...task };
  delete projectedLegacyTask[MEMORY_REVIEW_RECHECK_REVISION_FIELD];
  const migrated = clearMemoryReviewTaskRecheck(legacySchedule, projectedLegacyTask);
  assert.equal(migrated[0].tasks[0][PLANNER_RECHECK_PENDING_FIELD], undefined);
  assert.equal(
    migrated[0].tasks[0][MEMORY_REVIEW_RECHECK_REVISION_FIELD],
    1,
    "a pending legacy task is migrated after its first successful recheck",
  );

  const ambiguousTask = {
    source: "memory_review",
    notebookId: "notebook-biology",
    nodeId: "topic-mitosis",
    dueAt: "2026-07-04T08:00:00.000Z",
    task: "3-minute memory check: Biology - Mitosis",
    [PLANNER_RECHECK_PENDING_FIELD]: true,
  };
  const ambiguousSchedule = [{
    day: 1,
    tasks: [{ ...ambiguousTask }, { ...ambiguousTask }],
  }];
  assert.strictEqual(
    clearMemoryReviewTaskRecheck(ambiguousSchedule, ambiguousTask),
    ambiguousSchedule,
    "an idless duplicate is left pending instead of clearing the wrong occurrence",
  );
});

test("appends a due review without replacing checked or unchecked Planner tasks", () => {
  const checkedTask = {
    id: "planner-task-checked",
    task: "Review algebra",
    time: "Morning",
  };
  const uncheckedTask = {
    id: "planner-task-unchecked",
    task: "Practice geometry",
    time: "Evening",
  };
  const laterTask = {
    id: "planner-task-later",
    task: "Read chemistry notes",
    time: "Afternoon",
  };
  const schedule = [
    { day: 1, date: "2026-07-04", tasks: [checkedTask, uncheckedTask] },
    { day: 2, date: "2026-07-05", tasks: [laterTask] },
  ];
  const completed = [checkedTask.task];

  const first = buildMemoryReviewExperience({
    notebooks: [notebook()],
    schedule,
    completed,
    today: "2026-07-04T08:00:00.000Z",
  });

  assert.deepEqual(schedule[0].tasks, [checkedTask, uncheckedTask]);
  assert.deepEqual(schedule[1].tasks, [laterTask]);
  assert.deepEqual(completed, [checkedTask.task]);
  assert.deepEqual(first.schedule[0].tasks.slice(0, 2), [checkedTask, uncheckedTask]);
  assert.deepEqual(first.schedule[1].tasks, [laterTask]);
  assert.equal(first.schedule[0].tasks.filter((task) => task.source === "memory_review").length, 1);
  assert.equal(first.schedule[0].tasks.length, 3);

  const second = buildMemoryReviewExperience({
    notebooks: [notebook()],
    schedule: first.schedule,
    completed,
    today: "2026-07-04T09:00:00.000Z",
  });

  assert.equal(second.changed, false);
  assert.deepEqual(second.schedule[0].tasks.slice(0, 2), [checkedTask, uncheckedTask]);
  assert.deepEqual(second.schedule[1].tasks, [laterTask]);
  assert.equal(second.schedule[0].tasks.filter((task) => task.source === "memory_review").length, 1);
  assert.deepEqual(completed, [checkedTask.task]);
});


test("merges a stale review projection into the latest schedule and stays idempotent", () => {
  const input = {
    notebooks: [notebook()],
    completed: ["Review algebra"],
    today: "2026-07-04T08:00:00.000Z",
  };
  const staleProjection = buildMemoryReviewExperience({
    ...input,
    schedule: [{ day: 1, date: "2026-07-04", tasks: [] }],
  });
  const latestSchedule = [{
    day: 1,
    date: "2026-07-04",
    tasks: [
      { id: "checked", task: "Review algebra", time: "Morning" },
      { id: "unchecked", task: "Practice geometry", time: "Evening" },
    ],
  }];

  const merged = mergeMemoryReviewSchedule(latestSchedule, input);

  assert.equal(staleProjection.changed, true);
  assert.deepEqual(merged[0].tasks.slice(0, 2), latestSchedule[0].tasks);
  assert.equal(merged[0].tasks.filter((task) => task.source === "memory_review").length, 1);
  assert.deepEqual(input.completed, ["Review algebra"]);
  assert.equal(mergeMemoryReviewSchedule(merged, input), merged);
});
test("supports exact task-ID completion without same-title collisions", () => {
  const taskA = { id: "memory-review-a", task: "Review: Mitosis" };
  const taskB = { id: "memory-review-b", task: "Review: Mitosis" };

  assert.equal(isMemoryReviewTaskCompleted([taskA.id], taskA), true);
  assert.equal(isMemoryReviewTaskCompleted([taskA.id], taskB), false);
  assert.equal(isMemoryReviewTaskCompleted([taskA.task], taskB), true);
  assert.equal(
    isMemoryReviewTaskCompleted(["memory-decay-a"], taskA),
    true,
    "legacy and current memory-task IDs represent the same occurrence",
  );
});

test("writes IDs for an ID-aware completion list and text for the legacy Planner", () => {
  const existing = { id: "planner-task-existing", task: "Existing" };
  const review = { id: "memory-review-a", task: "Review: Mitosis" };
  const schedule = [{ day: 1, tasks: [existing, review] }];

  assert.deepEqual(
    addMemoryReviewTaskCompletion([existing.id], review, { schedule }),
    [existing.id, review.id],
  );
  assert.deepEqual(
    addMemoryReviewTaskCompletion([], review, { schedule }),
    [review.task],
  );
});

test("builds three revealable prompts and a scored callback payload", () => {
  const experience = buildMemoryReviewExperience({
    notebooks: [notebook()],
    schedule: [{ day: 1, date: "2026-07-04", tasks: [] }],
    today: "2026-07-04T08:00:00.000Z",
  });
  const entry = experience.entries[0];
  const quiz = createMemoryReviewQuiz(entry, { dateKey: experience.dateKey });
  const ratings = Object.fromEntries(quiz.activeRecallPrompts.map((question, index) => [
    question.id,
    index < 2 ? "recalled" : "review",
  ]));
  const payload = buildMemoryReviewSubmission({
    entry,
    quiz,
    ratings,
    confidence: 4,
    completedAt: "2026-07-04T08:03:00.000Z",
  });

  assert.equal(quiz.activeRecallPrompts.length, 3);
  assert.ok(quiz.activeRecallPrompts.every((question) => question.revealAnswer));
  assert.equal(payload.score, 67);
  assert.equal(payload.confidence, 4);
  assert.equal(payload.completedAt, "2026-07-04T08:03:00.000Z");
  assert.equal(payload.task, entry.task);
  assert.equal(payload.candidate, entry.candidate);
  assert.equal(payload.notebook.memoryDecayState.records["topic-mitosis"].lastScore, 67);
  assert.equal(
    payload.notebook.learningState.nodes["topic-mitosis"].attempts.at(-1).kind,
    "memory-micro-quiz",
  );
});

test("does not submit until every prompt has a rating", () => {
  const experience = buildMemoryReviewExperience({
    notebooks: [notebook()],
    schedule: [{ day: 1, date: "2026-07-04", tasks: [] }],
    today: "2026-07-04T08:00:00.000Z",
  });
  const entry = experience.entries[0];
  const quiz = createMemoryReviewQuiz(entry, { dateKey: experience.dateKey });

  assert.equal(buildMemoryReviewSubmission({
    entry,
    quiz,
    ratings: { [quiz.activeRecallPrompts[0].id]: "recalled" },
    confidence: 3,
  }), null);
});
