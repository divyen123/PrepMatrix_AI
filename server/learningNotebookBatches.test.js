import assert from "node:assert/strict";
import test from "node:test";
import {
  LearningNotebookBatchValidationError,
  buildLearningNotebookBatches,
  mergeLearningNotebookBatches,
  validateLearningNotebookBatch,
} from "./learningNotebookBatches.js";
import { buildLearningNotebookDepthTargets } from "./learningNotebookRoutes.js";
import {
  MAX_LEARNING_IMPORTANT_QUESTIONS,
  hasGeneratedLearningNotebookDepth,
  normalizeLearningNotebook,
} from "../src/utils/learningNotebook.js";

function generatedBatch(batch) {
  const details = "Explain the governing principle, identify each variable, trace a worked example, and justify the result using the stated assumptions. ";
  const topics = Array.from({ length: batch.topicCount }, (_, index) => ({
    id: `local-topic-${index + 1}`,
    title: `${batch.chapterName} topic ${batch.topicOffset + index + 1}`,
    summary: details,
    explanation: details.repeat(4),
    importance: "high",
    learningObjectives: ["Define the principle", "Explain the worked example"],
    keyPoints: ["Governing principle", "Variables", "Reasoning", "Result"],
    examples: Array.from({ length: batch.depthTargets.minimumExamplesPerTopic }, (_, exampleIndex) => `${details} Example ${exampleIndex + 1}.`),
    applications: ["A concrete application"],
    commonMistakes: ["Ignoring the assumptions"],
    revisionTips: ["Explain every step"],
    subtopics: Array.from({ length: batch.depthTargets.minimumSubtopicsPerTopic }, (_, subtopicIndex) => ({
      id: `local-subtopic-${subtopicIndex + 1}`,
      title: `Detailed subtopic ${subtopicIndex + 1}`,
      summary: details,
      explanation: details.repeat(2),
      keyPoints: ["Assumptions", "Conclusions"],
      examples: Array.from({ length: batch.depthTargets.minimumExamplesPerSubtopic }, (_, exampleIndex) => `${details} Application ${exampleIndex + 1}.`),
    })),
  }));
  return {
    title: batch.chapterName,
    overview: `An explanation of ${batch.chapterName} topic group ${batch.topicOffset + 1}.`,
    chapters: [{ id: "local-chapter", title: batch.chapterName, summary: details, topics }],
    importantQuestions: Array.from({ length: batch.questionCount }, (_, index) => ({
      id: `local-question-${index + 1}`,
      question: `${batch.chapterName} group ${batch.topicOffset + 1}: explain principle ${index + 1}.`,
      answer: details,
      whyItMatters: "Connect the principles to reasoning.",
      difficulty: "medium",
    })),
    revisedNotes: Array.from({ length: batch.noteCount }, (_, index) => ({
      id: `local-note-${index + 1}`,
      title: `${batch.chapterName} group ${batch.topicOffset + 1} note ${index + 1}`,
      content: details.repeat(3),
      keyPoints: ["Reasoning", "Result"],
      revisionTips: ["Trace the example"],
      chapterId: "local-chapter",
      chapterTitle: "Untrusted chapter scope",
      topicIds: [topics[0].id],
    })),
    mindMap: {
      nodes: [{ id: "local-root", label: batch.chapterName, kind: "root" }],
      edges: [],
    },
    coverageWarnings: ["Based on the supplied chapter requirements."],
    careerPreparation: { focus: "", skills: [], interviewQuestions: [], codingTopics: [] },
  };
}

function plan(chapterNames, compact = true) {
  const depthTargets = buildLearningNotebookDepthTargets(chapterNames, { compact });
  const batches = buildLearningNotebookBatches(chapterNames, depthTargets, { compact });
  return { depthTargets, batches, results: batches.map((batch) => ({ batch, generated: generatedBatch(batch) })) };
}

