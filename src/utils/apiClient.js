export const API_BASE = (import.meta.env?.VITE_API_URL || "").trim().replace(/\/+$/, "");
export const HAS_CONFIGURED_API = Boolean(API_BASE);
export const AUTH_RECOVERY_TIMEOUT_MS = 65000;
export const AI_QUOTA_UPDATED_EVENT = "prepmatrixAiQuotaUpdated";
export const AI_AUTH_READY_EVENT = "prepmatrixAiAuthReady";
export const AI_AUTH_CLEARED_EVENT = "prepmatrixAiAuthCleared";
const AUTH_NOTICE_KEY = "prepmatrix_auth_notice";
const AI_IDEMPOTENCY_RECOVERY_TTL_MS = 30 * 60 * 1000;
const pendingAiIdempotencyKeys = new Map();

async function createAiRequestFingerprint(path, method, body) {
  const input = String(body || "");
  const prefix = `${String(method || "GET").toUpperCase()}:${path}:`;
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

function publishQuota(response, payload) {
  const nestedQuota = payload?.quota && typeof payload.quota === "object"
    ? payload.quota
    : null;
  const directQuota = payload && typeof payload === "object"
    && Number.isFinite(Number(payload.limit))
    && Number.isFinite(Number(payload.remaining))
    ? payload
    : null;
  const payloadQuota = nestedQuota || directQuota;
  const limit = numberHeader(response, "X-AI-Credit-Limit");
  const remaining = numberHeader(response, "X-AI-Credit-Remaining");
  const cost = numberHeader(response, "X-AI-Credit-Cost");
  const resetAt = response.headers.get("X-AI-Credit-Reset-At");

  if (!payloadQuota && limit === null && remaining === null && cost === null && !resetAt) {
    return;
  }

  dispatchWindowEvent(AI_QUOTA_UPDATED_EVENT, {
    ...(payloadQuota || {}),
    ...(!payloadQuota ? { partial: true, reserved: 0 } : { partial: false }),
    ...(limit !== null ? { limit } : {}),
    ...(remaining !== null ? { remaining } : {}),
    ...(resetAt ? { resetAt } : {}),
    ...(cost !== null ? { requestCost: cost } : {}),
  });
}

async function request(path, options = {}) {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs || 15000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const {
    timeoutMs: _timeoutMs,
    headers: optionHeaders,
    ...fetchOptions
  } = options;
  const token = localStorage.getItem("prepmatrix_auth_token");
  const requestedIdempotencyKey = optionHeaders?.["Idempotency-Key"]
    ?? optionHeaders?.["idempotency-key"];
  const idempotencyFingerprint = requestedIdempotencyKey
    ? await createAiRequestFingerprint(path, fetchOptions.method, fetchOptions.body)
    : "";
  const stableIdempotencyKey = rememberAiIdempotencyKey(idempotencyFingerprint, requestedIdempotencyKey);
  const headers = {
    "Content-Type": "application/json",
    ...(optionHeaders || {}),
  };
  if (stableIdempotencyKey) {
    headers["Idempotency-Key"] = stableIdempotencyKey;
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
      publishQuota(response, payload);
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
  saveWorkspace: (body) => request("/api/workspace", { method: "PUT", body: JSON.stringify(body) }),
  importWorkspace: (body) => request("/api/workspace/import", { method: "POST", body: JSON.stringify(body) }),
  getResumeBuilderStatus: () => request("/api/resume-builder/status"),
  generateResume: (body = {}) => request("/api/resume-builder/generate", {
    method: "POST",
    body: JSON.stringify(body),
  }),
  getResumeHistory: () => request("/api/resume-builder/history"),
  getResumeHistoryItem: (id) => request(
    `/api/resume-builder/history/${encodeURIComponent(id)}`,
  ),
  createResumeHistory: (body) => request("/api/resume-builder/history", {
    method: "POST",
    body: JSON.stringify(body),
  }),
  updateResumeHistory: (id, body) => request(
    `/api/resume-builder/history/${encodeURIComponent(id)}`,
    { method: "PUT", body: JSON.stringify(body) },
  ),
  deleteResumeHistory: (id) => request(
    `/api/resume-builder/history/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  ),
  clearResumeHistory: () => request("/api/resume-builder/history", {
    method: "DELETE",
  }),
  getNotes: () => request("/api/notes"),
  createNote: (note) => request("/api/notes", { method: "POST", body: JSON.stringify({ note }) }),
  saveNotes: (notes) => request("/api/notes", { method: "PUT", body: JSON.stringify({ notes }) }),
  getQuizzes: () => request("/api/quizzes"),
  clearQuizHistory: () => request("/api/quizzes", { method: "DELETE" }),
  deleteQuizAttempt: (id) => request(`/api/quizzes/${encodeURIComponent(id)}`, { method: "DELETE" }),
  generateQuiz: (body, options = {}) => request("/api/quizzes/generate", {
    ...options,
    method: "POST",
    body: JSON.stringify(body),
  }),
  saveQuizAttempt: (body) => request("/api/quizzes", { method: "POST", body: JSON.stringify(body) }),
  getQuizBattles: () => request("/api/quiz-battles"),
  getQuizBattle: (id) => request(`/api/quiz-battles/${encodeURIComponent(id)}`),
  getQuizBattleStats: () => request("/api/quiz-battles/stats"),
  previewQuizBattleInvite: (code) => request(
    `/api/quiz-battles/invites/${encodeURIComponent(code)}/preview`,
    { method: "POST", body: JSON.stringify({}) },
  ),
  createQuizBattle: (body, options = {}) => request("/api/quiz-battles", {
    ...options,
    method: "POST",
    body: JSON.stringify(body),
  }),
  acceptQuizBattleInvite: (code) => request(
    `/api/quiz-battles/invites/${encodeURIComponent(code)}/accept`,
    { method: "POST", body: JSON.stringify({}) },
  ),
  cancelQuizBattle: (id) => request(
    `/api/quiz-battles/${encodeURIComponent(id)}/cancel`,
    { method: "POST", body: JSON.stringify({}) },
  ),
  startQuizBattle: (id) => request(
    `/api/quiz-battles/${encodeURIComponent(id)}/start`,
    { method: "POST", body: JSON.stringify({}) },
  ),
  saveQuizBattleAnswers: (id, answers, options = {}) => request(
    `/api/quiz-battles/${encodeURIComponent(id)}/answers`,
    { ...options, method: "PUT", body: JSON.stringify({ answers }) },
  ),
  submitQuizBattle: (id, answers) => request(
    `/api/quiz-battles/${encodeURIComponent(id)}/submit`,
    { method: "POST", body: JSON.stringify({ answers }) },
  ),
  updateProfile: (body) => request("/api/auth/profile", { method: "PUT", body: JSON.stringify(body) }),
  getChatSessions: (query = "") => {
    const normalizedQuery = typeof query === "string" ? query.trim() : "";
    const search = normalizedQuery ? `?q=${encodeURIComponent(normalizedQuery)}` : "";
    return request(`/api/chat-sessions${search}`);
  },
  getChatSession: (id) => request(`/api/chat-sessions/${id}`),
  createChatSession: (body) => request("/api/chat-sessions", { method: "POST", body: JSON.stringify(body) }),
  deleteChatSession: (id) => request(`/api/chat-sessions/${id}`, { method: "DELETE" }),
  clearChatSessions: () => request("/api/chat-sessions", { method: "DELETE" }),
  renameChatSession: (id, title) => request(`/api/chat-sessions/${id}`, { method: "PUT", body: JSON.stringify({ title }) }),
  getAiQuota: () => request("/api/ai/quota"),
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
