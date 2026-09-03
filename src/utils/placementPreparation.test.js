import assert from "node:assert/strict";
import test from "node:test";
import { upsertLearningPlannerTask } from "./learningPlanner.js";
import {
  buildPlacementActionTarget,
  buildPlacementChatPrompt,
  createPlacementDraft,
  deletePlacementHistoryEntry,
  getPlacementHistory,
  getSavedPlacementAnalysis,
  hasSavedPlacementPreparation,
  mergePlacementDraft,
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

  const deleted = deletePlacementHistoryEntry(pinned, firstDraft.id);
  assert.equal(getPlacementHistory(deleted).length, 1);
  assert.equal(getSavedPlacementAnalysis(deleted).targetRole, "Platform intern");
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
