import { useEffect, useMemo, useState } from "react";
import { Check, Search, Trash2, X } from "lucide-react";
import api from "../utils/apiClient";

const NOTES_PER_PAGE = 6;

function splitTopics(value) {
  return value
    .split(/\n|,/)
    .map((topic) => topic.trim())
    .filter(Boolean);
}

function buildRevisionTask(note) {
  const leftTopicText = note.leftTopics?.length
    ? `: ${note.leftTopics.slice(0, 3).join(", ")}`
    : "";

  return `Revise ${note.topic} doubt${leftTopicText}`;
}

function isNoteRevisionTask(taskName = "") {
  return /^Revise .+ doubt(?::|$)/i.test(taskName.trim());
}

function getCoreTasks(day) {
  return (day.tasks || []).filter((task) => !isNoteRevisionTask(task.task));
}

function isCoreDayComplete(day, completedTasks) {
  const coreTasks = getCoreTasks(day);
  return coreTasks.length > 0 && coreTasks.every((task) => completedTasks.has(task.task));
}

function getPlanTargetIndex(schedule, completed = [], preferredDay = "tomorrow") {
  const completedTasks = new Set(completed);
  const preferredIndex = preferredDay === "tomorrow" ? 1 : 0;
  let progressIndex = 0;

  while (progressIndex < schedule.length) {
    const day = schedule[progressIndex];
    const coreTasks = getCoreTasks(day);

    if (coreTasks.length === 0 || isCoreDayComplete(day, completedTasks)) {
      progressIndex += 1;
      continue;
    }

    break;
  }

  const searchStart = Math.max(preferredIndex, progressIndex);
  const nextStudyDayIndex = schedule.findIndex((day, index) => (
    index >= searchStart && getCoreTasks(day).length > 0
  ));

  return nextStudyDayIndex >= 0 ? nextStudyDayIndex : schedule.length - 1;
}

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

