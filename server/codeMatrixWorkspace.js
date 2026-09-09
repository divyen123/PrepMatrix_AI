export const CODE_MATRIX_LANGUAGES = Object.freeze([
  "python", "c", "cpp", "java", "javascript", "sql", "html", "css",
]);

export const CODE_MATRIX_LIMITS = Object.freeze({
  draftBytes: 64 * 1024,
  inputBytes: 16 * 1024,
  workspaceBytes: 512 * 1024,
  workspaceRequestBytes: 1024 * 1024,
  submissionRequestBytes: 512 * 1024,
  outputBytes: 64 * 1024,
  cpuTimeSeconds: 2,
  wallTimeSeconds: 10,
  memoryKilobytes: 128000,
  submissionRetentionSeconds: 24 * 60 * 60,
  pollIntervalMs: 1000,
});

export class CodeMatrixError extends Error {
  constructor(status, code, message, retryAfterSeconds) {
    super(message);
    this.name = "CodeMatrixError";
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function invalid(message) {
  throw new CodeMatrixError(400, "CODE_MATRIX_INVALID_REQUEST", message);
}

export function codeMatrixObject(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    invalid(`${label} must be an object.`);
  }
  if (Object.keys(value).some((key) => !keys.includes(key))) invalid(`${label} contains an unknown field.`);
  return value;
}

export function codeMatrixText(value, maxBytes, label, { nonempty = false } = {}) {
  if (typeof value !== "string" || (nonempty && !value.trim()) || !value.isWellFormed()) {
    invalid(`${label} must be ${nonempty ? "a nonempty" : "a"} UTF-8 string.`);
  }
  if (Buffer.byteLength(value, "utf8") > maxBytes) {
    throw new CodeMatrixError(413, "CODE_MATRIX_SIZE_LIMIT", `${label} exceeds ${maxBytes} UTF-8 bytes.`);
  }
  return value;
}

function flag(value, label) {
  if (typeof value !== "boolean") invalid(`${label} must be a boolean.`);
  return value;
}

export const CODE_MATRIX_SETUP_STEPS = Object.freeze(["subjects", "notebook", "plan"]);

export function defaultCodeMatrixWorkspace() {
  return {
    revision: 0,
    drafts: {},
    language: "python",
    inputs: {},
    setupDismissed: false,
    completedSteps: [],
    createdAt: null, updatedAt: null, savedAt: null, hasWorkspace: false,
  };
}

export function validateCodeMatrixWorkspacePatch(body) {
  codeMatrixObject(body, ["revision", "drafts", "language", "inputs", "setupDismissed", "completedSteps", "updatedAt"], "workspace");
  if (body.revision !== undefined && (!Number.isSafeInteger(body.revision) || body.revision < 0 || body.revision >= Number.MAX_SAFE_INTEGER)) {
    invalid("revision must be the nonnegative integer returned by GET workspace.");
  }
  if (!Object.keys(body).some((key) => !["revision", "updatedAt"].includes(key))) invalid("Provide at least one workspace field to save.");
  if (body.drafts !== undefined) {
    codeMatrixObject(body.drafts, CODE_MATRIX_LANGUAGES, "drafts");
    for (const [language, draft] of Object.entries(body.drafts)) codeMatrixText(draft, CODE_MATRIX_LIMITS.draftBytes, `drafts.${language}`);
  }
  if (body.language !== undefined && !CODE_MATRIX_LANGUAGES.includes(body.language)) invalid("language is unsupported.");
  if (body.inputs !== undefined) {
    codeMatrixObject(body.inputs, CODE_MATRIX_LANGUAGES, "inputs");
    for (const [language, input] of Object.entries(body.inputs)) codeMatrixText(input, CODE_MATRIX_LIMITS.inputBytes, `inputs.${language}`);
  }
  if (body.setupDismissed !== undefined) flag(body.setupDismissed, "setupDismissed");
  if (body.completedSteps !== undefined && (!Array.isArray(body.completedSteps) || body.completedSteps.length > 3
    || body.completedSteps.some((step) => !CODE_MATRIX_SETUP_STEPS.includes(step)))) invalid("completedSteps may contain subjects, notebook, and plan only.");
  // Keep the client edit timestamp for local checkpoint reconciliation; savedAt is server time.
  if (body.updatedAt !== undefined && body.updatedAt !== null && body.updatedAt !== ""
    && (typeof body.updatedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u.test(body.updatedAt)
      || !Number.isFinite(Date.parse(body.updatedAt)))) invalid("updatedAt must be an ISO timestamp, null, or empty string.");
  return body;
}

export function mergeCodeMatrixWorkspace(current, body, now, observedSteps = []) {
  validateCodeMatrixWorkspacePatch(body);
  const previous = current ?? defaultCodeMatrixWorkspace();
  if (body.revision !== undefined && body.revision !== previous.revision) {
    throw new CodeMatrixError(409, "CODE_MATRIX_REVISION_CONFLICT", "Workspace changed. Reload and merge your edits before saving.");
  }
  const next = {
    revision: previous.revision + 1,
    drafts: { ...previous.drafts, ...body.drafts },
    language: body.language ?? previous.language,
    inputs: { ...previous.inputs, ...body.inputs },
    setupDismissed: previous.setupDismissed || body.setupDismissed === true,
    // Only previous server observations and current database facts mark completion.
    completedSteps: CODE_MATRIX_SETUP_STEPS.filter((step) => previous.completedSteps.includes(step) || observedSteps.includes(step)),
    createdAt: previous.createdAt ?? now,
    updatedAt: body.updatedAt || now.toISOString(),
    savedAt: now,
    hasWorkspace: true,
  };
  // Bound the merged document as well as individual fields and incoming JSON.
  codeMatrixText(JSON.stringify(next), CODE_MATRIX_LIMITS.workspaceBytes, "workspace");
  return next;
}

export function publicCodeMatrixWorkspace(document) {
  if (!document?.hasWorkspace) return null;
  const { revision, drafts, language, inputs, setupDismissed, completedSteps, createdAt, updatedAt, savedAt } = document;
  return { language, drafts, inputs, setupDismissed, completedSteps, createdAt, updatedAt, savedAt, revision };
}
