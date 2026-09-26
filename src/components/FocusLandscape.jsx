import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, CheckCircle2, History } from 'lucide-react';
import { createPlannerHistoryEntry, getLandscapeData, normalizePlannerHistory } from '../utils/plannerHistory';
import { normalizeMaterialBookmarks } from '../utils/materialBookmarks';
import { buildSubjectMaterials } from '../utils/materialRecommendations';
import PlannerHistoryDialog from './PlannerHistoryDialog';

const SUBJECT_PIE_COLORS = [
  '#14b8a6',
  '#3b82f6',
  '#8b5cf6',
  '#f59e0b',
  '#ec4899',
  '#22c55e',
  '#f97316',
  '#06b6d4',
];
const SUBJECT_PIE_CENTER = 160;
const SUBJECT_PIE_RADIUS = 112;
const SUBJECT_PIE_CIRCUMFERENCE = 2 * Math.PI * SUBJECT_PIE_RADIUS;

function FocusLandscape({ academicProfileDataId = '', subjects = [], schedule = [], completed = [], history = [], scheduleStartDate = '', materialBookmarks = [], userProfile = {}, notebooks = [], notebooksLoading, notebooksError, onRetryNotebooks }) {
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
  const pieData = useMemo(() => {
    const activeItems = sortedData
      .filter((item) => Number(item.total) > 0)
      .map((item) => ({ ...item, pieValue: Number(item.total) }));
    const historicalItems = sortedData
      .filter((item) => Number(item.historicalCount) > 0)
      .map((item) => ({ ...item, pieValue: Number(item.historicalCount) }));
    const mode = activeItems.length ? 'active' : historicalItems.length ? 'history' : 'subjects';
    const source = activeItems.length
      ? activeItems
      : historicalItems.length
        ? historicalItems
        : sortedData.map((item) => ({ ...item, pieValue: 1 }));
    const totalValue = source.reduce((sum, item) => sum + item.pieValue, 0);
    const segments = source.reduce((result, item, index) => {
      const segmentLength = totalValue
        ? (item.pieValue / totalValue) * SUBJECT_PIE_CIRCUMFERENCE
        : 0;
      const gap = source.length > 1 ? Math.min(5, segmentLength * 0.16) : 0;
      return {
        offset: result.offset + segmentLength,
        values: [
          ...result.values,
          {
            ...item,
            color: SUBJECT_PIE_COLORS[index % SUBJECT_PIE_COLORS.length],
            dashLength: Math.max(0, segmentLength - gap),
            dashOffset: result.offset,
          },
        ],
      };
    }, { offset: 0, values: [] }).values;

    return { mode, segments };
  }, [sortedData]);
  const activeTaskTotal = sortedData.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
  const activeTaskDone = sortedData.reduce((sum, item) => sum + (Number(item.done) || 0), 0);
  const historicalTaskTotal = sortedData.reduce((sum, item) => sum + (Number(item.historicalCount) || 0), 0);
  const overallCompletionRate = activeTaskTotal
    ? Math.round((activeTaskDone / activeTaskTotal) * 100)
    : 0;
  const pieSummary = pieData.mode === 'active'
    ? { value: `${overallCompletionRate}%`, label: 'overall complete' }
    : pieData.mode === 'history'
      ? { value: historicalTaskTotal, label: 'saved tasks' }
      : { value: sortedData.length, label: sortedData.length === 1 ? 'subject' : 'subjects' };
  const pieDescription = pieData.mode === 'active'
    ? `Subject workload distribution. ${activeTaskDone} of ${activeTaskTotal} scheduled tasks are complete.`
    : pieData.mode === 'history'
      ? `Completed subject history containing ${historicalTaskTotal} saved tasks.`
      : `Subject landscape containing ${sortedData.length} subjects without an active schedule.`;

  const showTooltip = useCallback((event, item) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setTooltipInfo({
      item,
      x: rect.left + rect.width / 2,
      y: rect.top - 10,
    });
  }, []);

  const materialSuggestion = useMemo(() => {
    const target = sortedData.find((item) => item.difficulty === 'hard' && item.pending > 0)
      || sortedData.find((item) => item.completionRate >= 50 && item.pending > 0)
      || focusLeader
      || sortedData[0];
    if (!target) return null;

    const subject = subjects.find((item) => item.name?.toLocaleLowerCase() === target.subject.toLocaleLowerCase())
      || { name: target.subject, chapters: 1 };
    const materials = buildSubjectMaterials(subject, {
      done: Math.min(target.done, Math.max(0, Number(subject.chapters) - 1)),
      pending: target.pending,
      total: target.total,
    }, userProfile.academicLevel, userProfile.academicTrack, userProfile);
    const laneTitle = target.difficulty === 'hard' && target.pending > 0
      ? 'Concept lesson'
      : target.completionRate >= 50 && target.pending > 0
        ? 'Revision recap'
        : target.pending > 0
          ? 'Notes and references'
          : 'Practice set';
    const lane = materials.lanes.find((item) => item.title === laneTitle);
    const bookmark = normalizeMaterialBookmarks(materialBookmarks).find(
      (item) => item.subject.toLocaleLowerCase() === target.subject.toLocaleLowerCase()
    );
    const videoLane = materials.lanes.find((item) => item.provider === 'YouTube');
    const notesLane = materials.lanes.find((item) => item.provider === 'Web notes');
    const searchLane = lane.provider === 'Search'
      ? lane
      : materials.lanes.find((item) => item.title === 'Practice set');
    const links = [
      ...(bookmark ? [{ label: 'Saved', description: `Open saved material for ${target.subject}`, href: bookmark.href }] : []),
      { label: 'YouTube', description: `Find ${target.subject} videos on YouTube`, href: videoLane.href },
      { label: 'Web notes', description: `Find ${target.subject} web notes`, href: notesLane.href },
      { label: 'Search', description: `Search ${target.subject} practice and revision resources`, href: searchLane.href },
    ];
    return {
      subject: target.subject,
      title: bookmark?.title || `${lane.title} · ${target.subject}`,
      details: bookmark
        ? `${target.subject} · ${bookmark.provider || 'Saved material'}`
        : `${target.subject} · ${lane.provider}`,
      links,
    };
  }, [sortedData, focusLeader, subjects, materialBookmarks, userProfile]);

  return (
    <section className="card landscape-card">
      <div className="landscape-header">
        <div>
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
            <div className={`subject-pie-chart${isVisible ? ' is-visible' : ''}`}>
              <div className="subject-pie-visual">
                <svg
                  aria-label={pieDescription}
                  className="subject-pie-svg"
                  role="img"
                  viewBox="0 0 320 320"
                >
                  <circle
                    className="subject-pie-track"
                    cx={SUBJECT_PIE_CENTER}
                    cy={SUBJECT_PIE_CENTER}
                    r={SUBJECT_PIE_RADIUS}
                  />
                  {pieData.segments.map((item, index) => (
                    <circle
                      aria-hidden="true"
                      className="subject-pie-segment"
                      cx={SUBJECT_PIE_CENTER}
                      cy={SUBJECT_PIE_CENTER}
                      key={`${item.subject}-${index}`}
                      onMouseEnter={(event) => showTooltip(event, item)}
                      onMouseLeave={() => setTooltipInfo(null)}
                      r={SUBJECT_PIE_RADIUS}
                      stroke={item.color}
                      strokeDasharray={`${isVisible ? item.dashLength : 0} ${SUBJECT_PIE_CIRCUMFERENCE - (isVisible ? item.dashLength : 0)}`}
                      strokeDashoffset={-item.dashOffset}
                      style={{ '--subject-pie-delay': `${index * 90}ms` }}
                      transform={`rotate(-90 ${SUBJECT_PIE_CENTER} ${SUBJECT_PIE_CENTER})`}
                    />
                  ))}
                </svg>
                <div aria-hidden="true" className="subject-pie-center">
                  <strong>{pieSummary.value}</strong>
                  <span>{pieSummary.label}</span>
                </div>
              </div>

              <ul aria-label="Subject completion legend" className="subject-pie-legend">
                {pieData.segments.map((item, index) => {
                  const detail = pieData.mode === 'active'
                    ? `${item.done}/${item.total} tasks${item.historicalCount ? ` · ${item.historicalCount} saved` : ''}`
                    : pieData.mode === 'history'
                      ? `${item.historicalCount} completed previously`
                      : 'No active schedule';
                  const value = pieData.mode === 'active' ? `${item.completionRate}%` : item.pieValue;

                  return (
                    <li
                      aria-label={`${item.subject}, ${detail}${pieData.mode === 'active' ? `, ${value} complete` : ''}`}
                      key={`${item.subject}-legend-${index}`}
                      style={{ '--subject-pie-color': item.color, '--subject-pie-delay': `${index * 90}ms` }}
                    >
                      <span aria-hidden="true" className="subject-pie-dot" />
                      <span className="subject-pie-legend-copy">
                        <strong>{item.subject}</strong>
                        <small>{detail}</small>
                      </span>
                      <span className="subject-pie-legend-value">{value}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          <div className="landscape-side">
            <div className="landscape-panel">
              <span className="landscape-panel-label">{focusLeader ? 'Top priority' : 'Study progress'}</span>
              <strong>{focusLeader?.subject || (hasActiveSchedule ? 'Schedule completed' : hasHistory ? 'Completed previously' : 'Ready for a new plan')}</strong>
              <p>
                {focusLeader && focusLeader.pending > 0
                  ? `${focusLeader.pending} ${focusLeader.pending === 1 ? 'task remains' : 'tasks remain'} in your current schedule for this subject.`
                  : hasHistory ? 'Your previous completed tasks are available in View history.' : hasActiveSchedule ? 'Every scheduled task has been completed.' : 'Create a schedule to see current study priorities.'}
              </p>
            </div>

            <div className="landscape-panel landscape-panel--suggestion">
              <span className="landscape-panel-label">Suggested material</span>
              <strong>{materialSuggestion.title}</strong>
              <p>{materialSuggestion.details}</p>
              <nav aria-label={`Resources for ${materialSuggestion.subject}`} className="landscape-resource-actions">
                {materialSuggestion.links.map((link) => (
                  <a
                    aria-label={link.description}
                    className="landscape-resource-link"
                    href={link.href}
                    key={link.label}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {link.label} <ArrowUpRight size={13} aria-hidden="true" />
                  </a>
                ))}
              </nav>
            </div>
          </div>
        </div>
      )}

      {historyOpen && <PlannerHistoryDialog academicProfileDataId={academicProfileDataId} entries={currentRecord ? [currentRecord, ...savedHistory] : savedHistory} notebooks={notebooks} notebooksLoading={notebooksLoading} notebooksError={notebooksError} onRetryNotebooks={onRetryNotebooks} onClose={() => setHistoryOpen(false)} />}

      {tooltipInfo && createPortal(
        <div 
          className="custom-bar-tooltip subject-pie-tooltip"
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
