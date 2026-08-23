function normalizeComparableText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLowerCase();
}

export function normalizeGeneratedQuestions(rawQuestions, limit) {
  if (!Array.isArray(rawQuestions)) {
    throw new Error("AI response did not include a questions array.");
  }

  const promptKeys = new Set();
  const questions = rawQuestions.slice(0, limit).map((item, index) => {
    const question = String(item?.question ?? "").trim();
    const questionKey = normalizeComparableText(question);
    const rawOptions = Array.isArray(item?.options) ? item.options : [];
    const options = rawOptions.map((option) => (
      typeof option === "string" ? option.trim() : ""
    ));
    const optionKeys = options.map(normalizeComparableText);
    const answerIndex = item?.answerIndex;

    if (!questionKey) {
      throw new Error("AI response included an empty quiz question.");
    }
    if (promptKeys.has(questionKey)) {
      throw new Error("AI response included duplicate quiz questions.");
    }
    if (
      options.length !== 4
      || optionKeys.some((option) => !option)
      || new Set(optionKeys).size !== 4
    ) {
      throw new Error("AI response included invalid quiz options.");
    }
    if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3) {
      throw new Error("AI response included an invalid quiz answer index.");
    }

    promptKeys.add(questionKey);
    return {
      id: `ai-${Date.now()}-${index}`,
      question,
      options,
      answerIndex,
      explanation: String(item?.explanation || "Review the correct option and compare it with the topic concept.").trim(),
    };
  });

  if (questions.length !== limit) {
    throw new Error(`AI generated ${questions.length} questions, expected ${limit}.`);
  }

  return questions;
}
