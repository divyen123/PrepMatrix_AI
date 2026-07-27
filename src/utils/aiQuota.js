import { createContext, useContext } from "react";

export const AI_FEATURES = Object.freeze({
  CHAT: "chat",
  QUIZ: "quiz",
  CAREER_ANALYSIS: "career_analysis",
  LEARNING_NOTEBOOK: "learning_notebook",
  SECURE_EXAM: "secure_exam",
  QUESTION_PAPER: "question_paper",
});

export const AI_DEFAULT_COSTS = Object.freeze({
  [AI_FEATURES.CHAT]: 1,
  [AI_FEATURES.QUIZ]: 3,
  [AI_FEATURES.CAREER_ANALYSIS]: 5,
  [AI_FEATURES.LEARNING_NOTEBOOK]: 12,
  [AI_FEATURES.SECURE_EXAM]: 15,
  [AI_FEATURES.QUESTION_PAPER]: 15,
});

export const AI_FEATURE_LABELS = Object.freeze({
  [AI_FEATURES.CHAT]: "Study chat or voice question",
  [AI_FEATURES.QUIZ]: "Quiz generation",
  [AI_FEATURES.CAREER_ANALYSIS]: "Career-topic analysis",
  [AI_FEATURES.LEARNING_NOTEBOOK]: "Learning notebook",
  [AI_FEATURES.SECURE_EXAM]: "Secure exam preparation",
  [AI_FEATURES.QUESTION_PAPER]: "Question paper",
});

const FEATURE_ALIASES = Object.freeze({
  chat: AI_FEATURES.CHAT,
  study_chat: AI_FEATURES.CHAT,
  studyChat: AI_FEATURES.CHAT,
  voice: AI_FEATURES.CHAT,
  quiz: AI_FEATURES.QUIZ,
  quiz_generation: AI_FEATURES.QUIZ,
  quizGeneration: AI_FEATURES.QUIZ,
  career: AI_FEATURES.CAREER_ANALYSIS,
  career_analysis: AI_FEATURES.CAREER_ANALYSIS,
  careerAnalysis: AI_FEATURES.CAREER_ANALYSIS,
  notebook: AI_FEATURES.LEARNING_NOTEBOOK,
  learning_notebook: AI_FEATURES.LEARNING_NOTEBOOK,
  learningNotebook: AI_FEATURES.LEARNING_NOTEBOOK,
  secure_exam: AI_FEATURES.SECURE_EXAM,
  secureExam: AI_FEATURES.SECURE_EXAM,
  secureExamPreparation: AI_FEATURES.SECURE_EXAM,
  question_paper: AI_FEATURES.QUESTION_PAPER,
  questionPaper: AI_FEATURES.QUESTION_PAPER,
  questionPaperGeneration: AI_FEATURES.QUESTION_PAPER,
});

export const AiQuotaContext = createContext(null);

export function canonicalAiFeature(feature) {
  return FEATURE_ALIASES[feature] || feature;
}

export function getAiRequestErrorMessage(error, fallback = "The AI request could not be completed.") {
  const code = error?.code || error?.details?.code;
  const serverMessage = error instanceof Error && error.message ? error.message : fallback;

  if (code === "AI_USER_QUOTA_EXHAUSTED") {
    return "You do not have enough AI credits for this action. Your work is still here, and your balance will reset next month.";
  }
  if (code === "AI_PROVIDER_RATE_LIMITED") {
    return "The shared AI provider is busy right now. Your AI credits were refunded, and your work is still here to retry.";
  }
  if (code === "AI_PROVIDER_UNAVAILABLE") {
    return "The AI provider is temporarily unavailable. Your AI credits were refunded, and your work is still here to retry.";
  }
  if (code === "AI_QUOTA_UNAVAILABLE") {
    return "Your AI balance could not be verified safely. Your work is still here; retry this same request shortly.";
  }
  if (code === "AI_REQUEST_IN_PROGRESS") {
    return "This AI request is already in progress. Please wait for it to finish; it will not be charged twice.";
  }
  if (error?.details?.creditsRefunded) {
    return /credits were refunded/iu.test(serverMessage)
      ? serverMessage
      : serverMessage + " Your AI credits were refunded.";
  }
  return serverMessage;
}

export function createAiIdempotencyKey() {
  return crypto.randomUUID();
}

export function useAiQuota() {
  const value = useContext(AiQuotaContext);
  if (!value) throw new Error("useAiQuota must be used within AiQuotaProvider.");
  return value;
}
