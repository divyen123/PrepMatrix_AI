export const API_BASE = (import.meta.env?.VITE_API_URL || "").trim().replace(/\/+$/, "");
export const HAS_CONFIGURED_API = Boolean(API_BASE);
export const AUTH_RECOVERY_TIMEOUT_MS = 65000;
export const ACADEMIC_PROFILE_DELETE_TIMEOUT_MS = 90000;
export const AI_QUOTA_UPDATED_EVENT = "prepmatrixAiQuotaUpdated";
export const AI_AUTH_READY_EVENT = "prepmatrixAiAuthReady";
export const AI_AUTH_CLEARED_EVENT = "prepmatrixAiAuthCleared";
const AUTH_NOTICE_KEY = "prepmatrix_auth_notice";
const AI_IDEMPOTENCY_RECOVERY_TTL_MS = 30 * 60 * 1000;
const pendingAiIdempotencyKeys = new Map();
let activeAcademicProfileId = "";

function normalizeAcademicProfileId(value) {
  if (typeof value === "string") return value.trim();
  return String(value?.academicProfileId || value?.dataId || "").trim();
}

export function setApiAcademicProfileScope(value) {
  const nextId = normalizeAcademicProfileId(value);
  if (nextId !== activeAcademicProfileId) pendingAiIdempotencyKeys.clear();
  activeAcademicProfileId = nextId;
  return activeAcademicProfileId;
}

export function getApiAcademicProfileScope() {
  return activeAcademicProfileId;
}

