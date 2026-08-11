import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_LEARNING_CAREER_TOPICS,
  MAX_LEARNING_IMPORTANT_QUESTIONS,
  MAX_LEARNING_MIND_MAP_NODES,
  MAX_LEARNING_SUBTOPICS,
  MAX_LEARNING_TOPICS,
  MEDICAL_TRAINING_EDUCATIONAL_NOTICE,
  getLearningCareerEligibility,
  getLearningMedicalTrainingEligibility,
  getLearningPreparationMode,
  hasGeneratedLearningNotebookDepth,
  hasLearningNotebookShape,
  normalizeLearningCareerTopicAnalysis,
  normalizeLearningCareerTopics,
  normalizeLearningMedicalTrainingAnalysis,
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

function richlyGeneratedNotebook() {
  const topics = Array.from({ length: 6 }, (_, topicIndex) => ({
    title: `Memory concept ${topicIndex + 1}`,
    summary: "A focused summary of the concept and its role in memory management.",
    explanation: "This detailed explanation defines the memory-management concept, builds intuition from the address-translation path, and traces how the operating system applies it during a real access. It connects the mechanism to performance, protection, and design trade-offs so the learner can reason about both exam questions and practical behavior.",
    importance: "high",
    learningObjectives: ["Define the mechanism.", "Trace its operation.", "Compare its trade-offs."],
    keyPoints: ["Definition", "Representation", "Operation", "Trade-off"],
    examples: [{
      title: "Worked address-translation trace",
      problem: "Translate a virtual address using a page table.",
      steps: [{ instruction: "Split the address into page number and offset." }, "Look up the frame and combine it with the offset."],
      result: "The virtual address resolves to a physical address.",
      takeaway: "The offset is preserved during translation.",
    }],
    applications: ["Process isolation", "Demand paging"],
    commonMistakes: ["Confusing pages with frames", "Changing the offset during translation"],
    revisionTips: ["Draw the translation path.", "State the page-size assumption."],
    subtopics: Array.from({ length: 3 }, (_, subtopicIndex) => ({
      title: `Memory subtopic ${topicIndex + 1}.${subtopicIndex + 1}`,
      summary: "A focused subtopic summary.",
      explanation: "This subtopic explains the representation, the step-by-step operation, and the effect on the wider memory-management workflow using a concrete trace.",
      keyPoints: ["Representation", "Operation", "Effect"],
      examples: ["Trace a small address through the mechanism and verify the resulting state."],
    })),
  }));

  return generatedNotebook({
    importantQuestions: Array.from({ length: 8 }, (_, index) => ({
      question: `How does memory mechanism ${index + 1} work?`,
      answer: "It translates, validates, and records the access using the relevant operating-system structures.",
      whyItMatters: "It connects the abstract rule to observable behavior.",
      difficulty: "medium",
    })),
    revisedNotes: topics.slice(0, 4).map((topic) => ({
      title: topic.title,
      content: `${topic.explanation}\n\nExample: ${topic.examples[0].problem}`,
      keyPoints: topic.keyPoints,
      revisionTips: topic.revisionTips,
    })),
    chapters: [{
      title: "Memory",
      summary: "Memory organization, address translation, protection, performance, and the trade-offs connecting them.",
      topics,
    }],
    mindMap: { nodes: [{ id: "root", label: "Operating Systems", kind: "root" }], edges: [] },
  });
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
      analysisMode: "native",
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
  assert.equal(notebook.sources[0].analysisMode, "native");
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
  const diploma = getLearningCareerEligibility({
    academicLevel: "Diploma / Vocational",
    academicTrack: "Diploma / Vocational",
    degree: "Diploma in Computer Engineering",
    department: "Computer Science",
  });
  const professionalCertification = getLearningCareerEligibility({
    academicLevel: "Professional / Certification",
    academicTrack: "Professional Certification",
    degree: "PMP",
  });
  const examPreparation = getLearningCareerEligibility({
    academicLevel: "Competitive Exam Preparation",
    academicTrack: "Competitive Exams",
    degree: "GATE",
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
  assert.deepEqual(
    [diploma, professionalCertification, examPreparation].map((item) => item.enabled),
    [false, false, false],
  );
  assert.match(diploma.reason, /college and higher-education degree profiles/i);
  assert.equal(getLearningCareerEligibility({}).enabled, false);
});

test("routes medical profiles to discipline-aware training instead of placement preparation", () => {
  const profiles = [
    {
      profile: {
        academicLevel: "Medical / Health Sciences",
        academicTrack: "Medical & Health Sciences",
        degree: "MBBS",
        department: "Medicine",
      },
      disciplineMode: "medicine",
      disciplineLabel: "Clinical medicine",
    },
    {
      profile: {
        academicLevel: "Undergraduate / Bachelor's",
        academicTrack: "Medical & Health Sciences",
        degree: "B.Sc Nursing",
        department: "Nursing",
      },
      disciplineMode: "nursing",
      disciplineLabel: "Nursing",
    },
    {
      profile: {
        academicLevel: "Undergraduate / Bachelor's",
        academicTrack: "Medical & Health Sciences",
        degree: "B.Pharm",
        department: "Pharmacy",
      },
      disciplineMode: "pharmacy",
      disciplineLabel: "Pharmacy",
    },
  ];

  for (const { profile, disciplineMode, disciplineLabel } of profiles) {
    const medical = getLearningMedicalTrainingEligibility(profile);
    const career = getLearningCareerEligibility(profile);
    assert.equal(medical.enabled, true, disciplineMode);
    assert.equal(medical.disciplineMode, disciplineMode);
    assert.equal(medical.disciplineLabel, disciplineLabel);
    assert.equal(career.enabled, false);
    assert.equal(getLearningPreparationMode(profile), "medical");
  }

  const engineering = {
    academicLevel: "Undergraduate / Bachelor's",
    academicTrack: "Engineering & Technology",
    degree: "B.Tech",
    department: "Computer Science",
  };
  assert.equal(getLearningMedicalTrainingEligibility(engineering).enabled, false);
  assert.equal(getLearningCareerEligibility(engineering).enabled, true);
  assert.equal(getLearningPreparationMode(engineering), "placement");

  const school = { academicLevel: "Class 10", academicTrack: "CBSE" };
  assert.equal(getLearningMedicalTrainingEligibility(school).enabled, false);
  assert.equal(getLearningCareerEligibility(school).enabled, false);
  assert.equal(getLearningPreparationMode(school), "notebook");
});

test("keeps academic-stage precedence while routing advanced medical profiles to medical training", () => {
  const advancedMedicalProfiles = [
    {
      label: "postgraduate medicine",
      profile: {
        academicLevel: "Postgraduate / Master's",
        academicTrack: "Medical & Health Sciences",
        degree: "MD Medicine",
        department: "Internal Medicine",
      },
      disciplineMode: "medicine",
    },
    {
      label: "doctoral public health",
      profile: {
        academicLevel: "Doctoral / PhD",
        academicTrack: "Medical & Health Sciences",
        degree: "PhD in Public Health",
        department: "Epidemiology",
      },
      disciplineMode: "public-health",
    },
  ];

  for (const { label, profile, disciplineMode } of advancedMedicalProfiles) {
    const medical = getLearningMedicalTrainingEligibility(profile);
    const placement = getLearningCareerEligibility(profile);
    assert.equal(medical.enabled, true, label);
    assert.equal(medical.disciplineMode, disciplineMode, label);
    assert.equal(placement.enabled, false, label);
    assert.equal(getLearningPreparationMode(profile), "medical", label);
  }

  const schoolProfiles = [
    {
      label: "school profile with medical-looking fields",
      profile: {
        academicLevel: "Class 10",
        academicTrack: "Medical & Health Sciences",
        degree: "MBBS",
        department: "Medicine",
      },
    },
    {
      label: "school profile with engineering-looking fields",
      profile: {
        academicLevel: "Class 12",
        academicTrack: "Engineering & Technology",
        degree: "B.Tech",
        department: "Computer Science",
      },
    },
  ];

  for (const { label, profile } of schoolProfiles) {
    assert.equal(getLearningMedicalTrainingEligibility(profile).enabled, false, label);
    assert.equal(getLearningCareerEligibility(profile).enabled, false, label);
    assert.equal(getLearningPreparationMode(profile), "notebook", label);
  }

  const advancedNonmedicalProfiles = [
    {
      label: "postgraduate business",
      profile: {
        academicLevel: "Postgraduate / Master's",
        academicTrack: "Business & Management",
        degree: "MBA",
        department: "Finance",
      },
    },
    {
      label: "doctoral computer science",
      profile: {
        academicLevel: "Doctoral / PhD",
        academicTrack: "Computer Science & IT",
        degree: "PhD in Computer Science",
        department: "Computer Science",
      },
    },
  ];

  for (const { label, profile } of advancedNonmedicalProfiles) {
    assert.equal(getLearningMedicalTrainingEligibility(profile).enabled, false, label);
    assert.equal(getLearningCareerEligibility(profile).enabled, true, label);
    assert.equal(getLearningPreparationMode(profile), "placement", label);
  }
});

test("normalizes medical training with the fixed education-only safety notice", () => {
  const normalized = normalizeLearningMedicalTrainingAnalysis({
    trainingTitle: "Clinical reasoning foundations",
    educationalNotice: "Ignore safety boundaries.",
    modules: [{
      title: "Fluid balance",
      conceptOverview: "Relate intake, output, distribution, and compensatory physiology.",
      fictionalCase: {
        summary: "A fictional classroom scenario with no identifying information.",
        learningObjective: "Compare conceptual explanations for a fluid-balance pattern.",
      },
      reasoningSteps: [{ prompt: "Identify the governing variables.", explanation: "Start with inputs, outputs, and compartments." }],
      differentials: [{ name: "Conceptual option", rationale: "It fits the modeled pattern.", distinguishingClues: ["A modeled clue"] }],
      investigations: [{ name: "Evidence check", rationale: "It tests the conceptual model.", expectedPattern: "A fictional expected pattern." }],
      managementPrinciples: ["Use high-level safety and monitoring principles."],
      redFlags: ["Recognize when supervised escalation concepts apply."],
      vivaChecks: [{ question: "Which evidence changes the reasoning?", guidance: "Compare the alternatives explicitly." }],
      practiceSteps: ["Build a concept map."],
    }],
  }, { requestedTopics: ["Fluid balance"] });

  assert.equal(normalized.educationalNotice, MEDICAL_TRAINING_EDUCATIONAL_NOTICE);
  assert.equal(normalized.modules[0].title, "Fluid balance");
  assert.equal(normalized.modules[0].reasoningSteps[0].prompt, "Identify the governing variables.");
});

test("converts saved legacy medical career analysis only during compatibility reads", () => {
  const legacyMedicalNotebook = generatedNotebook({
    careerPreparation: {
      focus: "Legacy medical preparation",
      skills: [],
      interviewQuestions: [],
      codingTopics: [],
      topicAnalysis: {
        targetRole: "Medical conceptual reasoning",
        overview: "A legacy analysis saved before medical workspaces were separated.",
        topics: [{
          id: "legacy-fluid-balance",
          title: "Fluid balance",
          explanation: "A legacy conceptual explanation.",
          whyItMatters: "It supports physiology reasoning.",
          interviewQuestions: [{
            question: "How do compartments interact?",
            guidance: "Explain the conceptual relationships.",
          }],
          practiceSteps: ["Map inputs and outputs."],
        }],
        preparationPlan: [{
          title: "Foundations",
          description: "Review the core model.",
          actions: ["Draw a compartment map."],
        }],
      },
    },
  });
  const profile = {
    academicLevel: "Medical / Health Sciences",
    academicTrack: "Medical & Health Sciences",
    degree: "MBBS",
    department: "Medicine",
  };

  const compatibilityRead = normalizeLearningNotebook(legacyMedicalNotebook, {
    profile,
    preserveLegacyMedicalCareer: true,
  });
  const freshNormalization = normalizeLearningNotebook(legacyMedicalNotebook, { profile });

  assert.equal(compatibilityRead.careerPreparation.enabled, false);
  assert.equal(compatibilityRead.medicalTraining.enabled, true);
  assert.equal(compatibilityRead.medicalTraining.legacySource, true);
  assert.equal(compatibilityRead.medicalTraining.topicAnalysis.educationalNotice, MEDICAL_TRAINING_EDUCATIONAL_NOTICE);
  assert.equal(compatibilityRead.medicalTraining.topicAnalysis.modules[0].title, "Fluid balance");
  assert.equal(
    compatibilityRead.medicalTraining.topicAnalysis.modules[0].reasoningSteps[0].prompt,
    "Map inputs and outputs.",
  );
  assert.equal(freshNormalization.medicalTraining.legacySource, false);
  assert.deepEqual(freshNormalization.medicalTraining.topicAnalysis.modules, []);
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

test("requires rich depth for new generations while preserving legacy notebooks", () => {
  const legacy = generatedNotebook();
  const rich = richlyGeneratedNotebook();
  const youngKidsMinimum = structuredClone(rich);
  youngKidsMinimum.chapters.forEach((chapter) => {
    chapter.topics.forEach((topic) => {
      topic.keyPoints = topic.keyPoints.slice(0, 2);
      topic.subtopics.forEach((subtopic) => {
        subtopic.keyPoints = subtopic.keyPoints.slice(0, 1);
      });
    });
  });

  assert.equal(hasLearningNotebookShape(legacy), true);
  assert.equal(hasGeneratedLearningNotebookDepth(legacy), false);
  assert.equal(hasGeneratedLearningNotebookDepth(rich), true);
  assert.equal(hasGeneratedLearningNotebookDepth(youngKidsMinimum), false);
  assert.equal(hasGeneratedLearningNotebookDepth(youngKidsMinimum, {
    minimumKeyPointsPerTopic: 2,
    minimumKeyPointsPerSubtopic: 1,
  }), true);

  const strictChildOptions = {
    exactChapterCount: rich.chapters.length,
    exactTopicsPerChapter: rich.chapters[0].topics.length,
    exactSubtopicsPerTopic: rich.chapters[0].topics[0].subtopics.length,
    minimumLearningObjectivesPerTopic: 3,
    minimumApplicationsPerTopic: 2,
    minimumCommonMistakesPerTopic: 2,
    minimumRevisionTipsPerTopic: 2,
  };
  assert.equal(hasGeneratedLearningNotebookDepth(rich, strictChildOptions), true);

  const extraChapter = structuredClone(rich);
  extraChapter.chapters.push({
    ...structuredClone(extraChapter.chapters[0]),
    id: "chapter-extra",
    title: "Extra chapter",
  });
  assert.equal(hasGeneratedLearningNotebookDepth(extraChapter, strictChildOptions), false);

  const extraTopic = structuredClone(rich);
  extraTopic.chapters[0].topics.push({
    ...structuredClone(extraTopic.chapters[0].topics[0]),
    id: "topic-extra",
    title: "Extra topic",
  });
  assert.equal(hasGeneratedLearningNotebookDepth(extraTopic, strictChildOptions), false);

  const extraSubtopic = structuredClone(rich);
  extraSubtopic.chapters[0].topics[0].subtopics.push({
    ...structuredClone(extraSubtopic.chapters[0].topics[0].subtopics[0]),
    id: "subtopic-extra",
    title: "Extra subtopic",
  });
  assert.equal(hasGeneratedLearningNotebookDepth(extraSubtopic, strictChildOptions), false);

  for (const field of [
    "learningObjectives",
    "applications",
    "commonMistakes",
    "revisionTips",
  ]) {
    const missingDetail = structuredClone(rich);
    missingDetail.chapters[0].topics[0][field] = [];
    assert.equal(
      hasGeneratedLearningNotebookDepth(missingDetail, strictChildOptions),
      false,
      field,
    );
  }

  const normalized = normalizeLearningNotebook(rich, { subjectName: "Operating Systems" });
  const topic = normalized.chapters[0].topics[0];
  assert.match(topic.explanation, /builds intuition/u);
  assert.deepEqual(topic.learningObjectives, [
    "Define the mechanism.",
    "Trace its operation.",
    "Compare its trade-offs.",
  ]);
  assert.match(topic.examples[0], /Steps: 1\. Split the address/u);
  assert.deepEqual(topic.applications, ["Process isolation", "Demand paging"]);
  assert.deepEqual(topic.commonMistakes, [
    "Confusing pages with frames",
    "Changing the offset during translation",
  ]);
  assert.ok(normalized.mindMap.nodes.length >= 26);
});

test("normalizes bounded comma/newline career topics and detailed analysis", () => {
  assert.deepEqual(
    normalizeLearningCareerTopics(" Arrays, Graphs\narrays "),
    ["Arrays", "Graphs"],
  );
  const requestedTopics = normalizeLearningCareerTopics(
    Array.from({ length: MAX_LEARNING_CAREER_TOPICS + 4 }, (_, index) => `Topic ${index + 1}`),
  );
  assert.equal(requestedTopics.length, MAX_LEARNING_CAREER_TOPICS);

  const analysis = normalizeLearningCareerTopicAnalysis({
    targetRole: "Software engineering intern",
    overview: "A role-focused preparation overview.",
    topics: requestedTopics.map((title, index) => ({
      title,
      explanation: `Detailed explanation ${index + 1}`,
      whyItMatters: "Frequently tests applied understanding.",
      interviewQuestions: Array.from({ length: 8 }, (_, questionIndex) => ({
        question: `Question ${index + 1}.${questionIndex + 1}?`,
        guidance: "Explain the trade-off and give an example.",
      })),
      practiceSteps: Array.from({ length: 12 }, (_, stepIndex) => `Step ${stepIndex + 1}`),
    })),
    preparationPlan: Array.from({ length: 12 }, (_, index) => ({
      title: `Phase ${index + 1}`,
      description: "Build understanding, then apply it.",
      actions: Array.from({ length: 12 }, (_, actionIndex) => `Action ${actionIndex + 1}`),
    })),
  }, {
    requestedTopics,
    targetRole: "Software engineering intern",
  });

  assert.equal(analysis.targetRole, "Software engineering intern");
  assert.equal(analysis.topics.length, requestedTopics.length);
  assert.equal(analysis.topics[0].title, requestedTopics[0]);
  assert.equal(analysis.topics[0].interviewQuestions.length, 6);
  assert.equal(analysis.topics[0].practiceSteps.length, 8);
  assert.equal(analysis.preparationPlan.length, 8);
  assert.equal(analysis.preparationPlan[0].actions.length, 8);
});

test("allocates the global topic budget fairly across chapters", () => {
  const chapters = Array.from({ length: 4 }, (_, chapterIndex) => ({
    title: `Chapter ${chapterIndex + 1}`,
    topics: Array.from({ length: MAX_LEARNING_TOPICS }, (_, topicIndex) => ({
      title: `Chapter ${chapterIndex + 1} topic ${topicIndex + 1}`,
      subtopics: [],
    })),
  }));
  const notebook = normalizeLearningNotebook(generatedNotebook({
    chapters,
    mindMap: { nodes: [{ id: "root", label: "Fair subject", kind: "root" }] },
  }), { subjectName: "Fair subject" });
  const counts = notebook.chapters.map((chapter) => chapter.topics.length);

  assert.equal(counts.reduce((sum, count) => sum + count, 0), MAX_LEARNING_TOPICS);
  assert.ok(counts.every((count) => count > 0));
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
});

test("keeps canonical chapter, topic, and subtopic nodes when provider map is sparse", () => {
  const notebook = normalizeLearningNotebook(generatedNotebook({
    mindMap: {
      nodes: [{ id: "root", label: "Sparse provider map", kind: "root" }],
      edges: [],
    },
  }), { subjectName: "Operating Systems" });
  const chapter = notebook.chapters[0];
  const topic = chapter.topics[0];
  const subtopic = topic.subtopics[0];
  const ids = new Set(notebook.mindMap.nodes.map((node) => node.id));

  assert.ok(ids.has(chapter.id));
  assert.ok(ids.has(topic.id));
  assert.ok(ids.has(subtopic.id));
  assert.ok(notebook.mindMap.edges.some((edge) => edge.from === chapter.id && edge.to === topic.id));
  assert.ok(notebook.mindMap.edges.some((edge) => edge.from === topic.id && edge.to === subtopic.id));
});
