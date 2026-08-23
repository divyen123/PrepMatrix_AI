import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLearningNodeCatalog,
  calculateLearningReview,
  completeLearningSession,
  getLearningInsights,
  getLearningNodeState,
  getLearningNodeStatus,
  getLearningReviewQueue,
  hasLearningNodeAchievement,
  markLearningNodeLearned,
  normalizeLearningState,
  recordLearningAttempt,
  setLearningNodeStatus,
  startLearningSession,
  updateLearningSession,
} from "./learningMastery.js";

const NOW = "2026-08-01T10:00:00.000Z";

const notebook = {
  id: "notebook-data-structures",
  subjectName: "Data Structures",
  chapters: [{
    id: "chapter-arrays",
    title: "Arrays",
    topics: [
      {
        id: "topic-traversal",
        title: "Array traversal",
        subtopics: [{ id: "subtopic-loops", title: "Loop invariants" }],
      },
      { id: "topic-sorting", title: "Array sorting", subtopics: [] },
    ],
  }],
};

test("builds stable worktree nodes and gives a legacy notebook a safe learning state", () => {
  const original = structuredClone(notebook);
  const catalog = buildLearningNodeCatalog(notebook);
  const state = normalizeLearningState({}, { notebook, now: NOW });

  assert.deepEqual(notebook, original);
  assert.deepEqual(catalog.map(({ nodeId, parentId, nodeType }) => ({ nodeId, parentId, nodeType })), [
    { nodeId: "chapter-arrays", parentId: "", nodeType: "chapter" },
    { nodeId: "topic-traversal", parentId: "chapter-arrays", nodeType: "topic" },
    { nodeId: "subtopic-loops", parentId: "topic-traversal", nodeType: "subtopic" },
    { nodeId: "topic-sorting", parentId: "chapter-arrays", nodeType: "topic" },
  ]);
  assert.equal(state.version, 1);
  assert.equal(state.nodes["chapter-arrays"].status, "ready");
  assert.equal(state.nodes["topic-traversal"].status, "ready");
  assert.equal(state.nodes["subtopic-loops"].status, "new");
  assert.equal(state.nodes["topic-sorting"].status, "new");
  assert.doesNotThrow(() => JSON.stringify(state));
});

test("normalizes legacy completion/confidence fields without mutating persisted input", () => {
  const legacy = {
    nodeStates: {
      "topic-traversal": {
        title: "Old title",
        completed: true,
        confidence: 80,
        completedAt: "2026-07-31T09:00:00.000Z",
        nextReviewAt: "2026-08-02T09:00:00.000Z",
      },
    },
  };
  const original = structuredClone(legacy);
  const state = normalizeLearningState(legacy, { notebook, now: NOW });

  assert.deepEqual(legacy, original);
  assert.equal(state.nodes["topic-traversal"].title, "Array traversal");
  assert.equal(state.nodes["topic-traversal"].status, "learned");
  assert.equal(state.nodes["topic-traversal"].confidence, 4);
  assert.equal(state.nodes["topic-traversal"].learnedAt, "2026-07-31T09:00:00.000Z");
  assert.equal(state.nodes["topic-traversal"].review.dueAt, "2026-08-02T09:00:00.000Z");
});

test("keeps durable topic achievement while a repeat session is in progress", () => {
  const initial = normalizeLearningState({}, { notebook, now: NOW });
  const learned = recordLearningAttempt(initial, {
    nodeId: "topic-traversal",
    score: 79,
    confidence: 3,
  }, { notebook, now: NOW });
  const learnedAt = learned.nodes["topic-traversal"].learnedAt;
  const restarted = setLearningNodeStatus(
    learned,
    "topic-traversal",
    "learning",
    { notebook, now: "2026-08-01T10:05:00.000Z" },
  );

  assert.equal(restarted.nodes["topic-traversal"].status, "learning");
  assert.equal(restarted.nodes["topic-traversal"].learnedAt, learnedAt);
  assert.equal(hasLearningNodeAchievement(restarted.nodes["topic-traversal"]), true);
  assert.equal(hasLearningNodeAchievement({ status: "learning" }), false);
  assert.equal(getLearningInsights(
    [{ ...notebook, learningState: restarted }],
    { now: "2026-08-01T10:05:00.000Z" },
  ).learnedTopicCount, 1);
});

