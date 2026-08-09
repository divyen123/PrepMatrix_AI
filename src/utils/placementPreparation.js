import {
  normalizeLearningCareerTopicAnalysis,
  normalizeLearningCareerTopics,
} from "./learningNotebook.js";

function cleanText(value, maxLength = 4000) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim().slice(0, maxLength);
}

function stablePart(value, fallback) {
  const part = cleanText(value, 120)
    .toLocaleLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return part || fallback;
}

function validIsoDate(value) {
  const date = new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

export function createPlacementDraft(payload = {}, options = {}) {
  const notebookId = cleanText(options.notebookId ?? payload?.notebook?.id, 120);
  const rawAnalysis = payload?.topicAnalysis
    ?? payload?.notebook?.careerPreparation?.topicAnalysis
    ?? payload?.analysis;
  const requestedTopics = normalizeLearningCareerTopics(options.requestedTopics);
  const analysis = normalizeLearningCareerTopicAnalysis(rawAnalysis, {
    requestedTopics,
    targetRole: options.targetRole,
  });

  if (!notebookId || !analysis.topics.length) {
    throw new Error("The placement analysis did not contain a usable preparation guide.");
  }

  return {
    analysis,
    generatedAt: validIsoDate(options.generatedAt),
    notebookId,
    providerModel: cleanText(payload?.providerModel, 160),
    source: "placement-analysis-draft",
  };
}

export function getSavedPlacementAnalysis(notebook) {
  const analysis = notebook?.careerPreparation?.topicAnalysis;
  return analysis && Array.isArray(analysis.topics) && analysis.topics.length
    ? analysis
    : null;
}

export function hasSavedPlacementPreparation(notebook) {
  return Boolean(getSavedPlacementAnalysis(notebook));
}

export function mergePlacementDraft(notebook, draft, options = {}) {
  if (!notebook?.id || !draft?.notebookId || notebook.id !== draft.notebookId) {
    throw new Error("This preparation draft belongs to a different learning notebook.");
  }

  const requestedTopics = draft.analysis?.topics?.map((topic) => topic?.title);
  const topicAnalysis = normalizeLearningCareerTopicAnalysis(draft.analysis, {
    requestedTopics,
    targetRole: draft.analysis?.targetRole,
  });
  if (!topicAnalysis.topics.length) {
    throw new Error("Analyze at least one placement topic before saving.");
  }

  return {
    ...notebook,
    careerPreparation: {
      ...(notebook.careerPreparation && typeof notebook.careerPreparation === "object"
        ? notebook.careerPreparation
        : {}),
      topicAnalysis,
    },
    updatedAt: validIsoDate(options.savedAt),
  };
}

export function isCodingPlacementItem({ codingRelevant = false, item, topic } = {}) {
  const text = [
    topic?.title,
    topic?.explanation,
    topic?.whyItMatters,
    item?.question,
    item?.title,
    item?.text,
    item?.guidance,
    item?.explanation,
    item,
  ].map((value) => cleanText(value, 600)).join(" ").toLocaleLowerCase();
  const codingSignal = /(?:\b(algorithm|array|string|hash|linked list|stack|queue|tree|graph|dynamic programming|sql|database|code|coding|complexity|runtime|data structure|api|debug|program|implementation|java|python|javascript|typescript)\b|c\+\+|c#)/u;
  return codingSignal.test(text) || (Boolean(codingRelevant) && /\b(problem|implementation|pattern|edge case)\b/u.test(text));
}

export function buildPlacementItemGuidance({
  codingRelevant = false,
  item,
  kind = "practice",
  topic,
} = {}) {
  const isInterview = kind === "interview";
  const label = cleanText(
    isInterview ? item?.question ?? item : item?.title ?? item?.text ?? item,
    700,
  );
  const suppliedGuidance = cleanText(item?.guidance ?? item?.answer ?? item?.explanation, 2200);
  const coding = isCodingPlacementItem({ codingRelevant, item, topic });
  const sections = [];

  if (suppliedGuidance) sections.push(suppliedGuidance);
  if (isInterview) {
    sections.push(
      "Answer framework: clarify the question, state the core idea, walk through one concrete example, discuss the important trade-off, and finish with a concise takeaway.",
    );
  } else {
    sections.push(
      `Practice goal: ${label || "Complete the task independently"}. Work once with guidance, repeat from memory, then explain what changed and why.`,
      "Completion check: record the result, one mistake you corrected, and the next variation you can solve without help.",
    );
  }
  if (coding) {
    sections.push(
      "Coding guidance: clarify inputs and constraints, outline a baseline and an optimized approach, state time and space complexity, trace edge cases, then implement and test the code with normal, boundary, and invalid cases.",
    );
  }

  return sections.filter(Boolean).join("\n\n");
}

export function buildPlacementActionTarget({
  codingRelevant = false,
  index = 0,
  item,
  kind = "practice",
  notebook,
  targetRole,
  topic,
} = {}) {
  const topicId = stablePart(topic?.id ?? topic?.title, "topic");
  const itemId = stablePart(item?.id, String(index + 1));
  const id = `placement:${topicId}:${kind}:${itemId}`;
  const itemText = cleanText(
    kind === "interview" ? item?.question ?? item : item?.title ?? item?.text ?? item,
    700,
  );
  const title = kind === "interview"
    ? itemText || "Placement interview check"
    : `Practice: ${itemText || topic?.title || "placement topic"}`;
  const explanation = buildPlacementItemGuidance({ codingRelevant, item, kind, topic });

  return {
    chapterName: `Placement prep${cleanText(targetRole, 160) ? ` - ${cleanText(targetRole, 160)}` : ""}`,
    explanation,
    id,
    keyPoints: [itemText, cleanText(topic?.whyItMatters, 900)].filter(Boolean),
    kind,
    metadata: {
      kind,
      notebookId: cleanText(notebook?.id, 120),
      topicId: cleanText(topic?.id, 120) || topicId,
    },
    subjectName: cleanText(notebook?.subjectName, 160) || "Placement preparation",
    summary: cleanText(topic?.whyItMatters ?? topic?.explanation, 1200),
    title,
    type: "placement",
    unitKey: id,
  };
}

export function buildPlacementChatPrompt({ notebook, target, targetRole, topic } = {}) {
  const coding = isCodingPlacementItem({ item: target, topic });
  return [
    "Coach me on this placement preparation item using an interactive, interview-ready explanation.",
    `Notebook: ${cleanText(notebook?.title, 180) || "Learning notebook"}.`,
    `Subject: ${cleanText(notebook?.subjectName, 160) || "Placement preparation"}.`,
    cleanText(targetRole, 160) ? `Target role: ${cleanText(targetRole, 160)}.` : "",
    cleanText(topic?.title, 180) ? `Preparation topic: ${cleanText(topic.title, 180)}.` : "",
    `Item: ${cleanText(target?.title, 700)}.`,
    cleanText(target?.explanation, 2400) ? `Current guidance:\n${cleanText(target.explanation, 2400)}` : "",
    coding
      ? "Include an approach comparison, complexity analysis, edge cases, a code-oriented walkthrough, and a small practice challenge."
      : "Include a strong answer structure, one concrete example, likely follow-up questions, and a short practice challenge.",
    "Keep the response practical and ask me to attempt the final check before revealing a model answer.",
  ].filter(Boolean).join("\n\n");
}
