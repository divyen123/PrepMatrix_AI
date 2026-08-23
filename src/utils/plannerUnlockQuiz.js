import {
  PLANNER_UNLOCK_PASS_PERCENTAGE,
  PLANNER_UNLOCK_QUIZ_QUESTION_COUNT,
} from "./plannerScheduleProgress.js";

export const PLANNER_UNLOCK_TOPIC_DETAILS_MAX_LENGTH = 600;

export function normalizePlannerUnlockTopicDetails(value) {
  return String(value || "")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, PLANNER_UNLOCK_TOPIC_DETAILS_MAX_LENGTH);
}

export function buildPlannerUnlockQuizRequest(context = {}, topicDetails = "") {
  const customTopicDetails = normalizePlannerUnlockTopicDetails(topicDetails);
  const inferredTopics = Array.isArray(context?.topics)
    ? context.topics.map((topic) => String(topic || "").trim()).filter(Boolean)
    : [];
  const sourceDayNumber = context?.sourceDayNumber || "the previous study day";
  const scheduledUnits = inferredTopics.join("; ")
    || String(context?.topic || "").trim()
    || String(context?.subjectName || "General study").trim();
  const topic = [
    "Completed planner units from Day " + sourceDayNumber + ": " + scheduledUnits + ".",
    customTopicDetails
      ? "Student-provided details that clarify those scheduled units: " + customTopicDetails + "."
      : "",
    "Use the details only to clarify the listed scheduled subjects and units.",
  ].filter(Boolean).join(" ").slice(0, 1800);

  return {
    customTopicDetails,
    subjectName: String(context?.subjectName || "General study").trim() || "General study",
    topic,
  };
}

export function normalizePlannerUnlockQuestions(value) {
  if (!Array.isArray(value) || value.length !== PLANNER_UNLOCK_QUIZ_QUESTION_COUNT) {
    return [];
  }

  const questions = value.map((question, index) => {
    const options = Array.isArray(question?.options)
      ? question.options.map((option) => String(option || "").trim())
      : [];
    const answerIndex = question?.answerIndex;
    const prompt = String(question?.question || "").trim();
    const optionKeys = options.map((option) => option.toLocaleLowerCase());

    if (
      !prompt
      || options.length !== 4
      || options.some((option) => !option)
      || new Set(optionKeys).size !== options.length
      || !Number.isInteger(answerIndex)
      || answerIndex < 0
      || answerIndex >= options.length
    ) {
      return null;
    }

    return {
      ...question,
      answerIndex,
      explanation: String(question?.explanation || "").trim(),
      id: String(question?.id || "planner-unlock-question-" + (index + 1)),
      options,
      question: prompt,
    };
  });

  if (!questions.every(Boolean)) return [];

  const promptKeys = questions.map((question) => (
    question.question.toLocaleLowerCase().replace(/\s+/gu, " ").trim()
  ));
  return new Set(promptKeys).size === questions.length ? questions : [];
}

export function scorePlannerUnlockQuiz(questions, answers) {
  const safeQuestions = Array.isArray(questions) ? questions : [];
  const score = safeQuestions.reduce((total, question, index) => (
    total + (answers?.[index] === question.answerIndex ? 1 : 0)
  ), 0);
  const total = safeQuestions.length;
  const percentage = total ? Math.round((score / total) * 100) : 0;

  return {
    passed: total === PLANNER_UNLOCK_QUIZ_QUESTION_COUNT
      && percentage >= PLANNER_UNLOCK_PASS_PERCENTAGE,
    percentage,
    score,
    total,
  };
}
