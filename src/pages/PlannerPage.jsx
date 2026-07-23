import { useState } from "react";
import { toast } from "react-toastify";
import {
  enableStudyReminders,
  getPushNotificationErrorMessage,
  isPushNotificationSupported,
} from "../utils/pushNotifications";
import Reminder from "../components/Reminder";
import SmartSuggestion from "../components/SmartSuggestion";
import Timetable from "../components/Timetable";
import WorktreeMapper from "../components/WorktreeMapper";

function PlannerPage({ subjects, schedule, setSchedule, completed, setCompleted, scheduleStartDate, setScheduleStartDate }) {
  const [showPermissionBanner, setShowPermissionBanner] = useState(() => {
    return isPushNotificationSupported() && localStorage.getItem("prepmatrix_notifications_enabled") !== "true";
  });
  const [enablingReminders, setEnablingReminders] = useState(false);

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
    <section className="page-stack planner-route-page">
      <div className="section-intro">
        <span className="section-tag">Planner</span>
        <h2>Generate, adjust, and recover your schedule</h2>
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

      <div className="planner-support-strip">
        <SmartSuggestion completed={completed} schedule={schedule} />
        <Reminder completed={completed} schedule={schedule} />
      </div>

      <Timetable
        completed={completed}
        schedule={schedule}
        scheduleStartDate={scheduleStartDate}
        setCompleted={setCompleted}
        setSchedule={setSchedule}
        subjects={subjects}
        setScheduleStartDate={setScheduleStartDate}
      />

      <WorktreeMapper />
    </section>
  );
}

export default PlannerPage;

