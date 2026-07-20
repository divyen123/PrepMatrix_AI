import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import {
  CalendarClock,
  Check,
  ChevronRight,
  Edit2,
  ListChecks,
  Trash2,
  X,
} from "lucide-react";
import SubjectPlanDialog from "./SubjectPlanDialog";
import { normalizeStudyPreferences, normalizeSubjectTopics } from "../utils/subjectPlanning";
import "./SubjectList.css";

function SubjectList({ hasActiveSchedule = false, subjects, setSubjects }) {
  const navigate = useNavigate();
  const [editIndex, setEditIndex] = useState(null);
  const [deleteConfirmIndex, setDeleteConfirmIndex] = useState(null);
  const [configureIndex, setConfigureIndex] = useState(null);
  const [editData, setEditData] = useState({
    name: "",
    chapters: "",
    difficulty: "",
  });
  const confirmRef = useRef(null);

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
        ? "Subject plan saved. Generate a new timetable when you are ready to apply it."
        : "Subject plan saved.",
      { toastId: "subject-plan-saved" },
    );
  };

  return (
    <section className="card subject-library-card">
      <h2>Subject library</h2>
      <p className="card-subtext">
        Select a subject to add optional topics and shape how it appears in your study schedule.
      </p>

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