test("allocates the original two-chapter compact depth across bounded chapter requests", () => {
  const { depthTargets, batches } = plan(["current electricity", "ray optics"]);
  assert.deepEqual(batches.map((batch) => [batch.chapterIndex, batch.topicOffset, batch.topicCount, batch.questionCount, batch.noteCount]), [
    [0, 0, 2, 2, 1],
    [0, 2, 2, 2, 1],
    [1, 0, 2, 1, 1],
    [1, 2, 2, 1, 1],
  ]);
  for (const batch of batches) {
    assert.equal(batch.depthTargets.expectedChapterCount, 1);
    assert.equal(batch.depthTargets.exactChapterCount, 1);
    assert.equal(batch.depthTargets.minimumTopicsPerChapter, 2);
    assert.equal(batch.depthTargets.exactTopicsPerChapter, 2);
    assert.equal(batch.depthTargets.minimumSubtopicsPerTopic, depthTargets.minimumSubtopicsPerTopic);
    assert.equal(batch.depthTargets.exactSubtopicsPerTopic, depthTargets.subtopicsPerTopic);
    assert.equal(batch.depthTargets.minimumExamplesPerTopic, depthTargets.minimumExamplesPerTopic);
    assert.equal(batch.depthTargets.minimumExamplesPerSubtopic, depthTargets.minimumExamplesPerSubtopic);
    assert.equal(batch.depthTargets.minimumImportantQuestions, batch.questionCount);
    assert.equal(batch.depthTargets.maximumImportantQuestions, batch.questionCount);
    assert.equal(batch.depthTargets.minimumNoteSections, 1);
  }
});

test("merges complete chapter content with unique short IDs, scoped notes, and a rebuilt map", () => {
  const chapterNames = ["current electricity", "ray optics"];
  const { depthTargets, results } = plan(chapterNames);
  const merged = mergeLearningNotebookBatches([...results].reverse(), { subjectName: "Physics", depthTargets });
  assert.deepEqual(merged.chapters.map((chapter) => chapter.title), chapterNames);
  assert.deepEqual(merged.chapters.map((chapter) => chapter.topics.length), [4, 4]);
  assert.ok(hasGeneratedLearningNotebookDepth(merged, depthTargets));
  assert.equal(merged.chapters[0].topics[0].explanation, results[0].generated.chapters[0].topics[0].explanation);
  assert.equal(merged.chapters[1].topics[3].subtopics[1].explanation, results[3].generated.chapters[0].topics[1].subtopics[1].explanation);
  assert.equal(merged.importantQuestions.length, 6);
  assert.equal(merged.revisedNotes.length, 4);
  assert.deepEqual(merged.revisedNotes.map((note) => note.chapterId), ["chapter-1", "chapter-2", "chapter-1", "chapter-2"]);
  assert.deepEqual(merged.revisedNotes[0].topicIds, ["chapter-1-topic-1"]);
  assert.deepEqual(merged.revisedNotes[1].topicIds, ["chapter-2-topic-1"]);
  assert.equal(merged.revisedNotes[1].chapterTitle, "ray optics");
  const ids = merged.chapters.flatMap((chapter) => [chapter.id, ...chapter.topics.flatMap((topic) => [topic.id, ...topic.subtopics.map((subtopic) => subtopic.id)])])
    .concat(merged.importantQuestions.map((question) => question.id), merged.revisedNotes.map((note) => note.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => id.length < 80));
  assert.equal(merged.mindMap.nodes.filter((node) => node.kind === "root").length, 1);
  assert.equal(merged.mindMap.nodes.filter((node) => node.kind === "chapter").length, 2);
  assert.equal(merged.mindMap.nodes.filter((node) => node.kind === "topic").length, 8);
  assert.equal(merged.mindMap.nodes.filter((node) => node.kind === "subtopic").length, 16);
  const normalized = normalizeLearningNotebook(merged);
  assert.deepEqual(normalized.revisedNotes.map((note) => note.topicIds), merged.revisedNotes.map((note) => note.topicIds));
  assert.deepEqual(normalized.chapters.map((chapter) => chapter.id), ["chapter-1", "chapter-2"]);
});

