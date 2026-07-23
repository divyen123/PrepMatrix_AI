import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Check, Search, Trash2, X } from "lucide-react";
import api from "../utils/apiClient";
import {
  getNotePlannerState,
  getScheduleDateOptions,
  pruneRemovedTaskCompletions,
  removeNotesFromPlanner,
  upsertNotePlannerTask,
} from "../utils/notePlanner";
import "./NotesPage.css";

const NOTES_PER_PAGE = 6;

function rankSearchMatch(fields, query) {
  const cleanQuery = query.trim().toLowerCase();
  if (!cleanQuery) return 0;

  return fields.reduce((best, field) => {
    const value = String(field || "").toLowerCase();
    if (!value.includes(cleanQuery)) return best;
    if (value === cleanQuery) return Math.max(best, 4);
    if (value.startsWith(cleanQuery)) return Math.max(best, 3);
    return Math.max(best, 2);
  }, 0);
}

function getWorkflowStatus(note, plannerState) {
  if (plannerState?.state === "completed") return "Resolved";
  return note?.status === "Resolved" ? "Resolved" : "Open";
}

function NotesPage({
  completed = [],
  schedule = [],
  scheduleStartDate = "",
  setCompleted,
  setSchedule,
  setNotification,
}) {
  const [notes, setNotes] = useState([]);
  const [topic, setTopic] = useState("");
  const [details, setDetails] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [filter, setFilter] = useState("All");
  const [notesPage, setNotesPage] = useState(1);
  const [notesSearchQuery, setNotesSearchQuery] = useState("");
  const [isNotesLoading, setIsNotesLoading] = useState(true);
  const [confirmClearNotes, setConfirmClearNotes] = useState(false);
  const [pendingDeleteNoteId, setPendingDeleteNoteId] = useState(null);
  const [plannerMenuNoteId, setPlannerMenuNoteId] = useState(null);
  const deleteTriggerRefs = useRef(new Map());
  const noteCardRefs = useRef(new Map());
  const notesListHeadingRef = useRef(null);

  const saveNotes = (nextNotes) => {
    setNotes(nextNotes);
    api.saveNotes(nextNotes).catch((error) => {
      setNotification?.(error instanceof Error ? error.message : "Could not save notes.");
    });
  };

  const addNoteObject = (nextNote) => {
    saveNotes([nextNote, ...notes]);
  };

  const addNote = (event) => {
    event.preventDefault();

    const cleanTopic = topic.trim();
    const cleanDetails = details.trim();

    if (!cleanTopic && !cleanDetails) return;

    addNoteObject({
      id: crypto.randomUUID(),
      topic: cleanTopic || "Untitled doubt",
      leftTopics: [],
      details: cleanDetails,
      priority,
      status: "Open",
      createdAt: new Date().toISOString(),
    });

    setTopic("");
    setDetails("");
    setPriority("Medium");
  };


  const cancelDeleteNote = (id) => {
    setPendingDeleteNoteId(null);
    window.requestAnimationFrame(() => deleteTriggerRefs.current.get(id)?.focus());
  };

  const removePlannerLinks = (notesToRemove) => {
    const removal = removeNotesFromPlanner(schedule, notesToRemove);
    if (!removal.changed) return;

    setSchedule(removal.schedule);
    setCompleted?.((current) => pruneRemovedTaskCompletions(
      current,
      removal.removedTaskNames,
      removal.schedule,
    ));
  };

  const deleteNote = (id) => {
    const noteToDelete = notes.find((note) => note.id === id);
    const nextNotes = notes.filter((note) => note.id !== id);
    if (noteToDelete) removePlannerLinks([noteToDelete]);
    saveNotes(nextNotes);
    setPendingDeleteNoteId(null);
    setPlannerMenuNoteId((current) => (current === id ? null : current));
    if (nextNotes.length === 0) setConfirmClearNotes(false);
    window.requestAnimationFrame(() => notesListHeadingRef.current?.focus());
  };

  const clearAllNotes = () => {
    if (notes.length === 0) return;
    removePlannerLinks(notes);
    setConfirmClearNotes(false);
    setPendingDeleteNoteId(null);
    setPlannerMenuNoteId(null);
    saveNotes([]);
    setFilter("All");
    setNotesSearchQuery("");
    setNotification?.("Stored notes cleared.");
  };

  const planNoteForDate = (note, dateKey) => {
    const result = upsertNotePlannerTask(
      schedule,
      note,
      dateKey,
      scheduleStartDate,
    );
    if (!result) {
      setNotification?.("That schedule date is no longer available. Generate or refresh your schedule.");
      return;
    }

    const dateOption = getScheduleDateOptions(schedule, scheduleStartDate)
      .find((option) => option.dateKey === result.dateKey);
    const wasPlanned = Boolean(getNotePlannerState(
      note,
      schedule,
      completed,
      scheduleStartDate,
    ).link);
    const updatedAt = new Date().toISOString();

    setSchedule(result.schedule);
    saveNotes(
      notes.map((item) =>
        item.id === note.id
          ? {
              ...item,
              planned: true,
              plannedAt: item.plannedAt || updatedAt,
              plannedDate: result.dateKey,
              plannedDay: Number(result.schedule[result.targetDayIndex]?.day) || result.targetDayIndex + 1,
              plannedTask: result.task.task,
              plannerUpdatedAt: updatedAt,
              status: "Open",
            }
          : item
      )
    );
    setPlannerMenuNoteId(null);
    window.requestAnimationFrame(() => {
      noteCardRefs.current.get(note.id)?.querySelector(".note-plan-action")?.focus();
    });
    setNotification?.(
      `${wasPlanned ? "Planner date updated" : "Doubt added to planner"}${dateOption ? ` for ${dateOption.label}` : ""}.`,
    );
  };

  const reopenNote = (note, plannerState) => {
    if (plannerState.taskName) {
      setCompleted?.((current) => current.filter((task) => task !== plannerState.taskName));
    }

    saveNotes(notes.map((item) => (
      item.id === note.id
        ? { ...item, planned: Boolean(plannerState.link), status: "Open" }
        : item
    )));

    if (!plannerState.link) setPlannerMenuNoteId(note.id);
    setNotification?.(
      plannerState.link
        ? "Planner task reopened. You can also move it to another date."
        : "Choose a schedule date to reopen this note in the planner.",
    );
  };

  useEffect(() => {
    if (!plannerMenuNoteId) return undefined;

    const closeWhenClickingOutside = (event) => {
      const openCard = noteCardRefs.current.get(plannerMenuNoteId);
      if (openCard && !openCard.contains(event.target)) setPlannerMenuNoteId(null);
    };
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      setPlannerMenuNoteId(null);
      window.requestAnimationFrame(() => {
        noteCardRefs.current.get(plannerMenuNoteId)?.querySelector(".note-plan-action")?.focus();
      });
    };

    document.addEventListener("pointerdown", closeWhenClickingOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeWhenClickingOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [plannerMenuNoteId]);

  useEffect(() => {
    try {
      const parsed = window.pendingVoiceNote;
      window.pendingVoiceNote = null;

      if (!parsed?.topic) return;

      const voiceNote = {
        id: crypto.randomUUID(),
        topic: parsed.topic,
        leftTopics: [],
        details: "Captured from voice assistant.",
        priority: "Medium",
        status: "Open",
        createdAt: new Date().toISOString(),
      };

      setNotes((current) => {
        const nextNotes = [voiceNote, ...current];
        api.saveNotes(nextNotes).catch((error) => {
          setNotification?.(error instanceof Error ? error.message : "Could not save notes.");
        });
        return nextNotes;
      });
      setNotification?.("Voice doubt saved to Notes.");
    } catch {
      window.pendingVoiceNote = null;
    }
  }, [setNotification]);

  useEffect(() => {
    let isMounted = true;

    setIsNotesLoading(true);

    api.getNotes()
      .then((payload) => {
        if (isMounted) setNotes(payload.notes || []);
      })
      .catch((error) => {
        setNotification?.(error instanceof Error ? error.message : "Could not load notes.");
      })
      .finally(() => {
        if (isMounted) setIsNotesLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [setNotification]);

  const plannerStates = useMemo(() => new Map(notes.map((note) => [
    note.id,
    getNotePlannerState(note, schedule, completed, scheduleStartDate),
  ])), [completed, notes, schedule, scheduleStartDate]);
  const scheduleDateOptions = useMemo(
    () => getScheduleDateOptions(schedule, scheduleStartDate),
    [schedule, scheduleStartDate],
  );

  const filteredNotes = useMemo(() => {
    const statusFiltered = filter === "All"
      ? notes
      : notes.filter((note) => getWorkflowStatus(note, plannerStates.get(note.id)) === filter);
    if (!notesSearchQuery.trim()) return statusFiltered;

    return statusFiltered
      .map((note, index) => ({
        note,
        index,
        rank: rankSearchMatch(
          [
            note.topic,
            note.details,
            note.priority,
            getWorkflowStatus(note, plannerStates.get(note.id)),
            plannerStates.get(note.id)?.state,
            ...(Array.isArray(note.leftTopics) ? note.leftTopics : []),
          ],
          notesSearchQuery
        ),
      }))
      .filter((item) => item.rank > 0)
      .sort((a, b) => b.rank - a.rank || a.index - b.index)
      .map((item) => item.note);
  }, [filter, notes, notesSearchQuery, plannerStates]);

  const notesTotalPages = Math.max(1, Math.ceil(filteredNotes.length / NOTES_PER_PAGE));
  const notesStart = (notesPage - 1) * NOTES_PER_PAGE;
  const paginatedNotes = filteredNotes.slice(notesStart, notesStart + NOTES_PER_PAGE);

  useEffect(() => {
    setNotesPage(1);
  }, [filter, notesSearchQuery]);

  useEffect(() => {
    setNotesPage((current) => Math.min(current, notesTotalPages));
  }, [notesTotalPages]);

  const openCount = notes.filter((note) => getWorkflowStatus(note, plannerStates.get(note.id)) === "Open").length;
  const resolvedCount = notes.filter((note) => getWorkflowStatus(note, plannerStates.get(note.id)) === "Resolved").length;
  const plannedCount = notes.filter((note) => plannerStates.get(note.id)?.state !== "unscheduled").length;

  return (
    <section className="page-stack notes-page">
      <div className="section-intro">
        <span className="section-tag">Notes</span>
        <h2>Doubt board</h2>
      </div>

      <div className="notes-grid">
        <form className="card notes-form-card" onSubmit={addNote}>
          <div>
            <span className="section-tag">Capture</span>
            <h3>Add a study note</h3>
            <p className="card-desc">
              Save doubts, questions, and revision reminders before they disappear.
            </p>
          </div>

          <label className="field-stack">
            Doubt topic
            <input
              onChange={(event) => setTopic(event.target.value)}
              placeholder="Example: Bayes theorem, React hooks, deadlock"
              type="text"
              value={topic}
            />
          </label>

          <label className="field-stack">
            Details
            <textarea
              onChange={(event) => setDetails(event.target.value)}
              placeholder="Write what confused you, where to revise, or what to ask later"
              rows="5"
              value={details}
            />
          </label>

          <div className="notes-form-row">
            <label className="field-stack">
              Priority
              <select
                onChange={(event) => setPriority(event.target.value)}
                value={priority}
              >
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
              </select>
            </label>
            <button className="primary-btn" type="submit">Save note</button>
          </div>
        </form>

        <aside className="notes-side-stack">
          <article className="card notes-summary-card">
            <span className="section-tag">Board status</span>
            <div className="notes-stat-grid">
              <div>
                <strong>{openCount}</strong>
                <span className="desktop-only-text">Open doubts</span>
                <span className="mobile-only-text">doubts</span>
              </div>
              <div>
                <strong>{resolvedCount}</strong>
                <span className="desktop-only-text">Resolved</span>
                <span className="mobile-only-text">resolved</span>
              </div>
              <div>
                <strong>{plannedCount}</strong>
                <span className="desktop-only-text">Planned</span>
                <span className="mobile-only-text">planned</span>
              </div>
            </div>
          </article>

          <article className="card notes-method-card">
            <span className="section-tag">Planner bridge</span>
            <h3>Notes to planner</h3>
            <p>
              Add a note to any available schedule date, then track its completion from the planner.
            </p>
          </article>
        </aside>
      </div>

      <section className={`card notes-list-card${confirmClearNotes ? " is-confirming-clear" : ""}`}>
        <div className="notes-list-header">
          <div>
            <span className="section-tag">Stored notes</span>
            <h3 ref={notesListHeadingRef} tabIndex={-1}>Your doubt queue</h3>
          </div>

          <div className="notes-actions">
            <div className="notes-search-filter-row">
              {notes.length > 0 && (
                <label className="stored-search-field notes-desktop-search">
                  <Search size={16} />
                  <input
                    aria-label="Search stored notes"
                    onChange={(event) => setNotesSearchQuery(event.target.value)}
                    placeholder="Search by topic, details, or saved topic"
                    type="search"
                    value={notesSearchQuery}
                  />
                </label>
              )}
              <select
                className="notes-filter-select"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="All">All Notes</option>
                <option value="Open">Open</option>
                <option value="Resolved">Resolved</option>
              </select>
              {notes.length > 0 && (confirmClearNotes ? (
                <div className="notes-clear-confirm-inline inline-destructive-confirm" role="group" aria-label="Confirm clearing all stored notes">
                  <span className="compact-confirm-copy">Clear all?</span>
                  <div className="compact-confirm-actions">
                    <button
                      aria-label="Confirm clearing all stored notes"
                      className="compact-confirm-btn is-confirm"
                      onClick={clearAllNotes}
                      title="Confirm clear all"
                      type="button"
                    >
                      <Check aria-hidden="true" size={13} />
                    </button>
                    <button
                      aria-label="Cancel clearing stored notes"
                      className="compact-confirm-btn is-cancel"
                      onClick={() => setConfirmClearNotes(false)}
                      title="Cancel"
                      type="button"
                    >
                      <X aria-hidden="true" size={13} />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  aria-label="Clear all stored notes"
                  className="notes-clear-all-btn"
                  onClick={() => setConfirmClearNotes(true)}
                  title="Clear all stored notes"
                  type="button"
                >
                  <Trash2 aria-hidden="true" size={15} />
                </button>
              ))}
            </div>
          </div>
        </div>

        {notes.length > 0 && (
          <label className="stored-search-field notes-mobile-search">
            <Search size={16} />
            <input
              aria-label="Search stored notes"
              onChange={(event) => setNotesSearchQuery(event.target.value)}
              placeholder="Search by topic, details, or saved topic"
              type="search"
              value={notesSearchQuery}
            />
          </label>
        )}


        {isNotesLoading ? (
          <p className="empty-state">Loading stored notes...</p>
        ) : filteredNotes.length === 0 ? (
          <p className="empty-state">
            {notes.length === 0
              ? "No notes here yet. Add a doubt to start your revision queue."
              : "No stored notes match your search."}
          </p>
        ) : (
          <div className="notes-list-grid">
            {paginatedNotes.map((note) => {
              const plannerState = plannerStates.get(note.id) || { state: "unscheduled" };
              const noteStatus = getWorkflowStatus(note, plannerState);
              const notePriority = ["Low", "Medium", "High"].includes(note.priority) ? note.priority : "Medium";
              const isConfirmingDelete = pendingDeleteNoteId === note.id;
              const isPlannerMenuOpen = plannerMenuNoteId === note.id;
              const legacyTopics = Array.isArray(note.leftTopics) ? note.leftTopics.filter(Boolean) : [];
              const plannerActionLabel = plannerState.state === "completed"
                ? "Reopen"
                : plannerState.state === "added" ? "Added to planner" : "Add to planner";
              const hasUpcomingDates = scheduleDateOptions.some((option) => !option.isPast);

              return (
                <article
                  className={`note-card is-${noteStatus.toLowerCase()}${isConfirmingDelete ? " is-confirming-delete" : ""}${isPlannerMenuOpen ? " is-planner-menu-open" : ""}`}
                  key={note.id}
                  ref={(node) => {
                    if (node) noteCardRefs.current.set(note.id, node);
                    else noteCardRefs.current.delete(note.id);
                  }}
                >
                  <div className="note-card-top">
                    <div className="note-card-heading">
                      <div className="note-card-chips">
                        <span className={`note-priority ${notePriority.toLowerCase()}`}>{notePriority}</span>
                        <span className={`note-status is-${noteStatus.toLowerCase()}`}>{noteStatus}</span>
                      </div>
                      <h4>{note.topic}</h4>
                    </div>
                    {plannerState.state !== "unscheduled" ? (
                      <span className={`planned-chip${plannerState.state === "completed" ? " is-completed" : ""}`}>
                        {plannerState.state === "completed" ? "Completed" : "Added to planner"}
                      </span>
                    ) : null}
                  </div>

                  <p className={`note-card-details${note.details ? "" : " is-empty"}`}>
                    {note.details || "No extra details added."}
                  </p>

                  {legacyTopics.length > 0 ? (
                    <div className="note-legacy-topics" aria-label="Previously saved topics">
                      <span>Saved topics</span>
                      <div>{legacyTopics.map((item) => <span key={`${note.id}-${item}`}>{item}</span>)}</div>
                    </div>
                  ) : null}

                  <div className="note-card-actions">
                    {isConfirmingDelete ? (
                      <div
                        aria-label={`Confirm deleting ${note.topic}`}
                        className="note-delete-confirm"
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            event.preventDefault();
                            cancelDeleteNote(note.id);
                          }
                        }}
                        role="group"
                      >
                        <span className="note-delete-confirm-copy">Delete this note?</span>
                        <div className="compact-confirm-actions">
                          <button
                            aria-label={`Confirm deleting ${note.topic}`}
                            autoFocus
                            className="compact-confirm-btn is-confirm"
                            onClick={() => deleteNote(note.id)}
                            title="Confirm delete"
                            type="button"
                          >
                            <Check aria-hidden="true" size={13} />
                          </button>
                          <button
                            aria-label={`Cancel deleting ${note.topic}`}
                            className="compact-confirm-btn is-cancel"
                            onClick={() => cancelDeleteNote(note.id)}
                            title="Cancel"
                            type="button"
                          >
                            <X aria-hidden="true" size={13} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <button
                          aria-controls={plannerState.state === "completed" ? undefined : `note-planner-dates-${note.id}`}
                          aria-expanded={plannerState.state === "completed" ? undefined : isPlannerMenuOpen}
                          className={`note-action-btn note-plan-action is-${plannerState.state}`}
                          onClick={() => {
                            if (plannerState.state === "completed") {
                              reopenNote(note, plannerState);
                            } else {
                              setPlannerMenuNoteId((current) => current === note.id ? null : note.id);
                            }
                          }}
                          type="button"
                        >
                          {plannerState.state !== "completed" ? <CalendarDays aria-hidden="true" size={13} /> : null}
                          <span>{plannerActionLabel}</span>
                        </button>
                        <button
                          aria-label={`Delete ${note.topic}`}
                          className="note-delete-icon-btn"
                          onClick={() => {
                            setPlannerMenuNoteId(null);
                            setPendingDeleteNoteId(note.id);
                          }}
                          ref={(node) => {
                            if (node) deleteTriggerRefs.current.set(note.id, node);
                            else deleteTriggerRefs.current.delete(note.id);
                          }}
                          title="Delete note"
                          type="button"
                        >
                          <Trash2 aria-hidden="true" size={13} />
                        </button>

                        {isPlannerMenuOpen ? (
                          <div
                            aria-label="Choose a schedule date"
                            className="planner-date-menu"
                            id={`note-planner-dates-${note.id}`}
                            role="group"
                          >
                            <div className="planner-date-menu-header">
                              <CalendarDays aria-hidden="true" size={13} />
                              <div>
                                <strong>Choose date</strong>
                              </div>
                            </div>

                            {scheduleDateOptions.length === 0 ? (
                              <p className="planner-date-empty">
                                Create a schedule first.
                              </p>
                            ) : (
                              <>
                                <div className="planner-date-options">
                                  {scheduleDateOptions.map((option) => {
                                    const isCurrentDate = plannerState.dateKey === option.dateKey;
                                    return (
                                      <button
                                        aria-current={isCurrentDate ? "date" : undefined}
                                        className={`planner-date-option${isCurrentDate ? " is-current" : ""}${option.isPast ? " is-past" : ""}`}
                                        disabled={option.isPast}
                                        key={option.dateKey}
                                        onClick={() => planNoteForDate(note, option.dateKey)}
                                        type="button"
                                      >
                                        <span>
                                          <strong>{option.label}</strong>
                                          <small>{option.taskCount} {option.taskCount === 1 ? "task" : "tasks"}</small>
                                        </span>
                                        {isCurrentDate ? <em>Current</em> : option.isPast ? <em>Past</em> : null}
                                      </button>
                                    );
                                  })}
                                </div>
                                {!hasUpcomingDates ? (
                                  <p className="planner-date-empty is-compact">
                                    Create a new schedule.
                                  </p>
                                ) : null}
                              </>
                            )}
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {filteredNotes.length > NOTES_PER_PAGE && (
          <div className="pagination-bar">
            <button disabled={notesPage === 1} onClick={() => setNotesPage((current) => current - 1)} type="button">
              Previous
            </button>
            <span>Page {notesPage} of {notesTotalPages}</span>
            <button disabled={notesPage === notesTotalPages} onClick={() => setNotesPage((current) => current + 1)} type="button">
              Next
            </button>
          </div>
        )}
      </section>
    </section>
  );
}

export default NotesPage;

