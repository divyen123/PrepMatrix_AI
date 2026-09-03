import {
  getLearningMedicalTrainingEligibility,
  normalizeLearningMedicalTrainingAnalysis,
} from "./learningNotebook.js";

export const MEDICAL_TRAINING_STARTERS = [
  { id: "mechanism", title: "Mechanism to finding", summary: "Connect foundational health science to findings in a fictional educational scenario." },
  { id: "options", title: "Compare reasoning options", summary: "Keep plausible explanations or priorities visible and identify the evidence that separates them." },
  { id: "evidence", title: "Assessment and evidence", summary: "Explain what an assessment or result supports, what it does not prove, and what could confound it." },
  { id: "safety", title: "Safety flags and escalation", summary: "Recognize urgent patterns, uncertainty, contraindications, and when qualified help is essential." },
  { id: "care", title: "Care and management principles", summary: "Reason about goals, risks, monitoring, alternatives, and discipline-appropriate care principles." },
  { id: "ethics", title: "Communication and ethics", summary: "Practice consent, confidentiality, shared decisions, public-health context, and clear communication." },
];

export const MEDICAL_REASONING_PATH = [
  { id: "findings", label: "Extract findings", hint: "Separate given facts from assumptions." },
  { id: "mechanism", label: "Explain mechanisms", hint: "Connect findings to relevant health-science concepts." },
  { id: "options", label: "Compare options", hint: "Keep alternative explanations or priorities visible." },
  { id: "evidence", label: "Test with evidence", hint: "Choose assessment actions or evidence that distinguish the options." },
  { id: "safety", label: "Check safety", hint: "Name safety flags, uncertainty, limits, and escalation." },
];

function cleanText(value, maximum = 4000) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim().slice(0, maximum);
}

function identifier(value, fallback) {
  const cleaned = cleanText(value, 120)
    .toLocaleLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || fallback;
}

