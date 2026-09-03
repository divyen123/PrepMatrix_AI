import { getPlacementHistory } from "./placementPreparation.js";

function cleanText(value, maxLength = 180) {
  return String(value ?? "").replace(/\s+/gu, " ").trim().slice(0, maxLength);
}

export function getStartLearningArtifactKind({ intakeMode, workspaceView } = {}) {
  if (workspaceView === "career") return "placement";
  if (workspaceView === "medical") return "medical";
  if (workspaceView === "notebook") return "notebook";
  return ["medical", "notebook", "placement"].includes(intakeMode) ? intakeMode : null;
}

export function shouldShowStartLearningHero({ workspaceView } = {}) {
  return workspaceView === "intake";
}

export function getSavedPlacementNotes(notebooks = []) {
  if (!Array.isArray(notebooks)) return [];

  return notebooks.flatMap((notebook) => getPlacementHistory(notebook).flatMap((entry) => {
    const analysis = entry?.analysis;
    if (!analysis || !notebook?.id) return [];
    return [{
      analysis,
      generatedAt: entry.generatedAt,
      historyId: entry.id,
      id: `${notebook.id}:placement:${entry.id}`,
      notebook,
      notebookId: notebook.id,
      pinned: entry.pinned === true,
      title: cleanText(analysis.targetRole) || "Placement preparation",
      topicCount: Array.isArray(analysis.topics) ? analysis.topics.length : 0,
      updatedAt: entry.generatedAt || notebook.updatedAt || notebook.createdAt || "",
    }];
  })).sort((left, right) => {
    const pinOrder = Number(right.pinned) - Number(left.pinned);
    if (pinOrder) return pinOrder;
    return (new Date(right.updatedAt).getTime() || 0) - (new Date(left.updatedAt).getTime() || 0);
  });
}

export function sortStartLearningNotebooks(notebooks = []) {
  return [...(Array.isArray(notebooks) ? notebooks : [])].sort((left, right) => {
    const pinOrder = Number(right?.pinned === true) - Number(left?.pinned === true);
    if (pinOrder) return pinOrder;
    const rightTime = new Date(right?.updatedAt || right?.createdAt || 0).getTime() || 0;
    const leftTime = new Date(left?.updatedAt || left?.createdAt || 0).getTime() || 0;
    return rightTime - leftTime;
  });
}

export function isPlacementPrepHash(value) {
  return String(value || "").trim().toLocaleLowerCase() === "#placement-prep";
}

export function isMedicalTrainingHash(value) {
  return String(value || "").trim().toLocaleLowerCase() === "#medical-training";
}
