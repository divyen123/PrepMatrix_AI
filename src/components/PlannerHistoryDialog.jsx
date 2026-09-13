import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, CheckCircle2, History, X } from 'lucide-react';
import api from '../utils/apiClient';
import { acquireDocumentScrollLock } from '../utils/documentScrollLock';
import './PlannerHistoryDialog.css';

const list = (value) => Array.isArray(value) ? value : [];
const label = (value) => typeof value === 'string' ? value : '';
const dateLabel = (value) => {
  const date = value ? new Date(/^\d{4}-\d{2}-\d{2}$/u.test(value) ? `${value}T12:00:00` : value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not recorded';
};

export function PlannerHistoryRecords({ entries = [], notes = [], notesLoading = false }) {
  return entries.length ? entries.map((entry, index) => (
    <details className="study-history-receipt" key={entry.id} open={index === 0}>
      <summary>
        <span><strong>{entry.isCurrent ? 'Current schedule' : 'Saved schedule'}</strong><small>{entry.startDate ? `${dateLabel(entry.startDate)} – ${dateLabel(entry.endDate)}` : 'Schedule dates not recorded'}</small></span>
        <span className="study-history-badge"><CheckCircle2 size={14} />{entry.fullyCompleted ? '100% completed' : `${entry.tasks.length} completed tasks`}</span>
      </summary>
      <div className="study-history-receipt-body">
        <dl className="study-history-facts">
          <div><dt>Completed</dt><dd>{entry.tasks.length} / {entry.totalTasks} tasks</dd></div>
          <div><dt>Subjects</dt><dd>{new Set(entry.tasks.map((task) => task.subjectName)).size}</dd></div>
          <div><dt>{entry.isCurrent ? 'Record' : 'Archived on'}</dt><dd>{entry.isCurrent ? 'Live progress' : dateLabel(entry.archivedAt)}</dd></div>
        </dl>
        {!entry.fullyCompleted && <p className="study-history-muted">Only completed work is listed. This schedule also had unfinished work.</p>}
        {[...new Set(entry.tasks.map((task) => task.subjectName))].map((subject) => (
          <section className="study-history-subject" key={subject}>
            <h3>{subject}</h3>
            <ol>
              {entry.tasks.filter((task) => task.subjectName === subject).map((task, taskIndex) => {
                const note = notes.find((item) => item.id === task.noteId);
                return <li key={`${task.id}-${taskIndex}`}>
                  <div><strong>{task.topic || task.label}</strong>{task.chapterTitle && task.chapterTitle !== task.topic && <span>Chapter: {task.chapterTitle}</span>}
                    <small>{task.noteId ? 'Saved note' : task.notebookId ? 'Notebook topic' : task.chapterTitle ? 'Chapter' : 'Study task'}{task.date && ` · Scheduled ${dateLabel(task.date)}`}{task.time && ` · ${task.time}`}</small>
                    {note && <details className="study-history-note"><summary>View linked note: {label(note.topic)}</summary><p>{label(note.details) || 'No additional details saved.'}</p></details>}
                    {task.noteId && !note && <small>{notesLoading ? 'Loading linked note…' : 'The task record is saved; its original note may no longer be available.'}</small>}
                  </div><CheckCircle2 size={17} aria-label="Completed" />
                </li>;
              })}
            </ol>
          </section>
        ))}
      </div>
    </details>
  )) : <p className="study-history-empty">No completed schedule records yet. Completed tasks will be kept here when you clear a schedule.</p>;
}

export function PreparedNotes({ notebooks = [], notes = [] }) {
  if (!notebooks.length && !notes.length) return <p className="study-history-empty">No prepared notebooks or saved notes yet.</p>;
  return <div className="study-history-prepared">
    <p className="study-history-muted">Saved learning materials are shown separately from completed schedule tasks.</p>
    {notebooks.map((notebook, index) => <details className="study-history-receipt" key={notebook.id || notebook._id || index}>
      <summary><span><strong>{label(notebook.title) || label(notebook.subjectName) || 'Study notebook'}</strong><small>{label(notebook.subjectName)} · Prepared {dateLabel(notebook.createdAt)}</small></span><BookOpen size={18} /></summary>
      <div className="study-history-receipt-body">
        {label(notebook.overview || notebook.summary) && <p>{label(notebook.overview || notebook.summary)}</p>}
        {list(notebook.chapters).map((chapter, chapterIndex) => <section className="study-history-subject" key={chapter.id || chapterIndex}>
          <h3>{label(chapter.title)}</h3>{label(chapter.summary) && <p>{chapter.summary}</p>}
          <ul>{list(chapter.topics).map((topic, topicIndex) => <li key={topic.id || topicIndex}>{label(topic.title || topic.name || topic)}</li>)}</ul>
        </section>)}
        {!list(notebook.chapters).length && list(notebook.topics).length > 0 && <ul>{notebook.topics.map((topic, topicIndex) => <li key={topic.id || topicIndex}>{label(topic.title || topic.name || topic)}</li>)}</ul>}
        {list(notebook.revisedNotes ?? notebook.notes).map((note, noteIndex) => <details className="study-history-note" key={note.id || noteIndex}>
          <summary>{label(note.title) || 'Revision note'}</summary><p>{label(note.content)}</p>
          {list(note.keyPoints).length > 0 && <ul>{note.keyPoints.map((point, pointIndex) => <li key={pointIndex}>{label(point)}</li>)}</ul>}
        </details>)}
      </div>
    </details>)}
    {notes.map((note, index) => <details className="study-history-receipt" key={note.id || index}>
      <summary><span><strong>{label(note.topic) || 'Study note'}</strong><small>Saved {dateLabel(note.createdAt)} · {label(note.status) || 'Open'}</small></span><BookOpen size={18} /></summary>
      <div className="study-history-receipt-body"><p className="study-history-note-text">{label(note.details) || 'No additional details saved.'}</p></div>
    </details>)}
  </div>;
}

export default function PlannerHistoryDialog({ academicProfileDataId, entries, notebooks = [], notebooksLoading, notebooksError, onRetryNotebooks, onClose }) {
  const dialogRef = useRef(null);
  const [tab, setTab] = useState('schedules');
  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [notesError, setNotesError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const releaseScrollLock = acquireDocumentScrollLock();
    dialog.showModal();
    return () => { dialog.close(); releaseScrollLock(); previousFocus?.focus?.({ preventScroll: true }); };
  }, []);

  useEffect(() => {
    let current = true;
    setNotesLoading(true);
    setNotesError('');
    api.getNotes({ academicProfileId: academicProfileDataId }).then((payload) => {
      if (current) setNotes(list(payload?.notes));
    }).catch(() => { if (current) setNotesError('Saved notes could not be loaded. Your schedule history is still available.'); })
      .finally(() => { if (current) setNotesLoading(false); });
    return () => { current = false; };
  }, [academicProfileDataId, retry]);

  return createPortal(<dialog className="study-history-dialog" ref={dialogRef} aria-labelledby="study-history-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <header className="study-history-header"><History size={24} /><div><span className="section-tag">Your learning record</span><h2 id="study-history-title">Study history</h2></div><button type="button" aria-label="Close study history" onClick={onClose}><X size={19} /></button></header>
    <div className="study-history-tabs" role="tablist" aria-label="History type" onKeyDown={(event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const nextTab = event.key === 'Home' ? 'schedules' : event.key === 'End' ? 'notes' : tab === 'schedules' ? 'notes' : 'schedules';
      setTab(nextTab);
      dialogRef.current?.querySelector(`#study-history-${nextTab}-tab`)?.focus();
    }}>
      <button id="study-history-schedules-tab" role="tab" tabIndex={tab === 'schedules' ? 0 : -1} aria-controls="study-history-panel" aria-selected={tab === 'schedules'} type="button" onClick={() => setTab('schedules')}>Schedules ({entries.length})</button>
      <button id="study-history-notes-tab" role="tab" tabIndex={tab === 'notes' ? 0 : -1} aria-controls="study-history-panel" aria-selected={tab === 'notes'} type="button" onClick={() => setTab('notes')}>Prepared notes</button>
    </div>
    <div id="study-history-panel" className="study-history-content" role="tabpanel" aria-labelledby={`study-history-${tab}-tab`}>
      {notesError && <p role="alert">{notesError} <button type="button" onClick={() => setRetry((value) => value + 1)}>Retry notes</button></p>}
      {tab === 'schedules' ? <PlannerHistoryRecords entries={entries} notes={notes} notesLoading={notesLoading} /> : <>
        {(notesLoading || notebooksLoading) && <p role="status">Loading saved learning materials…</p>}
        {notebooksError && <p role="alert">Notebooks could not be loaded. <button type="button" onClick={onRetryNotebooks}>Retry notebooks</button></p>}
        {!notesLoading && !notebooksLoading && <PreparedNotes notebooks={notebooks} notes={notes} />}
      </>}
    </div>
    <footer className="study-history-footer"><span>Scheduled dates describe the plan; archived dates record when it was saved to history.</span><button type="button" onClick={onClose}>Done</button></footer>
  </dialog>, document.body);
}
