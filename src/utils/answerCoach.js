export const ANSWER_COACH_FOCUS = Object.freeze({
  concept_gap: "Concept gap",
  calculation_slip: "Calculation slip",
  wording_mistake: "Question wording",
  prerequisite: "Missing prerequisite",
  incomplete: "Incomplete answer",
  other: "Another issue",
});

const DIAGNOSTIC_FALLBACK = [
  "Which step felt least certain when you answered?",
  "What would you change if you tried this question again?",
];

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function finiteMarks(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
}

export function normalizeAnswerCoachAnalysis(payload) {
  const raw = payload?.analysis || payload?.report?.analysis || payload?.report || payload;
  if (!raw || !Array.isArray(raw.questions)) {
    throw new Error("The answer analysis could not be read. Please try again.");
  }

  const questions = raw.questions.map((item, index) => {
    const marks = finiteMarks(item?.marks);
    const awardedMarks = Math.min(marks, finiteMarks(item?.awardedMarks));
    const questionNumber = Number(item?.questionNumber) || index + 1;
    return {
      questionNumber,
      questionId: text(item?.questionId),
      question: text(item?.question),
      topic: text(item?.topic),
      marks,
      awardedMarks,
      observedAnswer: text(item?.observedAnswer),
      steps: Array.isArray(item?.steps) ? item.steps.map((step) => ({
        observation: text(step?.observation),
        marksAwarded: finiteMarks(step?.marksAwarded),
        marksPossible: finiteMarks(step?.marksPossible),
      })).filter((step) => step.observation) : [],
      firstError: text(item?.firstError),
      feedback: text(item?.feedback),
      needsReview: Boolean(item?.needsReview) || awardedMarks < marks,
      errorType: text(item?.errorType),
      diagnosticQuestions: Array.isArray(item?.diagnosticQuestions)
        ? item.diagnosticQuestions.map(text).filter(Boolean).slice(0, 2)
        : [],
      practiceQuestion: text(item?.practiceQuestion),
      recheckQuestion: text(item?.recheckQuestion),
    };
  });
  const unreadableQuestionNumbers = [...new Set(
    (Array.isArray(raw.unreadableQuestionNumbers) ? raw.unreadableQuestionNumbers : [])
      .map(Number)
      .filter((number) => Number.isInteger(number) && number > 0),
  )].sort((a, b) => a - b);
  const ungradedQuestionNumbers = [...new Set(
    (Array.isArray(raw.ungradedQuestionNumbers) ? raw.ungradedQuestionNumbers : [])
      .map(Number)
      .filter((number) => Number.isInteger(number) && number > 0),
  )].sort((a, b) => a - b);
  const fallbackPossible = questions.reduce((sum, question) => sum + question.marks, 0);
  const totalPossible = finiteMarks(raw.totalPossible, fallbackPossible);
  const totalAwarded = Math.min(totalPossible, finiteMarks(
    raw.totalAwarded,
    questions.reduce((sum, question) => sum + question.awardedMarks, 0),
  ));

  return {
    paperId: text(raw.paperId),
    paperTitle: text(raw.paperTitle),
    subjectNames: Array.isArray(raw.subjectNames) ? raw.subjectNames.map(text).filter(Boolean) : [],
    questions,
    totalAwarded,
    totalPossible,
    unreadableQuestionNumbers,
    ungradedQuestionNumbers,
  };
}

export function getAnswerCoachDiagnosticQuestions(question) {
  const provided = Array.isArray(question?.diagnosticQuestions)
    ? question.diagnosticQuestions.map(text).filter(Boolean).slice(0, 2)
    : [];
  return [...provided, ...DIAGNOSTIC_FALLBACK].slice(0, 2);
}

export function getAnswerCoachFocus(selectedFocus, suggestedFocus) {
  if (selectedFocus && selectedFocus !== "unsure" && ANSWER_COACH_FOCUS[selectedFocus]) {
    return selectedFocus;
  }
  return ANSWER_COACH_FOCUS[suggestedFocus] ? suggestedFocus : "other";
}

export function getAnswerCoachPracticeQuestion(question, paperQuestion, focus) {
  if (text(question?.practiceQuestion)) return text(question.practiceQuestion);
  const source = text(question?.question) || text(paperQuestion?.question);
  const prompt = source || "Explain the topic in your own words and work through one example.";
  if (focus === "calculation_slip") return `${prompt} Show every intermediate step and check the final result.`;
  if (focus === "wording_mistake") return `${prompt} Underline what is being asked before you answer.`;
  if (focus === "prerequisite") return `${prompt} State the earlier rule or definition you need before solving.`;
  if (focus === "incomplete") return `${prompt} Give a complete answer that addresses every part.`;
  return `${prompt} Explain why your first step is valid before completing the answer.`;
}

export function getAnswerCoachRecheckQuestion(question, paperQuestion) {
  return `Try again without notes: ${text(question?.question) || text(paperQuestion?.question) || "explain the topic and solve one example."}`;
}
