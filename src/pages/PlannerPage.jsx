import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import {
  ArrowLeft,
  BrainCircuit,
  CalendarDays,
  ChevronRight,
  Network,
} from "lucide-react";
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
import { mergeMemoryReviewSchedule } from "../utils/learningMemoryReviewExperience.js";
import { subscribeToLocalDateChanges } from "../utils/localDateRefresh.js";
import "./PlannerPage.css";

const PLANNER_DESTINATIONS = [
  {
    id: "schedule",
    path: "/planner/schedule",
    eyebrow: "Plan and recover",
    title: "Planner",
    description: "Build, rebalance, export, and recover your focused study schedule.",
    helper: "Schedule workspace",
    icon: CalendarDays,
  },
  {
    id: "worktree",
    path: "/planner/worktree",
    eyebrow: "Map your thinking",
    title: "Worktree",
    description: "Arrange concepts as a visual map and keep complex topics connected.",
    helper: "Visual workspace",
    icon: Network,
  },
  {
    id: "recall",
    path: "/planner/recall",
    eyebrow: "Strengthen memory",
    title: "Recall session",
    description: "Run short active-recall checks before a concept reaches its forgetting point.",
    helper: "Three-minute checks",
    icon: BrainCircuit,
  },
];

const PLANNER_SUBPAGE_COPY = {
  schedule: {
    tag: "Schedule",
    title: "Generate, adjust, and recover your schedule",
    description: "Keep every study block, recovery action, and reminder in one focused view.",
  },
  worktree: {
    tag: "Worktree",
    title: "Build a visual map of your learning",
    description: "Connect ideas, arrange branches, and return to saved study maps.",
  },
  recall: {
    tag: "Recall session",
    title: "Recall what matters before it fades",
    description: "",
  },
};

