import assert from "node:assert/strict";
import test from "node:test";
import {
  getLearningInsights,
  hasLearningNodeAchievement,
  normalizeLearningState,
} from "./learningMastery.js";
import { normalizeLearningNotebook } from "./learningNotebook.js";

const NOW = "2026-10-04T10:00:00.000Z";
const COMPLETED_AT = "2026-10-03T10:00:00.000Z";
const TOPICS = [
  { id: "big-data", title: "Big Data Overview" },
  { id: "four-vs", title: "The 4 Vs of Data Analytics" },
  { id: "frameworks", title: "Data Processing Frameworks" },
  { id: "visualization", title: "Data Visualization Basics" },
];

function notebook(overrides = {}) {
  return {
    id: "notebook-data",
    subjectName: "Data analytics",
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: COMPLETED_AT,
    chapters: [{
      id: "intro",
      title: "Introduction to data analytics",
      topics: TOPICS.map((topic) => ({ ...topic, subtopics: [] })),
    }],
    revisedNotes: TOPICS.map((topic) => ({
      id: `note-${topic.id}`,
      title: topic.title,
      content: `Revision material for ${topic.title}.`,
      completed: true,
      completedAt: COMPLETED_AT,
    })),
    ...overrides,
  };
}

function legacyCompletedNodes() {
  return Object.fromEntries(TOPICS.map((topic) => [topic.id, {
    nodeId: topic.id,
    nodeType: "topic",
    title: topic.title,
    chapterTitle: "Introduction to data analytics",
    status: "learned",
    learnedAt: COMPLETED_AT,
    masteryScore: 70,
  }]));
}

function currentTopic(savedNotebook, title) {
  const outlineTopic = savedNotebook.chapters.flatMap((chapter) => chapter.topics)
    .find((topic) => topic.title === title);
  assert.ok(outlineTopic, `Expected current outline topic ${title}`);
  return savedNotebook.learningState.nodes[outlineTopic.id];
}

test("scoped outline IDs and legacy completed IDs count four current topics once", () => {
  const canonical = normalizeLearningNotebook(notebook({ revisedNotes: [] }), { now: NOW });
  const saved = normalizeLearningNotebook(notebook({
    chapters: canonical.chapters,
    learningState: {
      nodes: {
        ...canonical.learningState.nodes,
        ...legacyCompletedNodes(),
      },
    },
  }), { now: NOW });
  const insights = getLearningInsights([saved], { now: NOW });

  assert.equal(insights.topicCount, 4);
  assert.equal(insights.learnedTopicCount, 4);
  assert.equal(Math.round(insights.learnedTopicCount / insights.topicCount * 100), 100);
  assert.equal(insights.subjects[0].totalTopics, 4);
  assert.equal(insights.subjects[0].learnedTopics, 4);
  TOPICS.forEach((topic) => {
    assert.equal(hasLearningNodeAchievement(currentTopic(saved, topic.title)), true);
    assert.equal(saved.learningState.nodes[topic.id], undefined);
  });
});

test("completed revised notes reconcile a zero-score current topic despite a formatted note heading", () => {
  const saved = normalizeLearningNotebook(notebook({
    revisedNotes: [{
      id: "visualization-note",
      title: "Revised notes: Data Visualization",
      content: "Choose a chart and communicate the result clearly.",
      completed: true,
      completedAt: COMPLETED_AT,
    }],
  }), { now: NOW });
  const topic = currentTopic(saved, "Data Visualization Basics");

  assert.equal(hasLearningNodeAchievement(topic), true);
  assert.equal(topic.status, "learned");
  assert.ok(topic.masteryScore > 0);
  assert.equal(getLearningInsights([saved], { now: NOW }).learnedTopicCount, 1);
});

test("reconciliation preserves assessed mastery, attempts, review schedule and session references", () => {
  const dueAt = "2026-10-20T10:00:00.000Z";
  const legacy = legacyCompletedNodes();
  legacy["big-data"] = {
    ...legacy["big-data"],
    status: "mastered",
    masteredAt: COMPLETED_AT,
    masteryScore: 95,
    confidence: 5,
    review: { stage: 3, intervalDays: 14, dueAt, lastReviewedAt: COMPLETED_AT },
    attempts: [{
      id: "big-data-assessment",
      answeredAt: COMPLETED_AT,
      score: 95,
      confidence: 5,
      sessionId: "recall-session",
    }],
  };
  const saved = normalizeLearningNotebook(notebook({
    learningState: {
      nodes: legacy,
      sessions: [{
        id: "recall-session",
        status: "completed",
        startedAt: "2026-10-03T09:55:00.000Z",
        completedAt: COMPLETED_AT,
        durationMinutes: 5,
        nodeIds: ["big-data"],
        learnedNodeIds: ["big-data"],
        masteredNodeIds: ["big-data"],
      }],
    },
  }), { now: NOW });
  const topic = currentTopic(saved, "Big Data Overview");

  assert.equal(topic.masteryScore, 95);
  assert.equal(topic.masteredAt, COMPLETED_AT);
  assert.equal(topic.review.dueAt, dueAt);
  assert.equal(topic.review.stage, 3);
  assert.equal(topic.attempts.length, 1);
  assert.equal(topic.attempts[0].id, "big-data-assessment");
  assert.equal(topic.attempts[0].score, 95);
  assert.deepEqual(saved.learningState.sessions[0].nodeIds, [topic.nodeId]);
  assert.deepEqual(saved.learningState.sessions[0].learnedNodeIds, [topic.nodeId]);
  assert.deepEqual(saved.learningState.sessions[0].masteredNodeIds, [topic.nodeId]);
  assert.equal(getLearningInsights([saved], { now: NOW }).masteredTopicCount, 1);
});

