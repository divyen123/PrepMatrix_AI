function normalizeChatHistorySearchValue(value) {
  if (typeof value !== "string") return "";

  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function chatSessionUpdatedTime(session) {
  const updatedTime = Date.parse(session?.updatedAt);
  return Number.isFinite(updatedTime) ? updatedTime : 0;
}

export function sortChatSessionsPinnedFirst(sessions) {
  if (!Array.isArray(sessions)) return [];

  return sessions
    .map((session, index) => ({ index, session }))
    .sort((left, right) => {
      const pinDifference = Number(right.session?.pinned === true)
        - Number(left.session?.pinned === true);
      if (pinDifference) return pinDifference;

      const updatedDifference = chatSessionUpdatedTime(right.session)
        - chatSessionUpdatedTime(left.session);
      return updatedDifference || left.index - right.index;
    })
    .map(({ session }) => session);
}

export function filterChatSessionsByTitle(sessions, query) {
  if (!Array.isArray(sessions)) return [];

  const normalizedQuery = normalizeChatHistorySearchValue(query);
  if (!normalizedQuery) return [...sessions];

  return sessions.filter((session) =>
    normalizeChatHistorySearchValue(session?.title).includes(normalizedQuery)
  );
}
