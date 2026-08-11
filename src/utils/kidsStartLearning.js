const GENERATION_SIZES = new Set(["low", "high"]);

function cleanText(value, maxLength) {
  return String(value ?? "").replace(/\s+/gu, " ").trim().slice(0, maxLength);
}

function listFrom(value) {
  return Array.isArray(value) ? value : [];
}

export const KIDS_LESSON_GENERATION_SIZES = Object.freeze([
  Object.freeze({
    id: "low",
    label: "Low",
    description: "A focused lesson with four key ideas, examples, and a four-question check.",
  }),
  Object.freeze({
    id: "high",
    label: "High",
    description: "A fuller lesson with six key ideas, extra examples, and five practice questions.",
  }),
]);

export function normalizeKidsLessonGenerationSize(value) {
  const normalized = cleanText(value, 20).toLocaleLowerCase();
  return GENERATION_SIZES.has(normalized) ? normalized : "low";
}

export function buildKidsLessonRequest({
  subject,
  topic,
  generationSize = "low",
  academicLevel = "",
  academicTrack = "",
  userProfile = {},
} = {}) {
  const cleanSubject = cleanText(subject, 120);
  const cleanTopic = cleanText(topic, 160);
  if (!cleanSubject || !cleanTopic) {
    throw new Error("Choose a subject and add a topic to begin.");
  }

  const size = normalizeKidsLessonGenerationSize(generationSize);
  const lessonShape = size === "high"
    ? "Create a fuller, playful lesson with six distinct small ideas, clear step-by-step explanations, at least two familiar examples for each idea, two short activities, and five different friendly practice questions."
    : "Create a focused, playful lesson with four distinct small ideas, clear explanations, at least two familiar examples for each idea, one short activity, and four different friendly practice questions.";
  const registeredClass = cleanText(
    userProfile?.grade
      || userProfile?.classLevel
      || userProfile?.standard
      || academicLevel,
    80,
  );

  return {
    subjectName: cleanSubject,
    chapterNames: [cleanTopic],
    requestedOutline: [{
      chapterName: cleanTopic,
      topics: [cleanTopic],
    }],
    learningPrompt: [
      lessonShape,
      "Use short sentences, encouraging language, and age-appropriate examples.",
      "Keep the content at the learner's registered class level" + (registeredClass ? " (" + registeredClass + ")" : "") + ".",
      "Avoid career, placement, interview, and resume content.",
      "The subject is " + cleanSubject + " and the topic is " + cleanTopic + ".",
    ].join(" "),
    generationSize: size,
    attachments: [],
    textSources: [],
    academicLevel: cleanText(academicLevel || registeredClass, 100),
    academicTrack: cleanText(academicTrack, 100),
    learnerProfile: {
      academicLevel: cleanText(academicLevel || registeredClass, 100),
      academicTrack: cleanText(academicTrack, 100),
      grade: registeredClass,
      degree: "",
      department: "",
      primaryGoal: "Age-appropriate foundational learning",
    },
  };
}

function normalizeTopic(value, index) {
  const source = value && typeof value === "object" ? value : {};
  const title = cleanText(source.title || source.name || source.topic, 180)
    || "Learning idea " + (index + 1);
  return {
    id: cleanText(source.id || source._id, 120) || "topic-" + (index + 1),
    title,
    explanation: cleanText(
      source.explanation || source.summary || source.content || source.description,
      2500,
    ),
    keyPoints: listFrom(source.keyPoints || source.points)
      .map((item) => cleanText(item?.text || item, 420))
      .filter(Boolean)
      .slice(0, 8),
    examples: listFrom(source.examples)
      .map((item) => cleanText(item?.text || item, 500))
      .filter(Boolean)
      .slice(0, 6),
  };
}

function normalizeChapter(value, index) {
  const source = value && typeof value === "object" ? value : {};
  return {
    id: cleanText(source.id || source._id, 120) || "chapter-" + (index + 1),
    title: cleanText(source.title || source.name || source.chapterName, 180)
      || "Lesson " + (index + 1),
    summary: cleanText(source.summary || source.overview || source.description, 1800),
    topics: listFrom(source.topics || source.sections)
      .map(normalizeTopic)
      .slice(0, 16),
  };
}

export function normalizeKidsLessonNotebook(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const id = cleanText(source.id || source._id, 120) || "new-kids-lesson";
  const rawQuestions = listFrom(
    source.importantQuestions || source.questions || source.revisionQuestions,
  );
  return {
    ...source,
    id,
    title: cleanText(source.title || source.name || source.subjectName, 180)
      || "My new lesson",
    subjectName: cleanText(source.subjectName || source.subject, 120),
    summary: cleanText(source.summary || source.overview || source.abstract, 3000),
    chapters: listFrom(source.chapters || source.outline)
      .map(normalizeChapter)
      .slice(0, 20),
    importantQuestions: rawQuestions.map((item, index) => ({
      id: cleanText(item?.id || item?._id, 120) || "question-" + (index + 1),
      question: cleanText(item?.question || item?.prompt || item, 500),
      answer: cleanText(item?.answer || item?.response || item?.explanation, 1200),
    })).filter((item) => item.question).slice(0, 10),
    updatedAt: source.updatedAt || source.createdAt || new Date().toISOString(),
  };
}