async function createAiRequestFingerprint(path, method, body, academicProfileId = "") {
  const input = String(body || "");
  const prefix = `${String(method || "GET").toUpperCase()}:${path}:${academicProfileId}:`;
  if (globalThis.crypto?.subtle && typeof TextEncoder !== "undefined") {
    const digest = await globalThis.crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(prefix + input),
    );
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  let hash = 2166136261;
  const fallbackInput = prefix + input;
  for (let index = 0; index < fallbackInput.length; index += 1) {
    hash ^= fallbackInput.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${fallbackInput.length}:${(hash >>> 0).toString(16)}`;
}
function rememberAiIdempotencyKey(fingerprint, requestedKey) {
  if (!fingerprint || !requestedKey) return requestedKey;

  const now = Date.now();
  for (const [key, entry] of pendingAiIdempotencyKeys) {
    if (entry.expiresAt <= now) pendingAiIdempotencyKeys.delete(key);
  }

  const existing = pendingAiIdempotencyKeys.get(fingerprint);
  if (existing?.expiresAt > now) return existing.key;

  if (pendingAiIdempotencyKeys.size >= 100) {
    pendingAiIdempotencyKeys.delete(pendingAiIdempotencyKeys.keys().next().value);
  }
  pendingAiIdempotencyKeys.set(fingerprint, {
    key: requestedKey,
    expiresAt: now + AI_IDEMPOTENCY_RECOVERY_TTL_MS,
  });
  return requestedKey;
}

function finishAiIdempotencyRequest(fingerprint, responsePayload) {
  if (!fingerprint) return;
  const code = responsePayload?.code;
  if (code === "AI_REQUEST_IN_PROGRESS" || code === "AI_QUOTA_UNAVAILABLE") return;
  pendingAiIdempotencyKeys.delete(fingerprint);
}

export function clearStoredAuthState() {
  localStorage.removeItem("prepmatrix_auth_token");
  pendingAiIdempotencyKeys.clear();
  activeAcademicProfileId = "";
  dispatchWindowEvent(AI_AUTH_CLEARED_EVENT);
}

function dispatchWindowEvent(name, detail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function notifySessionEnded(message) {
  if (typeof window === "undefined") return;
  const notice = message || "Please log in again to continue.";
  window.sessionStorage.setItem(AUTH_NOTICE_KEY, notice);
  window.dispatchEvent(new CustomEvent("prepmatrixAuthSessionEnded", { detail: { message: notice } }));
}

function numberHeader(response, name) {
  const value = response.headers.get(name);
  if (value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function extractAiQuotaUpdate(response, path = "") {
  // Account-balance reads are applied by AiQuotaProvider's request-sequenced
  // refresh. Publishing them here as well would let an older overlapping read
  // bypass that sequence guard and overwrite a newer confirmed balance.
  if (path === "/api/ai/quota") return null;

  const limit = numberHeader(response, "X-AI-Credit-Limit");
  const remaining = numberHeader(response, "X-AI-Credit-Remaining");
  const cost = numberHeader(response, "X-AI-Credit-Cost");
  const resetAt = response.headers.get("X-AI-Credit-Reset-At");
  const hasAiCreditHeaders = limit !== null || remaining !== null || cost !== null || Boolean(resetAt);

  // Other modules can expose their own `quota` payloads (for example the
  // Resume Builder's weekly generation allowance). Only explicit
  // X-AI-Credit headers from an AI action may update the live balance here.
  if (!hasAiCreditHeaders) return null;

  return {
    partial: true,
    ...(limit !== null ? { limit } : {}),
    ...(remaining !== null ? { remaining } : {}),
    ...(resetAt ? { resetAt } : {}),
    ...(cost !== null ? { requestCost: cost } : {}),
  };
}

function publishQuota(response, path) {
  const update = extractAiQuotaUpdate(response, path);
  if (update) dispatchWindowEvent(AI_QUOTA_UPDATED_EVENT, update);
}

async function request(path, options = {}) {
  const requestedAcademicProfileId = options.academicProfileId === null
    ? ""
    : normalizeAcademicProfileId(options.academicProfileId) || activeAcademicProfileId;
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs || 15000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const {
    timeoutMs: _timeoutMs,
    academicProfileId: _academicProfileId,
    headers: optionHeaders,
    ...fetchOptions
  } = options;
  const token = localStorage.getItem("prepmatrix_auth_token");
  const requestedIdempotencyKey = optionHeaders?.["Idempotency-Key"]
    ?? optionHeaders?.["idempotency-key"];
  const idempotencyFingerprint = requestedIdempotencyKey
    ? await createAiRequestFingerprint(
      path,
      fetchOptions.method,
      fetchOptions.body,
      requestedAcademicProfileId,
    )
    : "";
  const stableIdempotencyKey = rememberAiIdempotencyKey(idempotencyFingerprint, requestedIdempotencyKey);
  const headers = {
    "Content-Type": "application/json",
    ...(optionHeaders || {}),
  };
  if (stableIdempotencyKey) {
    headers["Idempotency-Key"] = stableIdempotencyKey;
  }
  if (requestedAcademicProfileId && !headers["X-Academic-Profile-Id"] && !headers["x-academic-profile-id"]) {
    headers["X-Academic-Profile-Id"] = requestedAcademicProfileId;
  }
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      credentials: "include",
      signal: controller.signal,
      ...fetchOptions,
      headers,
    });

    clearTimeout(timeoutId);

    const payload = await response.json().catch(() => ({}));
    if (token && token === localStorage.getItem("prepmatrix_auth_token")) {
      publishQuota(response, path);
    }
    finishAiIdempotencyRequest(idempotencyFingerprint, payload);

    if (response.status === 401) {
      clearStoredAuthState();
      if (payload.code === "PASSWORD_CHANGED") {
        notifySessionEnded(payload.error || "Your password was changed. Please log in again.");
      }
    }

    if (path === "/api/auth/logout" || (path === "/api/auth/account" && response.ok)) {
      clearStoredAuthState();
    }

    if (payload.token) {
      localStorage.setItem("prepmatrix_auth_token", payload.token);
    }

    if (!response.ok) {
      const error = new Error(payload.error || "Request failed.");
      error.status = response.status;
      error.code = payload.code;
      error.details = payload;
      throw error;
    }

    if (
      path === "/api/auth/me"
      || path === "/api/auth/login"
      || path === "/api/auth/register"
    ) {
      dispatchWindowEvent(AI_AUTH_READY_EVENT, { path });
    }

    return payload;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

const api = {
  me: (options = {}) => request("/api/auth/me", { timeoutMs: AUTH_RECOVERY_TIMEOUT_MS, ...options }),
  login: (body) => request("/api/auth/login", { method: "POST", body: JSON.stringify(body) }),
  register: (body) => request("/api/auth/register", { method: "POST", body: JSON.stringify(body) }),
  logout: () => request("/api/auth/logout", { method: "POST", body: JSON.stringify({}) }),
  deleteAccount: (password) => request("/api/auth/account", { method: "DELETE", body: JSON.stringify({ password }) }),
  saveWorkspace: (body, options = {}) => request("/api/workspace", { ...options, method: "PUT", body: JSON.stringify(body) }),
  importWorkspace: (body, options = {}) => request("/api/workspace/import", { ...options, method: "POST", body: JSON.stringify(body) }),
  syncAppUsage: (body, options = {}) => request("/api/app-usage/sync", {
    ...options,
    academicProfileId: null,
    method: "POST",
    body: JSON.stringify(body),
  }),
  getResumeBuilderStatus: (options = {}) => request("/api/resume-builder/status", options),
  generateResume: (body = {}, options = {}) => request("/api/resume-builder/generate", {
    ...options,
    method: "POST",
    body: JSON.stringify(body),
  }),
  getResumeHistory: (options = {}) => request("/api/resume-builder/history", options),
  getResumeHistoryItem: (id, options = {}) => request(
    `/api/resume-builder/history/${encodeURIComponent(id)}`,
    options,
  ),
  createResumeHistory: (body, options = {}) => request("/api/resume-builder/history", {
    ...options,
    method: "POST",
    body: JSON.stringify(body),
  }),
  updateResumeHistory: (id, body, options = {}) => request(
    `/api/resume-builder/history/${encodeURIComponent(id)}`,
    { ...options, method: "PUT", body: JSON.stringify(body) },
  ),
  deleteResumeHistory: (id, options = {}) => request(
    `/api/resume-builder/history/${encodeURIComponent(id)}`,
    { ...options, method: "DELETE" },
  ),
  clearResumeHistory: (options = {}) => request("/api/resume-builder/history", {
    ...options,
    method: "DELETE",
  }),
  getNotes: (options = {}) => request("/api/notes", options),
  createNote: (note, options = {}) => request("/api/notes", { ...options, method: "POST", body: JSON.stringify({ note }) }),
  saveNotes: (notes, options = {}) => request("/api/notes", { ...options, method: "PUT", body: JSON.stringify({ notes }) }),
  getQuizzes: (options = {}) => request("/api/quizzes", options),
  clearQuizHistory: (options = {}) => request("/api/quizzes", { ...options, method: "DELETE" }),
  deleteQuizAttempt: (id, options = {}) => request(`/api/quizzes/${encodeURIComponent(id)}`, { ...options, method: "DELETE" }),
  generateQuiz: (body, options = {}) => request("/api/quizzes/generate", {
    ...options,
    method: "POST",
    body: JSON.stringify(body),
  }),
  saveQuizAttempt: (body, options = {}) => request("/api/quizzes", { ...options, method: "POST", body: JSON.stringify(body) }),
  getQuizBattles: (options = {}) => request("/api/quiz-battles", options),
  getQuizBattle: (id, options = {}) => request(`/api/quiz-battles/${encodeURIComponent(id)}`, options),
  getQuizBattleStats: (options = {}) => request("/api/quiz-battles/stats", options),
  previewQuizBattleInvite: (code, options = {}) => request(
    `/api/quiz-battles/invites/${encodeURIComponent(code)}/preview`,
    { ...options, method: "POST", body: JSON.stringify({}) },
  ),
  createQuizBattle: (body, options = {}) => request("/api/quiz-battles", {
    ...options,
    method: "POST",
    body: JSON.stringify(body),
  }),
  acceptQuizBattleInvite: (code, options = {}) => request(
    `/api/quiz-battles/invites/${encodeURIComponent(code)}/accept`,
    { ...options, method: "POST", body: JSON.stringify({}) },
  ),
  cancelQuizBattle: (id, options = {}) => request(
    `/api/quiz-battles/${encodeURIComponent(id)}/cancel`,
    { ...options, method: "POST", body: JSON.stringify({}) },
  ),
  startQuizBattle: (id, options = {}) => request(
    `/api/quiz-battles/${encodeURIComponent(id)}/start`,
    { ...options, method: "POST", body: JSON.stringify({}) },
  ),
  saveQuizBattleAnswers: (id, answers, options = {}) => request(
    `/api/quiz-battles/${encodeURIComponent(id)}/answers`,
    { ...options, method: "PUT", body: JSON.stringify({ answers }) },
  ),
  submitQuizBattle: (id, answers, options = {}) => request(
    `/api/quiz-battles/${encodeURIComponent(id)}/submit`,
    { ...options, method: "POST", body: JSON.stringify({ answers }) },
  ),
  updateProfile: (body, options = {}) => request("/api/auth/profile", { ...options, method: "PUT", body: JSON.stringify(body) }),
  getChatSessions: (query = "", options = {}) => {
    const normalizedQuery = typeof query === "string" ? query.trim() : "";
    const search = normalizedQuery ? `?q=${encodeURIComponent(normalizedQuery)}` : "";
    return request(`/api/chat-sessions${search}`, options);
  },
  getChatSession: (id, options = {}) => request(`/api/chat-sessions/${id}`, options),
  createChatSession: (body, options = {}) => request("/api/chat-sessions", { ...options, method: "POST", body: JSON.stringify(body) }),
  deleteChatSession: (id, options = {}) => request(`/api/chat-sessions/${id}`, { ...options, method: "DELETE" }),
  clearChatSessions: (options = {}) => request("/api/chat-sessions", { ...options, method: "DELETE" }),
  renameChatSession: (id, title, options = {}) => request(`/api/chat-sessions/${id}`, { ...options, method: "PUT", body: JSON.stringify({ title }) }),
  setChatSessionPinned: (id, pinned, options = {}) => request(`/api/chat-sessions/${id}/pin`, {
    ...options,
    method: "PATCH",
    body: JSON.stringify({ pinned }),
  }),
  getAiQuota: () => request("/api/ai/quota", { academicProfileId: null }),
  get: (path, options = {}) => request(path, options),
  post: (path, body, options = {}) => request(path, { ...options, method: "POST", body: JSON.stringify(body) }),
  put: (path, body, options = {}) => request(path, { ...options, method: "PUT", body: JSON.stringify(body) }),
  patch: (path, body, options = {}) => request(path, {
    ...options,
    method: "PATCH",
    body: body === undefined ? undefined : JSON.stringify(body),
  }),
  delete: (path, options = {}) => request(path, { ...options, method: "DELETE" }),
};

export default api;
