export const CHAT_SESSION_SEARCH_QUERY_MAX_LENGTH = 120;

export function normalizeChatSessionSearchQuery(value) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, CHAT_SESSION_SEARCH_QUERY_MAX_LENGTH);
}

export function escapeRegexLiteral(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export function buildChatSessionListFilter(userId, rawQuery) {
  if (userId === undefined || userId === null) {
    throw new TypeError("A user ID is required to list chat sessions.");
  }

  const query = normalizeChatSessionSearchQuery(rawQuery);
  if (!query) return { userId };

  const search = {
    $regex: escapeRegexLiteral(query),
    $options: "i",
  };

  return {
    userId,
    $or: [
      { title: search },
      { "messages.text": search },
    ],
  };
}
