import test from "node:test";
import assert from "node:assert/strict";
import {
  learningNotebookRevisionFilter,
  mergeLearningNotebookProgress,
  nextLearningNotebookRevisionDate,
} from "./learningNotebookProgressMerge.js";

function node(id, answeredAt, score, extra = {}) {
  return {
    nodeId: id,
    title: id,
    status: score >= 85 ? "mastered" : "learned",
    masteryScore: score,
    lastStudiedAt: answeredAt,
    attempts: [{ id: `attempt-${id}-${score}`, score, answeredAt }],
    misconceptions: [],
    review: { lastReviewedAt: answeredAt, dueAt: "2026-08-01T00:00:00.000Z" },
    ...extra,
  };
}

function memoryRecord(nodeId, observedAt, lastScore, extra = {}) {
  return {
    nodeId,
    observedAt,
    halfLifeDays: 5,
    dueAt: "2026-08-01T00:00:00.000Z",
    lastScore,
    ...extra,
  };
}

test("preserves newer server progress while accepting an unrelated client attempt", () => {
  const current = {
    learningState: {
      updatedAt: "2026-07-05T10:02:00.000Z",
      nodes: {
        algebra: node("algebra", "2026-07-05T10:02:00.000Z", 95),
        geometry: node("geometry", "2026-07-05T09:00:00.000Z", 70),
      },
      sessions: [{ id: "server-session", startedAt: "2026-07-05T10:00:00.000Z" }],
    },
    memoryDecayState: {
      updatedAt: "2026-07-05T10:02:00.000Z",
      records: {
        algebra: memoryRecord("algebra", "2026-07-05T10:02:00.000Z", 95, {
          lastQuizId: "memory-quiz-server",
          lastQuizCompletedAt: "2026-07-05T10:02:00.000Z",
        }),
      },
    },
  };
  const incoming = {
    learningState: {
      updatedAt: "2026-07-05T10:01:00.000Z",
      nodes: {
        algebra: node("algebra", "2026-07-05T09:30:00.000Z", 65),
        geometry: node("geometry", "2026-07-05T10:01:00.000Z", 88),
      },
      sessions: [{ id: "client-session", startedAt: "2026-07-05T10:01:00.000Z" }],
    },
    memoryDecayState: {
      updatedAt: "2026-07-05T10:01:00.000Z",
      records: {
        algebra: memoryRecord("algebra", "2026-07-05T09:30:00.000Z", 65),
        geometry: memoryRecord("geometry", "2026-07-05T10:01:00.000Z", 88),
      },
    },
  };

  const merged = mergeLearningNotebookProgress(current, incoming);

  assert.equal(merged.learningState.nodes.algebra.masteryScore, 95);
  assert.deepEqual(
    merged.learningState.nodes.algebra.attempts.map((attempt) => attempt.score),
    [65, 95],
  );
  assert.equal(merged.learningState.nodes.geometry.masteryScore, 88);
  assert.deepEqual(
    new Set(merged.learningState.sessions.map((session) => session.id)),
    new Set(["client-session", "server-session"]),
  );
  assert.equal(merged.memoryDecayState.records.algebra.lastQuizId, "memory-quiz-server");
  assert.equal(merged.memoryDecayState.records.algebra.lastScore, 95);
  assert.equal(merged.memoryDecayState.records.geometry.lastScore, 88);
});

test("unions concurrent attempts on the same node and keeps the newest node projection", () => {
  const merged = mergeLearningNotebookProgress({
    learningState: {
      updatedAt: "2026-07-05T10:00:00.000Z",
      nodes: { algebra: node("algebra", "2026-07-05T10:00:00.000Z", 80) },
    },
  }, {
    learningState: {
      updatedAt: "2026-07-05T10:01:00.000Z",
      nodes: { algebra: node("algebra", "2026-07-05T10:01:00.000Z", 90) },
    },
  });

  assert.equal(merged.learningState.nodes.algebra.masteryScore, 90);
  assert.deepEqual(
    merged.learningState.nodes.algebra.attempts.map((attempt) => attempt.score),
    [80, 90],
  );
});

test("keeps the newest guided-session stage when legacy session timestamps tie", () => {
  const session = {
    id: "guided-session",
    status: "in_progress",
    startedAt: "2026-07-05T10:00:00.000Z",
    activeStartedAt: "2026-07-05T10:00:00.000Z",
    nodeIds: ["algebra"],
  };
  const merged = mergeLearningNotebookProgress({
    learningState: {
      updatedAt: "2026-07-05T10:00:01.000Z",
      activeSessionId: session.id,
      sessions: [{ ...session, stageIndex: 0 }],
    },
  }, {
    learningState: {
      updatedAt: "2026-07-05T10:00:02.000Z",
      activeSessionId: session.id,
      sessions: [{ ...session, stageIndex: 1 }],
    },
  });

  assert.equal(merged.learningState.activeSessionId, session.id);
  assert.equal(merged.learningState.sessions[0].stageIndex, 1);
});

test("builds legacy-safe revision filters and monotonically increasing dates", () => {
  const previous = new Date("2026-07-05T10:00:00.000Z");
  assert.deepEqual(learningNotebookRevisionFilter({ updatedAt: previous }), {
    updatedAt: previous,
  });
  assert.deepEqual(learningNotebookRevisionFilter({}), {
    updatedAt: { $exists: false },
  });
  assert.equal(
    nextLearningNotebookRevisionDate("2026-07-05T09:00:00.000Z", previous).toISOString(),
    "2026-07-05T10:00:00.001Z",
  );
});
