function normalizeChatHistorySearchValue(value) {
  if (typeof value !== "string") return "";

  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function filterChatSessionsByTitle(sessions, query) {
  if (!Array.isArray(sessions)) return [];

  const normalizedQuery = normalizeChatHistorySearchValue(query);
  if (!normalizedQuery) return [...sessions];

  return sessions.filter((session) =>
    normalizeChatHistorySearchValue(session?.title).includes(normalizedQuery)
  );
}
