import { useCallback, useEffect, useState } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { Download } from "lucide-react";
import { toast } from "react-toastify";
import successSound from "../assets/success.mp3";
import { generateSchedule } from "../utils/scheduleGenerator";

function Timetable({
  subjects,
  schedule,
  setSchedule,
  completed,
  setCompleted,
  setScheduleStartDate,
}) {
  const [examDate, setExamDate] = useState("");
  const [planMode, setPlanMode] = useState("balanced");
  const [loading, setLoading] = useState(false);
  const [previousSchedule, setPreviousSchedule] = useState(null);
  const [lastAction, setLastAction] = useState(null); // "rebalance" | "backlog"
  const [showGenerateForm, setShowGenerateForm] = useState(schedule.length === 0);

  useEffect(() => {
    if (schedule.length === 0) {
      setShowGenerateForm(true);
    }
  }, [schedule.length]);

  const getBacklogTasks = useCallback(() => {
    const backlog = [];

    schedule.forEach((day) => {
      day.tasks?.forEach((task) => {
        if (!completed.includes(task.task)) {
          backlog.push(task.task);
        }
      });
    });

    return backlog;
  }, [completed, schedule]);

  const generate = useCallback(() => {
    if (!examDate || subjects.length === 0) {
      toast.error("Add at least one subject and select an exam date.", {
        toastId: "planner-missing-inputs",
      });
      return;
    }

    setLoading(true);

    setTimeout(() => {
      const today = new Date();
      const exam = new Date(examDate);
      const diffTime = exam - today;
      let days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (days < 1) {
        setLoading(false);
        toast.error("Choose an exam date in the future.", {
          toastId: "planner-future-date",
        });
        return;
      }

      if (days > 30) {
        toast.info("The planner limits schedules to 30 days for performance.", {
          toastId: "planner-day-limit",
        });
        days = 30;
      }

      const backlog = getBacklogTasks();
      const result = generateSchedule(subjects, days, backlog, { planMode });

      setSchedule(result);
      setScheduleStartDate?.(new Date().toISOString());
      setLoading(false);
      setPreviousSchedule(null);
      setShowGenerateForm(false);
      toast.success("Timetable generated.", {
        toastId: "planner-generated",
      });

      const audio = new Audio(successSound);
      audio.play().catch(() => {});
    }, 450);
  }, [examDate, getBacklogTasks, planMode, setSchedule, subjects]);

  useEffect(() => {
    window.plannerActions = { generate };

    if (window.plannerAutoGenerateRequested) {
      window.plannerAutoGenerateRequested = false;
      window.setTimeout(generate, 350);
    }

    return () => {
      delete window.plannerActions;
    };
  }, [generate]);

  const toggleComplete = (taskName) => {
    const updated = completed.includes(taskName)
      ? completed.filter((task) => task !== taskName)
      : [...completed, taskName];

    setCompleted(updated);
  };

  const downloadPDF = async () => {
    const element = document.getElementById("timetable");
    if (!element) return;

    const originalMaxHeight = element.style.maxHeight;
    const originalOverflowY = element.style.overflowY;
    const originalPaddingRight = element.style.paddingRight;

    element.style.maxHeight = "none";
    element.style.overflowY = "visible";
    element.style.paddingRight = "0";

    try {
      const canvas = await html2canvas(element);
      const imageData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const imageWidth = 190;
      const imageHeight = (canvas.height * imageWidth) / canvas.width;

      pdf.addImage(imageData, "PNG", 10, 10, imageWidth, imageHeight);
      pdf.save("StudyPlan.pdf");
      toast.success("PDF exported.", {
        toastId: "planner-pdf-exported",
      });
    } catch (err) {
      toast.error("Failed to export PDF.");
    } finally {
      element.style.maxHeight = originalMaxHeight;
      element.style.overflowY = originalOverflowY;
      element.style.paddingRight = originalPaddingRight;
    }
  };

  const handleMissedTasks = () => {
    setPreviousSchedule(structuredClone(schedule));
    setLastAction("backlog");
    const updatedSchedule = structuredClone(schedule);

    for (let index = 0; index < updatedSchedule.length - 1; index += 1) {
      const currentDay = updatedSchedule[index];
      const nextDay = updatedSchedule[index + 1];

      if (!currentDay.tasks) continue;

      const completedTasks = [];

      currentDay.tasks.forEach((task) => {
        if (completed.includes(task.task)) {
          completedTasks.push(task);
          return;
        }

        if (!nextDay.tasks) nextDay.tasks = [];

        const alreadyExists = nextDay.tasks.some((nextTask) => nextTask.task === task.task);
        if (!alreadyExists) nextDay.tasks.push(task);
      });

      currentDay.tasks = completedTasks;
    }

    setSchedule(updatedSchedule);
    toast.success("Incomplete tasks moved forward.", {
      toastId: "planner-backlog-recovered",
    });
  };

  const rebalanceSchedule = () => {
    setPreviousSchedule(structuredClone(schedule));
    setLastAction("rebalance");
    const updated = structuredClone(schedule);

    updated.forEach((day) => {
      if (day.tasks?.length > 4) {
        const overflow = day.tasks.slice(4);
        day.tasks = day.tasks.slice(0, 4);
        const nextOpenDay = updated.find((item) => item.tasks.length < 3);
        if (nextOpenDay) nextOpenDay.tasks.push(...overflow);
      }
    });

    setSchedule(updated);
    toast.success("Schedule rebalanced.", {
      toastId: "planner-rebalanced",
    });
  };

  const handleUndo = () => {
    if (previousSchedule) {
      setSchedule(previousSchedule);
      setPreviousSchedule(null);
      setLastAction(null);
      toast.success("Changes undone successfully.", {
        toastId: "planner-undone",
      });
    }
  };

  return (
    <section className="card schedule-card">
      <div className="schedule-card-header">
        <div>
          <h2>Study schedule</h2>
          <p className="card-subtext">
            Generate a focused timetable, export it, and recover backlog when the week changes.
          </p>
        </div>
      </div>

      <div className="timetable-topbar">
        {showGenerateForm ? (
          <>
            <div className="form-grid planner-target-grid">
              <label className="field-stack compact-field">
                Exam date
                <input onChange={(event) => setExamDate(event.target.value)} type="date" value={examDate} />
              </label>

              <label className="field-stack compact-field">
                Exam strategy
                <select onChange={(event) => setPlanMode(event.target.value)} value={planMode}>
                  <option value="balanced">Balanced coverage</option>
                  <option value="high-priority">High priority first</option>
                  <option value="revision-heavy">Revision-heavy</option>
                  <option value="rapid">Rapid coverage</option>
                </select>
              </label>
            </div>

            <div className="timetable-actions">
              <button className="action-btn" disabled={loading} onClick={generate} type="button">
                {loading ? (
                  <span className="spinner" />
                ) : (
                  <>
                    <span className="desktop-only-text">Generate schedule</span>
                    <span className="mobile-only-text">Generate</span>
                  </>
                )}
              </button>
              {schedule.length > 0 && (
                <button
                  className="secondary-btn action-btn"
                  onClick={() => setShowGenerateForm(false)}
                  type="button"
                >
                  Cancel
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="timetable-actions">
            <button className="secondary-btn action-btn" onClick={downloadPDF} type="button" title="Export PDF" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
              <Download size={14} />
              <span>Export</span>
            </button>
            <button className="secondary-btn action-btn" onClick={rebalanceSchedule} type="button">
              Rebalance
            </button>
            {previousSchedule && lastAction === "rebalance" && (
              <button className="secondary-btn action-btn undo-btn" onClick={handleUndo} type="button" title="Undo rebalance">
                ↩ Undo
              </button>
            )}
            <button className="secondary-btn action-btn" onClick={handleMissedTasks} type="button">
              <span className="desktop-only-text">Recover backlog</span>
              <span className="mobile-only-text">Recover</span>
            </button>
            {previousSchedule && lastAction === "backlog" && (
              <button className="secondary-btn action-btn undo-btn" onClick={handleUndo} type="button" title="Undo backlog recovery">
                ↩ Undo
              </button>
            )}
            <button className="action-btn new-schedule-btn" onClick={() => setShowGenerateForm(true)} type="button">
              <span className="desktop-only-text">New schedule</span>
              <span className="mobile-only-text">New schedule</span>
            </button>
          </div>
        )}
      </div>

      <div
        className="timetable"
        id="timetable"
        style={
          schedule.length > 8
            ? {
                maxHeight: "830px",
                overflowY: "auto",
                paddingRight: "8px",
              }
            : {}
        }
      >
        {schedule.length === 0 ? (
          <p className="empty-state">No timetable generated yet.</p>
        ) : (
          schedule.map((item) => (
            <div className="day-card" key={item.day}>
              <div className="day-title">Day {item.day}</div>
              {item.tasks?.length === 0 ? (
                <div className="task-chip revision">Revision block</div>
              ) : (
                item.tasks.map((task, index) => (
                  <div className="task-row" key={`${task.task}-${index}`}>
                    <input
                      aria-label={`Mark ${task.task} complete`}
                      checked={completed.includes(task.task)}
                      onChange={() => toggleComplete(task.task)}
                      type="checkbox"
                    />
                    <span className="time-slot">{task.time}</span>
                    <span className={completed.includes(task.task) ? "task-chip done" : "task-chip"}>{task.task}</span>
                  </div>
                ))
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export default Timetable;
