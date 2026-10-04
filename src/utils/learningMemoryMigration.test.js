import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLearningNotebook } from "./learningNotebook.js";
import { normalizeLearningMemoryState } from "./learningMemoryDecay.js";

const NOW = "2026-07-05T10:03:00.000Z";
const OBSERVED_AT = "2026-07-05T10:02:00.000Z";

function learnedNode(overrides = {}) {
  return {
    nodeId: "algebra",
    notebookId: "math-notebook",
    nodeType: "topic",
    title: "Algebra",
    chapterTitle: "Foundations",
    status: "mastered",
    learnedAt: "2026-07-05T10:00:00.000Z",
    masteredAt: OBSERVED_AT,
    lastStudiedAt: OBSERVED_AT,
    masteryScore: 95,
    attempts: [{ id: "saved-quiz-attempt", score: 95, answeredAt: OBSERVED_AT }],
    review: { stage: 1, lastReviewedAt: OBSERVED_AT, dueAt: "2026-07-10T10:02:00.000Z" },
    ...overrides,
  };
}

function savedRecord(overrides = {}) {
  return {
    nodeId: "algebra",
    notebookId: "math-notebook",
    observedAt: OBSERVED_AT,
    halfLifeDays: 9,
    targetRecall: 0.75,
    dueAt: "2026-07-09T00:00:00.000Z",
    lastScore: 95,
    masteryScore: 95,
    reviewCount: 4,
    lastQuizId: "saved-memory-quiz",
    lastQuizCompletedAt: OBSERVED_AT,
    ...overrides,
  };
}

function notebook(overrides = {}) {
  return {
    id: "math-notebook",
    subjectName: "Mathematics",
    createdAt: "2026-07-01T10:00:00.000Z",
    updatedAt: OBSERVED_AT,
    chapters: [{
      id: "foundations",
      title: "Foundations",
      topics: [{ id: "algebra", title: "Algebra", subtopics: [] }],
    }],
    learningState: { nodes: { algebra: learnedNode() } },
    memoryDecayState: { records: { algebra: savedRecord() } },
    ...overrides,
  };
}

test("scoping mastery IDs also migrates calibrated memory history without losing quiz metadata", () => {
  const raw = notebook();
  const before = structuredClone(raw);
  const saved = normalizeLearningNotebook(raw, { now: NOW });
  const canonicalId = saved.chapters[0].topics[0].id;
  const record = saved.memoryDecayState.records[canonicalId];

  assert.deepEqual(raw, before);
  assert.notEqual(canonicalId, "algebra");
  assert.equal(saved.learningState.nodes[canonicalId].masteryScore, 95);
  assert.equal(record.nodeId, canonicalId);
  assert.equal(record.notebookId, raw.id);
  assert.equal(record.lastQuizId, "saved-memory-quiz");
  assert.equal(record.lastQuizCompletedAt, OBSERVED_AT);
  assert.equal(record.halfLifeDays, 9);
  assert.equal(record.dueAt, "2026-07-09T00:00:00.000Z");
  assert.equal(record.reviewCount, 4);
  assert.equal(saved.memoryDecayState.records.algebra, undefined);

  const read = normalizeLearningNotebook(JSON.parse(JSON.stringify(saved)), { now: NOW });
  assert.deepEqual(read.memoryDecayState.records, saved.memoryDecayState.records);
});

test("legacy records without notebookId use the notebook scope and newer alias history wins", () => {
  const legacy = savedRecord();
  delete legacy.notebookId;
  const raw = notebook({
    memoryDecayState: {
      records: {
        "foundations-algebra": savedRecord({
          nodeId: "foundations-algebra",
          observedAt: "2026-07-05T10:00:00.000Z",
          halfLifeDays: 2,
          lastQuizId: "older-canonical-quiz",
          lastQuizCompletedAt: "2026-07-05T10:00:00.000Z",
        }),
        algebra: legacy,
      },
    },
  });
  const saved = normalizeLearningNotebook(raw, { now: NOW });
  const canonicalId = saved.chapters[0].topics[0].id;
  const record = saved.memoryDecayState.records[canonicalId];

  assert.equal(record.notebookId, raw.id);
  assert.equal(record.lastQuizId, "saved-memory-quiz");
  assert.equal(record.halfLifeDays, 9);
  assert.deepEqual(Object.keys(saved.memoryDecayState.records), [canonicalId]);
});

