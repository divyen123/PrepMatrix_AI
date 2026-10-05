import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion as Motion, useReducedMotion } from "motion/react";
import { ArrowLeft, BookOpen, BriefcaseBusiness, Check, ListFilter, LoaderCircle, Pin, PinOff, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { placementLibraryShortcut, visiblePlacementLibraryEntries } from "./placementLibraryModel.js";
import "./PlacementLibrary.css";

function savedDate(preparation) {
  const date = new Date(preparation.generatedAt || preparation.updatedAt || "");
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(date)
    : "";
}

export default function PlacementLibrary({
  preparations = [], loading = false, error = "", onRetry, onOpen, onNew,
  onDelete, onDeleteAll, onPin, busy = false, onBack, shortcutsEnabled = true,
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("recent");
  const [filterOpen, setFilterOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState("");
  const [action, setAction] = useState("");
  const [actionError, setActionError] = useState("");
  const searchRef = useRef(null);
  const filterRef = useRef(null);
  const filterButtonRef = useRef(null);
  const actionLock = useRef(false);
  const headingId = useId();
  const listId = useId();
  const filterId = useId();
  const reducedMotion = useReducedMotion();
  const hasPreparations = preparations.length > 0;
  const locked = busy || loading || Boolean(action);
  const entries = useMemo(() => visiblePlacementLibraryEntries(preparations, { search, filter, sort }), [preparations, search, filter, sort]);
  const transition = { duration: reducedMotion ? 0 : 0.18, ease: "easeOut" };

  useEffect(() => {
    if (hasPreparations) return;
    setSearch("");
    setFilter("all");
    setFilterOpen(false);
    setPendingDelete("");
  }, [hasPreparations]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        if (filterOpen) {
          event.preventDefault();
          setFilterOpen(false);
          filterButtonRef.current?.focus();
        }
        if (!actionLock.current) setPendingDelete("");
        return;
      }
      const shortcut = placementLibraryShortcut(event, {
        enabled: shortcutsEnabled && !locked,
        hasPreparations,
        modalOpen: Boolean(document.querySelector('[role="dialog"][aria-modal="true"]')),
      });
      if (shortcut === "new" && onNew) {
        event.preventDefault();
        setFilterOpen(false);
        setPendingDelete("");
        onNew();
      } else if (shortcut === "search") {
        event.preventDefault();
        setFilterOpen(false);
        searchRef.current?.focus();
      } else if (shortcut === "filter") {
        event.preventDefault();
        setPendingDelete("");
        setFilterOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [filterOpen, hasPreparations, locked, onNew, shortcutsEnabled]);

  useEffect(() => {
    if (!filterOpen) return;
    const frame = requestAnimationFrame(() => filterRef.current?.querySelector("select")?.focus());
    const onPointerDown = (event) => {
      if (!filterRef.current?.contains(event.target)) setFilterOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("pointerdown", onPointerDown); };
  }, [filterOpen]);

  const runAction = async (key, callback, deleting = false) => {
    if (locked || actionLock.current || !callback) return;
    actionLock.current = true;
    setAction(key);
    setActionError("");
    try {
      const result = await callback();
      if (deleting && result !== false) setPendingDelete("");
    } catch (caught) {
      setActionError(caught?.message || `Could not ${deleting ? "delete" : "update"} the preparation. Please try again.`);
    } finally {
      actionLock.current = false;
      setAction("");
    }
  };

  const confirmation = (key, callback, label) => (
    <Motion.div className="placement-library-confirm" role="group" aria-label={`Confirm ${label}`} initial={{ opacity: 0, scale: reducedMotion ? 1 : 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: reducedMotion ? 1 : 0.94 }} transition={transition}>
      <button className="placement-library-icon is-confirm" type="button" aria-label={`Confirm ${label}`} title={`Confirm ${label}`} disabled={locked} onClick={() => runAction(key, callback, true)}>
        {action === key ? <LoaderCircle size={17} className="is-spinning" aria-hidden="true" /> : <Check size={17} aria-hidden="true" />}
      </button>
      <button className="placement-library-icon is-cancel" type="button" aria-label={`Cancel ${label}`} title="Cancel deletion" disabled={locked} onClick={() => setPendingDelete("")}><X size={17} aria-hidden="true" /></button>
    </Motion.div>
  );

  return (
    <section className="placement-library" aria-labelledby={headingId} aria-busy={loading || Boolean(action)}>
      <header className="placement-library-header">
        <div className="placement-library-heading">
          {onBack && <button type="button" className="placement-library-icon" aria-label="Back from placement preparation" disabled={locked} onClick={onBack}><ArrowLeft size={19} aria-hidden="true" /></button>}
          <h2 id={headingId}>Your preparations</h2>
        </div>
        <div className="placement-library-controls">
          {hasPreparations && <>
            <label className="placement-library-search">
              <Search size={17} aria-hidden="true" />
              <span className="placement-library-sr-only">Search preparations</span>
              <input ref={searchRef} type="search" value={search} placeholder="Search preparations" aria-controls={listId} aria-keyshortcuts="/" disabled={locked} onChange={(event) => setSearch(event.target.value)} />
              {search && <button type="button" className="placement-library-search-clear" aria-label="Clear preparation search" disabled={locked} onClick={() => setSearch("")}><X size={14} aria-hidden="true" /></button>}
            </label>
            <div className="placement-library-filter-wrap" ref={filterRef}>
              <button ref={filterButtonRef} data-placement-filter-trigger className={`placement-library-icon${filter !== "all" || sort !== "recent" ? " is-active" : ""}`} type="button" aria-label="Filter and sort preparations" title="Filter and sort preparations (F)" aria-keyshortcuts="F" aria-controls={filterId} aria-expanded={filterOpen} disabled={locked} onClick={() => { setPendingDelete(""); setFilterOpen((open) => !open); }}><ListFilter size={18} aria-hidden="true" /></button>
              <AnimatePresence>{filterOpen && <Motion.div id={filterId} className="placement-library-filter" role="group" aria-label="Filter preparations" initial={{ opacity: 0, y: reducedMotion ? 0 : -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reducedMotion ? 0 : -6 }} transition={transition}>
                <label>Show<select aria-label="Preparation filter" value={filter} disabled={locked} onChange={(event) => setFilter(event.target.value)}><option value="all">All preparations</option><option value="pinned">Pinned</option><option value="notebook">From notebook</option><option value="typed">Typed topics</option></select></label>
                <label>Sort by<select aria-label="Preparation sort" value={sort} disabled={locked} onChange={(event) => setSort(event.target.value)}><option value="recent">Newest first</option><option value="oldest">Oldest first</option></select></label>
              </Motion.div>}</AnimatePresence>
            </div>
            {onDeleteAll && <AnimatePresence initial={false} mode="wait">{pendingDelete === "all" ? <Motion.div key="delete-all-confirm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={transition}>{confirmation("all", onDeleteAll, "deleting all preparations")}</Motion.div> : <Motion.button key="delete-all" type="button" className="placement-library-icon is-delete" aria-label="Delete all preparations" title="Delete all preparations" disabled={locked} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={transition} onClick={() => { setFilterOpen(false); setPendingDelete("all"); }}><Trash2 size={17} aria-hidden="true" /></Motion.button>}</AnimatePresence>}
          </>}
          <button className="placement-library-new" type="button" onClick={onNew} disabled={locked} aria-keyshortcuts="N"><Plus size={18} aria-hidden="true" />New topic</button>
        </div>
      </header>
      {(error || actionError) && <div className="placement-library-error" role="alert"><span>{error || actionError}</span>{error && onRetry && <button type="button" onClick={onRetry} disabled={locked}><RefreshCw size={15} aria-hidden="true" />Retry</button>}</div>}
      {loading && !hasPreparations ? <div className="placement-library-empty" role="status"><LoaderCircle size={22} className="is-spinning" aria-hidden="true" /><span>Loading preparations…</span></div> : !hasPreparations ? <div className="placement-library-empty" role="status">{!error && "No preparations exist."}</div> : <>
        <Motion.div className="placement-library-grid" id={listId} layout={!reducedMotion}>
          <AnimatePresence initial={false}>
            {entries.map(({ preparation, key, title, topics, source }) => {
              const deleteKey = `delete:${key}`;
              const pinKey = `pin:${key}`;
              const topicCount = topics.length || Math.max(0, Number(preparation.topicCount) || 0);
              return <Motion.article className={`placement-library-card${preparation.pinned ? " is-pinned" : ""}`} key={key} layout={!reducedMotion} initial={{ opacity: 0, y: reducedMotion ? 0 : 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reducedMotion ? 0 : -8 }} transition={transition}>
                <button className="placement-library-card-open" type="button" aria-label={`Open ${title}, ${topicCount} ${topicCount === 1 ? "topic" : "topics"}`} disabled={locked} onClick={() => onOpen?.(preparation)}>
                  <div className="placement-library-card-top"><span className="placement-library-symbol"><BriefcaseBusiness size={22} aria-hidden="true" /></span><span className="placement-library-topic-count">{topicCount} {topicCount === 1 ? "topic" : "topics"}</span></div>
                  <h3>{title}</h3>
                  {topics.length > 0 && <span className="placement-library-topic-preview">{topics.join(" · ")}</span>}
                  {source.type === "notebook" && <span className="placement-library-source"><BookOpen size={14} aria-hidden="true" /><span>{source.label}</span></span>}
                </button>
                <footer>
                  <time dateTime={preparation.generatedAt || preparation.updatedAt || undefined}>{savedDate(preparation)}</time>
                  <div className="placement-library-card-actions">
                    {onPin && <button className={`placement-library-icon${preparation.pinned ? " is-active" : ""}`} type="button" aria-label={`${preparation.pinned ? "Unpin" : "Pin"} ${title}`} title={preparation.pinned ? "Unpin preparation" : "Pin preparation"} aria-pressed={preparation.pinned === true} disabled={locked} onClick={() => runAction(pinKey, () => onPin(preparation))}>{action === pinKey ? <LoaderCircle size={16} className="is-spinning" aria-hidden="true" /> : preparation.pinned ? <PinOff size={16} aria-hidden="true" /> : <Pin size={16} aria-hidden="true" />}</button>}
                    {onDelete && <AnimatePresence initial={false} mode="wait">{pendingDelete === deleteKey ? <Motion.div key="confirm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={transition}>{confirmation(deleteKey, () => onDelete(preparation), `deleting ${title}`)}</Motion.div> : <Motion.button key="delete" className="placement-library-icon is-delete" type="button" aria-label={`Delete ${title}`} title="Delete preparation" disabled={locked} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={transition} onClick={() => { setFilterOpen(false); setPendingDelete(deleteKey); }}><Trash2 size={16} aria-hidden="true" /></Motion.button>}</AnimatePresence>}
                  </div>
                </footer>
              </Motion.article>;
            })}
          </AnimatePresence>
        </Motion.div>
        {!entries.length && <div className="placement-library-empty placement-library-empty--filtered" role="status"><span>No preparations match your search or filter.</span><button type="button" onClick={() => { setSearch(""); setFilter("all"); }}>Clear filters</button></div>}
      </>}
    </section>
  );
}
