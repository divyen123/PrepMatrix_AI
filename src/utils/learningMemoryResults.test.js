import test from "node:test";
import assert from "node:assert/strict";
import { applyPredictiveMemoryQuizResult } from "./learningMemoryResults.js";

function notebook() {
  return {
    id: "notebook-biology",
    subjectName: "Biology",
    chapters: [{
      id: "chapter-cells",
      title: "Cell biology",
      topics: [{
        id: "topic-mitosis",
        title: "Mitosis",
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
            kind: "practice",
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

test("applies one quiz result to memory decay and mastery state immutably", () => {
  const source = notebook();
  const applied = applyPredictiveMemoryQuizResult(source, {
    quizId: "memory-quiz-daily-1",
    nodeId: "topic-mitosis",
    correctCount: 3,
    questionCount: 3,
    confidence: 4,
    durationMinutes: 2.5,
    prompts: ["Define mitosis", "Order its phases", "Why does it matter?"],
  }, { now: "2026-07-04T12:00:00.000Z" });

  assert.equal(source.memoryDecayState, undefined);
  assert.equal(source.learningState.nodes["topic-mitosis"].attempts.length, 1);
  assert.equal(applied.changed, true);
  assert.equal(applied.duplicate, false);
  assert.equal(applied.record.lastQuizId, "memory-quiz-daily-1");
  assert.equal(applied.record.lastScore, 100);
  assert.equal(applied.memoryDecayState.records["topic-mitosis"].source, "memory-micro-quiz");
  const attempts = applied.learningState.nodes["topic-mitosis"].attempts;
  assert.equal(attempts.length, 2);
  assert.equal(attempts.at(-1).kind, "memory-micro-quiz");
  assert.equal(attempts.at(-1).score, 100);
});

test("treats a retried quiz submission as idempotent", () => {
  const first = applyPredictiveMemoryQuizResult(notebook(), {
    quizId: "memory-quiz-daily-1",
    nodeId: "topic-mitosis",
    score: 80,
  }, { now: "2026-07-04T12:00:00.000Z" });
  const second = applyPredictiveMemoryQuizResult(first.notebook, {
    quizId: "memory-quiz-daily-1",
    nodeId: "topic-mitosis",
    score: 80,
  }, { now: "2026-07-04T12:01:00.000Z" });

  assert.equal(second.changed, false);
  assert.equal(second.duplicate, true);
  assert.equal(second.learningState.nodes["topic-mitosis"].attempts.length, 2);
});

test("treats delayed A after A then B as a duplicate without rewinding B decay", () => {
  const firstA = applyPredictiveMemoryQuizResult(notebook(), {
    quizId: "memory-quiz-daily-A",
    nodeId: "topic-mitosis",
    score: 72,
    confidence: 3,
  }, { now: "2026-07-04T12:00:00.000Z" });
  const nextB = applyPredictiveMemoryQuizResult(firstA.notebook, {
    quizId: "memory-quiz-daily-B",
    nodeId: "topic-mitosis",
    score: 94,
    confidence: 5,
  }, { now: "2026-07-05T12:00:00.000Z" });
  const bRecord = nextB.memoryDecayState.records["topic-mitosis"];
  const attemptCountAfterB = nextB.learningState.nodes["topic-mitosis"].attempts.length;

  const delayedA = applyPredictiveMemoryQuizResult(nextB.notebook, {
    quizId: "memory-quiz-daily-A",
    nodeId: "topic-mitosis",
    score: 10,
    confidence: 1,
  }, { now: "2026-07-06T12:00:00.000Z" });

  assert.equal(delayedA.changed, false);
  assert.equal(delayedA.duplicate, true);
  assert.equal(delayedA.attempt.score, 72);
  assert.equal(delayedA.record.lastQuizId, "memory-quiz-daily-B");
  assert.equal(delayedA.record.lastScore, 94);
  assert.equal(delayedA.record.halfLifeDays, bRecord.halfLifeDays);
  assert.equal(delayedA.record.dueAt, bRecord.dueAt);
  assert.equal(
    delayedA.learningState.nodes["topic-mitosis"].attempts.length,
    attemptCountAfterB,
  );
});

test("recognizes the legacy bounded attempt ID after the last quiz marker changes", () => {
  const source = notebook();
  source.learningState.nodes["topic-mitosis"].attempts.push({
    id: "memory-attempt-memory-quiz-legacy-A",
    kind: "memory-micro-quiz",
    score: 81,
    confidence: 4,
    answeredAt: "2026-07-04T12:00:00.000Z",
  });
  source.memoryDecayState = {
    version: 1,
    model: "exponential-half-life-v1",
    updatedAt: "2026-07-05T12:00:00.000Z",
    records: {
      "topic-mitosis": {
        nodeId: "topic-mitosis",
        notebookId: "notebook-biology",
        observedAt: "2026-07-05T12:00:00.000Z",
        halfLifeDays: 10,
        targetRecall: 0.75,
        dueAt: "2026-07-09T12:00:00.000Z",
        lastScore: 90,
        lastQuizId: "memory-quiz-newer-B",
        lastQuizCompletedAt: "2026-07-05T12:00:00.000Z",
      },
    },
  };

  const delayedLegacyA = applyPredictiveMemoryQuizResult(source, {
    quizId: "memory-quiz-legacy-A",
    nodeId: "topic-mitosis",
    score: 20,
  }, { now: "2026-07-06T12:00:00.000Z" });

  assert.equal(delayedLegacyA.duplicate, true);
  assert.equal(delayedLegacyA.changed, false);
  assert.equal(delayedLegacyA.attempt.score, 81);
  assert.equal(delayedLegacyA.record.lastQuizId, "memory-quiz-newer-B");
});

test("rejects unscored or unknown-node submissions", () => {
  assert.equal(
    applyPredictiveMemoryQuizResult(notebook(), { nodeId: "topic-mitosis" }),
    null,
  );
  assert.equal(
    applyPredictiveMemoryQuizResult(notebook(), { nodeId: "unknown", score: 80 }),
    null,
  );
});
