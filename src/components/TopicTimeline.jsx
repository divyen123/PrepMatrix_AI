import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getPlannerMetrics } from "../utils/plannerMetrics";
import SubjectProgressModal from "./SubjectProgressModal";

function getSubjectProgress(subjects, schedule, completed) {
  const completedSet = new Set(completed);

  return subjects.map((subject) => {
    const subjectTasks = schedule.flatMap((day) =>
      day.tasks.filter((task) => task.task.startsWith(`${subject.name} -`))
    );
    const done = subjectTasks.filter((task) => completedSet.has(task.task)).length;
    const total = subjectTasks.length || subject.chapters;
    const percent = total ? Math.round((done / total) * 100) : 0;

    return {
      ...subject,
      done,
      total,
      percent,
    };
  });
}

function TopicTimeline({ subjects, schedule, completed }) {
  const laneRef = useRef(null);
  const dragStateRef = useRef({ dragging: false, pointerId: null, startX: 0, scrollLeft: 0 });
  const preventClickRef = useRef(false);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const metrics = getPlannerMetrics(schedule, completed);
  const progress = getSubjectProgress(subjects, schedule, completed);

  const scrollLane = (direction) => {
    const lane = laneRef.current;
    if (!lane) return;

    const card = lane.querySelector(".topic-lane-card");
    const cardWidth = card?.getBoundingClientRect().width || 280;
    const gap = 18;
    const visibleCards = Math.max(1, Math.floor(lane.clientWidth / (cardWidth + gap)));

    lane.scrollBy({
      left: direction * (cardWidth + gap) * visibleCards,
      behavior: "smooth",
    });
  };

  const startDrag = (event) => {
    const lane = laneRef.current;
    if (!lane) return;

    dragStateRef.current = {
      dragging: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      scrollLeft: lane.scrollLeft,
    };
    lane.classList.add("dragging");
    lane.setPointerCapture?.(event.pointerId);
  };

  const dragLane = (event) => {
    const lane = laneRef.current;
    const dragState = dragStateRef.current;
    if (!lane || !dragState.dragging) return;

    event.preventDefault();
    const distance = event.clientX - dragState.startX;
    if (Math.abs(distance) > 5) {
      preventClickRef.current = true;
    }
    lane.scrollLeft = dragState.scrollLeft - distance;
  };

  const stopDrag = () => {
    const lane = laneRef.current;
    const dragState = dragStateRef.current;
    if (!lane || !dragState.dragging) return;

    lane.classList.remove("dragging");
    if (dragState.pointerId !== null) {
      lane.releasePointerCapture?.(dragState.pointerId);
    }
    dragStateRef.current = { dragging: false, pointerId: null, startX: 0, scrollLeft: 0 };
    
    setTimeout(() => {
      preventClickRef.current = false;
    }, 50);
  };

  return (
    <section className="card topic-timeline-card">
      <div className="timeline-header">
        <div>
          <span className="section-tag">Timeline map</span>
          <h3>Topic progress lanes</h3>
          <p className="card-subtext">
            Each card turns scheduled chapters into a compact topic timeline.
          </p>
        </div>
        <strong>{metrics.completedTasks}/{metrics.totalTasks} done</strong>
      </div>

      {progress.length === 0 ? (
        <p className="card-subtext">Add subjects and generate a timetable to unlock animated topic lanes.</p>
      ) : (
        <div className="topic-carousel-shell">
          <button
            aria-label="Show previous timeline cards"
            className="topic-carousel-arrow left"
            onClick={() => scrollLane(-1)}
            type="button"
          >
            <ChevronLeft aria-hidden="true" size={24} strokeWidth={2.6} />
          </button>

          <div
            className="topic-timeline-grid"
            onPointerCancel={stopDrag}
            onPointerDown={startDrag}
            onPointerLeave={stopDrag}
            onPointerMove={dragLane}
            onPointerUp={stopDrag}
            ref={laneRef}
          >
            {progress.map((subject, index) => (
              <article
                className="topic-lane-card clickable-lane-card"
                key={subject.id}
                style={{ animationDelay: `${index * 70}ms` }}
                onClick={() => {
                  if (preventClickRef.current) return;
                  setSelectedSubject(subject.name);
                }}
              >
                <div className="topic-lane-top">
                  <strong>{subject.name}</strong>
                  <span>{subject.percent}%</span>
                </div>
                <div className="topic-lane-track" aria-hidden="true">
                  <div style={{ width: `${subject.percent}%` }} />
                </div>
                <div className="topic-lane-dots">
                  {Array.from({ length: Math.max(subject.total, 1) }, (_, dotIndex) => (
                    <span
                      className={dotIndex < subject.done ? "done" : ""}
                      key={`${subject.id}-${dotIndex}`}
                      title={`Chapter ${dotIndex + 1}`}
                    />
                  ))}
                </div>
                <p>{subject.done}/{subject.total} chapters complete</p>
              </article>
            ))}
          </div>

          <button
            aria-label="Show next timeline cards"
            className="topic-carousel-arrow right"
            onClick={() => scrollLane(1)}
            type="button"
          >
            <ChevronRight aria-hidden="true" size={24} strokeWidth={2.6} />
          </button>
        </div>
      )}
      
      {selectedSubject && (
        <SubjectProgressModal
          subject={selectedSubject}
          onClose={() => setSelectedSubject(null)}
          schedule={schedule}
          completed={completed}
        />
      )}
    </section>
  );
}

export default TopicTimeline;
