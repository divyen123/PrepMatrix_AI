import test from "node:test";
import assert from "node:assert/strict";
import { normalizeLearningNotebook } from "./learningNotebook.js";

test("learning notebook normalization preserves bounded mastery state for API persistence", () => {
  const normalized = normalizeLearningNotebook({
    subjectName: "Computer Networks",
    overview: "A network study guide.",
    chapters: [{
      id: "chapter-routing",
      title: "Routing",
      topics: [{ id: "topic-distance-vector", title: "Distance vector", subtopics: [] }],
    }],
    learningState: {
      version: 99,
      updatedAt: "2026-08-08T10:00:00.000Z",
      nodes: {
        "chapter-routing-topic-distance-vector": {
          status: "learned",
          masteryScore: 78,
          confidence: 4,
          learnedAt: "2026-08-08T09:00:00.000Z",
          review: { stage: 0, dueAt: "2026-08-09T09:00:00.000Z" },
        },
        unknown: { title: "", status: "mastered" },
      },
      sessions: [{
        id: "routing-session",
        subjectName: "Computer Networks",
        status: "completed",
        startedAt: "2026-08-08T08:30:00.000Z",
        completedAt: "2026-08-08T09:00:00.000Z",
        durationMinutes: 30,
        stageIndex: 3,
      }],
    },
  }, {
    id: "notebook-networks",
    now: new Date("2026-08-08T10:00:00.000Z"),
  });

  assert.equal(normalized.id, "notebook-networks");
  assert.equal(normalized.learningState.version, 1);
  assert.equal(normalized.learningState.nodes[normalized.chapters[0].topics[0].id].status, "learned");
  assert.equal(normalized.learningState.nodes[normalized.chapters[0].topics[0].id].masteryScore, 78);
  assert.equal(normalized.learningState.nodes.unknown, undefined);
  assert.equal(normalized.learningState.sessions[0].stageIndex, 3);
  assert.doesNotThrow(() => JSON.stringify(normalized.learningState));
});

test("old notebooks receive a compatible state without losing their content", () => {
  const normalized = normalizeLearningNotebook({
    subjectName: "Mathematics",
    overview: "Legacy content",
    chapters: [{
      id: "chapter-algebra",
      title: "Algebra",
      topics: [{ id: "topic-equations", title: "Equations", subtopics: [] }],
    }],
  }, { now: new Date("2026-08-08T10:00:00.000Z") });

  assert.equal(normalized.overview, "Legacy content");
  assert.equal(normalized.learningState.nodes["chapter-algebra"].status, "ready");
  assert.equal(normalized.learningState.nodes[normalized.chapters[0].topics[0].id].status, "ready");
  assert.deepEqual(normalized.learningState.sessions, []);
});
