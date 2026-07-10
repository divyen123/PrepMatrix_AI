export const API_BASE = (import.meta.env.VITE_API_URL || "").trim().replace(/\/+$/, "");
export const HAS_CONFIGURED_API = Boolean(API_BASE);
export const AUTH_RECOVERY_TIMEOUT_MS = 65000;
const AUTH_NOTICE_KEY = "prepmatrix_auth_notice";

function notifySessionEnded(message) {
  if (typeof window === "undefined") return;
  const notice = message || "Please log in again to continue.";
  window.sessionStorage.setItem(AUTH_NOTICE_KEY, notice);
  window.dispatchEvent(new CustomEvent("prepmatrixAuthSessionEnded", { detail: { message: notice } }));
}

async function request(path, options = {}) {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs || 15000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const { timeoutMs: _timeoutMs, ...fetchOptions } = options;
  const token = localStorage.getItem("prepmatrix_auth_token");
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      credentials: "include",
      headers,
      signal: controller.signal,
      ...fetchOptions,
    });

    clearTimeout(timeoutId);

    const payload = await response.json().catch(() => ({}));

    if (response.status === 401) {
      localStorage.removeItem("prepmatrix_auth_token");
      if (payload.code === "PASSWORD_CHANGED") {
        notifySessionEnded(payload.error || "Your password was changed. Please log in again.");
      }
    }

    if (path === "/api/auth/logout") {
      localStorage.removeItem("prepmatrix_auth_token");
    }

    if (payload.token) {
      localStorage.setItem("prepmatrix_auth_token", payload.token);
    }

    if (!response.ok) {
      const error = new Error(payload.error || "Request failed.");
      error.status = response.status;
      error.code = payload.code;
      throw error;
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
  getNotes: () => request("/api/notes"),
  saveNotes: (notes) => request("/api/notes", { method: "PUT", body: JSON.stringify({ notes }) }),
  getQuizzes: () => request("/api/quizzes"),
  clearQuizHistory: () => request("/api/quizzes", { method: "DELETE" }),
  generateQuiz: (body) => request("/api/quizzes/generate", { method: "POST", body: JSON.stringify(body) }),
  saveQuizAttempt: (body) => request("/api/quizzes", { method: "POST", body: JSON.stringify(body) }),
  updateProfile: (body) => request("/api/auth/profile", { method: "PUT", body: JSON.stringify(body) }),
  getChatSessions: () => request("/api/chat-sessions"),
  getChatSession: (id) => request(`/api/chat-sessions/${id}`),
  createChatSession: (body) => request("/api/chat-sessions", { method: "POST", body: JSON.stringify(body) }),
  deleteChatSession: (id) => request(`/api/chat-sessions/${id}`, { method: "DELETE" }),
  clearChatSessions: () => request("/api/chat-sessions", { method: "DELETE" }),
  renameChatSession: (id, title) => request(`/api/chat-sessions/${id}`, { method: "PUT", body: JSON.stringify({ title }) }),
  get: (path) => request(path),
  post: (path, body) => request(path, { method: "POST", body: JSON.stringify(body) }),
  put: (path, body) => request(path, { method: "PUT", body: JSON.stringify(body) }),
  delete: (path) => request(path, { method: "DELETE" }),
};

export default api;

