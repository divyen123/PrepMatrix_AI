const STANDARD_CHAT_EXPERIENCE = Object.freeze({
  heading: "Study assistant",
  intro: "Study assistant is ready. Ask for strategy, summaries, or planner-based advice.",
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
