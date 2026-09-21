import { normalizeSubjectNames } from "./subjectPlanning.js";

const STANDARD_CHAT_EXPERIENCE = Object.freeze({
  heading: "Study assistant",
  intro: "What would you like to study?",
  subtitle: "Planner-aware study support",
});

const KIDS_CHAT_EXPERIENCE = Object.freeze({
  heading: "Kids AI Chat",
  intro: "Your learning helper is ready. Ask a short question about school or something you are learning.",
  subtitle: "Age-appropriate learning help",
});

export function getChatExperienceCopy(childMode = false) {
  return childMode ? KIDS_CHAT_EXPERIENCE : STANDARD_CHAT_EXPERIENCE;
}

function formatSubjectPrompt(names) {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} or ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, or ${names.at(-1)}`;
}

export function getNewChatPrompt(subjects = []) {
  const names = normalizeSubjectNames(subjects);
  if (!names.length) return STANDARD_CHAT_EXPERIENCE.intro;

  const visibleNames = names.slice(0, 3);
  const remainingCount = names.length - visibleNames.length;
  const subjectPrompt = remainingCount
    ? visibleNames.join(", ")
    : formatSubjectPrompt(visibleNames);
  if (!remainingCount) return `Ask about ${subjectPrompt}`;

  return `Ask about ${subjectPrompt}, or ${remainingCount} more ${remainingCount === 1 ? "subject" : "subjects"}`;
}