function validIsoDate(value) {
  const date = new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function historyId(generatedAt, label) {
  const timestamp = new Date(generatedAt).getTime();
  return `medical-training-${Number.isFinite(timestamp) ? timestamp : Date.now()}-${identifier(label, "guide")}`;
}

export function sortMedicalTrainingHistory(history = []) {
  return [...(Array.isArray(history) ? history : [])].sort((left, right) => {
    const pinOrder = Number(right?.pinned === true) - Number(left?.pinned === true);
    if (pinOrder) return pinOrder;
    const rightTime = new Date(right?.generatedAt || 0).getTime() || 0;
    const leftTime = new Date(left?.generatedAt || 0).getTime() || 0;
    return rightTime - leftTime;
  });
}

export function getMedicalTrainingHistory(notebook) {
  const history = notebook?.medicalTraining?.history;
  if (Array.isArray(history) && history.length) return sortMedicalTrainingHistory(history);
  const analysis = getSavedMedicalTrainingAnalysis(notebook);
  if (!analysis) return [];
  return [{
    id: "medical-training-legacy",
    analysis,
    generatedAt: notebook?.updatedAt || notebook?.createdAt || new Date(0).toISOString(),
    pinned: false,
    providerModel: "",
    source: "legacy-saved-analysis",
  }];
}

export function getMedicalTrainingHistoryEntry(notebook, historyIdValue = "") {
  const history = getMedicalTrainingHistory(notebook);
  return history.find((entry) => entry.id === historyIdValue) || history[0] || null;
}

export function isMedicalTrainingProfile(profile = {}) {
  return getLearningMedicalTrainingEligibility(profile).enabled;
}

export function createMedicalTrainingDraft(payload = {}, options = {}) {
  const notebookId = cleanText(options.notebookId ?? payload?.notebook?.id, 120);
  const rawAnalysis = payload?.medicalTraining
    ?? payload?.notebook?.medicalTraining?.topicAnalysis
    ?? payload?.topicAnalysis
    ?? payload?.analysis;
  const analysis = normalizeLearningMedicalTrainingAnalysis(rawAnalysis, {
    requestedTopics: options.requestedTopics,
    trainingFocus: options.trainingFocus,
  });
  if (!notebookId || !analysis.modules.length) {
    throw new Error("The medical training analysis did not contain a usable reasoning guide.");
  }
  const generatedAt = validIsoDate(options.generatedAt);
  return {
    analysis,
    generatedAt,
    id: cleanText(options.id, 120)
      || historyId(generatedAt, analysis.trainingTitle || analysis.modules[0]?.title),
    notebookId,
    pinned: false,
    providerModel: cleanText(payload?.providerModel, 160),
    source: "medical-training-draft",
    trainingKind: "medical",
  };
}

export function getSavedMedicalTrainingAnalysis(notebook) {
  const history = notebook?.medicalTraining?.history;
  const source = Array.isArray(history) && history.length
    ? sortMedicalTrainingHistory(history)[0]?.analysis
    : notebook?.medicalTraining?.topicAnalysis;
  if (!source || typeof source !== "object") return null;
  const analysis = normalizeLearningMedicalTrainingAnalysis(source);
  return analysis.modules.length ? analysis : null;
}

export function getSavedMedicalTrainingNotes(notebooks = []) {
  if (!Array.isArray(notebooks)) return [];
  return notebooks.flatMap((notebook) => getMedicalTrainingHistory(notebook).flatMap((entry) => {
    const analysis = entry?.analysis;
    if (!analysis || !notebook?.id) return [];
    return [{
      analysis,
      generatedAt: entry.generatedAt,
      historyId: entry.id,
      id: `${notebook.id}:medical-training:${entry.id}`,
      notebook,
      notebookId: notebook.id,
      pinned: entry.pinned === true,
      title: cleanText(analysis.trainingTitle, 180) || "Medical training",
      topicCount: analysis.modules.length,
      updatedAt: entry.generatedAt || notebook.updatedAt || notebook.createdAt || "",
    }];
  })).sort((left, right) => {
    const pinOrder = Number(right.pinned) - Number(left.pinned);
    if (pinOrder) return pinOrder;
    return (new Date(right.updatedAt).getTime() || 0) - (new Date(left.updatedAt).getTime() || 0);
  });
}

export function getMedicalTrainingInputValues(notebook, draft, userProfile = {}, historyIdValue = "") {
  const matchingDraft = draft?.notebookId === notebook?.id ? draft : null;
  const analysis = matchingDraft?.analysis
    || getMedicalTrainingHistoryEntry(notebook, historyIdValue)?.analysis
    || getSavedMedicalTrainingAnalysis(notebook);
  return {
    focus: cleanText(
      analysis?.trainingTitle
      || userProfile?.medicalSpecialty
      || userProfile?.department
      || userProfile?.degree,
      160,
    ),
    topics: (analysis?.modules || [])
      .map((module) => cleanText(module?.title, 140))
      .filter(Boolean)
      .slice(0, 12)
      .join("\n"),
  };
}

export function mergeMedicalTrainingDraft(notebook, draft, options = {}) {
  if (!notebook?.id || !draft?.notebookId || notebook.id !== draft.notebookId) {
    throw new Error("This medical training draft belongs to a different learning notebook.");
  }
  const topicAnalysis = normalizeLearningMedicalTrainingAnalysis(draft.analysis);
  if (!topicAnalysis.modules.length) {
    throw new Error("Analyze at least one health-science concept or educational scenario before saving.");
  }
  const generatedAt = validIsoDate(draft.generatedAt);
  const entry = {
    id: cleanText(draft.id, 120)
      || historyId(generatedAt, topicAnalysis.trainingTitle || topicAnalysis.modules[0]?.title),
    analysis: topicAnalysis,
    generatedAt,
    pinned: draft.pinned === true,
    providerModel: cleanText(draft.providerModel, 160),
    source: cleanText(draft.source, 120),
  };
  const history = [
    entry,
    ...getMedicalTrainingHistory(notebook).filter((item) => item.id !== entry.id),
  ];
  return {
    ...notebook,
    medicalTraining: {
      ...(notebook.medicalTraining && typeof notebook.medicalTraining === "object"
        ? notebook.medicalTraining
        : {}),
      enabled: true,
      history,
      topicAnalysis,
    },
    updatedAt: validIsoDate(options.savedAt),
  };
}

export function setMedicalTrainingHistoryPinned(notebook, historyIdValue, pinned, options = {}) {
  const history = getMedicalTrainingHistory(notebook);
  if (!history.some((entry) => entry.id === historyIdValue)) {
    throw new Error("That medical training history item is no longer available.");
  }
  return {
    ...notebook,
    medicalTraining: {
      ...(notebook.medicalTraining || {}),
      history: history.map((entry) => (
        entry.id === historyIdValue ? { ...entry, pinned: pinned === true } : entry
      )),
    },
    updatedAt: validIsoDate(options.updatedAt),
  };
}

export function deleteMedicalTrainingHistoryEntry(notebook, historyIdValue, options = {}) {
  const history = getMedicalTrainingHistory(notebook).filter((entry) => entry.id !== historyIdValue);
  return {
    ...notebook,
    medicalTraining: {
      ...(notebook.medicalTraining || {}),
      history,
      topicAnalysis: history[0]?.analysis || normalizeLearningMedicalTrainingAnalysis(),
    },
    updatedAt: validIsoDate(options.updatedAt),
  };
}

export function clearMedicalTrainingHistory(notebook, options = {}) {
  return {
    ...notebook,
    medicalTraining: {
      ...(notebook.medicalTraining || {}),
      history: [],
      topicAnalysis: normalizeLearningMedicalTrainingAnalysis(),
    },
    updatedAt: validIsoDate(options.updatedAt),
  };
}

export function buildMedicalTrainingActionTarget({
  focus,
  index = 0,
  item,
  kind = "practice",
  module,
  notebook,
} = {}) {
  const moduleId = identifier(module?.id ?? module?.title, "module");
  const itemId = identifier(item?.id, String(index + 1));
  const itemText = cleanText(
    kind === "viva"
      ? item?.question ?? item
      : item?.title ?? item?.prompt ?? item?.text ?? item,
    700,
  );
  const id = `medical-training:${moduleId}:${kind}:${itemId}`;
  const guidance = cleanText(item?.guidance ?? item?.explanation, 2200);
  const framework = kind === "viva"
    ? "Reasoning framework: identify decisive findings, explain the mechanism, compare plausible options, state what evidence would change your view, and finish with uncertainty, safety flags, and escalation boundaries."
    : "Reasoning drill: move from fictional findings to mechanisms and options, justify the most discriminating evidence, then record one unsafe assumption you avoided and one uncertainty that remains.";
  const boundary = "Educational simulation only: do not use this material to assess, diagnose, or treat a real person. Use fictional or de-identified details and verify care decisions with qualified supervision and current local guidance.";
  return {
    artifact: "medical-training",
    chapterName: `Medical training${cleanText(focus, 160) ? ` - ${cleanText(focus, 160)}` : ""}`,
    explanation: [guidance, framework, boundary].filter(Boolean).join("\n\n"),
    id,
    keyPoints: [itemText, cleanText(module?.whyItMatters, 900)].filter(Boolean),
    kind,
    metadata: {
      artifact: "medical-training",
      kind,
      moduleId: cleanText(module?.id, 120) || moduleId,
      notebookId: cleanText(notebook?.id, 120),
      trainingKind: "medical",
    },
    subjectName: cleanText(notebook?.subjectName, 160) || "Medical training",
    summary: cleanText(module?.whyItMatters ?? module?.conceptOverview, 1200),
    title: kind === "viva"
      ? itemText || "Conceptual reasoning check"
      : `Reasoning drill: ${itemText || module?.title || "health-science concept"}`,
    type: "medical-training",
    unitKey: id,
  };
}

export function buildMedicalTrainingChatPrompt({ focus, module, target } = {}) {
  return [
    "Act as a health-science education coach for a fictional, de-identified learning exercise, not as a professional caring for a real person.",
    cleanText(focus, 160) ? `Training focus: ${cleanText(focus, 160)}.` : "",
    cleanText(module?.title, 180) ? `Concept: ${cleanText(module.title, 180)}.` : "",
    `Reasoning task: ${cleanText(target?.title, 700)}.`,
    "Teach mechanism-first reasoning: extract findings, connect mechanisms, compare options, choose discriminating assessment actions or evidence, and explicitly check safety flags, uncertainty, contraindications, and escalation.",
    "Ask me to reason through the final check before showing a reference explanation. Never provide patient-specific diagnosis, dosing, or treatment instructions; remind me to use qualified supervision and current local guidance.",
  ].filter(Boolean).join("\n\n");
}
