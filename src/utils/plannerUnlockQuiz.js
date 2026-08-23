import {
  PLANNER_UNLOCK_PASS_PERCENTAGE,
  PLANNER_UNLOCK_QUIZ_QUESTION_COUNT,
} from "./plannerScheduleProgress.js";

export function normalizePlannerUnlockQuestions(value) {
  if (!Array.isArray(value) || value.length !== PLANNER_UNLOCK_QUIZ_QUESTION_COUNT) {
    return [];
  }

  const questions = value.map((question, index) => {
    const options = Array.isArray(question?.options)
      ? question.options.map((option) => String(option || "").trim())
      : [];
    const answerIndex = Number(question?.answerIndex);
    const prompt = String(question?.question || "").trim();

    if (
      !prompt
      || options.length !== 4
      || options.some((option) => !option)
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

  return questions.every(Boolean) ? questions : [];
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