test("historical topics outside the current outline do not inflate completion totals", () => {
  const saved = normalizeLearningNotebook(notebook({
    learningState: {
      nodes: {
        ...legacyCompletedNodes(),
        "removed-topic": {
          nodeId: "removed-topic",
          nodeType: "topic",
          title: "Removed historical topic",
          status: "mastered",
          learnedAt: COMPLETED_AT,
          masteredAt: COMPLETED_AT,
          masteryScore: 100,
        },
      },
    },
  }), { now: NOW });
  const insights = getLearningInsights([saved], { now: NOW });

  assert.ok(saved.learningState.nodes["removed-topic"]);
  assert.equal(insights.topicCount, 4);
  assert.equal(insights.learnedTopicCount, 4);
  assert.equal(insights.masteredTopicCount, 0);
  assert.equal(insights.recentLearnedTopics.some((topic) => topic.id === "removed-topic"), false);
});

test("a later unassessed visit does not discard migrated assessment and review evidence", () => {
  const blank = normalizeLearningNotebook(notebook({ revisedNotes: [] }), { now: NOW });
  const topicId = blank.chapters[0].topics[0].id;
  const saved = normalizeLearningNotebook({
    ...blank,
    revisedNotes: [],
    learningState: {
      nodes: {
        [topicId]: {
          ...blank.learningState.nodes[topicId],
          status: "learning",
          lastStudiedAt: NOW,
          masteryScore: 0,
        },
        "big-data": {
          nodeId: "big-data",
          nodeType: "topic",
          title: "Big Data Overview",
          status: "mastered",
          learnedAt: COMPLETED_AT,
          masteredAt: COMPLETED_AT,
          masteryScore: 95,
          review: { stage: 3, dueAt: "2026-10-20T10:00:00.000Z", lastReviewedAt: COMPLETED_AT },
          attempts: [{ id: "older-assessment", answeredAt: COMPLETED_AT, score: 95 }],
        },
      },
    },
  }, { now: NOW });
  const topic = currentTopic(saved, "Big Data Overview");

  assert.equal(topic.masteryScore, 95);
  assert.equal(topic.masteredAt, COMPLETED_AT);
  assert.equal(topic.review.dueAt, "2026-10-20T10:00:00.000Z");
  assert.equal(topic.review.stage, 3);
  assert.equal(topic.attempts[0].score, 95);
});

test("timestamp-free legacy mastery wins over a generated empty canonical node", () => {
  const saved = normalizeLearningNotebook(notebook({
    revisedNotes: [],
    learningState: {
      nodes: {
        "big-data": {
          nodeId: "big-data",
          nodeType: "topic",
          title: "Big Data Overview",
          status: "mastered",
          masteryScore: 95,
        },
      },
    },
  }), { now: NOW });
  const topic = currentTopic(saved, "Big Data Overview");

  assert.equal(topic.status, "mastered");
  assert.equal(topic.masteryScore, 95);
  assert.equal(hasLearningNodeAchievement(topic), true);
  assert.equal(getLearningInsights([saved], { now: NOW }).masteredTopicCount, 1);
});

test("a later unassessed visit preserves migrated manual learning score and review schedule", () => {
  const blank = normalizeLearningNotebook(notebook({ revisedNotes: [] }), { now: NOW });
  const topicId = blank.chapters[0].topics[0].id;
  const saved = normalizeLearningNotebook({
    ...blank,
    revisedNotes: [],
    learningState: {
      nodes: {
        [topicId]: {
          ...blank.learningState.nodes[topicId],
          status: "learning",
          lastStudiedAt: NOW,
          masteryScore: 0,
        },
        "big-data": {
          nodeId: "big-data",
          nodeType: "topic",
          title: "Big Data Overview",
          status: "learned",
          learnedAt: COMPLETED_AT,
          masteryScore: 70,
          review: { stage: 1, dueAt: "2026-10-06T10:00:00.000Z", lastReviewedAt: COMPLETED_AT },
        },
      },
    },
  }, { now: NOW });
  const topic = currentTopic(saved, "Big Data Overview");

  assert.equal(topic.masteryScore, 70);
  assert.equal(topic.learnedAt, COMPLETED_AT);
  assert.equal(topic.review.dueAt, "2026-10-06T10:00:00.000Z");
  assert.equal(getLearningInsights([saved], { now: NOW }).learnedTopicCount, 1);
});