function NotesPage({ completed = [], schedule = [], setSchedule, setNotification }) {
  const [notes, setNotes] = useState([]);
  const [topic, setTopic] = useState("");
  const [leftTopics, setLeftTopics] = useState("");
  const [details, setDetails] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [filter, setFilter] = useState("All");
  const [notesPage, setNotesPage] = useState(1);
  const [notesSearchQuery, setNotesSearchQuery] = useState("");
  const [isNotesLoading, setIsNotesLoading] = useState(true);
  const [confirmClearNotes, setConfirmClearNotes] = useState(false);

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
    const topics = splitTopics(leftTopics);

    if (!cleanTopic && !cleanDetails && topics.length === 0) return;

    addNoteObject({
      id: crypto.randomUUID(),
      topic: cleanTopic || "Untitled doubt",
      leftTopics: topics,
      details: cleanDetails,
      priority,
      status: "Open",
      createdAt: new Date().toISOString(),
    });

    setTopic("");
    setLeftTopics("");
    setDetails("");
    setPriority("Medium");
  };

  const toggleStatus = (id) => {
    saveNotes(
      notes.map((note) =>
        note.id === id
          ? { ...note, status: note.status === "Open" ? "Resolved" : "Open" }
          : note
      )
    );
  };

  const deleteNote = (id) => {
    const nextNotes = notes.filter((note) => note.id !== id);
    saveNotes(nextNotes);
    if (nextNotes.length === 0) setConfirmClearNotes(false);
  };

  const clearAllNotes = () => {
    if (notes.length === 0) return;
    setConfirmClearNotes(false);
    saveNotes([]);
    setFilter("All");
    setNotesSearchQuery("");
    setNotification?.("Stored notes cleared.");
  };

  const planNote = (note, preferredDay = "tomorrow") => {
    const taskName = buildRevisionTask(note);
    const nextSchedule = schedule.length ? structuredClone(schedule) : [{ day: 1, tasks: [] }];
    const targetIndex = getPlanTargetIndex(nextSchedule, completed, preferredDay);
    const targetDay = nextSchedule[targetIndex] || nextSchedule[0];

    targetDay.tasks = targetDay.tasks || [];

    const alreadyPlanned = nextSchedule.some((day) =>
      day.tasks?.some((task) => task.task === taskName)
    );

    if (!alreadyPlanned) {
      targetDay.tasks.push({ time: "Morning", task: taskName });
      setSchedule(nextSchedule);
    }

    saveNotes(
      notes.map((item) =>
        item.id === note.id
          ? { ...item, planned: true, plannedTask: taskName, plannedAt: new Date().toISOString() }
          : item
      )
    );

    setNotification?.(alreadyPlanned ? "This doubt is already in the planner." : "Doubt added to your study schedule.");
  };

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

  const filteredNotes = useMemo(() => {
    const statusFiltered = filter === "All" ? notes : notes.filter((note) => note.status === filter);
    if (!notesSearchQuery.trim()) return statusFiltered;

    return statusFiltered
      .map((note, index) => ({
        note,
        index,
        rank: rankSearchMatch(
          [note.topic, note.details, note.priority, note.status, ...(note.leftTopics || [])],
          notesSearchQuery
        ),
      }))
      .filter((item) => item.rank > 0)
      .sort((a, b) => b.rank - a.rank || a.index - b.index)
      .map((item) => item.note);
  }, [filter, notes, notesSearchQuery]);

  const notesTotalPages = Math.max(1, Math.ceil(filteredNotes.length / NOTES_PER_PAGE));
  const notesStart = (notesPage - 1) * NOTES_PER_PAGE;
  const paginatedNotes = filteredNotes.slice(notesStart, notesStart + NOTES_PER_PAGE);

  useEffect(() => {
    setNotesPage(1);
  }, [filter, notesSearchQuery]);

  useEffect(() => {
    setNotesPage((current) => Math.min(current, notesTotalPages));
  }, [notesTotalPages]);

  const openCount = notes.filter((note) => note.status === "Open").length;
  const resolvedCount = notes.filter((note) => note.status === "Resolved").length;
  const leftTopicCount = notes.reduce(
    (total, note) => total + note.leftTopics.length,
    0
  );

  return (
    <section className="page-stack notes-page">
      <div className="section-intro">
        <span className="section-tag">Notes</span>
        <h2>Doubt board and left-topic tracker</h2>
      </div>

      <div className="notes-grid">
        <form className="card notes-form-card" onSubmit={addNote}>
          <div>
            <span className="section-tag">Capture</span>
            <h3>Add a study note</h3>
            <p className="card-desc">
              Save doubts, skipped topics, and revision reminders before they disappear.
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
            Topics left
            <textarea
              onChange={(event) => setLeftTopics(event.target.value)}
              placeholder="Add topics separated by commas or new lines"
              rows="4"
              value={leftTopics}
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
                <strong>{leftTopicCount}</strong>
                <span className="desktop-only-text">Topics left</span>
                <span className="mobile-only-text">remaining</span>
              </div>
            </div>
          </article>

          <article className="card notes-method-card">
            <span className="section-tag">Planner bridge</span>
            <h3>Notes to planner</h3>
            <p>
              Turn any doubt into a morning revision task. Voice commands can also add doubts here automatically.
            </p>
          </article>
        </aside>
      </div>

      <section className={`card notes-list-card${confirmClearNotes ? " is-confirming-clear" : ""}`}>
        <div className="notes-list-header">
          <div>
            <span className="section-tag">Stored notes</span>
            <h3>Your doubt queue</h3>
          </div>

          <div className="notes-actions">
            <div className="notes-search-filter-row">
              {notes.length > 0 && (
                <label className="stored-search-field notes-desktop-search">
                  <Search size={16} />
                  <input
                    aria-label="Search stored notes"
                    onChange={(event) => setNotesSearchQuery(event.target.value)}
                    placeholder="Search by topic, details, priority, or left topic"
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
              placeholder="Search by topic, details, priority, or left topic"
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
              ? "No notes here yet. Add a doubt or left-out topic to start your revision queue."
              : "No stored notes match your search."}
          </p>
        ) : (
          <div className="notes-list-grid">
            {paginatedNotes.map((note) => (
              <article className="note-card" key={note.id}>
                <div className="note-card-top">
                  <div>
                    <span className={`note-priority ${note.priority.toLowerCase()}`}>{note.priority}</span>
                    <h4>{note.topic}</h4>
                  </div>
                  {note.planned ? <span className="planned-chip">Added to planner</span> : null}
                </div>

                {note.details ? <p>{note.details}</p> : null}

                {note.leftTopics.length > 0 ? (
                  <div className="left-topic-wrap">
                    {note.leftTopics.map((item) => <span key={`${note.id}-${item}`}>{item}</span>)}
                  </div>
                ) : null}

                <div className="note-card-actions">
                  <button 
                    onClick={() => planNote(note)} 
                    type="button"
                    style={{
                      padding: "4px 8px",
                      fontSize: "0.72rem",
                      height: "26px",
                      minHeight: "26px",
                      borderRadius: "999px",
                      boxSizing: "border-box",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "100%"
                    }}
                  >
                    Plan tomorrow morning
                  </button>
                  <button 
                    onClick={() => toggleStatus(note.id)} 
                    type="button"
                    style={{
                      padding: "4px 8px",
                      fontSize: "0.72rem",
                      height: "26px",
                      minHeight: "26px",
                      borderRadius: "999px",
                      boxSizing: "border-box",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "100%"
                    }}
                  >
                    {note.status === "Open" ? "Mark resolved" : "Reopen"}
                  </button>
                  <button 
                    className="danger-text" 
                    onClick={() => deleteNote(note.id)} 
                    type="button"
                    style={{
                      padding: "4px 8px",
                      fontSize: "0.72rem",
                      height: "26px",
                      minHeight: "26px",
                      borderRadius: "999px",
                      boxSizing: "border-box",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "100%"
                    }}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
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

