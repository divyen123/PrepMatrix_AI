import {
  normalizeLearningCareerTopicAnalysis,
  normalizeLearningCareerTopics,
  normalizePlacementPreparationSource,
} from "./learningNotebook.js";

export { normalizePlacementPreparationSource } from "./learningNotebook.js";

function cleanText(value, maxLength = 4000) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim().slice(0, maxLength);
}

function listFrom(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

const NOTEBOOK_ROLE_RULES = [
  {
    role: "Full-stack developer",
    signals: [/\bfull[\s-]?stack\b/iu],
  },
  {
    role: "UI/UX designer",
    signals: [
      /\bui\s*\/\s*ux\b|\buser (?:interface|experience)\b|\binteraction design\b/iu,
      /\bwirefram(?:e|ing)\b|\bdesign systems?\b|\bfigma\b/iu,
    ],
  },
  {
    role: "Frontend developer",
    signals: [
      /\bfront[\s-]?end\b|\bweb (?:development|design)\b/iu,
      /\breact(?:\.js)?\b|\bangular\b|\bvue(?:\.js)?\b|\bhtml\b|\bcss\b/iu,
    ],
  },
  {
    role: "Backend developer",
    signals: [
      /\bback[\s-]?end\b|\bserver[\s-]?side\b|\bmicroservices?\b/iu,
      /\brest(?:ful)?\s+api\b|\bapi (?:design|development|techniques?)\b|\bcrud\b/iu,
      /\bnode(?:\.js)?\b|\bexpress(?:\.js)?\b|\bspring boot\b|\bdjango\b/iu,
    ],
  },
  {
    role: "Mobile application developer",
    signals: [
      /\bmobile (?:app|application)\b|\bandroid\b|\bios development\b/iu,
      /\bflutter\b|\breact native\b|\bswiftui\b|\bkotlin\b/iu,
    ],
  },
  {
    role: "DevOps engineer",
    signals: [
      /\bdevops\b|\bsite reliability\b|\bsre\b|\bci\s*\/\s*cd\b/iu,
      /\bdocker\b|\bkubernetes\b|\bterraform\b|\bcontainer orchestration\b/iu,
    ],
  },
  {
    role: "Cybersecurity analyst",
    signals: [
      /\bcyber[\s-]?security\b|\binformation security\b|\bnetwork security\b/iu,
      /\bethical hacking\b|\bpenetration testing\b|\bmalware\b|\bcryptograph/iu,
    ],
  },
  {
    role: "Network engineer",
    signals: [
      /\bdata communication\b|\bcomputer networks?\b|\bnetworking\b/iu,
      /\btcp\s*\/\s*ip\b|\brouting protocols?\b|\bsubnetting\b/iu,
    ],
  },
  {
    role: "Machine learning engineer",
    signals: [
      /\bmachine learning\b|\bdeep learning\b|\bartificial intelligence\b/iu,
      /\bneural networks?\b|\bcomputer vision\b|\bnatural language processing\b|\bnlp\b/iu,
    ],
  },
  {
    role: "Data scientist",
    signals: [/\bdata science\b|\bpredictive model(?:ing|ling)\b|\bfeature engineering\b/iu],
  },
  {
    role: "Data analyst",
    signals: [
      /\bdata analytics?\b|\bbusiness intelligence\b|\bdata visuali[sz]ation\b/iu,
      /\bpower\s*bi\b|\btableau\b|\bexploratory data analysis\b/iu,
    ],
  },
  {
    role: "Database engineer",
    signals: [/\bdatabase systems?\b|\bdbms\b|\bdatabase administration\b|\bsql database\b/iu],
  },
  {
    role: "Cloud engineer",
    signals: [/\bcloud computing\b|\bamazon web services\b|\baws\b|\bmicrosoft azure\b|\bgoogle cloud\b/iu],
  },
  {
    role: "Quantum computing research intern",
    signals: [/\bquantum comput(?:ing|ation)\b|\bquantum algorithms?\b|\bqubits?\b/iu],
  },
  {
    role: "Software engineering intern",
    signals: [
      /\bsoftware engineering\b|\bdata structures?\b|\balgorithms?\b/iu,
      /\boperating systems?\b|\bobject[\s-]?oriented programming\b|\bcomputer science\b/iu,
      /\bjava programming\b|\bpython programming\b|\bc\+\+(?:\s|$)/iu,
    ],
  },
  {
    role: "Finance analyst",
    signals: [/\bfinance\b|\baccounting\b|\binvestment analysis\b|\beconomics\b/iu],
  },
  {
    role: "Business analyst",
    signals: [/\bbusiness analytics?\b|\bbusiness management\b|\bmarketing analytics?\b/iu],
  },
  {
    role: "Legal research intern",
    signals: [/\blaw\b|\blegal studies\b|\bjurisprudence\b|\bconstitutional studies\b/iu],
  },
  {
    role: "Engineering graduate trainee",
    signals: [
      /\bmechanical engineering\b|\bcivil engineering\b|\belectrical engineering\b/iu,
      /\belectronics engineering\b|\bembedded systems?\b|\bvlsi\b/iu,
    ],
  },
];

export function getNotebookPlacementTopics(notebook, limit = 12) {
  const chapters = listFrom(
    notebook?.chapters
      || notebook?.outline?.chapters
      || notebook?.structure?.chapters
      || notebook?.studyGuide?.chapters,
  );
  const candidates = [
    ...chapters.flatMap((chapter) => listFrom(chapter?.topics || chapter?.children)),
    ...listFrom(notebook?.topics),
  ];
  const seen = new Set();
  const boundedLimit = Math.max(0, Math.min(Number(limit) || 12, 12));

  return candidates.map((topic) => cleanText(
    topic?.title || topic?.name || topic?.label || topic?.text || topic,
    140,
  )).filter((topic) => {
    const key = topic.toLocaleLowerCase();
    if (!topic || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, boundedLimit);
}

export function getNotebookPlacementRoleSuggestion(notebook, fallbackRole = "") {
  const savedRole = cleanText(
    notebook?.careerPreparation?.topicAnalysis?.targetRole
      || listFrom(notebook?.careerPreparation?.history)
        .map((entry) => entry?.analysis?.targetRole)
        .find(Boolean)
      || notebook?.targetRole,
    160,
  );
  if (savedRole) return savedRole;

  const chapters = listFrom(
    notebook?.chapters
      || notebook?.outline?.chapters
      || notebook?.structure?.chapters
      || notebook?.studyGuide?.chapters,
  );
  const primaryText = [notebook?.subjectName, notebook?.subject, notebook?.title, notebook?.name]
    .map((value) => cleanText(value, 240))
    .filter(Boolean)
    .join(" ");
  const supportingText = [
    notebook?.summary,
    notebook?.overview,
    ...chapters.map((chapter) => chapter?.title || chapter?.name || chapter?.label),
    ...getNotebookPlacementTopics(notebook),
  ].map((value) => cleanText(value, 600)).filter(Boolean).join(" ");

  const match = NOTEBOOK_ROLE_RULES.map((rule, index) => ({
    index,
    role: rule.role,
    score: rule.signals.reduce((score, signal) => (
      score + (signal.test(primaryText) ? 4 : 0) + (signal.test(supportingText) ? 1 : 0)
    ), 0),
  })).filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)[0];

  return match?.role || cleanText(fallbackRole, 160) || "Graduate trainee";
}

export function canCompletePlacementRole(value, suggestion) {
  const typed = cleanText(value, 160).replace(/\s+/gu, " ").toLocaleLowerCase();
  const complete = cleanText(suggestion, 160).replace(/\s+/gu, " ").toLocaleLowerCase();
  if (!typed || !complete || typed === complete) return false;
  if (complete.startsWith(typed)) return true;

  const typedWords = typed.split(" ");
  const completeWords = complete.split(" ");
  if (
    typedWords.length <= completeWords.length
    && typedWords.every((word, index) => completeWords[index]?.startsWith(word))
  ) return true;

  const compactTyped = typed.replace(/[^a-z0-9]+/gu, "");
  const acronym = completeWords.map((word) => word[0]).join("");
  return compactTyped.length >= 2 && acronym.startsWith(compactTyped);
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

function placementHistoryMutation(action, id = "", options = {}) {
  return {
    action,
    ...(id ? { id: cleanText(id, 120) } : {}),
    ...(action === "pin" ? { pinned: options.pinned === true } : {}),
  };
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
  if (Array.isArray(history) && history.length) {
    return sortPlacementHistory(history.map((entry) => ({
      ...entry,
      preparationSource: normalizePlacementPreparationSource(
        entry?.preparationSource ?? entry?.customContext ?? entry?.context,
        notebook?.preparationSource ?? notebook?.customContext ?? notebook?.context,
      ),
    })));
  }
  const analysis = notebook?.careerPreparation?.topicAnalysis;
  if (!analysis || !Array.isArray(analysis.topics) || !analysis.topics.length) return [];
  return [{
    id: "placement-legacy",
    analysis,
    generatedAt: notebook?.updatedAt || notebook?.createdAt || new Date(0).toISOString(),
    pinned: false,
    preparationSource: normalizePlacementPreparationSource(
      notebook?.preparationSource ?? notebook?.customContext ?? notebook?.context,
    ),
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
  const preparationSource = normalizePlacementPreparationSource(
    options.preparationSource ?? options.customContext ?? options.context,
    payload?.preparationSource
      ?? payload?.customContext
      ?? payload?.context
      ?? payload?.notebook?.preparationSource
      ?? payload?.notebook?.customContext
      ?? payload?.notebook?.context,
  );

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
    preparationSource,
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
    preparationSource: normalizePlacementPreparationSource(
      draft.preparationSource ?? draft.customContext ?? draft.context,
      notebook?.preparationSource ?? notebook?.customContext ?? notebook?.context,
    ),
    providerModel: cleanText(draft.providerModel, 160),
    source: cleanText(draft.source, 120),
  };
  const history = [
    entry,
    ...getPlacementHistory(notebook).filter((item) => item.id !== entry.id),
  ];
  return {
    ...notebook,
    careerHistoryMutation: placementHistoryMutation("upsert", entry.id),
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
    careerHistoryMutation: placementHistoryMutation("pin", historyIdValue, { pinned }),
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
    careerHistoryMutation: placementHistoryMutation("delete", historyIdValue),
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
    careerHistoryMutation: placementHistoryMutation("clear"),
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
  if (isInterview) {
    const answer = [item?.answer, item?.guidance, item?.explanation]
      .map((value) => cleanText(value, 2200)).find(Boolean) || "";
    // Remove only the stock additions used by older versions; keep the saved answer.
    const directAnswer = answer
      .replaceAll("Answer framework: clarify the question, state the core idea, walk through one concrete example, discuss the important trade-off, and finish with a concise takeaway.", "")
      .replaceAll("Coding guidance: clarify inputs and constraints, outline a baseline and an optimized approach, state time and space complexity, trace edge cases, then implement and test the code with normal, boundary, and invalid cases.", "")
      .replace(/^(?:answer|model answer|sample answer):\s*/iu, "")
      .replace(/^(?:mention|state|explain|note) that\s+/iu, "")
      .trim();
    return directAnswer;
  }
  const label = cleanText(
    isInterview ? item?.question ?? item : item?.title ?? item?.text ?? item,
    700,
  );
  const suppliedGuidance = cleanText(item?.guidance ?? item?.answer ?? item?.explanation, 2200);
  const coding = isCodingPlacementItem({ codingRelevant, item, topic });
  const sections = [];

  if (suppliedGuidance) sections.push(suppliedGuidance);
  sections.push(
    `Practice goal: ${label || "Complete the task independently"}. Work once with guidance, repeat from memory, then explain what changed and why.`,
    "Completion check: record the result, one mistake you corrected, and the next variation you can solve without help.",
  );
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
  preparationSource,
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
  const normalizedPreparationSource = normalizePlacementPreparationSource(
    preparationSource,
    notebook?.preparationSource ?? notebook?.customContext ?? notebook?.context,
  );
  const preparationContext = normalizedPreparationSource.context
    || normalizedPreparationSource.label;
  const topicSummary = cleanText(topic?.whyItMatters ?? topic?.explanation, 1200);
  const itemIsCodingRelevant = isCodingPlacementItem({ codingRelevant, item, topic });

  return {
    chapterName: `Placement prep${cleanText(targetRole, 160) ? ` - ${cleanText(targetRole, 160)}` : ""}`,
    explanation,
    id,
    keyPoints: [
      itemText,
      cleanText(topic?.whyItMatters, 900),
      preparationContext
        ? `Preparation context: ${cleanText(preparationContext, 900)}`
        : "",
    ].filter(Boolean),
    kind,
    metadata: {
      codingRelevant: itemIsCodingRelevant,
      kind,
      notebookId: cleanText(notebook?.id, 120),
      preparationSource: normalizedPreparationSource,
      topicId: cleanText(topic?.id, 120) || topicId,
    },
    subjectName: cleanText(notebook?.subjectName, 160) || "Placement preparation",
    summary: [
      topicSummary,
      preparationContext
        ? `Preparation context: ${cleanText(preparationContext, 1200)}`
        : "",
    ].filter(Boolean).join("\n\n"),
    title,
    type: "placement",
    unitKey: id,
  };
}

export function buildPlacementChatPrompt({
  notebook,
  preparationSource,
  target,
  targetRole,
  topic,
} = {}) {
  const isInterview = target?.kind === "interview";
  const coding = isCodingPlacementItem({ item: target, topic });
  const normalizedPreparationSource = normalizePlacementPreparationSource(
    preparationSource ?? target?.metadata?.preparationSource,
    notebook?.preparationSource ?? notebook?.customContext ?? notebook?.context,
  );
  const preparationContext = normalizedPreparationSource.context
    || normalizedPreparationSource.label;
  const customWorkspace = notebook?.artifactKind === "placement-workspace";
  return [
    isInterview
      ? "Answer this exact interview question directly with a complete, interview-ready model answer."
      : "Coach me on this placement preparation item using an interactive, interview-ready explanation.",
    preparationContext
      ? `Learner-provided preparation context:\n${preparationContext}`
      : "",
    !customWorkspace
      ? `Notebook: ${cleanText(notebook?.title, 180) || "Learning notebook"}.`
      : "",
    !customWorkspace
      ? `Subject: ${cleanText(notebook?.subjectName, 160) || "Placement preparation"}.`
      : "",
    cleanText(targetRole, 160) ? `Target role: ${cleanText(targetRole, 160)}.` : "",
    cleanText(topic?.title, 180) ? `Preparation topic: ${cleanText(topic.title, 180)}.` : "",
    `Item: ${cleanText(target?.title, 700)}.`,
    cleanText(target?.explanation, 2400) ? `Current guidance:\n${cleanText(target.explanation, 2400)}` : "",
    isInterview
      ? "Use concise bullet points with the specific facts, reasoning, and examples needed to answer every part of the question. Include code or pseudocode, actual complexity, and edge cases only if the question asks for a coding solution. Do not substitute a generic answer framework or coding checklist, and do not withhold the answer behind a practice question."
      : coding
      ? "Include an approach comparison, complexity analysis, edge cases, a code-oriented walkthrough, and a small practice challenge."
      : "Include a strong answer structure, one concrete example, likely follow-up questions, and a short practice challenge.",
    isInterview ? "Put the answer first, then add a relevant follow-up only if helpful."
      : "Keep the response practical and ask me to attempt the final check before revealing a model answer.",
  ].filter(Boolean).join("\n\n");
}