test("schedules deterministic spaced reviews and exposes review-due state", () => {
  const initial = normalizeLearningState({}, { notebook, now: NOW });
  const learned = markLearningNodeLearned(initial, "topic-traversal", {
    notebook,
    now: NOW,
  });
  const learnedNode = learned.nodes["topic-traversal"];

  assert.equal(learnedNode.review.intervalDays, 1);
  assert.equal(learnedNode.review.dueAt, "2026-08-02T10:00:00.000Z");
  assert.equal(
    getLearningNodeStatus(learnedNode, { now: "2026-08-02T10:00:00.000Z" }),
    "review_due",
  );
  assert.equal(
    getLearningNodeState(learned, "topic-traversal", {
      notebook,
      now: "2026-08-02T10:00:00.000Z",
    }).status,
    "review_due",
  );

  const reviewed = recordLearningAttempt(learned, {
    nodeId: "topic-traversal",
    kind: "review",
    score: 96,
    confidence: 5,
  }, { notebook, now: "2026-08-02T10:00:00.000Z" });
  const reviewedNode = reviewed.nodes["topic-traversal"];

  assert.equal(reviewedNode.status, "mastered");
  assert.equal(reviewedNode.review.stage, 1);
  assert.equal(reviewedNode.review.intervalDays, 3);
  assert.equal(reviewedNode.review.dueAt, "2026-08-05T10:00:00.000Z");
  assert.deepEqual(
    getLearningReviewQueue([{ ...notebook, learningState: reviewed }], {
      now: "2026-08-06T10:00:00.000Z",
    }).map(({ id, status }) => ({ id, status })),
    [{ id: "topic-traversal", status: "review_due" }],
  );

  assert.deepEqual(calculateLearningReview(reviewedNode.review, {
    score: 40,
    confidence: 2,
  }, { now: "2026-08-06T10:00:00.000Z" }), {
    stage: 0,
    intervalDays: 1,
    dueAt: "2026-08-07T10:00:00.000Z",
    lastReviewedAt: "2026-08-06T10:00:00.000Z",
  });
});

test("records confidence, response summaries, and recurring/resolved misconceptions", () => {
  const initial = normalizeLearningState({}, { notebook, now: NOW });
  const first = recordLearningAttempt(initial, {
    nodeId: "topic-traversal",
    score: 45,
    confidence: 2,
    responseSummary: "I used the index as the array value.",
    misconceptions: [{ id: "index-value", label: "Confuses index and value" }],
  }, { notebook, now: NOW });
  const second = recordLearningAttempt(first, {
    nodeId: "topic-traversal",
    score: 78,
    confidence: 3,
    responseSummary: "I corrected the loop invariant.",
    misconceptions: [{ id: "index-value", label: "Confuses index and value" }],
  }, { notebook, now: "2026-08-01T10:05:00.000Z" });
  const resolved = recordLearningAttempt(second, {
    nodeId: "topic-traversal",
    kind: "reflection",
    confidence: 4,
    resolvedMisconceptionIds: ["index-value"],
  }, { notebook, now: "2026-08-01T10:10:00.000Z" });
  const node = resolved.nodes["topic-traversal"];

  assert.equal(node.attempts.length, 3);
  assert.equal(node.attempts[0].responseSummary, "I used the index as the array value.");
  assert.equal(node.status, "learned");
  assert.equal(node.misconceptions.length, 1);
  assert.equal(node.misconceptions[0].count, 2);
  assert.equal(node.misconceptions[0].resolvedAt, "2026-08-01T10:10:00.000Z");
});

test("persists, pauses, resumes, and summarizes a guided learning session", () => {
  const initial = normalizeLearningState({}, { notebook, now: NOW });
  const started = startLearningSession(initial, {
    id: "session-arrays",
    notebookId: notebook.id,
    subjectName: notebook.subjectName,
    objective: "Explain and apply array traversal",
    nodeIds: ["topic-traversal"],
  }, { notebook, now: NOW });
  const paused = updateLearningSession(started, {
    stageIndex: 3,
    pausedAt: true,
    nodeIds: ["topic-traversal"],
  }, { notebook, now: "2026-08-01T10:10:00.000Z" });
  const resumed = updateLearningSession(paused, {
    pausedAt: false,
  }, { notebook, now: "2026-08-01T10:12:00.000Z" });
  const attempted = recordLearningAttempt(resumed, {
    nodeId: "topic-traversal",
    kind: "mastery_check",
    score: 100,
    confidence: 5,
    responseSummary: "Traversal maintains an index-based invariant.",
  }, { notebook, now: "2026-08-01T10:15:00.000Z" });
  const finished = completeLearningSession(attempted, {
    summary: "Mastered array traversal through recall and practice.",
  }, { notebook, now: "2026-08-01T10:30:00.000Z" });
  const session = finished.sessions[0];

  assert.equal(paused.sessions[0].stageIndex, 3);
  assert.equal(started.sessions[0].updatedAt, NOW);
  assert.equal(paused.sessions[0].updatedAt, "2026-08-01T10:10:00.000Z");
  assert.equal(paused.sessions[0].accumulatedActiveMs, 10 * 60_000);
  assert.equal(paused.sessions[0].activeStartedAt, "");
  assert.equal(resumed.sessions[0].accumulatedActiveMs, 10 * 60_000);
  assert.equal(resumed.sessions[0].activeStartedAt, "2026-08-01T10:12:00.000Z");
  assert.equal(resumed.sessions[0].updatedAt, "2026-08-01T10:12:00.000Z");
  assert.equal(paused.sessions[0].pausedAt, "2026-08-01T10:10:00.000Z");
  assert.equal(resumed.sessions[0].pausedAt, "");
  assert.equal(attempted.nodes["topic-traversal"].attempts[0].sessionId, "session-arrays");
  assert.equal(session.status, "completed");
  assert.equal(session.stageIndex, 3);
  assert.equal(session.updatedAt, "2026-08-01T10:30:00.000Z");
  assert.equal(session.pausedAt, "");
  assert.equal(session.durationMinutes, 28);
  assert.equal(session.accumulatedActiveMs, 28 * 60_000);
  assert.equal(session.attemptCount, 1);
  assert.equal(session.correctAttempts, 1);
  assert.equal(session.accuracy, 100);
  assert.deepEqual(session.masteredNodeIds, ["topic-traversal"]);
  assert.equal(finished.activeSessionId, "");
});

