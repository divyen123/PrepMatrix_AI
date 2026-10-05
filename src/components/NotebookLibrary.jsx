import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion as Motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowUpDown, BookOpen, Check, LoaderCircle, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { notebookLibraryShortcut, visibleNotebookLibraryEntries } from "./notebookLibraryModel.js";
import "./NotebookLibrary.css";

function savedDate(notebook) {
  const date = new Date(notebook.createdAt || notebook.generatedAt || notebook.updatedAt || "");
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(date)
    : "";
}

export default function NotebookLibrary({
  notebooks = [], loading = false, error = "", onRetry, onOpen, onNew,
  onDelete, onDeleteAll, busy = false, completionForNotebook, onBack, shortcutsEnabled = true,
}) {
  const [search, setSearch] = useState("");
  const [state, setState] = useState("all");
  const [sort, setSort] = useState("recent");
  const [sortOpen, setSortOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState("");
  const [action, setAction] = useState("");
  const [actionError, setActionError] = useState("");
  const searchRef = useRef(null);
  const sortRef = useRef(null);
  const actionLock = useRef(false);
  const headingId = useId();
  const listId = useId();
  const reducedMotion = useReducedMotion();
  const hasNotebooks = notebooks.length > 0;
  const locked = busy || loading || Boolean(action);
  const entries = useMemo(() => visibleNotebookLibraryEntries(notebooks, { search, state, sort, completionForNotebook }), [notebooks, search, state, sort, completionForNotebook]);
  const transition = { duration: reducedMotion ? 0 : 0.18, ease: "easeOut" };

  useEffect(() => {
    if (hasNotebooks) return;
    setSearch("");
    setState("all");
    setSortOpen(false);
    setPendingDelete("");
  }, [hasNotebooks]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setSortOpen(false);
        if (!actionLock.current) setPendingDelete("");
        return;
      }
      const shortcut = notebookLibraryShortcut(event, {
        enabled: shortcutsEnabled && !locked,
        hasNotebooks,
        modalOpen: Boolean(document.querySelector('[role="dialog"][aria-modal="true"]')),
      });
      if (shortcut === "new" && onNew) {
        event.preventDefault();
        setSortOpen(false);
        onNew();
      } else if (shortcut === "search") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [hasNotebooks, locked, onNew, shortcutsEnabled]);

  useEffect(() => {
    if (!sortOpen) return;
    const onPointerDown = (event) => {
      if (!sortRef.current?.contains(event.target)) setSortOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [sortOpen]);

  const runDelete = async (key, callback) => {
    if (locked || actionLock.current || !callback) return;
    actionLock.current = true;
    setAction(key);
    setActionError("");
    try {
      const result = await callback();
      if (result !== false) setPendingDelete("");
    } catch (caught) {
      setActionError(caught?.message || "Could not delete the notebook. Please try again.");
    } finally {
      actionLock.current = false;
      setAction("");
    }
  };

  const confirmation = (key, callback, label) => (
    <Motion.div className="notebook-library-confirm" role="group" aria-label={`Confirm ${label}`} initial={{ opacity: 0, scale: reducedMotion ? 1 : 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: reducedMotion ? 1 : 0.94 }} transition={transition}>
      <button className="notebook-library-icon is-confirm" type="button" aria-label={`Confirm ${label}`} title={`Confirm ${label}`} disabled={locked} onClick={() => runDelete(key, callback)}>
        {action === key ? <LoaderCircle size={17} className="is-spinning" aria-hidden="true" /> : <Check size={17} aria-hidden="true" />}
      </button>
      <button className="notebook-library-icon is-cancel" type="button" aria-label={`Cancel ${label}`} title="Cancel deletion" disabled={locked} onClick={() => setPendingDelete("")}><X size={17} aria-hidden="true" /></button>
    </Motion.div>
  );

  return (
    <section className="notebook-library" aria-labelledby={headingId} aria-busy={loading || Boolean(action)}>
      <header className="notebook-library-header">
        <div className="notebook-library-heading">
          {onBack && <button type="button" className="notebook-library-icon" aria-label="Back from notebook preparation" onClick={onBack}><ArrowLeft size={19} aria-hidden="true" /></button>}
          <h2 id={headingId}>Notebook preparation</h2>
        </div>
        <div className="notebook-library-controls">
          {hasNotebooks && <>
            <label className="notebook-library-search">
              <Search size={17} aria-hidden="true" />
              <span className="notebook-library-sr-only">Search notebooks</span>
              <input ref={searchRef} type="search" value={search} placeholder="Search notebooks" aria-controls={listId} aria-keyshortcuts="/" onChange={(event) => setSearch(event.target.value)} />
              {search && <button type="button" className="notebook-library-search-clear" aria-label="Clear notebook search" onClick={() => setSearch("")}><X size={14} aria-hidden="true" /></button>}
            </label>
            <div className="notebook-library-sort-wrap" ref={sortRef}>
              <button className={`notebook-library-icon${state !== "all" || sort !== "recent" ? " is-active" : ""}`} type="button" aria-label="Sort and filter notebooks by completion" title="Sort by completion" aria-expanded={sortOpen} disabled={locked} onClick={() => setSortOpen((open) => !open)}><ArrowUpDown size={18} aria-hidden="true" /></button>
              <AnimatePresence>{sortOpen && <Motion.div className="notebook-library-sort" initial={{ opacity: 0, y: reducedMotion ? 0 : -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reducedMotion ? 0 : -6 }} transition={transition}>
                <label>Completion state<select aria-label="Completion state" value={state} onChange={(event) => setState(event.target.value)}><option value="all">All notebooks</option><option value="in-progress">In progress</option><option value="completed">Completed</option><option value="not-started">Not started</option></select></label>
                <label>Sort by<select aria-label="Sort by" value={sort} onChange={(event) => setSort(event.target.value)}><option value="recent">Newest first</option><option value="completion-high">Completion: high to low</option><option value="completion-low">Completion: low to high</option></select></label>
              </Motion.div>}</AnimatePresence>
            </div>
            {onDeleteAll && <AnimatePresence initial={false} mode="wait">{pendingDelete === "all" ? <Motion.div key="delete-all-confirm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={transition}>{confirmation("all", onDeleteAll, "deleting all notebooks")}</Motion.div> : <Motion.button key="delete-all" type="button" className="notebook-library-icon is-delete" aria-label="Delete all notebooks" title="Delete all notebooks" disabled={locked} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={transition} onClick={() => { setSortOpen(false); setPendingDelete("all"); }}><Trash2 size={17} aria-hidden="true" /></Motion.button>}</AnimatePresence>}
          </>}
          <button className="notebook-library-new" type="button" onClick={onNew} disabled={locked} aria-keyshortcuts="N"><Plus size={18} aria-hidden="true" />New notebook</button>
        </div>
      </header>
      {(error || actionError) && <div className="notebook-library-error" role="alert"><span>{error || actionError}</span>{error && onRetry && <button type="button" onClick={onRetry} disabled={locked}><RefreshCw size={15} aria-hidden="true" />Retry</button>}</div>}
      {loading && !hasNotebooks ? <div className="notebook-library-empty" role="status"><LoaderCircle size={22} className="is-spinning" aria-hidden="true" /><span>Loading notebooks…</span></div> : !hasNotebooks ? <div className="notebook-library-empty" role="status">{!error && "No generated notebooks exist."}</div> : <>
        <Motion.div className="notebook-library-grid" id={listId} layout={!reducedMotion}>
          <AnimatePresence initial={false}>
            {entries.map(({ notebook, completion, index }) => {
              const key = String(notebook.id || notebook._id || index);
              const deleteKey = `notebook:${key}`;
              const title = notebook.title || notebook.subjectName || "Untitled notebook";
              return <Motion.article className={`notebook-library-card${completion.state === "completed" ? " is-completed" : ""}`} key={key} layout={!reducedMotion} initial={{ opacity: 0, y: reducedMotion ? 0 : 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reducedMotion ? 0 : -8 }} transition={transition}>
                <button className="notebook-library-card-open" type="button" aria-label={`Open ${title}, ${completion.percent}% completed`} disabled={locked} onClick={() => onOpen?.(notebook)}>
                  <div className="notebook-library-card-top"><span className="notebook-library-book"><BookOpen size={22} aria-hidden="true" /></span><span className="notebook-library-percent">{completion.percent}%</span></div>
                  {notebook.subjectName && <span className="notebook-library-subject">{notebook.subjectName}</span>}
                  <h3>{title}</h3>
                  <span className="notebook-library-progress" aria-hidden="true"><span style={{ width: `${completion.percent}%` }} /></span>
                  <span className="notebook-library-progress-label">{completion.state === "completed" ? "Completed" : completion.totalTopics ? `${completion.completedTopics} of ${completion.totalTopics} topics completed` : "Not started"}</span>
                </button>
                <footer><time dateTime={notebook.createdAt || notebook.generatedAt || notebook.updatedAt || undefined}>{savedDate(notebook)}</time>{onDelete && <AnimatePresence initial={false} mode="wait">{pendingDelete === deleteKey ? <Motion.div key="confirm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={transition}>{confirmation(deleteKey, () => onDelete(notebook), `deleting ${title}`)}</Motion.div> : <Motion.button key="delete" className="notebook-library-icon is-delete" type="button" aria-label={`Delete ${title}`} title="Delete notebook" disabled={locked} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={transition} onClick={() => setPendingDelete(deleteKey)}><Trash2 size={16} aria-hidden="true" /></Motion.button>}</AnimatePresence>}</footer>
              </Motion.article>;
            })}
          </AnimatePresence>
        </Motion.div>
        {!entries.length && <div className="notebook-library-empty notebook-library-empty--filtered" role="status"><span>No notebooks match your search or completion state.</span><button type="button" onClick={() => { setSearch(""); setState("all"); }}>Clear filters</button></div>}
      </>}
    </section>
  );
}
