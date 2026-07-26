import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_LEARNING_IMPORTANT_QUESTIONS,
  MAX_LEARNING_MIND_MAP_NODES,
  MAX_LEARNING_SUBTOPICS,
  MAX_LEARNING_TOPICS,
  getLearningCareerEligibility,
  hasLearningNotebookShape,
  normalizeLearningNotebook,
} from "./learningNotebook.js";

function generatedNotebook(overrides = {}) {
  return {
    title: "Operating Systems Revision",
    overview: "A compact operating systems overview.",
    importantQuestions: [{
      question: "What is virtual memory?",
      answer: "It maps virtual addresses to physical storage.",
      whyItMatters: "It is a common exam and interview concept.",
      difficulty: "medium",
    }],
    revisedNotes: [{
      title: "Memory management",
      content: "Paging divides memory into fixed-size units.",
      keyPoints: ["Pages map to frames."],
      revisionTips: ["Draw the address translation path."],
    }],
    chapters: [{
      title: "Memory",
      summary: "How an operating system organizes memory concepts.",
      topics: [{
        title: "Memory management",
        summary: "How an operating system allocates and protects memory.",
        importance: "high",
        keyPoints: ["Paging", "Segmentation"],
        revisionTips: ["Compare paging and segmentation."],
        subtopics: [{
          title: "Paging",
          summary: "Fixed-size virtual memory blocks.",
          keyPoints: ["Page tables"],
        }],
      }],
    }],
    mindMap: {
      nodes: [
        { id: "root", label: "Operating Systems", kind: "root" },
        { id: "memory", label: "Memory", parentId: "root", kind: "topic" },
      ],
    },
    careerPreparation: {
      focus: "Technical interview readiness.",
      skills: ["Systems reasoning"],
      interviewQuestions: [{
        question: "How does a page fault work?",
        guidance: "Trace the trap, disk read, and page table update.",
      }],
      codingTopics: [{
        title: "Concurrency",
        whyItMatters: "Interviewers test synchronization fundamentals.",
        practiceSteps: ["Implement a bounded queue."],
      }],
    },
    ...overrides,
  };
}

test("normalizes a bounded notebook and strips raw source payloads", () => {
  const notebook = normalizeLearningNotebook(generatedNotebook(), {
    id: "notebook-1",
    subjectName: "Operating Systems",
    chapterNames: ["Memory", "Processes"],
    profile: {
      academicLevel: "Undergraduate / Bachelor's",
      academicTrack: "Computer Science & IT",
      degree: "B.Tech",
      department: "Information Technology",
    },
    sources: [{
      name: "os.pdf",
      type: "application/pdf",
      size: 4096,
      kind: "pdf",
      analysisMode: "text",
      totalPages: 80,
      pagesRead: 40,
      truncated: true,
      dataUrl: "data:application/pdf;base64,secret",
      text: "raw source text",
    }],
    model: "test-model",
    now: new Date("2026-07-26T10:00:00.000Z"),
  });

  assert.equal(notebook.id, "notebook-1");
  assert.deepEqual(notebook.chapterNames, ["Memory", "Processes"]);
  assert.equal(notebook.importantQuestions[0].question, "What is virtual memory?");
  assert.equal(notebook.chapters[0].topics[0].title, "Memory management");
  assert.equal(notebook.topics[0].subtopics[0].title, "Paging");
  assert.equal(notebook.mindMap.edges[0].from, "root");
  assert.equal(notebook.careerPreparation.enabled, true);
  assert.equal(notebook.careerPreparation.codingRelevant, true);
  assert.equal(notebook.sources[0].truncated, true);
  assert.equal("dataUrl" in notebook.sources[0], false);
  assert.equal("text" in notebook.sources[0], false);
  assert.equal(notebook.createdAt, "2026-07-26T10:00:00.000Z");
});

test("scopes generated topic and subtopic IDs to their chapter", () => {
  const notebook = normalizeLearningNotebook(generatedNotebook({
    chapters: [
      { title: "Arrays", topics: [{ title: "Traversal", subtopics: [{ title: "Complexity" }] }] },
      { title: "Trees", topics: [{ title: "Traversal", subtopics: [{ title: "Complexity" }] }] },
    ],
    mindMap: { nodes: [] },
  }), { subjectName: "Data Structures" });

  const outlineIds = notebook.chapters.flatMap((chapter) => [
    chapter.id,
    ...chapter.topics.flatMap((topic) => [
      topic.id,
      ...topic.subtopics.map((subtopic) => subtopic.id),
    ]),
  ]);
  const firstTopic = notebook.chapters[0].topics[0];
  const secondTopic = notebook.chapters[1].topics[0];

  assert.equal(new Set(outlineIds).size, outlineIds.length);
  assert.match(firstTopic.id, new RegExp(`^${notebook.chapters[0].id}-`));
  assert.match(secondTopic.id, new RegExp(`^${notebook.chapters[1].id}-`));
  assert.notEqual(firstTopic.id, secondTopic.id);
  assert.equal(
    new Set(notebook.mindMap.nodes.map((node) => node.id)).size,
    notebook.mindMap.nodes.length,
  );
});