test("aggregates learned/mastered/review-due topics, subjects, and recent sessions", () => {
  const dataNotebook = {
    ...notebook,
    learningState: {
      updatedAt: "2026-08-09T10:00:00.000Z",
      nodes: {
        "topic-traversal": {
          status: "mastered",
          masteryScore: 94,
          confidence: 5,
          learnedAt: "2026-08-02T10:00:00.000Z",
          masteredAt: "2026-08-04T10:00:00.000Z",
          lastStudiedAt: "2026-08-04T10:00:00.000Z",
          review: { stage: 2, dueAt: "2026-08-20T10:00:00.000Z" },
          attempts: [{ score: 100, correct: true, confidence: 5, answeredAt: "2026-08-04T10:00:00.000Z" }],
        },
        "topic-sorting": {
          status: "learned",
          masteryScore: 74,
          confidence: 3,
          learnedAt: "2026-08-05T10:00:00.000Z",
          lastStudiedAt: "2026-08-06T10:00:00.000Z",
          review: { stage: 0, dueAt: "2026-08-07T10:00:00.000Z" },
          attempts: [{ score: 60, correct: false, confidence: 3, answeredAt: "2026-08-06T10:00:00.000Z" }],
        },
      },
      sessions: [{
        id: "data-session",
        subjectName: "Data Structures",
        status: "completed",
        startedAt: "2026-08-06T09:30:00.000Z",
        completedAt: "2026-08-06T10:00:00.000Z",
        durationMinutes: 30,
      }],
    },
  };
  const operatingSystems = {
    id: "notebook-os",
    subjectName: "Operating Systems",
    chapters: [{
      id: "chapter-processes",
      title: "Processes",
      topics: [{ id: "topic-process-state", title: "Process states", subtopics: [] }],
    }],
    learningState: {
      nodes: {
        "topic-process-state": {
          status: "learned",
          masteryScore: 80,
          confidence: 4,
          learnedAt: "2026-08-08T10:00:00.000Z",
          lastStudiedAt: "2026-08-09T10:00:00.000Z",
          review: { stage: 1, dueAt: "2026-08-15T10:00:00.000Z" },
        },
      },
      sessions: [{
        id: "os-session",
        subjectName: "Operating Systems",
        status: "completed",
        startedAt: "2026-08-09T09:45:00.000Z",
        completedAt: "2026-08-09T10:00:00.000Z",
        durationMinutes: 15,
      }],
    },
  };
  const insights = getLearningInsights([dataNotebook, operatingSystems], {
    now: "2026-08-10T10:00:00.000Z",
  });

  assert.equal(insights.notebookCount, 2);
  assert.equal(insights.subjectCount, 2);
  assert.equal(insights.topicCount, 3);
  assert.equal(insights.learnedTopicCount, 3);
  assert.equal(insights.masteredTopicCount, 1);
  assert.equal(insights.reviewDueCount, 1);
  assert.equal(insights.sessionCount, 2);
  assert.equal(insights.studyMinutes, 45);
  assert.equal(insights.masteryRate, 33);
  assert.equal(insights.attemptCount, 2);
  assert.equal(insights.accuracy, 50);
  assert.deepEqual(
    insights.subjects.map(({ subjectName, totalTopics, learnedTopics, masteredTopics, reviewDue, studyMinutes }) => ({
      subjectName,
      totalTopics,
      learnedTopics,
      masteredTopics,
      reviewDue,
      studyMinutes,
    })),
    [
      {
        subjectName: "Data Structures",
        totalTopics: 2,
        learnedTopics: 2,
        masteredTopics: 1,
        reviewDue: 1,
        studyMinutes: 30,
      },
      {
        subjectName: "Operating Systems",
        totalTopics: 1,
        learnedTopics: 1,
        masteredTopics: 0,
        reviewDue: 0,
        studyMinutes: 15,
      },
    ],
  );
  assert.deepEqual(
    insights.recentLearnedTopics.map(({ title }) => title),
    ["Process states", "Array sorting", "Array traversal"],
  );
  assert.deepEqual(
    insights.recentSessions.map(({ id }) => id),
    ["os-session", "data-session"],
  );
});
test("restores legacy paused sessions and excludes an overnight pause from study time", () => {
  const legacy = normalizeLearningState({
    activeSessionId: "legacy-session",
    sessions: [{
      id: "legacy-session",
      subjectName: notebook.subjectName,
      status: "in_progress",
      startedAt: "2026-08-01T10:00:00.000Z",
      pausedAt: "2026-08-01T10:20:00.000Z",
      nodeIds: ["topic-traversal"],
    }],
  }, { notebook, now: "2026-08-02T10:00:00.000Z" });

  assert.equal(legacy.sessions[0].accumulatedActiveMs, 20 * 60_000);
  assert.equal(legacy.sessions[0].activeStartedAt, "");

  const finished = completeLearningSession(legacy, {}, {
    notebook,
    now: "2026-08-02T10:00:00.000Z",
  });

  assert.equal(finished.sessions[0].durationMinutes, 20);
  assert.equal(finished.sessions[0].accumulatedActiveMs, 20 * 60_000);
});

