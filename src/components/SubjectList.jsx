import { useEffect, useState, useRef } from "react";
import { toast } from "react-toastify";
import { Edit2, Trash2 } from "lucide-react";

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
    <section className="card" style={{ overflow: "visible" }}>
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

                    <div className="subject-right" style={{ position: "relative" }}>
                      <button
                        aria-label={`Edit ${subject.name}`}
                        className="icon-action-btn"
                        onClick={() => startEdit(index)}
                        title="Edit"
                        type="button"
                      >
                        <Edit2 size={16} />
                      </button>

                      <div style={{ position: "relative", display: "inline-block" }}>
                        <button
                          aria-label={`Delete ${subject.name}`}
                          className="icon-action-btn danger"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirmIndex(deleteConfirmIndex === index ? null : index);
                          }}
                          onPointerDown={(e) => e.stopPropagation()}
                          title="Delete"
                          type="button"
                        >
                          <Trash2 size={16} />
                        </button>

                        {deleteConfirmIndex === index && (
                          <div
                            ref={confirmRef}
                            style={{
                              position: "absolute",
                              bottom: index === 0 ? "unset" : "calc(100% + 8px)",
                              top: index === 0 ? "calc(100% + 8px)" : "unset",
                              right: "0",
                              width: "260px",
                              padding: "12px",
                              background: "var(--surface)",
                              backdropFilter: "blur(28px)",
                              border: "1px solid rgba(239, 68, 68, 0.45)",
                              borderRadius: "12px",
                              boxShadow: "0 10px 30px rgba(0, 0, 0, 0.25), inset 0 1px 1px rgba(255, 255, 255, 0.15)",
                              zIndex: 50,
                              display: "flex",
                              flexDirection: "column",
                              gap: "8px"
                            }}
                          >
                            <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                              <Trash2 size={16} style={{ color: "#ef4444", marginTop: "2px", flexShrink: 0 }} />
                              <div>
                                <strong style={{ fontSize: "0.88rem", color: "var(--text-strong)", display: "block", marginBottom: "2px", textAlign: "left" }}>Delete Subject?</strong>
                                <p className="card-subtext" style={{ margin: 0, fontSize: "0.78rem", lineHeight: "1.3", textAlign: "left", color: "var(--text-muted)" }}>
                                  Delete this subject from the planner? This action cannot be undone.
                                </p>
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end", marginTop: "2px" }}>
                              <button
                                className="secondary-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteConfirmIndex(null);
                                }}
                                onPointerDown={(e) => e.stopPropagation()}
                                style={{ padding: "4px 8px", fontSize: "0.78rem", minHeight: "unset", height: "auto" }}
                                type="button"
                              >
                                Cancel
                              </button>
                              <button
                                className="confirm-danger-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteSubject(index);
                                }}
                                onPointerDown={(e) => e.stopPropagation()}
                                style={{
                                  padding: "4px 8px", fontSize: "0.78rem", minHeight: "unset", height: "auto",
                                  background: "rgba(239, 68, 68, 0.15)", color: "#ef4444",
                                  border: "1px solid rgba(239, 68, 68, 0.4)", fontWeight: 600
                                }}
                                type="button"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
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
