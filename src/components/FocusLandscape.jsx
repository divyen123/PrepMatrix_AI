import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, History } from 'lucide-react';
import { createPlannerHistoryEntry, getLandscapeData, normalizePlannerHistory } from '../utils/plannerHistory';
import PlannerHistoryDialog from './PlannerHistoryDialog';

function FocusLandscape({ academicProfileDataId = '', subjects = [], schedule = [], completed = [], history = [], scheduleStartDate = '', notebooks = [], notebooksLoading, notebooksError, onRetryNotebooks }) {
  const [isVisible, setIsVisible] = useState(false);
  const [tooltipInfo, setTooltipInfo] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const observer = useRef(null);

  const setObserverTarget = useCallback((node) => {
    if (observer.current) observer.current.disconnect();
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') { setIsVisible(true); return; }
    observer.current = new IntersectionObserver(
      (entries) => {
        if (entries.length > 0 && entries[0].isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.1 }
    );
    if (node) observer.current.observe(node);
  }, []);
  useEffect(() => () => observer.current?.disconnect(), []);

  const savedHistory = useMemo(() => normalizePlannerHistory(history), [history]);
  const currentRecord = useMemo(() => {
    const entry = createPlannerHistoryEntry({ subjects, schedule, completed, scheduleStartDate }, { id: 'current-schedule', now: '2000-01-01T00:00:00Z' });
    return entry ? { ...entry, archivedAt: '', isCurrent: true } : null;
  }, [subjects, schedule, completed, scheduleStartDate]);
  const sortedData = useMemo(() => getLandscapeData(subjects, schedule, completed, savedHistory), [subjects, schedule, completed, savedHistory]);
  const focusLeader = sortedData.find((item) => item.pending > 0);
  const hasActiveSchedule = sortedData.some((item) => item.total > 0);
  const hasHistory = savedHistory.length > 0;
  const latestFullyCompleted = savedHistory[0]?.fullyCompleted;

  return (
    <section className="card landscape-card">
      <div className="landscape-header">
        <div>
          <span className="section-tag">Focus Map</span>
          <h2>Subject landscape</h2>
        </div>
        <button type="button" className="landscape-history-button" onClick={() => { setTooltipInfo(null); setHistoryOpen(true); }}><History size={16} />View history</button>
      </div>

      {!hasActiveSchedule && hasHistory && <div className="landscape-history-message" role="status">
        <CheckCircle2 size={23} /><div><strong>{latestFullyCompleted ? 'Already completed — your progress is saved' : 'Your completed work is saved'}</strong>
          <p>The active schedule was cleared. View history for completed chapters, topics, and prepared notes.</p></div>
      </div>}

      {sortedData.length === 0 ? (
        <p className="empty-state">
          Add subjects and generate a timetable to unlock the study landscape.
        </p>
      ) : (
        <div className="landscape-grid">
          <div className="landscape-chart-shell" ref={setObserverTarget}>
            <div className="custom-bar-chart">
              {sortedData.map((item, index) => (
                <div 
                  className="custom-bar-row" 
                  key={item.subject} 
                  style={{ animationDelay: `${index * 0.1}s` }}
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setTooltipInfo({
                      item,
                      x: rect.left + rect.width / 2,
                      y: rect.top - 10
                    });
                  }}
                  onMouseLeave={() => setTooltipInfo(null)}
                >
                  <div className="custom-bar-label">
                    <span>{item.subject}</span>
                    <span className="custom-bar-count">
                      {item.total ? `${item.done}/${item.total} tasks` : item.historicalCount ? `${item.historicalCount} completed previously` : 'No active schedule'}
                    </span>
                  </div>
                  <div className="custom-bar-track">
                    <div 
                      className={`custom-bar-fill custom-bar-fill--${item.difficulty}`}
                      style={{ 
                        width: isVisible ? `${item.completionRate}%` : "0%",
                        opacity: isVisible ? 1 : 0
                      }}
                    />
                    <div 
                      className={`custom-bar-pending custom-bar-pending--${item.difficulty}`}
                      style={{ 
                        width: isVisible ? `${item.pendingRate}%` : "0%", 
                        left: isVisible ? `${item.completionRate}%` : "0%",
                        opacity: isVisible ? 1 : 0
                      }}
                    />
                  </div>
                  {item.total > 0 && item.historicalCount > 0 && <small className="landscape-history-caption">{item.historicalCount} completed tasks also saved in history</small>}
                </div>
              ))}
            </div>
          </div>

          <div className="landscape-side">
            <div className="landscape-panel">
              <span className="panel-label">{focusLeader ? 'Top priority' : 'Study progress'}</span>
              <strong>{focusLeader?.subject || (hasActiveSchedule ? 'Schedule completed' : hasHistory ? 'Completed previously' : 'Ready for a new plan')}</strong>
              <p>
                {focusLeader && focusLeader.pending > 0
                  ? `${focusLeader.pending} ${focusLeader.pending === 1 ? 'task remains' : 'tasks remain'} in your current schedule for this subject.`
                  : hasHistory ? 'Your previous completed tasks are available in View history.' : hasActiveSchedule ? 'Every scheduled task has been completed.' : 'Create a schedule to see current study priorities.'}
              </p>
            </div>

            <div className="landscape-panel">
              <span className="panel-label">Difficulty balance</span>
              <div className="landscape-legend">
                <span><i className="legend-dot easy" /> Easy</span>
                <span><i className="legend-dot medium" /> Medium</span>
                <span><i className="legend-dot hard" /> Hard</span>
              </div>
              <p>
                Filled regions show completed tasks. Translucent regions show pending tasks in the active schedule. Historical work is labelled separately.
              </p>
            </div>
          </div>
        </div>
      )}

      {historyOpen && <PlannerHistoryDialog academicProfileDataId={academicProfileDataId} entries={currentRecord ? [currentRecord, ...savedHistory] : savedHistory} notebooks={notebooks} notebooksLoading={notebooksLoading} notebooksError={notebooksError} onRetryNotebooks={onRetryNotebooks} onClose={() => setHistoryOpen(false)} />}

      {tooltipInfo && createPortal(
        <div 
          className="custom-bar-tooltip" 
          style={{ left: tooltipInfo.x, top: tooltipInfo.y }}
        >
          <strong>{tooltipInfo.item.subject}</strong>
          <div className="tooltip-metrics">
            <span><i className={`dot ${tooltipInfo.item.difficulty}`}></i> Difficulty: {tooltipInfo.item.difficulty}</span>
            <span>Completed: {tooltipInfo.item.total ? tooltipInfo.item.done : tooltipInfo.item.historicalCount}</span>
            <span>{tooltipInfo.item.total ? `Pending: ${tooltipInfo.item.pending}` : tooltipInfo.item.historicalCount ? 'Saved history · no active schedule' : 'No active schedule'}</span>
            {tooltipInfo.item.total > 0 && <span>Schedule completion: {tooltipInfo.item.completionRate}%</span>}
          </div>
        </div>,
        document.body
      )}
    </section>
  );
}

export default FocusLandscape;