test("puts failed first-time learning into the due queue without reporting it as learned", () => {
  const initial = normalizeLearningState({}, { notebook, now: NOW });
  const failed = recordLearningAttempt(initial, {
    nodeId: "topic-traversal",
    kind: "mastery_check",
    score: 40,
    confidence: 2,
  }, { notebook, now: NOW });

  assert.equal(failed.nodes["topic-traversal"].status, "learning");
  assert.equal(failed.nodes["topic-traversal"].review.dueAt, "2026-08-02T10:00:00.000Z");
  assert.deepEqual(getLearningReviewQueue([{ ...notebook, learningState: failed }], {
    now: "2026-08-01T12:00:00.000Z",
  }), []);

  const dueQueue = getLearningReviewQueue([{ ...notebook, learningState: failed }], {
    now: "2026-08-02T10:00:00.000Z",
  });
  const insights = getLearningInsights([{ ...notebook, learningState: failed }], {
    now: "2026-08-02T10:00:00.000Z",
  });

  assert.deepEqual(dueQueue.map(({ id, status }) => ({ id, status })), [
    { id: "topic-traversal", status: "review_due" },
  ]);
  assert.equal(insights.reviewDueCount, 1);
  assert.equal(insights.learnedTopicCount, 0);
  assert.deepEqual(insights.recentLearnedTopics, []);
});

test("manual completion preserves mastered and due learning evidence", () => {
  const initial = normalizeLearningState({}, { notebook, now: NOW });
  const mastered = recordLearningAttempt(initial, {
    nodeId: "topic-traversal",
    score: 100,
    confidence: 5,
  }, { notebook, now: NOW });
  const masteredNode = structuredClone(mastered.nodes["topic-traversal"]);
  const manuallyCompletedMastered = markLearningNodeLearned(
    mastered,
    "topic-traversal",
    { notebook, now: "2026-08-01T10:05:00.000Z" },
  );

  assert.deepEqual(manuallyCompletedMastered.nodes["topic-traversal"], masteredNode);

  const failed = recordLearningAttempt(initial, {
    nodeId: "topic-sorting",
    score: 35,
    confidence: 1,
  }, { notebook, now: NOW });
  const failedNode = structuredClone(failed.nodes["topic-sorting"]);
  const manuallyCompletedDue = markLearningNodeLearned(
    failed,
    "topic-sorting",
    { notebook, now: "2026-08-02T10:00:00.000Z" },
  );

  assert.deepEqual(manuallyCompletedDue.nodes["topic-sorting"], failedNode);
  assert.equal(getLearningNodeStatus(
    manuallyCompletedDue.nodes["topic-sorting"],
    { now: "2026-08-02T10:00:00.000Z" },
  ), "review_due");
});