function resolvePlannerView(pathname) {
  const normalizedPath = String(pathname || "").replace(/\/+$/u, "") || "/planner";
  if (normalizedPath === "/planner") return "hub";
  const destination = PLANNER_DESTINATIONS.find((item) => item.path === normalizedPath);
  return destination?.id || "";
}

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
  const location = useLocation();
  const plannerView = resolvePlannerView(location.pathname);
  const [showPermissionBanner, setShowPermissionBanner] = useState(() => {
    return isPushNotificationSupported() && localStorage.getItem("prepmatrix_notifications_enabled") !== "true";
  });
  const [enablingReminders, setEnablingReminders] = useState(false);
  const [memoryNotebooks, setMemoryNotebooks] = useState([]);
  const [memoryNotebooksLoading, setMemoryNotebooksLoading] = useState(() => !kidsMode);
  const [memoryNotebooksError, setMemoryNotebooksError] = useState("");
  const [today, setToday] = useState(() => new Date());

  useEffect(() => subscribeToLocalDateChanges(setToday), []);

  useEffect(() => {
    if (kidsMode) {
      setMemoryNotebooksLoading(false);
      setMemoryNotebooksError("");
      setMemoryNotebooks([]);
      return undefined;
    }
    let active = true;
    setMemoryNotebooksLoading(true);
    setMemoryNotebooksError("");
    api.get("/api/learning-notebooks")
      .then((payload) => {
        if (active) setMemoryNotebooks(Array.isArray(payload?.notebooks) ? payload.notebooks : []);
      })
      .catch(() => {
        if (active) {
          setMemoryNotebooks([]);
          setMemoryNotebooksError("Memory checks could not be loaded. Please try again shortly.");
        }
      })
      .finally(() => {
        if (active) setMemoryNotebooksLoading(false);
      });
    return () => {
      active = false;
    };
  }, [kidsMode]);

  useEffect(() => {
    if (kidsMode || memoryNotebooksLoading || typeof setSchedule !== "function") return;
    setSchedule((currentSchedule) => mergeMemoryReviewSchedule(currentSchedule, {
      notebooks: memoryNotebooks,
      scheduleStartDate,
      completed,
      today,
      maxDaily: 3,
    }));
  }, [completed, kidsMode, memoryNotebooks, memoryNotebooksLoading, scheduleStartDate, setSchedule, today]);

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

  if (!plannerView || (kidsMode && plannerView === "recall")) {
    return <Navigate replace to="/planner" />;
  }

  const subpageCopy = PLANNER_SUBPAGE_COPY[plannerView];
  const visibleDestinations = kidsMode
    ? PLANNER_DESTINATIONS.filter((destination) => destination.id !== "recall")
    : PLANNER_DESTINATIONS;

  return (
    <section className={`page-stack planner-route-page${kidsMode ? " is-kids-planner" : ""}`}>
      {plannerView === "hub" ? (
        <>
          <div className="section-intro planner-hub-intro">
            <span className="section-tag">{kidsMode ? "My learning spaces" : "Planner"}</span>
            <h2>{kidsMode ? "Choose what you want to work on" : "Choose your planning workspace"}</h2>
          </div>

          <nav aria-label="Planner workspaces" className="planner-hub-grid">
            {visibleDestinations.map((destination) => {
              const DestinationIcon = destination.icon;
              return (
                <Link
                  aria-label={`Open ${destination.title}`}
                  className={`planner-hub-card is-${destination.id}`}
                  key={destination.id}
                  to={destination.path}
                >
                  <span className="planner-hub-card-icon" aria-hidden="true">
                    <DestinationIcon size={23} strokeWidth={1.9} />
                  </span>
                  <span className="planner-hub-card-copy">
                    <span className="planner-hub-card-eyebrow">{destination.eyebrow}</span>
                    <strong>{destination.title}</strong>
                    <span>{destination.description}</span>
                  </span>
                  <span className="planner-hub-card-footer">
                    <span>{destination.helper}</span>
                    <ChevronRight aria-hidden="true" size={18} />
                  </span>
                </Link>
              );
            })}
          </nav>
        </>
      ) : (
        <>
          <header className="planner-subpage-header">
            <Link
              aria-label="Back to Planner workspaces"
              className="planner-subpage-back page-back-control"
              title="Back to Planner workspaces"
              to="/planner"
            >
              <ArrowLeft aria-hidden="true" size={19} />
            </Link>
            <div className="section-intro">
              <span className="section-tag">{subpageCopy.tag}</span>
              <h2>{kidsMode && plannerView === "schedule"
                ? "See today's learning path and mark each win"
                : subpageCopy.title}</h2>
              {subpageCopy.description && <p>{subpageCopy.description}</p>}
            </div>
          </header>

          <div className={`planner-subpage-content is-${plannerView}`}>
            {plannerView === "schedule" && (
              <>
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
                        disabled={enablingReminders}
                        onClick={handleEnableReminders}
                        style={{ padding: "6px 14px", fontSize: "0.78rem", minHeight: "30px", height: "30px" }}
                        type="button"
                      >
                        {enablingReminders ? "Enabling..." : "Enable"}
                      </button>
                      <button
                        className="secondary-btn"
                        onClick={() => setShowPermissionBanner(false)}
                        style={{ padding: "6px 14px", fontSize: "0.78rem", minHeight: "30px", height: "30px" }}
                        type="button"
                      >
                        Dismiss
                      </button>
                    </div>
                  </article>
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
                    state: { parentAccess: "planner", returnTo: "/planner/schedule" },
                  })}
                  schedule={schedule}
                  scheduleStartDate={scheduleStartDate}
                  setCompleted={setCompleted}
                  setSchedule={setSchedule}
                  subjects={subjects}
                  setScheduleStartDate={setScheduleStartDate}
                />
              </>
            )}

            {plannerView === "worktree" && (
              <WorktreeMapper
                academicProfile={academicProfile}
                key={academicProfileDataId || "default-academic-profile"}
                variant={kidsMode ? "kids" : "default"}
              />
            )}

            {plannerView === "recall" && (
              <PredictiveMemoryReview
                completed={completed}
                loadError={memoryNotebooksError}
                loading={memoryNotebooksLoading}
                notebooks={memoryNotebooks}
                onNotebookUpdated={handleMemoryNotebookUpdated}
                schedule={schedule}
                scheduleStartDate={scheduleStartDate}
                setCompleted={setCompleted}
                setSchedule={setSchedule}
                standalone
              />
            )}
          </div>
        </>
      )}
    </section>
  );
}

export default PlannerPage;
