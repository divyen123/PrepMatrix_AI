import { getSavedPlacementAnalysis } from "./placementPreparation.js";

function cleanText(value, maxLength = 180) {
  return String(value ?? "").replace(/\s+/gu, " ").trim().slice(0, maxLength);
}

export function getStartLearningArtifactKind({ intakeMode, workspaceView } = {}) {
  if (workspaceView === "career") return "placement";
  if (workspaceView === "medical") return "medical";
  if (workspaceView === "notebook") return "notebook";
  return ["medical", "notebook", "placement"].includes(intakeMode) ? intakeMode : null;
}

export function getSavedPlacementNotes(notebooks = []) {
  if (!Array.isArray(notebooks)) return [];

  return notebooks.flatMap((notebook) => {
    const analysis = getSavedPlacementAnalysis(notebook);
    if (!analysis || !notebook?.id) return [];
    return [{
      analysis,
      id: `${notebook.id}:placement`,
      notebook,
      notebookId: notebook.id,
      title: cleanText(analysis.targetRole) || "Placement preparation",
      topicCount: Array.isArray(analysis.topics) ? analysis.topics.length : 0,
      updatedAt: notebook.updatedAt || notebook.createdAt || "",
    }];
  });
}

export function isPlacementPrepHash(value) {
  return String(value || "").trim().toLocaleLowerCase() === "#placement-prep";
}

export function isMedicalTrainingHash(value) {
  return String(value || "").trim().toLocaleLowerCase() === "#medical-training";
}
