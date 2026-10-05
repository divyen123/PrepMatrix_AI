function text(value) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

export function placementLibraryTopics(preparation) {
  const topics = Array.isArray(preparation?.analysis?.topics)
    ? preparation.analysis.topics
    : Array.isArray(preparation?.topics) ? preparation.topics : [];
  return topics.map((topic) => text(typeof topic === "object" ? topic?.title || topic?.name : topic)).filter(Boolean);
}

export function placementLibraryTitle(preparation) {
  return text(preparation?.title || preparation?.analysis?.targetRole) || "Placement preparation";
}

export function placementLibraryKey(preparation, index = 0) {
  return text(preparation?.id)
    || `${text(preparation?.notebookId || preparation?.notebook?.id)}:placement:${text(preparation?.historyId) || index}`;
}

export function placementLibrarySource(preparation) {
  const notebook = preparation?.preparationSource?.type === "notebook";
  return {
    type: notebook ? "notebook" : "typed",
    label: notebook
      ? text(preparation?.sourceLabel || preparation?.preparationSource?.label || preparation?.notebook?.title) || "Learning notebook"
      : "",
  };
}

export function placementLibraryTimestamp(preparation) {
  const parsed = Date.parse(preparation?.generatedAt || preparation?.updatedAt || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

export function visiblePlacementLibraryEntries(preparations, { search = "", filter = "all", sort = "recent" } = {}) {
  const query = text(search).toLocaleLowerCase();
  return (Array.isArray(preparations) ? preparations : [])
    .filter((preparation) => preparation && typeof preparation === "object")
    .map((preparation, index) => ({
      preparation,
      index,
      key: placementLibraryKey(preparation, index),
      title: placementLibraryTitle(preparation),
      topics: placementLibraryTopics(preparation),
      source: placementLibrarySource(preparation),
    }))
    .filter(({ preparation, title, topics, source }) => {
      if (filter === "pinned" && preparation.pinned !== true) return false;
      if (["notebook", "typed"].includes(filter) && source.type !== filter) return false;
      const searchable = [title, ...topics, source.label].join(" ").toLocaleLowerCase();
      return !query || searchable.includes(query);
    })
    .sort((left, right) => {
      const byDate = placementLibraryTimestamp(right.preparation) - placementLibraryTimestamp(left.preparation);
      return (sort === "oldest" ? -byDate : byDate) || left.index - right.index;
    });
}

export function placementLibraryShortcut(event, { enabled = true, hasPreparations = false, modalOpen = false } = {}) {
  if (!enabled || modalOpen || event.defaultPrevented || event.repeat || event.isComposing
    || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return "";
  if (event.target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="searchbox"], [role="combobox"]')) return "";
  const key = String(event.key).toLocaleLowerCase();
  if (key === "n") return "new";
  if (!hasPreparations) return "";
  if (key === "/") return "search";
  return key === "f" ? "filter" : "";
}
