import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import {
  enableStudyReminders,
  getPushNotificationErrorMessage,
  isPushNotificationSupported,
} from "../utils/pushNotifications";
import Reminder from "../components/Reminder";
import Timetable from "../components/Timetable";
import WorktreeMapper from "../components/WorktreeMapper";
import PredictiveMemoryReview from "../components/PredictiveMemoryReview";
import api from "../utils/apiClient";

function PlannerPage({
  academicProfile = {},
  academicProfileDataId = "",
  subjects,
  schedule,
  setSchedule,
  completed,
  setCompleted,
  scheduleStartDate,
  setScheduleStartDate,
  kidsMode = false,
  parentAccessGranted = true,
}) {
  const navigate = useNavigate();
  const [showPermissionBanner, setShowPermissionBanner] = useState(() => {
    return isPushNotificationSupported() && localStorage.getItem("prepmatrix_notifications_enabled") !== "true";
  });
  const [enablingReminders, setEnablingReminders] = useState(false);
  const [memoryNotebooks, setMemoryNotebooks] = useState([]);

  useEffect(() => {
    if (kidsMode) {
      setMemoryNotebooks([]);
      return undefined;
    }
    let active = true;
    api.get("/api/learning-notebooks")
      .then((payload) => {
        if (active) setMemoryNotebooks(Array.isArray(payload?.notebooks) ? payload.notebooks : []);
      })
      .catch(() => {
        if (active) setMemoryNotebooks([]);
      });
    return () => {
      active = false;
    };
  }, [kidsMode]);

  const handleMemoryNotebookUpdated = useCallback(async (payload) => {
    const notebookId = String(payload?.notebook?.id || payload?.candidate?.notebookId || "").trim();
    const nodeId = String(payload?.nodeId || payload?.candidate?.nodeId || "").trim();
    const clientRecord = payload?.notebook?.memoryDecayState?.records?.[nodeId];
    const quizId = String(payload?.quizId || clientRecord?.lastQuizId || "").trim();
    if (!notebookId || !nodeId || !quizId) {
      throw new Error("This memory review is missing its notebook reference.");
    }

    const response = await api.post(
      `/api/learning-notebooks/${encodeURIComponent(notebookId)}/memory-quizzes/${encodeURIComponent(quizId)}/complete`,
      {
        nodeId,
        score: payload.score,
        confidence: payload.confidence,
        durationMinutes: payload.durationMinutes || 3,
      },
    );
    if (!response?.notebook) throw new Error("The saved memory review could not be reloaded.");
    setMemoryNotebooks((current) => {
      const exists = current.some((notebook) => notebook.id === response.notebook.id);
      return exists
        ? current.map((notebook) => (notebook.id === response.notebook.id ? response.notebook : notebook))
        : [response.notebook, ...current];
    });
    return response.notebook;
  }, []);


  const handleEnableReminders = async () => {
    if (enablingReminders) return;
    setEnablingReminders(true);

    try {
      await enableStudyReminders();
      localStorage.setItem("prepmatrix_notifications_enabled", "true");
      toast.success("Study reminders enabled!");
      setShowPermissionBanner(false);
    } catch (error) {
      console.error("Push notification setup failed:", error);
      localStorage.setItem("prepmatrix_notifications_enabled", "false");
      toast.error(getPushNotificationErrorMessage(error));
    } finally {
      setEnablingReminders(false);
    }
  };

  return (
    <section className={`page-stack planner-route-page${kidsMode ? " is-kids-planner" : ""}`}>
      <div className="section-intro">
        <span className="section-tag">{kidsMode ? "My colorful plan" : "Planner"}</span>
        <h2>{kidsMode ? "See today's learning path and mark each win" : "Generate, adjust, and recover your schedule"}</h2>
      </div>

      {showPermissionBanner && (
        <article className="card info-card reminders-banner">
          <div style={{ flex: 1 }}>
            <h4 style={{ margin: "0 0 4px", fontSize: "0.95rem" }}>Enable Study Reminders</h4>
            <p className="card-subtext" style={{ margin: 0, fontSize: "0.82rem" }}>
              Get each scheduled reminder around its due time, plus a 6:00 PM study check when today's tasks are still waiting.
            </p>
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <button 
              className="action-btn" 
              onClick={handleEnableReminders}
              disabled={enablingReminders}
              style={{ padding: "6px 14px", fontSize: "0.78rem", minHeight: "30px", height: "30px" }}
            >
              {enablingReminders ? "Enabling..." : "Enable"}
            </button>
            <button 
              className="secondary-btn" 
              onClick={() => setShowPermissionBanner(false)}
              style={{ padding: "6px 14px", fontSize: "0.78rem", minHeight: "30px", height: "30px" }}
            >
              Dismiss
            </button>
          </div>
        </article>
      )}

      {!kidsMode && (
        <PredictiveMemoryReview
          completed={completed}
          notebooks={memoryNotebooks}
          onNotebookUpdated={handleMemoryNotebookUpdated}
          schedule={schedule}
          scheduleStartDate={scheduleStartDate}
          setCompleted={setCompleted}
          setSchedule={setSchedule}
        />
      )}

      <div className="planner-support-strip">
        <Reminder completed={completed} schedule={schedule} />
      </div>

      <Timetable
        academicProfile={academicProfile}
        academicProfileDataId={academicProfileDataId}
        canManageSchedule={!kidsMode || parentAccessGranted}
        completed={completed}
        onOpenSubjects={() => navigate("/subjects#subject-library")}
        onRequestParentAccess={() => navigate("/kids", {
          state: { parentAccess: "planner", returnTo: "/planner" },
        })}
        schedule={schedule}
        scheduleStartDate={scheduleStartDate}
        setCompleted={setCompleted}
        setSchedule={setSchedule}
        subjects={subjects}
        setScheduleStartDate={setScheduleStartDate}
      />

      <WorktreeMapper
        academicProfile={academicProfile}
        key={academicProfileDataId || "default-academic-profile"}
        variant={kidsMode ? "kids" : "default"}
      />
    </section>
  );
}

export default PlannerPage;
