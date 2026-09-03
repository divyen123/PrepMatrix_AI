import assert from "node:assert/strict";
import test from "node:test";
import { upsertLearningPlannerTask } from "./learningPlanner.js";
import {
  buildPlacementActionTarget,
  buildPlacementChatPrompt,
  clearPlacementHistory,
  createPlacementDraft,
  deletePlacementHistoryEntry,
  getPlacementHistory,
  getSavedPlacementAnalysis,
  hasSavedPlacementPreparation,
  mergePlacementDraft,
  normalizePlacementPreparationSource,
  setPlacementHistoryPinned,
} from "./placementPreparation.js";

function analysisPayload() {
  return {
    providerModel: "test-model",
    topicAnalysis: {
      targetRole: "Backend intern",
      overview: "Prepare role fundamentals and coding trade-offs.",
      topics: [{
        id: "career-topic-1",
        title: "Graph algorithms",
        explanation: "Choose a traversal based on the graph and objective.",
        whyItMatters: "Interviews test reasoning about traversal and complexity.",
        interviewQuestions: [{
          id: "career-topic-1-question-1",
          question: "When would you choose BFS over DFS?",
          guidance: "Compare shortest paths, memory, and traversal order.",
        }],
        practiceSteps: ["Implement BFS with an adjacency list."],
      }],
      preparationPlan: [],
    },
  };
}

