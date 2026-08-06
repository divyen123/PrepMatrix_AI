import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { getPlannerMetrics } from "../utils/plannerMetrics";

function FocusLandscape({ subjects = [], schedule = [], completed = [] }) {
  const [isVisible, setIsVisible] = useState(false);
  const [tooltipInfo, setTooltipInfo] = useState(null);
  const observer = useRef(null);

  const setObserverTarget = useCallback((node) => {
    if (observer.current) observer.current.disconnect();
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

  const metrics = getPlannerMetrics(schedule, completed);

  const chartData = subjects.map((subject) => {
    const stats = metrics.subjectStats[subject.name] || {
      done: 0,
      pending: 0,
      total: 0,
    };
    const totalChapters = Math.max(subject.chapters, stats.total, 1);
    const completionRate = Math.round((stats.done / totalChapters) * 100) || 0;
    const pendingRate = Math.max(0, 100 - completionRate);
    
    return {
      id: subject.id,
      subject: subject.name,
      difficulty: subject.difficulty || "medium",
      done: stats.done,
      pending: stats.pending,
      completionRate,
      pendingRate,
    };
  });

  const sortedData = [...chartData].sort((a, b) => b.pending - a.pending || b.pendingRate - a.pendingRate);
  const focusLeader = sortedData[0];

  return (
    <section className="card landscape-card">
      <div className="landscape-header">
        <div>
          <span className="section-tag">Focus Map</span>
          <h2>Subject landscape</h2>
          <p className="card-subtext">
            Compare subjects by workload and progress. Solid bars show completed chapters,
            while the shaded area shows what's left.
          </p>
        </div>
      </div>

      {chartData.length === 0 ? (
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
                      {item.done}/{item.done + item.pending} ch
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
                </div>
              ))}
            </div>
          </div>

          <div className="landscape-side">
            <div className="landscape-panel">
              <span className="panel-label">Top Priority</span>
              <strong>{focusLeader?.subject || "No subjects yet"}</strong>
              <p>
                {focusLeader && focusLeader.pending > 0
                  ? `${focusLeader.pending} unfinished chapters are sitting in this subject.`
                  : "All caught up or generate a schedule to see priorities."}
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
                Darker filled regions represent completed work, while lighter translucent sections indicate pending chapters.
              </p>
            </div>
          </div>
        </div>
      )}

      {tooltipInfo && createPortal(
        <div 
          className="custom-bar-tooltip" 
          style={{ left: tooltipInfo.x, top: tooltipInfo.y }}
        >
          <strong>{tooltipInfo.item.subject}</strong>
          <div className="tooltip-metrics">
            <span><i className={`dot ${tooltipInfo.item.difficulty}`}></i> Difficulty: {tooltipInfo.item.difficulty}</span>
            <span>✓ Completed: {tooltipInfo.item.done}</span>
            <span>⏱ Pending: {tooltipInfo.item.pending}</span>
            <span>% Coverage: {tooltipInfo.item.completionRate}%</span>
          </div>
        </div>,
        document.body
      )}
    </section>
  );
}

export default FocusLandscape;