test("original mastery chapter context disambiguates memory records missing topic metadata", () => {
  const raw = notebook({
    chapters: [
      { id: "first", title: "Foundations", topics: [{ id: "algebra", title: "Algebra" }] },
      { id: "second", title: "Advanced study", topics: [{ id: "algebra", title: "Algebra" }] },
    ],
  });
  const saved = normalizeLearningNotebook(raw, { now: NOW });
  const firstId = saved.chapters[0].topics[0].id;
  const secondId = saved.chapters[1].topics[0].id;

  assert.equal(saved.memoryDecayState.records[firstId].lastQuizId, "saved-memory-quiz");
  assert.equal(saved.memoryDecayState.records[firstId].halfLifeDays, 9);
  assert.equal(saved.memoryDecayState.records[secondId], undefined);
  assert.equal(saved.memoryDecayState.records.algebra, undefined);
});

test("ambiguous valid memory history stays saved until its outline target can be resolved", () => {
  const raw = notebook({
    chapters: [
      { id: "first", title: "First chapter", topics: [{ id: "algebra", title: "Algebra" }] },
      { id: "second", title: "Second chapter", topics: [{ id: "algebra", title: "Algebra" }] },
    ],
    learningState: { nodes: {} },
  });
  const saved = normalizeLearningNotebook(raw, { now: NOW });

  assert.equal(saved.memoryDecayState.records.algebra.lastQuizId, "saved-memory-quiz");
  assert.equal(saved.memoryDecayState.records.algebra.halfLifeDays, 9);
  saved.chapters.flatMap((chapter) => chapter.topics).forEach((topic) => {
    assert.equal(saved.memoryDecayState.records[topic.id], undefined);
  });
  const read = normalizeLearningNotebook(JSON.parse(JSON.stringify(saved)), { now: NOW });
  assert.deepEqual(read.memoryDecayState.records, saved.memoryDecayState.records);
});

test("an evaluated result newer than saved memory history retains its genuine score", () => {
  const saved = normalizeLearningNotebook(notebook({
    learningState: {
      nodes: {
        algebra: learnedNode({
          status: "review_due",
          masteryScore: 25,
          lastStudiedAt: NOW,
          attempts: [
            { id: "saved-quiz-attempt", score: 95, answeredAt: OBSERVED_AT },
            { id: "new-failed-attempt", score: 25, answeredAt: NOW },
          ],
          review: { stage: 0, lastReviewedAt: NOW, dueAt: "2026-07-06T10:03:00.000Z" },
        }),
      },
    },
  }), { now: NOW });
  const canonicalId = saved.chapters[0].topics[0].id;

  assert.equal(saved.learningState.nodes[canonicalId].masteryScore, 25);
  assert.equal(saved.memoryDecayState.records[canonicalId].lastScore, 25);
  assert.equal(saved.memoryDecayState.records[canonicalId].masteryScore, 25);
  assert.equal(saved.memoryDecayState.records[canonicalId].observedAt, NOW);
});

test("foreign notebook records cannot supply current-notebook memory history", () => {
  const raw = notebook();
  const state = normalizeLearningMemoryState({
    records: { algebra: savedRecord({ notebookId: "another-notebook", lastQuizId: "foreign-quiz" }) },
  }, { notebook: raw, now: NOW });

  assert.notEqual(state.records.algebra?.lastQuizId, "foreign-quiz");
  assert.equal(Object.values(state.records).some((record) => record.notebookId === "another-notebook"), false);
});

test("memory normalization without an outline keeps the learning state's notebook scope", () => {
  const raw = notebook();
  const state = normalizeLearningMemoryState(raw.memoryDecayState, {
    learningState: raw.learningState,
    now: NOW,
  });

  assert.equal(state.records.algebra.notebookId, raw.id);
  assert.equal(state.records.algebra.halfLifeDays, 9);
  assert.equal(state.records.algebra.lastQuizId, "saved-memory-quiz");
});

test("qualified saved-map keys recover missing node and notebook IDs before reassignment", () => {
  const record = savedRecord();
  delete record.nodeId;
  delete record.notebookId;
  const saved = normalizeLearningNotebook(notebook({
    memoryDecayState: { records: { "math-notebook:algebra": record } },
  }), { now: NOW });
  const canonicalId = saved.chapters[0].topics[0].id;

  assert.equal(saved.memoryDecayState.records[canonicalId].notebookId, saved.id);
  assert.equal(saved.memoryDecayState.records[canonicalId].halfLifeDays, 9);
  assert.equal(saved.memoryDecayState.records[canonicalId].lastQuizId, "saved-memory-quiz");
  assert.deepEqual(Object.keys(saved.memoryDecayState.records), [canonicalId]);
});
