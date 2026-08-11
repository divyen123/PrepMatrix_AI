const MEDICAL_CHAT_ARTIFACT = "medical-training";
const MEDICAL_CHAT_MODE = "education-only";
const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/iu;
const MODULE_ID_PATTERN = /^[a-z0-9._:-]{1,120}$/iu;

export function normalizeChatAssistantContext(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const artifact = String(value.artifact ?? "").trim().toLocaleLowerCase();
  const mode = String(value.mode ?? "").trim().toLocaleLowerCase();
  const notebookId = String(value.notebookId ?? "").trim();
  const moduleId = String(value.moduleId ?? "").trim();

  if (
    artifact !== MEDICAL_CHAT_ARTIFACT
    || mode !== MEDICAL_CHAT_MODE
    || !OBJECT_ID_PATTERN.test(notebookId)
    || !MODULE_ID_PATTERN.test(moduleId)
  ) return null;

  return {
    artifact: MEDICAL_CHAT_ARTIFACT,
    mode: MEDICAL_CHAT_MODE,
    notebookId,
    moduleId,
  };
}

export function sameChatAssistantContext(left, right) {
  const normalizedLeft = normalizeChatAssistantContext(left);
  const normalizedRight = normalizeChatAssistantContext(right);
  if (!normalizedLeft || !normalizedRight) return normalizedLeft === normalizedRight;
  return normalizedLeft.artifact === normalizedRight.artifact
    && normalizedLeft.mode === normalizedRight.mode
    && normalizedLeft.notebookId === normalizedRight.notebookId
    && normalizedLeft.moduleId === normalizedRight.moduleId;
}