test("an exact generic note heading completes its topic even when every word is a title filler", () => {
  const saved = normalizeLearningNotebook(notebook({
    chapters: [{ id: "foundations", title: "Foundations", topics: [{ id: "introduction", title: "Introduction" }] }],
    revisedNotes: [{ id: "intro-note", title: "Introduction", completed: true }],
  }), { now: NOW });

  assert.equal(hasLearningNodeAchievement(currentTopic(saved, "Introduction")), true);
  assert.equal(getLearningInsights([saved], { now: NOW }).learnedTopicCount, 1);
});

test("an exact topic link takes priority over another topic with the same ID suffix", () => {
  const blank = normalizeLearningNotebook(notebook({
    chapters: [
      { id: "first", title: "First chapter", topics: [{ id: "intro", title: "First topic" }] },
      { id: "second", title: "Second chapter", topics: [{ id: "first-intro", title: "Second topic" }] },
    ],
    revisedNotes: [],
  }), { now: NOW });
  const linkedTopicId = blank.chapters[0].topics[0].id;
  const saved = normalizeLearningNotebook({
    ...blank,
    revisedNotes: [{ id: "exact-link", title: "Shared notes", completed: true, topicIds: [linkedTopicId] }],
  }, { now: NOW });

  assert.equal(hasLearningNodeAchievement(currentTopic(saved, "First topic")), true);
  assert.equal(hasLearningNodeAchievement(currentTopic(saved, "Second topic")), false);
  assert.equal(getLearningInsights([saved], { now: NOW }).learnedTopicCount, 1);
});

test("an ambiguous revised note does not complete identically named topics in different chapters", () => {
  const saved = normalizeLearningNotebook(notebook({
    chapters: [
      { id: "relational", title: "Relational databases", topics: [{ id: "normalization", title: "Normalization" }] },
      { id: "preprocessing", title: "Data preprocessing", topics: [{ id: "normalization", title: "Normalization" }] },
    ],
    revisedNotes: [{ id: "ambiguous", title: "Normalization", completed: true }],
  }), { now: NOW });

  assert.equal(getLearningInsights([saved], { now: NOW }).learnedTopicCount, 0);
  saved.chapters.flatMap((chapter) => chapter.topics).forEach((topic) => {
    assert.equal(hasLearningNodeAchievement(saved.learningState.nodes[topic.id]), false);
  });
});

test("explicit revised-note topic links survive storage normalization and disambiguate completion", () => {
  const blank = normalizeLearningNotebook(notebook({
    chapters: [
      { id: "relational", title: "Relational databases", topics: [{ id: "normalization", title: "Normalization" }] },
      { id: "preprocessing", title: "Data preprocessing", topics: [{ id: "normalization", title: "Normalization" }] },
    ],
    revisedNotes: [],
  }), { now: NOW });
  const linkedTopicId = blank.chapters[1].topics[0].id;
  const saved = normalizeLearningNotebook({
    ...blank,
    revisedNotes: [{
      id: "linked-note",
      title: "Normalization",
      content: "Scale numeric input features.",
      topicIds: [linkedTopicId],
      completed: true,
      completedAt: COMPLETED_AT,
    }],
  }, { now: NOW });

  assert.deepEqual(saved.revisedNotes[0].topicIds, [linkedTopicId]);
  assert.equal(saved.revisedNotes[0].completedAt, COMPLETED_AT);
  assert.equal(hasLearningNodeAchievement(saved.learningState.nodes[linkedTopicId]), true);
  assert.equal(hasLearningNodeAchievement(saved.learningState.nodes[blank.chapters[0].topics[0].id]), false);
  assert.equal(getLearningInsights([saved], { now: NOW }).learnedTopicCount, 1);
});

test("completed-note reconciliation is idempotent across serialized save and read normalization", () => {
  const saved = normalizeLearningNotebook(notebook({
    learningState: { nodes: legacyCompletedNodes() },
  }), { now: NOW });
  const read = normalizeLearningNotebook(JSON.parse(JSON.stringify(saved)), { now: NOW });
  const normalizedAgain = normalizeLearningState(read.learningState, { notebook: read, now: NOW });

  assert.deepEqual(read.learningState, saved.learningState);
  assert.deepEqual(normalizedAgain, read.learningState);
  assert.deepEqual(getLearningInsights([read], { now: NOW }), getLearningInsights([saved], { now: NOW }));
  assert.equal(getLearningInsights([read], { now: NOW }).learnedTopicCount, 4);
});

test("incomplete revised notes do not manufacture learning achievement", () => {
  const saved = normalizeLearningNotebook(notebook({
    revisedNotes: TOPICS.map((topic) => ({
      id: `note-${topic.id}`,
      title: topic.title,
      content: "Prepared notes that have not been completed.",
      completed: false,
    })),
  }), { now: NOW });
  const insights = getLearningInsights([saved], { now: NOW });

  assert.equal(insights.topicCount, 4);
  assert.equal(insights.learnedTopicCount, 0);
  TOPICS.forEach((topic) => {
    const progress = currentTopic(saved, topic.title);
    assert.equal(progress.masteryScore, 0);
    assert.equal(hasLearningNodeAchievement(progress), false);
  });
});
