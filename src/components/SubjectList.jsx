import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "../utils/toast";
import {
  CalendarClock,
  Check,
  ChevronRight,
  Edit2,
  ListChecks,
  Target,
  Trash2,
  X,
} from "lucide-react";
import GoalTracker from "./GoalTracker";
import SubjectPlanDialog from "./SubjectPlanDialog";
import { normalizeStudyPreferences, normalizeSubjectTopics } from "../utils/subjectPlanning";
import "./SubjectList.css";

const GOAL_TRACKER_EXIT_MS = 180;

function SubjectList({
  academicProfile = {},
  completed = [],
  hasActiveSchedule = false,
  kidsMode = false,
  schedule = [],
  setSubjects,
  subjects,
  userProfile = {},
}) {
  const navigate = useNavigate();
  const [editIndex, setEditIndex] = useState(null);
  const [goalPopupOpen, setGoalPopupOpen] = useState(false);
  const [goalPopupClosing, setGoalPopupClosing] = useState(false);
  const [deleteConfirmIndex, setDeleteConfirmIndex] = useState(null);
  const [configureIndex, setConfigureIndex] = useState(null);
  const [editData, setEditData] = useState({
    name: "",
    chapters: "",
    difficulty: "",
  });
  const confirmRef = useRef(null);
  const goalPopupCloseTimerRef = useRef(null);
  const trackGoalsButtonRef = useRef(null);
  const location = useLocation();

  const openGoalPopup = useCallback(() => {
    if (goalPopupCloseTimerRef.current) {
      window.clearTimeout(goalPopupCloseTimerRef.current);
      goalPopupCloseTimerRef.current = null;
    }
    setGoalPopupClosing(false);
    setGoalPopupOpen(true);
  }, []);

  const closeGoalPopup = useCallback((reason = "dismiss") => {
    if (goalPopupCloseTimerRef.current) return;

    setGoalPopupClosing(true);
    goalPopupCloseTimerRef.current = window.setTimeout(() => {
      goalPopupCloseTimerRef.current = null;
      setGoalPopupOpen(false);
      setGoalPopupClosing(false);

      if (reason !== "outside") {
        trackGoalsButtonRef.current?.focus({ preventScroll: true });
      }
    }, GOAL_TRACKER_EXIT_MS);
  }, []);

  const toggleGoalPopup = () => {
    if (goalPopupOpen && !goalPopupClosing) {
      closeGoalPopup("toggle");
      return;
    }
    openGoalPopup();
  };

  useEffect(() => () => {
    if (goalPopupCloseTimerRef.current) {
      window.clearTimeout(goalPopupCloseTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (location.hash === "#subject-library") {
      const timer = setTimeout(() => {
        const el = document.getElementById("subject-library");
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
          el.classList.add("highlight-pulse");
          setTimeout(() => el.classList.remove("highlight-pulse"), 1000);
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [location.hash]);

  useEffect(() => {
    if (deleteConfirmIndex === null) return undefined;

    const handlePointerDown = (event) => {
      if (confirmRef.current && !confirmRef.current.contains(event.target)) {
        setDeleteConfirmIndex(null);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") setDeleteConfirmIndex(null);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [deleteConfirmIndex]);

  const deleteSubject = (index) => {
    setSubjects(subjects.filter((_, itemIndex) => itemIndex !== index));
    if (configureIndex === index) setConfigureIndex(null);
    setDeleteConfirmIndex(null);
    toast.success("Subject deleted.", {
      toastId: "subject-deleted",
    });
  };

  const startEdit = (index) => {
    setConfigureIndex(null);
    setEditIndex(index);
    setEditData({ ...subjects[index] });
  };

  const saveEdit = () => {
    if (!editData.name.trim() || Number(editData.chapters) < 1) return;

    const updated = [...subjects];
    updated[editIndex] = {
      ...editData,
      name: editData.name.trim(),
      chapters: Number(editData.chapters),
    };

    setSubjects(updated);
    setEditIndex(null);
    toast.success("Subject updated.", {
      toastId: "subject-updated",
    });
  };

  const saveConfiguration = (nextSubject) => {
    if (configureIndex === null) return;
    const updated = [...subjects];
    updated[configureIndex] = nextSubject;
    setSubjects(updated, { preserveSchedule: true });
    toast.success(
      hasActiveSchedule
        ? "Subject plan saved. Current timetable updated."
        : "Subject plan saved.",
      { toastId: "subject-plan-saved" },
    );
  };

  return (
    <section className="card subject-library-card" id="subject-library">
      <div
        className="subject-library-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "1.5rem",
          position: "relative",
          zIndex: 1300,
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>Subject library</h2>
          <p className="card-subtext" style={{ marginTop: "0.5rem", marginBottom: 0 }}>
            Select a subject to add optional topics and shape how it appears in your study schedule.
          </p>
        </div>
        <div className="subject-library-actions" style={{ display: "flex", gap: "10px", alignItems: "center", position: "relative", zIndex: 1300 }}>
          {subjects.length > 0 && (
            <button
              aria-controls="subject-goal-tracker"
              aria-expanded={goalPopupOpen && !goalPopupClosing}
              aria-haspopup="dialog"
              className="primary-btn track-goals-btn"
              onClick={toggleGoalPopup}
              ref={trackGoalsButtonRef}
              type="button"
            >
              <Target aria-hidden="true" size={15} />
              Track goals
            </button>
          )}
          <button
            className="primary-btn"
            onClick={() => navigate(kidsMode ? "/planner" : "/resources")}
            type="button"
          >
            {kidsMode ? "Open planner" : "Open materials"}
          </button>

          {goalPopupOpen && subjects.length > 0 && (
            <GoalTracker
              anchorRef={trackGoalsButtonRef}
              closing={goalPopupClosing}
              completed={completed}
              onClose={closeGoalPopup}
              schedule={schedule}
              subjects={subjects}
              userProfile={userProfile}
            />
          )}
        </div>
      </div>

      {subjects.length === 0 ? (
        <p className="empty-state">No subjects added yet.</p>
      ) : (
        <div
          className="subjects-scroll-container"
          style={
            subjects.length > 4
              ? {
                  maxHeight: "395px",
                  overflowY: "auto",
                  paddingRight: "8px",
                }
              : {}
          }
        >
          {subjects.map((subject, index) => {
            const topicCount = normalizeSubjectTopics(subject.topics).length;
            const preferences = normalizeStudyPreferences(subject.studyPreferences);

            return (
              <div className="subject-row" key={`${subject.name}-${index}`}>
                {editIndex === index ? (
                  <div className="edit-row">
                    <input
                      aria-label="Subject name"
                      onChange={(event) =>
                        setEditData({ ...editData, name: event.target.value })
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") saveEdit();
                      }}
                      value={editData.name}
                    />

                    <input
                      aria-label="Total chapters"
                      min="1"
                      onChange={(event) =>
                        setEditData({ ...editData, chapters: event.target.value })
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") saveEdit();
                      }}
                      type="number"
                      value={editData.chapters}
                    />

                    <select
                      aria-label="Subject difficulty"
                      onChange={(event) =>
                        setEditData({ ...editData, difficulty: event.target.value })
                      }
                      value={editData.difficulty}
                    >
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>

                    <button onClick={saveEdit} type="button">
                      Save
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      aria-haspopup="dialog"
                      aria-label={`Configure study plan for ${subject.name}`}
                      className="subject-card-open"
                      onClick={() => setConfigureIndex(index)}
                      type="button"
                    >
                      <span className="subject-left">
                        <span className="subject-name">{subject.name}</span>
                        <span className="subject-meta-row">
                          <span className="chapter-count">{subject.chapters} chapters</span>
                          <span className={`difficulty-badge ${subject.difficulty}`}>
                            {subject.difficulty}
                          </span>
                          <span className="subject-plan-mini-chip">
                            <ListChecks aria-hidden="true" size={13} />
                            {topicCount ? `${topicCount} ${topicCount === 1 ? "topic" : "topics"}` : "Auto topics"}
                          </span>
                          <span className="subject-plan-mini-chip">
                            <CalendarClock aria-hidden="true" size={13} />
                            {preferences.sessionsPerWeek}/week
                          </span>
                        </span>
                      </span>
                      <span className="subject-config-cue" aria-hidden="true">
                        <span>Configure</span>
                        <ChevronRight size={17} />
                      </span>
                    </button>

                    <div className="subject-right">
                      <button
                        aria-label={`Edit ${subject.name}`}
                        className="icon-action-btn"
                        onClick={() => startEdit(index)}
                        title="Edit"
                        type="button"
                      >
                        <Edit2 size={16} />
                      </button>

                      {deleteConfirmIndex === index ? (
                        <div
                          aria-label={`Confirm deleting ${subject.name}`}
                          className="subject-delete-confirm"
                          ref={confirmRef}
                          role="group"
                        >
                          <button
                            aria-label={`Confirm delete ${subject.name}`}
                            className="icon-action-btn danger"
                            onClick={() => deleteSubject(index)}
                            title="Confirm delete"
                            type="button"
                          >
                            <Check size={16} strokeWidth={3} />
                          </button>
                          <button
                            aria-label={`Cancel deleting ${subject.name}`}
                            className="icon-action-btn"
                            onClick={() => setDeleteConfirmIndex(null)}
                            title="Cancel delete"
                            type="button"
                          >
                            <X size={16} strokeWidth={3} />
                          </button>
                        </div>
                      ) : (
                        <button
                          aria-label={`Delete ${subject.name}`}
                          className="icon-action-btn danger"
                          onClick={() => setDeleteConfirmIndex(index)}
                          title="Delete"
                          type="button"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {configureIndex !== null && subjects[configureIndex] && (
        <SubjectPlanDialog
          academicProfile={academicProfile}
          hasActiveSchedule={hasActiveSchedule}
          onClose={() => setConfigureIndex(null)}
          onOpenPlanner={() => navigate("/planner")}
          onSave={saveConfiguration}
          subject={subjects[configureIndex]}
        />
      )}
    </section>
  );
}

export default SubjectList;
