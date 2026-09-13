import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { History, X } from 'lucide-react';
import { acquireDocumentScrollLock } from '../utils/documentScrollLock';
import './PlannerHistoryDialog.css';
import './MomentumViews.css';

const MOMENTUM_LABELS = { study: 'Subjects', exam: 'Exams', quiz: 'Quizzes', battle: 'Quiz Battles', coding: 'CodeMatrix' };

export function MomentumHistoryRows({ entries = [] }) {
  return entries.length ? <ol className="momentum-history-list">{entries.map((entry) => <li key={entry.id}>
    <div><span className="momentum-history-kind">{MOMENTUM_LABELS[entry.kind]} · {entry.subject}</span><strong>{entry.title}</strong><p>{entry.detail}</p>
      <small>{entry.occurredAt ? new Date(entry.occurredAt).toLocaleString() : `Recovered from saved progress · recorded ${new Date(entry.recordedAt).toLocaleDateString()}`}{entry.scheduledDate ? ` · Scheduled ${entry.scheduledDate}` : ''}</small>
    </div><b>+{entry.xp} XP</b>
  </li>)}</ol> : <p className="study-history-empty">Complete a study task, exam, quiz, or four successful code runs to earn XP.</p>;
}

export default function MomentumHistoryDialog({ data, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    const dialog = ref.current;
    const unlock = acquireDocumentScrollLock();
    dialog.showModal();
    return () => { dialog.close(); unlock(); previousFocus?.focus?.({ preventScroll: true }); };
  }, []);
  return createPortal(<dialog ref={ref} className="study-history-dialog momentum-history-dialog" aria-labelledby="momentum-history-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <header className="study-history-header"><History size={21} /><h2 id="momentum-history-title">XP history</h2><button type="button" className="momentum-history-close" aria-label="Close XP history" onClick={onClose}><X size={16} /></button></header>
    <div className="study-history-content">
      <MomentumHistoryRows entries={data?.history} />
    </div>
    <footer className="study-history-footer"><button type="button" onClick={onClose}>Done</button></footer>
  </dialog>, document.body);
}
