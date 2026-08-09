import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Clock3,
  FileText,
  History,
  LayoutTemplate,
  LoaderCircle,
  RefreshCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  filterResumeHistory,
  reconcileResumeHistorySearch,
} from "../utils/resumeHistory";
import "./ResumeHistorySection.css";

function formatHistoryDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Saved recently";
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function templateLabel(value) {
  const label = String(value || "balanced").replace(/[-_]+/g, " ").trim();
  return label ? label.replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Balanced";
}

export default function ResumeHistorySection({
  entries = [],
  loading = false,
  error = "",
  selectedId = "",
  onSelect,
  onDelete,
  onDeleteAll,
  onRetry,
}) {
  const [search, setSearch] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState("");
  const [deleteAllConfirmOpen, setDeleteAllConfirmOpen] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const actionLockRef = useRef(false);
  const normalizedEntries = useMemo(() => filterResumeHistory(entries), [entries]);
  const filteredEntries = useMemo(
    () => filterResumeHistory(normalizedEntries, search),
    [normalizedEntries, search],
  );
  const hasHistory = normalizedEntries.length > 0;
  const isEmpty = !loading && !error && !hasHistory;
  const query = search.trim();
  const interactionLocked = loading || Boolean(busyAction);

  useEffect(() => {
    if (!hasHistory) {
      setSearch((currentSearch) => reconcileResumeHistorySearch(currentSearch, hasHistory));
    }
  }, [hasHistory]);

  const runAction = async (key, callback) => {
    if (actionLockRef.current) return false;
    actionLockRef.current = true;
    setBusyAction(key);
    try {
      await callback?.();
      return true;
    } catch {
      return false;
    } finally {
      actionLockRef.current = false;
      setBusyAction("");
    }
  };

  const selectEntry = async (entry) => {
    await runAction(`select:${entry.id}`, () => onSelect?.(entry));
  };

  const deleteEntry = async (entry) => {
    const deleted = await runAction(`delete:${entry.id}`, () => onDelete?.(entry.id, entry));
    if (deleted) setPendingDeleteId("");
  };

  const deleteAll = async () => {
    const deleted = await runAction("delete-all", () => onDeleteAll?.());
    if (deleted) {
      setDeleteAllConfirmOpen(false);
      setPendingDeleteId("");
    }
  };

  return (
    <section
      className={"resume-history-section" + (isEmpty ? " is-empty" : "")}
      aria-labelledby="resume-history-title"
      id="resume-history"
    >
      <header className="resume-history-header">
        <div className="resume-history-heading">
          <span className="resume-history-heading__icon" aria-hidden="true">
            <History size={19} />
          </span>
          <div>
            <span className="resume-history-eyebrow">Saved versions</span>
            <div className="resume-history-title-row">
              <h2 id="resume-history-title">Resume history</h2>
              <span className="resume-history-count" aria-label={`${normalizedEntries.length} saved resumes`}>
                {normalizedEntries.length}
              </span>
            </div>
            {isEmpty && (
              <p className="resume-history-empty-message" role="status">
                No generated resumes yet
              </p>
            )}
          </div>
        </div>

        <div className="resume-history-header-actions">
          {hasHistory && (
            <label className="resume-history-search">
              <Search aria-hidden="true" size={15} />
              <span className="resume-history-sr-only">Search resume history</span>
              <input
                aria-controls="resume-history-list"
                disabled={loading}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search resumes"
                type="search"
                value={search}
              />
              {search && (
                <button
                  aria-label="Clear resume history search"
                  className="resume-history-search__clear"
                  disabled={interactionLocked}
                  onClick={() => setSearch("")}
                  type="button"
                >
                  <X aria-hidden="true" size={14} strokeWidth={2.8} />
                </button>
              )}
            </label>
          )}

          {deleteAllConfirmOpen ? (
            <div
              aria-label="Confirm deleting all resume history"
              className="resume-history-confirm resume-history-confirm--global"
              role="group"
            >
              <button
                aria-label="Confirm delete all resume history"
                className="is-confirm"
                disabled={interactionLocked && busyAction !== "delete-all"}
                onClick={deleteAll}
                title="Confirm delete all"
                type="button"
              >
                {busyAction === "delete-all"
                  ? <LoaderCircle aria-hidden="true" className="is-spinning" size={16} />
                  : <Check aria-hidden="true" size={17} strokeWidth={3} />}
              </button>
              <button
                aria-label="Cancel deleting all resume history"
                className="is-cancel"
                disabled={interactionLocked}
                onClick={() => setDeleteAllConfirmOpen(false)}
                title="Cancel delete all"
                type="button"
              >
                <X aria-hidden="true" size={17} strokeWidth={3} />
              </button>
            </div>
          ) : (
            <button
              aria-label="Delete all resume history"
              className="resume-history-delete-all"
              disabled={interactionLocked || normalizedEntries.length === 0}
              onClick={() => {
                setPendingDeleteId("");
                setDeleteAllConfirmOpen(true);
              }}
              title="Delete all resume history"
              type="button"
            >
              <Trash2 aria-hidden="true" size={17} />
            </button>
          )}
        </div>
      </header>

      <p className="resume-history-sr-only" aria-live="polite">
        {query
          ? `${filteredEntries.length} of ${normalizedEntries.length} resumes match ${query}.`
          : `${normalizedEntries.length} resumes in history.`}
      </p>

      {loading && normalizedEntries.length === 0 ? (
        <div className="resume-history-state" role="status" aria-live="polite">
          <LoaderCircle aria-hidden="true" className="is-spinning" size={24} />
          <strong>Loading resume history</strong>
          <span>Your saved resume versions are being prepared.</span>
        </div>
      ) : error ? (
        <div className="resume-history-state resume-history-state--error" role="alert">
          <RefreshCcw aria-hidden="true" size={23} />
          <strong>Resume history is unavailable</strong>
          <span>{error}</span>
          {onRetry && (
            <button disabled={interactionLocked} onClick={onRetry} type="button">
              <RefreshCcw aria-hidden="true" size={15} /> Retry
            </button>
          )}
        </div>
      ) : normalizedEntries.length === 0 ? null : filteredEntries.length === 0 ? (
        <div className="resume-history-state resume-history-state--empty">
          <Search aria-hidden="true" size={24} />
          <strong>No matching resumes</strong>
          <span>No resume names match &ldquo;{query}&rdquo;.</span>
          <button disabled={interactionLocked} onClick={() => setSearch("")} type="button">
            Clear search
          </button>
        </div>
      ) : (
        <div
          aria-busy={interactionLocked}
          className="resume-history-list"
          id="resume-history-list"
        >
          {filteredEntries.map((entry) => {
            const isSelected = selectedId === entry.id;
            const isSelecting = busyAction === `select:${entry.id}`;
            const isDeleting = busyAction === `delete:${entry.id}`;
            const headline = entry.headline || entry.draft?.personal?.headline || "Editable resume version";
            return (
              <article
                className={`resume-history-card${isSelected ? " is-selected" : ""}`}
                key={entry.id}
              >
                <button
                  aria-label={`Load ${entry.name} from resume history`}
                  aria-pressed={isSelected}
                  className="resume-history-card__load"
                  disabled={interactionLocked}
                  onClick={() => selectEntry(entry)}
                  type="button"
                >
                  <span className="resume-history-card__paper" aria-hidden="true">
                    {isSelecting ? <LoaderCircle className="is-spinning" size={25} /> : <FileText size={25} />}
                    <i /><i /><i />
                  </span>
                  <strong title={entry.name}>{entry.name}</strong>
                  <span className="resume-history-card__headline" title={headline}>{headline}</span>
                  <span className="resume-history-card__meta">
                    <span><Clock3 aria-hidden="true" size={12} /> {formatHistoryDate(entry.generatedAt || entry.updatedAt)}</span>
                    <span><LayoutTemplate aria-hidden="true" size={12} /> {templateLabel(entry.layout?.template)}</span>
                  </span>
                  {isSelected && <span className="resume-history-card__selected"><Check size={12} strokeWidth={3} /> Loaded</span>}
                </button>

                <div className="resume-history-card__actions">
                  {pendingDeleteId === entry.id ? (
                    <div
                      aria-label={`Confirm deleting ${entry.name}`}
                      className="resume-history-confirm"
                      role="group"
                    >
                      <button
                        aria-label={`Confirm delete ${entry.name}`}
                        className="is-confirm"
                        disabled={interactionLocked && !isDeleting}
                        onClick={(event) => {
                          event.stopPropagation();
                          deleteEntry(entry);
                        }}
                        title="Confirm delete"
                        type="button"
                      >
                        {isDeleting
                          ? <LoaderCircle aria-hidden="true" className="is-spinning" size={14} />
                          : <Check aria-hidden="true" size={15} strokeWidth={3} />}
                      </button>
                      <button
                        aria-label={`Cancel deleting ${entry.name}`}
                        className="is-cancel"
                        disabled={interactionLocked}
                        onClick={(event) => {
                          event.stopPropagation();
                          setPendingDeleteId("");
                        }}
                        title="Cancel delete"
                        type="button"
                      >
                        <X aria-hidden="true" size={15} strokeWidth={3} />
                      </button>
                    </div>
                  ) : (
                    <button
                      aria-label={`Delete ${entry.name} from resume history`}
                      className="resume-history-card__delete"
                      disabled={interactionLocked}
                      onClick={(event) => {
                        event.stopPropagation();
                        setDeleteAllConfirmOpen(false);
                        setPendingDeleteId(entry.id);
                      }}
                      title="Delete resume"
                      type="button"
                    >
                      <Trash2 aria-hidden="true" size={14} />
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
