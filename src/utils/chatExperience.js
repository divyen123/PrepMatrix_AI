import { normalizeSubjectNames } from "./subjectPlanning.js";

const STANDARD_CHAT_EXPERIENCE = Object.freeze({
  heading: "Study assistant",
  intro: "What would you like to study?",
  subtitle: "",
});

const KIDS_CHAT_EXPERIENCE = Object.freeze({
  heading: "Kids AI Chat",
  intro: "Your learning helper is ready. Ask a short question about school or something you are learning.",
  subtitle: "Age-appropriate learning help",
});

export function getChatExperienceCopy(childMode = false) {
  return childMode ? KIDS_CHAT_EXPERIENCE : STANDARD_CHAT_EXPERIENCE;
}

export function getNewChatPrompt(subjects = [], random = Math.random, previousPrompt = "") {
  const names = normalizeSubjectNames(subjects);
  if (!names.length) return STANDARD_CHAT_EXPERIENCE.intro;

  const choices = names.length > 1
    ? names.filter((name) => `Ask about ${name}` !== previousPrompt)
    : names;
  const sample = Number(typeof random === "function" ? random() : 0);
  const index = Number.isFinite(sample)
    ? Math.min(choices.length - 1, Math.max(0, Math.floor(sample * choices.length)))
    : 0;
  return `Ask about ${choices[index]}`;
}
