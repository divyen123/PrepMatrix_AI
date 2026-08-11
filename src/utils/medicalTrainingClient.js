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
  return {
    analysis,
    generatedAt: validIsoDate(options.generatedAt),
    notebookId,
    providerModel: cleanText(payload?.providerModel, 160),
    source: "medical-training-draft",
    trainingKind: "medical",
  };
}

export function getSavedMedicalTrainingAnalysis(notebook) {
  const source = notebook?.medicalTraining?.topicAnalysis;
  if (!source || typeof source !== "object") return null;
  const analysis = normalizeLearningMedicalTrainingAnalysis(source);
  return analysis.modules.length ? analysis : null;
}

export function getSavedMedicalTrainingNotes(notebooks = []) {
  if (!Array.isArray(notebooks)) return [];
  return notebooks.flatMap((notebook) => {
    const analysis = getSavedMedicalTrainingAnalysis(notebook);
    if (!analysis || !notebook?.id) return [];
    return [{
      analysis,
      id: `${notebook.id}:medical-training`,
      notebook,
      notebookId: notebook.id,
      title: cleanText(analysis.trainingTitle, 180) || "Medical training",
      topicCount: analysis.modules.length,
      updatedAt: notebook.updatedAt || notebook.createdAt || "",
    }];
  });
}

export function getMedicalTrainingInputValues(notebook, draft, userProfile = {}) {
  const matchingDraft = draft?.notebookId === notebook?.id ? draft : null;
  const analysis = matchingDraft?.analysis || getSavedMedicalTrainingAnalysis(notebook);
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
  return {
    ...notebook,
    medicalTraining: {
      ...(notebook.medicalTraining && typeof notebook.medicalTraining === "object"
        ? notebook.medicalTraining
        : {}),
      enabled: true,
      topicAnalysis,
    },
    updatedAt: validIsoDate(options.savedAt),
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