test("splits detailed two-chapter notebooks without reducing original teaching depth", () => {
  const { depthTargets, batches, results } = plan(["Electricity", "Optics"], false);
  results.forEach(({ batch, generated }) => {
    generated.chapters[0].summary += ` This section covers topic group ${batch.topicOffset + 1}.`;
  });
  assert.equal(batches.length, 16);
  assert.deepEqual(batches.map((batch) => batch.topicOffset), [0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 4, 5, 6, 7]);
  assert.ok(batches.every((batch) => batch.topicCount === 1 && batch.depthTargets.minimumSubtopicsPerTopic === 4));
  const merged = mergeLearningNotebookBatches(results, { subjectName: "Physics", depthTargets });
  assert.deepEqual(merged.chapters.map((chapter) => chapter.topics.length), [8, 8]);
  assert.equal(merged.chapters.flatMap((chapter) => chapter.topics).flatMap((topic) => topic.subtopics).length, 64);
  for (const group of [1, 2, 3, 4, 5, 6, 7, 8]) assert.ok(merged.chapters[0].summary.includes(`topic group ${group}`));
  assert.ok(merged.importantQuestions.length >= depthTargets.minimumImportantQuestions);
  assert.ok(merged.revisedNotes.length >= depthTargets.minimumNoteSections);
  assert.ok(hasGeneratedLearningNotebookDepth(merged, depthTargets));
});

test("keeps every supported detailed chapter layout within auxiliary caps", () => {
  for (let count = 1; count <= 12; count += 1) {
    const names = Array.from({ length: count }, (_, index) => `Chapter ${index + 1}`);
    const { depthTargets, batches, results } = plan(names, false);
    assert.ok(batches.length <= 20);
    assert.ok(batches.every((batch) => batch.questionCount >= 1 && batch.noteCount >= 1));
    assert.equal(batches.reduce((total, batch) => total + batch.topicCount, 0), depthTargets.totalTopics);
    assert.ok(batches.reduce((total, batch) => total + batch.questionCount, 0) <= MAX_LEARNING_IMPORTANT_QUESTIONS);
    assert.ok(batches.reduce((total, batch) => total + batch.noteCount, 0) <= 24);
    if (count === 9 || count === 12) {
      const merged = mergeLearningNotebookBatches(results, { subjectName: "Science", depthTargets });
      assert.equal(merged.chapters.length, count);
      assert.ok(hasGeneratedLearningNotebookDepth(merged, depthTargets));
      assert.ok(merged.revisedNotes.some((note) => note.chapterId === `chapter-${count}`));
      assert.ok(merged.importantQuestions.some((question) => question.question.startsWith(`Chapter ${count} `)));
    }
  }
  const { depthTargets } = plan(["One", "Two"]);
  assert.throws(() => buildLearningNotebookBatches(Array.from({ length: 30 }, (_, index) => `Chapter ${index}`), {
    ...depthTargets, expectedChapterCount: 30, topicsPerChapter: 1,
  }, { compact: true }), LearningNotebookBatchValidationError);
});

test("rejects wrong chapters, incomplete depth, and raw missing auxiliary sections", () => {
  const { batches } = plan(["Electricity", "Optics"]);
  const batch = batches[0];
  assert.ok(validateLearningNotebookBatch(generatedBatch(batch), batch));
  const cases = [
    (value) => { value.chapters[0].title = "Other chapter"; },
    (value) => { value.chapters.push(structuredClone(value.chapters[0])); },
    (value) => { value.chapters[0].topics.pop(); },
    (value) => { value.chapters[0].topics[0].explanation = "Too short"; },
    (value) => { value.chapters[0].topics[0].subtopics.pop(); },
    (value) => { value.chapters[0].topics[0].subtopics.push(structuredClone(value.chapters[0].topics[0].subtopics[0])); },
    (value) => { value.importantQuestions.pop(); },
    (value) => { value.importantQuestions[0].answer = ""; },
    (value) => { value.revisedNotes = []; },
    (value) => { value.revisedNotes[0] = {}; },
  ];
  for (const mutate of cases) {
    const generated = generatedBatch(batch);
    mutate(generated);
    assert.equal(validateLearningNotebookBatch(generated, batch), false);
  }
});

test("rejects partial batches, overlapping groups, and duplicate final question content", () => {
  const { depthTargets, results } = plan(["Electricity", "Optics"], false);
  const options = { subjectName: "Physics", depthTargets };
  assert.throws(() => mergeLearningNotebookBatches(results.slice(1), options), LearningNotebookBatchValidationError);
  assert.throws(() => mergeLearningNotebookBatches(results.slice(0, -1), options), LearningNotebookBatchValidationError);
  assert.throws(() => mergeLearningNotebookBatches([...results, results[0]], options), LearningNotebookBatchValidationError);
  const duplicates = structuredClone(results);
  duplicates[8].generated.importantQuestions[0].question = duplicates[0].generated.importantQuestions[0].question;
  assert.throws(() => mergeLearningNotebookBatches(duplicates, options), LearningNotebookBatchValidationError);
});

