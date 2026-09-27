export function resolveQuizPageView({
  isYoungKidsLearner = false,
  tab = "",
  hasBattleInvite = false,
  hasBattleId = false,
  hasSubject = false,
  hasQuizSession = false,
  hasDeferredQuizSession = false,
  hasQuestions = false,
} = {}) {
  if (isYoungKidsLearner) return "solo";
  if (tab === "battles" || hasBattleInvite || hasBattleId) return "battles";
  if (tab === "hub") return "hub";
  if (tab === "solo" || hasSubject || hasQuizSession || hasDeferredQuizSession || hasQuestions) {
    return "solo";
  }
  return "hub";
}
