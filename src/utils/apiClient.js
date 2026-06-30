const API_BASE = import.meta.env.VITE_API_URL || "";

async function request(path, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      signal: controller.signal,
      ...options,
    });

    clearTimeout(timeoutId);

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error || "Request failed.");
    }

    return payload;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

const api = {
  me: () => request("/api/auth/me"),
  login: (body) => request("/api/auth/login", { method: "POST", body: JSON.stringify(body) }),
  register: (body) => request("/api/auth/register", { method: "POST", body: JSON.stringify(body) }),
  logout: () => request("/api/auth/logout", { method: "POST", body: JSON.stringify({}) }),
  deleteAccount: () => request("/api/auth/account", { method: "DELETE" }),
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
  renameChatSession: (id, title) => request(`/api/chat-sessions/${id}`, { method: "PUT", body: JSON.stringify({ title }) }),
  get: (path) => request(path),
  post: (path, body) => request(path, { method: "POST", body: JSON.stringify(body) }),
  put: (path, body) => request(path, { method: "PUT", body: JSON.stringify(body) }),
  delete: (path) => request(path, { method: "DELETE" }),
};

export default api;


