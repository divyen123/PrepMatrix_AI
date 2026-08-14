import test from "node:test";
import assert from "node:assert/strict";
import {
  addMemoryReviewTaskCompletion,
  buildMemoryReviewExperience,
  buildMemoryReviewSubmission,
  createMemoryReviewQuiz,
  isMemoryReviewTaskCompleted,
} from "./learningMemoryReviewExperience.js";

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

test("supports exact task-ID completion without same-title collisions", () => {
  const taskA = { id: "memory-review-a", task: "Review: Mitosis" };
  const taskB = { id: "memory-review-b", task: "Review: Mitosis" };

  assert.equal(isMemoryReviewTaskCompleted([taskA.id], taskA), true);
  assert.equal(isMemoryReviewTaskCompleted([taskA.id], taskB), false);
  assert.equal(isMemoryReviewTaskCompleted([taskA.task], taskB), true);
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
