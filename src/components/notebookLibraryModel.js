export function notebookLibraryCompletion(notebook, completionForNotebook) {
  const supplied = completionForNotebook?.(notebook);
  const summary = typeof supplied === "number" ? { percent: supplied } : supplied || {};
  const topics = (Array.isArray(notebook?.chapters) ? notebook.chapters : [])
    .reduce((count, chapter) => count + (Array.isArray(chapter?.topics) ? chapter.topics.length : 0), 0);
  const totalTopics = Math.max(0, Number(summary.totalTopics ?? topics) || 0);
  const suppliedCompleted = Math.min(totalTopics, Math.max(0, Number(summary.completedTopics) || 0));
  const rawPercent = Number(summary.percent ?? (totalTopics ? suppliedCompleted / totalTopics * 100 : 0));
  const percent = Math.round(Math.min(100, Math.max(0, Number.isFinite(rawPercent) ? rawPercent : 0)));
  const completedTopics = summary.completedTopics == null ? Math.round(totalTopics * percent / 100) : suppliedCompleted;
  const state = percent === 100 ? "completed" : percent > 0 ? "in-progress" : "not-started";
  return { percent, completedTopics, totalTopics, state };
}

function notebookTimestamp(notebook) {
  const timestamp = Date.parse(notebook?.createdAt || notebook?.generatedAt || notebook?.updatedAt || "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function visibleNotebookLibraryEntries(notebooks, { search = "", state = "all", sort = "recent", completionForNotebook } = {}) {
  const query = String(search).trim().toLocaleLowerCase();
  return (Array.isArray(notebooks) ? notebooks : [])
    .filter((notebook) => notebook && typeof notebook === "object")
    .map((notebook, index) => ({ notebook, index, completion: notebookLibraryCompletion(notebook, completionForNotebook) }))
    .filter(({ notebook, completion }) => {
      if (state !== "all" && completion.state !== state) return false;
      if (!query) return true;
      const chapters = Array.isArray(notebook.chapters) ? notebook.chapters : [];
      const text = [notebook.title, notebook.subjectName, ...chapters.flatMap((chapter) => [chapter?.title, ...(Array.isArray(chapter?.topics) ? chapter.topics : []).map((topic) => topic?.title)])]
        .filter(Boolean).join(" ").toLocaleLowerCase();
      return text.includes(query);
    })
    .sort((left, right) => {
      const progressOrder = sort === "completion-high"
        ? right.completion.percent - left.completion.percent
        : sort === "completion-low" ? left.completion.percent - right.completion.percent : 0;
      return progressOrder || notebookTimestamp(right.notebook) - notebookTimestamp(left.notebook) || left.index - right.index;
    });
}

export function notebookLibraryShortcut(event, { enabled = true, hasNotebooks = false, modalOpen = false } = {}) {
  if (!enabled || modalOpen || event.defaultPrevented || event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return "";
  if (event.target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="searchbox"], [role="combobox"]')) return "";
  if (String(event.key).toLowerCase() === "n") return "new";
  return event.key === "/" && hasNotebooks ? "search" : "";
}
