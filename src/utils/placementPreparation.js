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

function historyId(prefix, generatedAt, label) {
  const timestamp = new Date(generatedAt).getTime();
  return `${prefix}-${Number.isFinite(timestamp) ? timestamp : Date.now()}-${stablePart(label, "guide")}`;
}

export function sortPlacementHistory(history = []) {
  return [...(Array.isArray(history) ? history : [])].sort((left, right) => {
    const pinOrder = Number(right?.pinned === true) - Number(left?.pinned === true);
    if (pinOrder) return pinOrder;
    const rightTime = new Date(right?.generatedAt || 0).getTime() || 0;
    const leftTime = new Date(left?.generatedAt || 0).getTime() || 0;
    return rightTime - leftTime;
  });
}

export function getPlacementHistory(notebook) {
  const history = notebook?.careerPreparation?.history;
  if (Array.isArray(history) && history.length) return sortPlacementHistory(history);
  const analysis = notebook?.careerPreparation?.topicAnalysis;
  if (!analysis || !Array.isArray(analysis.topics) || !analysis.topics.length) return [];
  return [{
    id: "placement-legacy",
    analysis,
    generatedAt: notebook?.updatedAt || notebook?.createdAt || new Date(0).toISOString(),
    pinned: false,
    providerModel: "",
    source: "legacy-saved-analysis",
  }];
}

export function getPlacementHistoryEntry(notebook, historyId = "") {
  const history = getPlacementHistory(notebook);
  return history.find((entry) => entry.id === historyId) || history[0] || null;
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

  const generatedAt = validIsoDate(options.generatedAt);
  return {
    analysis,
    generatedAt,
    id: cleanText(options.id, 120)
      || historyId("placement", generatedAt, analysis.targetRole || analysis.topics[0]?.title),
    notebookId,
    pinned: false,
    providerModel: cleanText(payload?.providerModel, 160),
    source: "placement-analysis-draft",
  };
}

export function getSavedPlacementAnalysis(notebook, historyId = "") {
  const analysis = getPlacementHistoryEntry(notebook, historyId)?.analysis;
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

  const generatedAt = validIsoDate(draft.generatedAt);
  const entry = {
    id: cleanText(draft.id, 120)
      || historyId("placement", generatedAt, topicAnalysis.targetRole || topicAnalysis.topics[0]?.title),
    analysis: topicAnalysis,
    generatedAt,
    pinned: draft.pinned === true,
    providerModel: cleanText(draft.providerModel, 160),
    source: cleanText(draft.source, 120),
  };
  const history = [
    entry,
    ...getPlacementHistory(notebook).filter((item) => item.id !== entry.id),
  ];
  return {
    ...notebook,
    careerPreparation: {
      ...(notebook.careerPreparation && typeof notebook.careerPreparation === "object"
        ? notebook.careerPreparation
        : {}),
      history,
      topicAnalysis,
    },
    updatedAt: validIsoDate(options.savedAt),
  };
}

export function setPlacementHistoryPinned(notebook, historyIdValue, pinned, options = {}) {
  const history = getPlacementHistory(notebook);
  if (!history.some((entry) => entry.id === historyIdValue)) {
    throw new Error("That placement history item is no longer available.");
  }
  return {
    ...notebook,
    careerPreparation: {
      ...(notebook.careerPreparation || {}),
      history: history.map((entry) => (
        entry.id === historyIdValue ? { ...entry, pinned: pinned === true } : entry
      )),
    },
    updatedAt: validIsoDate(options.updatedAt),
  };
}

export function deletePlacementHistoryEntry(notebook, historyIdValue, options = {}) {
  const history = getPlacementHistory(notebook).filter((entry) => entry.id !== historyIdValue);
  return {
    ...notebook,
    careerPreparation: {
      ...(notebook.careerPreparation || {}),
      history,
      topicAnalysis: history[0]?.analysis || normalizeLearningCareerTopicAnalysis(),
    },
    updatedAt: validIsoDate(options.updatedAt),
  };
}

export function clearPlacementHistory(notebook, options = {}) {
  return {
    ...notebook,
    careerPreparation: {
      ...(notebook.careerPreparation || {}),
      history: [],
      topicAnalysis: normalizeLearningCareerTopicAnalysis(),
    },
    updatedAt: validIsoDate(options.updatedAt),
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
