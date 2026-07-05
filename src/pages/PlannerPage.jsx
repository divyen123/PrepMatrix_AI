import { useState } from "react";
import { toast } from "react-toastify";
import Reminder from "../components/Reminder";
import SmartSuggestion from "../components/SmartSuggestion";
import Timetable from "../components/Timetable";
import WorktreeMapper from "../components/WorktreeMapper";

function PlannerPage({ subjects, schedule, setSchedule, completed, setCompleted, scheduleStartDate, setScheduleStartDate }) {
  const [showPermissionBanner, setShowPermissionBanner] = useState(() => {
    return typeof window !== "undefined" && "Notification" in window && Notification.permission === "default";
  });

  const subscribeUserToPush = async () => {
    try {
      const response = await fetch("/api/notifications/vapid-key");
      const { publicKey } = await response.json();
      if (!publicKey) {
        console.warn("No public VAPID key returned from server.");
        return;
      }

      // Convert VAPID key from base64url to Uint8Array
      const padding = "=".repeat((4 - (publicKey.length % 4)) % 4);
      const base64 = (publicKey + padding).replace(/\-/g, "+").replace(/_/g, "/");
      const rawData = window.atob(base64);
      const outputArray = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: outputArray,
      });

      // Send to server
      const timezoneOffset = new Date().getTimezoneOffset(); // e.g. -330 for UTC+5:30
      await fetch("/api/notifications/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription, timezoneOffset }),
      });
      console.log("Successfully subscribed user to Web Push!");
    } catch (err) {
      console.error("Subscription failed:", err);
    }
  };

  return (
    <section className="page-stack planner-route-page">
      <div className="section-intro">
        <span className="section-tag">Planner</span>
        <h2>Generate, adjust, and recover your schedule</h2>
      </div>

      <WorktreeMapper />

      {showPermissionBanner && (
        <article className="card info-card reminders-banner">
          <div style={{ flex: 1 }}>
            <h4 style={{ margin: "0 0 4px", fontSize: "0.95rem" }}>Enable Study Reminders</h4>
            <p className="card-subtext" style={{ margin: 0, fontSize: "0.82rem" }}>
              Get browser notifications at 6:00 PM if you haven't completed any of today's study tasks, even when you're not active.
            </p>
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <button 
              className="action-btn" 
              onClick={async () => {
                const permission = await Notification.requestPermission();
                if (permission === "granted") {
                  await subscribeUserToPush();
                  toast.success("Study reminders enabled!");
                }
                setShowPermissionBanner(false);
              }}
              style={{ padding: "6px 14px", fontSize: "0.78rem", minHeight: "30px", height: "30px" }}
            >
              Enable
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
        setCompleted={setCompleted}
        setSchedule={setSchedule}
        subjects={subjects}
        setScheduleStartDate={setScheduleStartDate}
      />
    </section>
  );
}

export default PlannerPage;
