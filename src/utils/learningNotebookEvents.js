export const LEARNING_NOTEBOOK_SAVED_EVENT = "prepmatrix:learning-notebook-saved";

/** Notify current-profile readers after the server has confirmed a notebook save. */
export function notifyLearningNotebookSaved({ academicProfileId = "", notebookId = "" } = {}) {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function"
    || typeof CustomEvent !== "function") return false;
  return window.dispatchEvent(new CustomEvent(LEARNING_NOTEBOOK_SAVED_EVENT, {
    detail: {
      academicProfileId: String(academicProfileId).trim(),
      notebookId: String(notebookId).trim(),
    },
  }));
}