test("caps generated collections and creates a safe fallback mind map", () => {
  const topics = Array.from({ length: MAX_LEARNING_TOPICS + 5 }, (_, topicIndex) => ({
    title: `Topic ${topicIndex + 1}`,
    subtopics: Array.from(
      { length: MAX_LEARNING_SUBTOPICS + 3 },
      (_, subtopicIndex) => ({ title: `Subtopic ${topicIndex + 1}.${subtopicIndex + 1}` }),
    ),
  }));
  const importantQuestions = Array.from(
    { length: MAX_LEARNING_IMPORTANT_QUESTIONS + 5 },
    (_, index) => ({ question: `Question ${index + 1}?` }),
  );

  const notebook = normalizeLearningNotebook(generatedNotebook({
    importantQuestions,
    chapters: [{ title: "Everything", topics }],
    mindMap: { nodes: [] },
  }), {
    subjectName: "Large subject",
    profile: { academicLevel: "Secondary School", academicTrack: "CBSE" },
  });

  assert.equal(notebook.importantQuestions.length, MAX_LEARNING_IMPORTANT_QUESTIONS);
  assert.equal(notebook.topics.length, MAX_LEARNING_TOPICS);
  assert.equal(notebook.topics[0].subtopics.length, MAX_LEARNING_SUBTOPICS);
  assert.ok(notebook.mindMap.nodes.length <= MAX_LEARNING_MIND_MAP_NODES);
  assert.equal(notebook.mindMap.nodes[0].kind, "root");
});

test("gates career preparation by academic category and field", () => {
  const school = getLearningCareerEligibility({
    academicLevel: "Class 10",
    academicTrack: "CBSE",
  });
  const technicalDegree = getLearningCareerEligibility({
    academicLevel: "Undergraduate / Bachelor's",
    academicTrack: "Engineering & Technology",
    degree: "B.Tech Computer Science",
    department: "Computer Science",
  });
  const businessDegree = getLearningCareerEligibility({
    academicLevel: "Postgraduate / Master's",
    academicTrack: "Business & Management",
    degree: "MBA",
    department: "Finance",
  });

  assert.deepEqual(
    { enabled: school.enabled, codingRelevant: school.codingRelevant },
    { enabled: false, codingRelevant: false },
  );
  assert.deepEqual(
    { enabled: technicalDegree.enabled, codingRelevant: technicalDegree.codingRelevant },
    { enabled: true, codingRelevant: true },
  );
  assert.deepEqual(
    { enabled: businessDegree.enabled, codingRelevant: businessDegree.codingRelevant },
    { enabled: true, codingRelevant: false },
  );
  assert.equal(getLearningCareerEligibility({}).enabled, false);
});

test("drops ineligible and irrelevant career details server-side", () => {
  const schoolNotebook = normalizeLearningNotebook(generatedNotebook(), {
    profile: { academicLevel: "Middle School", academicTrack: "State Board" },
  });
  const businessNotebook = normalizeLearningNotebook(generatedNotebook(), {
    profile: {
      academicLevel: "Postgraduate / Master's",
      academicTrack: "Business & Management",
      degree: "MBA",
      department: "Finance",
    },
  });

  assert.equal(schoolNotebook.careerPreparation.enabled, false);
  assert.deepEqual(schoolNotebook.careerPreparation.interviewQuestions, []);
  assert.equal(businessNotebook.careerPreparation.enabled, true);
  assert.equal(businessNotebook.careerPreparation.codingRelevant, false);
  assert.deepEqual(businessNotebook.careerPreparation.codingTopics, []);
});

test("recognizes only the strict generated notebook envelope", () => {
  assert.equal(hasLearningNotebookShape(generatedNotebook()), true);
  assert.equal(hasLearningNotebookShape({ notebook: generatedNotebook() }), true);
  assert.equal(hasLearningNotebookShape(generatedNotebook({ chapters: [] })), false);
  assert.equal(hasLearningNotebookShape(generatedNotebook({ chapters: [{ title: "", topics: [] }] })), false);
  assert.equal(hasLearningNotebookShape({ overview: "Missing arrays" }), false);
  assert.equal(hasLearningNotebookShape(null), false);
});
