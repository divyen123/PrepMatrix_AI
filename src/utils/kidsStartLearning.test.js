import assert from "node:assert/strict";
import test from "node:test";
import {
  buildKidsLessonRequest,
  normalizeKidsLessonGenerationSize,
  normalizeKidsLessonNotebook,
} from "./kidsStartLearning.js";

test("builds a small, child-safe notebook request from only subject, topic, and size", () => {
  const request = buildKidsLessonRequest({
    subject: " Science ",
    topic: " Parts of a plant ",
    generationSize: "low",
    academicLevel: "Class 2",
    academicTrack: "School",
    userProfile: { id: "child-1", grade: "Class 2" },
  });

  assert.equal(request.subjectName, "Science");
  assert.deepEqual(request.chapterNames, ["Parts of a plant"]);
  assert.deepEqual(request.requestedOutline, [{
    chapterName: "Parts of a plant",
    topics: ["Parts of a plant"],
  }]);
  assert.equal(request.generationSize, "low");
  assert.deepEqual(request.attachments, []);
  assert.deepEqual(request.textSources, []);
  assert.match(request.learningPrompt, /quick, playful lesson/i);
  assert.match(request.learningPrompt, /registered class level \(Class 2\)/i);
  assert.match(request.learningPrompt, /avoid career, placement, interview, and resume/i);
  assert.equal("careerRole" in request, false);
  assert.equal("placementPreparation" in request, false);
});

test("high generation size asks for a fuller lesson and invalid sizes fall back safely", () => {
  const high = buildKidsLessonRequest({
    subject: "Maths",
    topic: "Shapes",
    generationSize: "high",
  });
  assert.equal(high.generationSize, "high");
  assert.match(high.learningPrompt, /fuller, playful lesson/i);
  assert.equal(normalizeKidsLessonGenerationSize("giant"), "low");
});

test("requires both subject and topic", () => {
  assert.throws(
    () => buildKidsLessonRequest({ subject: "English", topic: "" }),
    /subject and add a topic/i,
  );
});

test("normalizes generated notebook content for the child-facing result", () => {
  const notebook = normalizeKidsLessonNotebook({
    _id: "lesson-1",
    subjectName: "Science",
    title: "Plants",
    overview: "A bright little plant lesson.",
    chapters: [{
      chapterName: "Plant parts",
      topics: [{
        topic: "Roots",
        content: "Roots hold the plant in the soil.",
        points: ["They absorb water."],
        examples: ["Carrot"],
      }],
    }],
    questions: [{ prompt: "What do roots absorb?", response: "Water." }],
  });

  assert.equal(notebook.id, "lesson-1");
  assert.equal(notebook.summary, "A bright little plant lesson.");
  assert.equal(notebook.chapters[0].title, "Plant parts");
  assert.equal(notebook.chapters[0].topics[0].title, "Roots");
  assert.deepEqual(notebook.chapters[0].topics[0].keyPoints, ["They absorb water."]);
  assert.equal(notebook.importantQuestions[0].answer, "Water.");
});