test("keeps colliding provider IDs bounded and rejects ambiguous note references", () => {
  const { depthTargets, results } = plan(["Electricity", "Optics"]);
  const veryLongId = "a".repeat(80);
  results[0].generated.chapters[0].topics.forEach((topic) => { topic.id = veryLongId; });
  results[0].generated.revisedNotes.forEach((note) => { note.topicIds = [veryLongId, "missing"]; });
  assert.equal(validateLearningNotebookBatch(results[0].generated, results[0].batch), false);
  assert.throws(() => mergeLearningNotebookBatches(results, { subjectName: "Physics", depthTargets }), LearningNotebookBatchValidationError);
  results[0].generated.revisedNotes.forEach((note) => { note.topicIds = []; });
  const merged = mergeLearningNotebookBatches(results, { subjectName: "Physics", depthTargets });
  assert.equal("topicIds" in merged.revisedNotes[0], false);
  assert.equal(merged.revisedNotes[0].chapterId, "chapter-1");
  assert.equal(merged.revisedNotes[0].chapterTitle, "Electricity");
  assert.deepEqual(merged.chapters[0].topics.map((topic) => topic.id), [
    "chapter-1-topic-1", "chapter-1-topic-2", "chapter-1-topic-3", "chapter-1-topic-4",
  ]);
});

test("rejects unknown explicit note references before they can match later batch topics", () => {
  const { depthTargets, results } = plan(["Electricity"]);
  const note = results[0].generated.revisedNotes[0];
  note.title = results[1].generated.chapters[0].topics[1].title;
  note.topicIds = ["missing-topic"];
  assert.equal(validateLearningNotebookBatch(results[0].generated, results[0].batch), false);
  assert.throws(() => mergeLearningNotebookBatches(results, { subjectName: "Physics", depthTargets }), LearningNotebookBatchValidationError);
  note.topicIds = [results[0].generated.chapters[0].topics[0].id, "missing-topic"];
  assert.equal(validateLearningNotebookBatch(results[0].generated, results[0].batch), false);
  delete note.topicIds;
  note.topicId = "missing-topic";
  assert.equal(validateLearningNotebookBatch(results[0].generated, results[0].batch), false);
});

test("deduplicates and interleaves career material before its existing caps", () => {
  const { depthTargets, results } = plan(["One", "Two"]);
  for (const { batch, generated } of results) {
    generated.careerPreparation = {
      focus: `Prepare for ${batch.chapterName}.`,
      skills: Array.from({ length: 24 }, (_, index) => `${batch.chapterName} skill ${index + 1}`),
      interviewQuestions: Array.from({ length: 24 }, (_, index) => ({
        id: "repeated-id",
        question: `${batch.chapterName} interview question ${index + 1}`,
        guidance: "Explain your reasoning.",
      })),
      codingTopics: Array.from({ length: 24 }, (_, index) => ({
        id: "repeated-id",
        title: `${batch.chapterName} coding topic ${index + 1}`,
        whyItMatters: "Practice applying the concept.",
        practiceSteps: ["Trace a worked example."],
      })),
    };
  }
  const merged = mergeLearningNotebookBatches(results, { subjectName: "Engineering", depthTargets });
  const career = merged.careerPreparation;
  assert.equal(career.skills.length, 16);
  assert.equal(career.interviewQuestions.length, 12);
  assert.equal(career.codingTopics.length, 12);
  assert.deepEqual(career.skills.slice(0, 4), ["One skill 1", "Two skill 1", "One skill 2", "Two skill 2"]);
  assert.deepEqual(career.interviewQuestions.slice(0, 2).map((question) => question.question), ["One interview question 1", "Two interview question 1"]);
  assert.deepEqual(career.codingTopics.slice(0, 2).map((topic) => topic.title), ["One coding topic 1", "Two coding topic 1"]);
  assert.equal(new Set(career.interviewQuestions.map((question) => question.question)).size, 12);
  assert.equal(new Set(career.codingTopics.map((topic) => topic.id)).size, 12);
  assert.equal(career.focus, "Prepare for One.\n\nPrepare for Two.");
});