test("keeps generated placement analysis outside the notebook until explicit merge", () => {
  const notebook = {
    id: "notebook-1",
    subjectName: "Data Structures",
    careerPreparation: { enabled: true, topicAnalysis: { topics: [] } },
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
  const draft = createPlacementDraft(analysisPayload(), {
    notebookId: notebook.id,
    requestedTopics: ["Graph algorithms"],
    targetRole: "Backend intern",
    generatedAt: "2026-08-08T10:00:00.000Z",
  });

  assert.equal(hasSavedPlacementPreparation(notebook), false);
  assert.equal(notebook.careerPreparation.topicAnalysis.topics.length, 0);
  assert.equal(draft.analysis.topics[0].title, "Graph algorithms");

  const saved = mergePlacementDraft(notebook, draft, {
    savedAt: "2026-08-08T10:05:00.000Z",
  });
  assert.equal(hasSavedPlacementPreparation(saved), true);
  assert.equal(getSavedPlacementAnalysis(saved).targetRole, "Backend intern");
  assert.equal(saved.careerPreparation.topicAnalysis.topics[0].id, "career-topic-1");
  assert.deepEqual(saved.careerHistoryMutation, {
    action: "upsert",
    id: draft.id,
  });
  assert.equal(notebook.careerPreparation.topicAnalysis.topics.length, 0);
});

test("refuses to merge a placement draft into another notebook", () => {
  const draft = createPlacementDraft(analysisPayload(), {
    notebookId: "notebook-1",
    requestedTopics: ["Graph algorithms"],
  });

  assert.throws(
    () => mergePlacementDraft({ id: "notebook-2" }, draft),
    /different learning notebook/u,
  );
});

test("keeps every placement generation and sorts pinned history first", () => {
  const firstDraft = createPlacementDraft(analysisPayload(), {
    notebookId: "notebook-1",
    generatedAt: "2026-08-08T10:00:00.000Z",
  });
  const secondDraft = createPlacementDraft({
    ...analysisPayload(),
    topicAnalysis: { ...analysisPayload().topicAnalysis, targetRole: "Platform intern" },
  }, {
    notebookId: "notebook-1",
    generatedAt: "2026-08-09T10:00:00.000Z",
  });
  const withFirst = mergePlacementDraft({ id: "notebook-1" }, firstDraft);
  const withBoth = mergePlacementDraft(withFirst, secondDraft);

  assert.equal(getPlacementHistory(withBoth).length, 2);
  assert.equal(getPlacementHistory(withBoth)[0].id, secondDraft.id);

  const pinned = setPlacementHistoryPinned(withBoth, firstDraft.id, true);
  assert.equal(getPlacementHistory(pinned)[0].id, firstDraft.id);
  assert.equal(getPlacementHistory(pinned)[0].pinned, true);
  assert.deepEqual(pinned.careerHistoryMutation, {
    action: "pin",
    id: firstDraft.id,
    pinned: true,
  });

  const deleted = deletePlacementHistoryEntry(pinned, firstDraft.id);
  assert.equal(getPlacementHistory(deleted).length, 1);
  assert.equal(getSavedPlacementAnalysis(deleted).targetRole, "Platform intern");
  assert.deepEqual(deleted.careerHistoryMutation, {
    action: "delete",
    id: firstDraft.id,
  });

  const cleared = clearPlacementHistory(deleted);
  assert.equal(getPlacementHistory(cleared).length, 0);
  assert.deepEqual(cleared.careerHistoryMutation, { action: "clear" });
});

test("builds stable coding targets with note, planner, and editable chat context", () => {
  const topic = analysisPayload().topicAnalysis.topics[0];
  const item = topic.interviewQuestions[0];
  const options = {
    codingRelevant: true,
    index: 0,
    item,
    kind: "interview",
    notebook: { id: "notebook-1", subjectName: "Data Structures", title: "DS notebook" },
    targetRole: "Backend intern",
    topic,
  };
  const first = buildPlacementActionTarget(options);
  const second = buildPlacementActionTarget(options);

  assert.equal(first.id, second.id);
  assert.equal(first.unitKey, first.id);
  assert.equal(first.metadata.notebookId, "notebook-1");
  assert.match(first.explanation, /Coding guidance/u);
  assert.match(first.explanation, /time and space complexity/u);

  const planner = upsertLearningPlannerTask(
    [{ day: 1, date: "2026-08-09", tasks: [] }],
    { id: options.notebook.id, subjectName: options.notebook.subjectName },
    first,
    "2026-08-09",
    "",
    "2026-08-08",
  );
  assert.equal(planner.task.sourceLearningNodeId, first.id);
  assert.equal(planner.task.topic, first.title);
  assert.equal(planner.task.chapterName, first.chapterName);

  const prompt = buildPlacementChatPrompt({
    notebook: options.notebook,
    target: first,
    targetRole: options.targetRole,
    topic,
  });
  assert.match(prompt, /Target role: Backend intern/u);
  assert.match(prompt, /code-oriented walkthrough/u);
  assert.match(prompt, /attempt the final check/u);
});

test("normalizes and preserves learner-provided preparation context in hidden workspace history", () => {
  const preparationSource = "  REST APIs on Node.js\r\n\r\nFocus on authentication.  ";
  const notebook = {
    id: "placement-workspace-1",
    artifactKind: "placement-workspace",
    preparationSource: "Fallback workspace context",
    subjectName: "Placement preparation",
  };
  const draft = createPlacementDraft({
    ...analysisPayload(),
    notebook,
  }, {
    preparationSource,
    requestedTopics: ["Graph algorithms"],
    targetRole: "Backend intern",
  });

  assert.equal(draft.notebookId, notebook.id);
  assert.deepEqual(draft.preparationSource, {
    context: "REST APIs on Node.js\n\nFocus on authentication.",
    label: "REST APIs on Node.js Focus on authentication.",
    type: "custom",
  });

  const saved = mergePlacementDraft(notebook, draft);
  const [entry] = getPlacementHistory(saved);
  assert.deepEqual(entry.preparationSource, draft.preparationSource);

  const target = buildPlacementActionTarget({
    item: analysisPayload().topicAnalysis.topics[0].interviewQuestions[0],
    kind: "interview",
    notebook,
    preparationSource: entry.preparationSource,
    targetRole: "Backend intern",
    topic: analysisPayload().topicAnalysis.topics[0],
  });
  assert.deepEqual(target.metadata.preparationSource, entry.preparationSource);
  assert.match(target.summary, /Preparation context: REST APIs on Node\.js/u);

  const prompt = buildPlacementChatPrompt({
    notebook,
    target,
    targetRole: "Backend intern",
    topic: analysisPayload().topicAnalysis.topics[0],
  });
  assert.match(prompt, /Learner-provided preparation context:\nREST APIs on Node\.js/u);
  assert.doesNotMatch(prompt, /Notebook: /u);
  assert.doesNotMatch(prompt, /Subject: /u);
});

test("bounds freeform preparation context and falls back only when it is empty", () => {
  assert.equal(
    normalizePlacementPreparationSource("  ", "Fallback context").context,
    "Fallback context",
  );
  assert.equal(
    normalizePlacementPreparationSource("Own context", "Fallback context").context,
    "Own context",
  );
  assert.equal(normalizePlacementPreparationSource("x".repeat(3100)).context.length, 3000);
  assert.deepEqual(normalizePlacementPreparationSource({
    context: "API design",
    label: "Backend APIs",
    notebookId: "notebook-1",
    type: "notebook",
  }), {
    context: "API design",
    label: "Backend APIs",
    notebookId: "notebook-1",
    type: "notebook",
  });
});

test("detects language-specific practice text as coding guidance", () => {
  const target = buildPlacementActionTarget({
    index: 0,
    item: "Write a C++ class and test invalid input.",
    kind: "practice",
    notebook: { id: "notebook-1", subjectName: "Object-oriented design" },
    topic: { id: "career-topic-2", title: "Object modeling" },
  });

  assert.match(target.explanation, /Coding guidance/u);
  assert.match(target.explanation, /implement and test the code/u);
});
