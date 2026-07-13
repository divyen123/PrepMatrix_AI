import { useEffect, useState, useRef } from "react";
import { toast } from "react-toastify";
import { Check, Edit2, Trash2, X } from "lucide-react";

function SubjectList({ subjects, setSubjects }) {
  const [editIndex, setEditIndex] = useState(null);
  const [deleteConfirmIndex, setDeleteConfirmIndex] = useState(null);
  const [editData, setEditData] = useState({
    name: "",
    chapters: "",
    difficulty: "",
  });
  const confirmRef = useRef(null);

  useEffect(() => {
    if (deleteConfirmIndex === null) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (confirmRef.current && !confirmRef.current.contains(event.target)) {
        setDeleteConfirmIndex(null);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setDeleteConfirmIndex(null);
      }
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
    setDeleteConfirmIndex(null);
    toast.success("Subject deleted.", {
      toastId: "subject-deleted",
    });
  };

  const startEdit = (index) => {
    setEditIndex(index);
    setEditData({ ...subjects[index] });
  };

  const saveEdit = () => {
    if (!editData.name.trim() || !editData.chapters) {
      return;
    }

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

  return (
    <section className="card">
      <h2>Subject library</h2>
      <p className="card-subtext">
        Review, edit, or remove the subjects feeding the study schedule.
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
            return (
              <div className="subject-row" key={`${subject.name}-${index}`}>
                {editIndex === index ? (
                  <div className="edit-row">
                    <input
                      onChange={(event) =>
                        setEditData({ ...editData, name: event.target.value })
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") saveEdit();
                      }}
                      value={editData.name}
                    />

                    <input
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
                    <div className="subject-left">
                      <span className="subject-name">{subject.name}</span>
                      <div className="subject-meta-row">
                        <span className="chapter-count">{subject.chapters} chapters</span>
                        <span className={`difficulty-badge ${subject.difficulty}`}>
                          {subject.difficulty}
                        </span>
                      </div>
                    </div>

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
                        <div aria-label={`Confirm deleting ${subject.name}`} className="subject-delete-confirm" ref={confirmRef} role="group">
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
    </section>
  );
}

export default SubjectList;
