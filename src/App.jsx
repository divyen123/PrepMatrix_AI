import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LogOut,
  Moon,
  RotateCcw,
  Sun,
  UserRound,
  LayoutDashboard,
  BookOpen,
  Calendar,
  TrendingUp,
  StickyNote,
  Trophy,
  ClipboardList,
  Library,
  Menu,
  X,
  Settings as SettingsIcon,
  Info
} from "lucide-react";
import { Link, NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import Notification from "./components/Notification";
import Chatbot from "./components/Chatbot";
import VoiceAssistant from "./components/VoiceAssistant";
import VoiceAssistantOverlay from "./components/VoiceAssistantOverlay";
import useVoiceAssistant from "./hooks/useVoiceAssistant";
import api, { HAS_CONFIGURED_API } from "./utils/apiClient";
import {
  getPushNotificationDiagnostic,
  reconcileStudyReminders,
} from "./utils/pushNotifications";
import BACKGROUND_PRESETS from "./utils/backgroundPresets";
import { resolveEffectiveDarkMode } from "./utils/appearanceTheme";
import { getPlannerMetrics } from "./utils/plannerMetrics";
import {
  academicProfilePayload,
  normalizeAcademicProfile,
} from "./utils/academicProfile";
import {
  DEFAULT_GOAL_REMINDER_DATA,
  DEFAULT_GOAL_REMINDER_SETTINGS,
  normalizePlannerData,
  normalizePlannerSettings,
  syncStudyTargetReminders,
} from "./utils/goalReminderStore";
import CustomCursor from "./components/CustomCursor";
import { SidebarStudyPet } from "./components/StudyPet";
import GoalReminderCenter from "./components/GoalReminderCenter";
import "./App.css";
import "./components/GoalReminderCenter.css";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const FloatingAnalytics = lazy(() => import("./components/FloatingAnalytics"));
const AnalyticsPage = lazy(() => import("./pages/AnalyticsPage"));
const AuthPage = lazy(() => import("./pages/AuthPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const NotesPage = lazy(() => import("./pages/NotesPage"));
const PlannerPage = lazy(() => import("./pages/PlannerPage"));
const QuizPage = lazy(() => import("./pages/QuizPage"));
const ReportPage = lazy(() => import("./pages/ReportPage"));
const ResourcesPage = lazy(() => import("./pages/ResourcesPage"));
const SubjectsPage = lazy(() => import("./pages/SubjectsPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const AboutPage = lazy(() => import("./pages/AboutPage"));
const ExamPage = lazy(() => import("./pages/ExamPage"));
const ExamAboutPage = lazy(() => import("./pages/ExamAboutPage"));

const NOTIFICATION_INTENT_KEY = "prepmatrix_notifications_enabled";
const NOTIFICATION_RECONCILE_RETRY_DELAYS_MS = [4000, 15000];
const DEFINITIVE_NOTIFICATION_ERROR_CODES = new Set([
  "unsupported",
  "insecure-context",
  "permission-denied",
  "not-subscribed",
  "subscription-expired",
]);

function notificationStateIsDefinitivelyOff(state) {
  return (
    !state?.supported ||
    !state?.secure ||
    state?.permission === "denied" ||
    !state?.subscribed
  );
}

function notificationErrorIsDefinitive(error) {
  const diagnostic = getPushNotificationDiagnostic(error);
  if (DEFINITIVE_NOTIFICATION_ERROR_CODES.has(diagnostic.code)) return true;
  return diagnostic.code === "server-config" && diagnostic.status !== 503;
}

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", helper: "Overview and momentum", icon: LayoutDashboard },
  { to: "/subjects", label: "Subjects", helper: "Manage chapters and load", icon: BookOpen },
  { to: "/planner", label: "Planner", helper: "Generate and rebalance work", icon: Calendar },
  { to: "/analytics", label: "Analytics", helper: "Progress, readiness, patterns", icon: TrendingUp },
  { to: "/notes", label: "Notes", helper: "Doubts and left topics", icon: StickyNote },
  { to: "/quiz", label: "Quiz", helper: "Topic-level checks", icon: Trophy },
  { to: "/report", label: "Report", helper: "Planner intelligence", icon: ClipboardList },
  { to: "/resources", label: "Materials", helper: "Suggested study resources", icon: Library },
];

function getTaskNames(schedule = []) {
  return schedule.flatMap((day) => day.tasks?.map((task) => task.task) || []);
}

function getCompletionReward(schedule = [], previousCompleted = [], nextCompleted = []) {
  if (nextCompleted.length <= previousCompleted.length) return null;

  const previousSet = new Set(previousCompleted);
  const nextSet = new Set(nextCompleted);
  const allTaskNames = getTaskNames(schedule);
  const previousMetrics = getPlannerMetrics(schedule, previousCompleted);
  const nextMetrics = getPlannerMetrics(schedule, nextCompleted);
  const planWasComplete = allTaskNames.length > 0 && allTaskNames.every((task) => previousSet.has(task));
  const planIsComplete = allTaskNames.length > 0 && allTaskNames.every((task) => nextSet.has(task));

  if (!previousMetrics.isExamEligible && nextMetrics.isExamEligible) {
    return {
      icon: "80%",
      eyebrow: "Exam mode unlocked",
      title: "You are now eligible to attend the exam",
      detail: `You completed ${nextMetrics.completedTasks} of ${nextMetrics.totalTasks} scheduled tasks. Secure exam mode is now available.`,
      tone: "legendary",
    };
  }

  if (planIsComplete && !planWasComplete) {
    return {
      icon: "WIN",
      eyebrow: "Plan cleared",
      title: "All scheduled days complete",
      detail: `You finished ${allTaskNames.length} planned task${allTaskNames.length === 1 ? "" : "s"}. That is a full-plan win.`,
      tone: "legendary",
    };
  }

  const completedDay = schedule.find((day) => {
    const tasks = day.tasks?.map((task) => task.task) || [];
    if (tasks.length === 0) return false;
    const wasComplete = tasks.every((task) => previousSet.has(task));
    const isComplete = tasks.every((task) => nextSet.has(task));
    return isComplete && !wasComplete;
  });

  if (!completedDay) return null;

  const dayTasks = completedDay.tasks || [];
  return {
    icon: "GO",
    eyebrow: `Day ${completedDay.day} complete`,
    title: "Daily streak unlocked",
    detail: `You completed all ${dayTasks.length} task${dayTasks.length === 1 ? "" : "s"} for Day ${completedDay.day}. Momentum is active.`,
    tone: "daily",
  };
}

function CompletionRewardPopup({ reward, onClose }) {
  if (!reward) return null;

  return (
    <div className={`completion-reward-popup ${reward.tone}`} role="status" aria-live="polite">
      <button aria-label="Close reward popup" onClick={onClose} type="button">
        <X aria-hidden="true" size={16} strokeWidth={2.6} />
      </button>
      <div className="reward-icon" aria-hidden="true">{reward.icon}</div>
      <div>
        <span>{reward.eyebrow}</span>
        <strong>{reward.title}</strong>
        <p>{reward.detail}</p>
      </div>
    </div>
  );
}

function EntrySplash() {
  return (
    <div className="entry-splash" role="status" aria-live="polite">
      <div className="entry-splash-orbit" aria-hidden="true" />
      <div className="entry-splash-card">
        <span className="entry-splash-logo" aria-hidden="true">P</span>
        <h2>PrepMatrix</h2>
        <p>Preparing your study workspace</p>
        <div className="entry-splash-loader" aria-hidden="true"><span /></div>
      </div>
    </div>
  );
}

function RouteLoading() {
  return (
    <section className="card loading-card route-loading-card" role="status" aria-live="polite">
      <span className="section-tag">Loading</span>
      <h2>Preparing workspace view...</h2>
      <p className="card-subtext">Bringing the next PrepMatrix tools into focus.</p>
    </section>
  );
}

function App() {
  const location = useLocation();
  const saveTimeoutRef = useRef(null);
  const academicProfileSaveRef = useRef(null);
  const academicProfileRevisionRef = useRef(0);
  const rewardTimeoutRef = useRef(null);
  const splashTimeoutRef = useRef(null);
  const resetConfirmRef = useRef(null);
  const profilePreviewTimerRef = useRef(null);
  const [subjects, setSubjects] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [completed, setCompleted] = useState([]);
  const [scheduleStartDate, setScheduleStartDate] = useState(null);
  const [academicLevel, setAcademicLevel] = useState("College");
  const [academicTrack, setAcademicTrack] = useState("General");
  const [materialBookmarks, setMaterialBookmarks] = useState([]);
  const [goalReminderData, setGoalReminderData] = useState(() => normalizePlannerData(DEFAULT_GOAL_REMINDER_DATA));
  const [goalReminderSettings, setGoalReminderSettings] = useState(() => normalizePlannerSettings(DEFAULT_GOAL_REMINDER_SETTINGS));
  const [darkMode, setDarkMode] = useState(() => {
    const savedDefault = localStorage.getItem("prepmatrix_default_theme");
    if (savedDefault) return savedDefault === "dark";
    return false;
  });
  const [userProfile, setUserProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);
  const [notification, setNotification] = useState("");
  const [completionReward, setCompletionReward] = useState(null);
  const [entrySplash, setEntrySplash] = useState(true);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profilePreviewOpen, setProfilePreviewOpen] = useState(false);
  const [profilePreviewSide, setProfilePreviewSide] = useState("photo");
  const [cursorStyle, setCursorStyle] = useState(() => {
    const saved = localStorage.getItem("prepmatrix_cursor_style") || "app-cursor";
    // Migrate old neon-cursor preference to blob-cursor
    if (saved === "neon-cursor") {
      localStorage.setItem("prepmatrix_cursor_style", "blob-cursor");
      return "blob-cursor";
    }
    return saved;
  });

  const voiceAssistant = useVoiceAssistant({
    academicLevel,
    academicTrack,
    schedule,
    completed,
  });

  const metrics = useMemo(
    () => getPlannerMetrics(schedule, completed),
    [schedule, completed]
  );

  const isAuthRoute = location.pathname === "/login" || location.pathname === "/register";
  const activeRoute = NAV_ITEMS.find((item) => location.pathname.startsWith(item.to));
  const titleLabel = activeRoute?.label || (
    location.pathname.startsWith("/exam/about") ? "Exam Guide" :
    location.pathname.startsWith("/exam") ? "Exam" :
    location.pathname.startsWith("/settings") ? "Settings" :
    location.pathname.startsWith("/about") ? "About" :
    location.pathname.includes("register") ? "Register" : "Login"
  );
  const profileInitial = (userProfile?.username || userProfile?.email || "P").trim().charAt(0).toUpperCase() || "P";

  const closeProfilePreview = () => {
    if (profilePreviewTimerRef.current) {
      window.clearTimeout(profilePreviewTimerRef.current);
      profilePreviewTimerRef.current = null;
    }
    setProfilePreviewOpen(false);
  };

  const openProfilePreview = () => {
    if (!userProfile) return;
    if (profilePreviewTimerRef.current) {
      window.clearTimeout(profilePreviewTimerRef.current);
      profilePreviewTimerRef.current = null;
    }
    setProfilePreviewSide("photo");
    setProfilePreviewOpen(true);
  };

  const toggleProfilePreviewSide = (event) => {
    event.stopPropagation();
    if (!userProfile?.profileImage) return;
    if (profilePreviewTimerRef.current) {
      window.clearTimeout(profilePreviewTimerRef.current);
      profilePreviewTimerRef.current = null;
    }
    setProfilePreviewSide((side) => (side === "photo" ? "logo" : "photo"));
  };

  const applyWorkspace = (workspace = {}, profile = null) => {
    const nextSubjects = Array.isArray(workspace?.subjects)
      ? workspace.subjects.filter((subject) => subject && typeof subject === "object")
      : [];
    const nextSchedule = Array.isArray(workspace?.schedule)
      ? workspace.schedule
        .filter((day) => day && typeof day === "object")
        .map((day) => ({
          ...day,
          tasks: Array.isArray(day.tasks)
            ? day.tasks.filter((task) => task && typeof task === "object")
            : [],
        }))
      : [];
    const profileLevel = String(profile?.academicLevel || "").trim();
    const workspaceLevel = String(workspace?.academicLevel || "").trim();
    const profileTrack = String(profile?.academicTrack || "").trim();
    const workspaceTrack = String(workspace?.academicTrack || "").trim();
    const profileIsGeneric = !profileLevel || /^(school|college|college \/ university)$/i.test(profileLevel);
    const nextAcademicProfile = normalizeAcademicProfile({
      ...profile,
      academicLevel: profileIsGeneric && workspaceLevel ? workspaceLevel : profileLevel || workspaceLevel,
      academicTrack: profileTrack && profileTrack !== "General" ? profileTrack : workspaceTrack || profileTrack,
    });
    setSubjects(nextSubjects);
    setSchedule(nextSchedule);
    setCompleted(Array.isArray(workspace?.completed) ? workspace.completed : []);
    setAcademicLevel(nextAcademicProfile.academicLevel);
    setAcademicTrack(nextAcademicProfile.academicTrack);
    if (profile) {
      setUserProfile((current) => ({ ...(current || profile), ...nextAcademicProfile }));
    }
    setMaterialBookmarks(Array.isArray(workspace?.materialBookmarks) ? workspace.materialBookmarks : []);
    const nextGoalReminderSettings = normalizePlannerSettings(workspace?.goalReminderSettings || DEFAULT_GOAL_REMINDER_SETTINGS);
    const nextGoalReminderData = syncStudyTargetReminders(workspace?.goalReminderData || DEFAULT_GOAL_REMINDER_DATA, nextGoalReminderSettings);
    setGoalReminderData(nextGoalReminderData);
    setGoalReminderSettings(nextGoalReminderSettings);
    setDarkMode(Boolean(workspace.darkMode));
    setScheduleStartDate(workspace.scheduleStartDate || null);
  };

  const updateAcademicProfile = useCallback((patch = {}, options = {}) => {
    const normalized = normalizeAcademicProfile({
      ...userProfile,
      academicLevel,
      academicTrack,
      ...patch,
    });

    setAcademicLevel(normalized.academicLevel);
    setAcademicTrack(normalized.academicTrack);
    setUserProfile((current) => current ? { ...current, ...patch, ...normalized } : current);

    if (options.persist === false || !userProfile) return normalized;

    academicProfileRevisionRef.current += 1;
    const revision = academicProfileRevisionRef.current;
    if (academicProfileSaveRef.current) {
      window.clearTimeout(academicProfileSaveRef.current);
    }

    academicProfileSaveRef.current = window.setTimeout(async () => {
      try {
        const response = await api.updateProfile(academicProfilePayload(normalized));
        if (revision !== academicProfileRevisionRef.current) return;
        const savedProfile = normalizeAcademicProfile(response.user);
        setUserProfile((current) => current
          ? { ...current, ...response.user, ...savedProfile }
          : { ...response.user, ...savedProfile });
      } catch (error) {
        if (revision === academicProfileRevisionRef.current) {
          setNotification(error instanceof Error ? error.message : "Could not sync the learner profile.");
        }
      }
    }, 450);

    return normalized;
  }, [academicLevel, academicTrack, userProfile]);

  const updateSubjects = (nextSubjects) => {
    setSubjects(Array.isArray(nextSubjects) ? nextSubjects : []);
    setSchedule([]);
    setCompleted([]);
    setScheduleStartDate(null);
  };

  const handleLogin = (profile, workspace) => {
    setUserProfile(profile);
    applyWorkspace(workspace, profile);
    setWorkspaceLoaded(true);
    setNotification(`Welcome, ${profile.username}.`);

    if (localStorage.getItem("prepmatrix_wake_mode") === "true") {
      voiceAssistant.setWakeMode(true);
    }

    if (splashTimeoutRef.current) {
      window.clearTimeout(splashTimeoutRef.current);
    }

    setEntrySplash(true);
    splashTimeoutRef.current = window.setTimeout(() => {
      setEntrySplash(false);
    }, 2400);
  };

  const handleLogout = async () => {
    voiceAssistant.pauseWakeMode?.();
    window.studyVoiceAssistant?.pauseWakeListening?.();
    window.speechSynthesis?.cancel?.();
    window.dispatchEvent(new CustomEvent("voiceRecordingChange", { detail: { isRecording: false } }));

    try {
      await api.logout();
    } catch {
      // If the cookie is already expired, clear the UI session anyway.
    }

    if (splashTimeoutRef.current) {
      window.clearTimeout(splashTimeoutRef.current);
    }

    setEntrySplash(false);
    setUserProfile(null);
    setWorkspaceLoaded(false);
    applyWorkspace({}, null);
    setNotification("Logged out of PrepMatrix.");
  };

  const handleAccountDeleted = () => {
    voiceAssistant.pauseWakeMode?.();
    window.studyVoiceAssistant?.pauseWakeListening?.();
    window.speechSynthesis?.cancel?.();
    window.dispatchEvent(new CustomEvent("voiceRecordingChange", { detail: { isRecording: false } }));

    if (splashTimeoutRef.current) {
      window.clearTimeout(splashTimeoutRef.current);
    }

    setEntrySplash(false);
    setUserProfile(null);
    setWorkspaceLoaded(false);
    applyWorkspace({}, null);
    setNotification("Account deleted successfully.");
  };

  const clearAuthenticatedUi = (message = "Please log in again to continue.") => {
    voiceAssistant.pauseWakeMode?.();
    window.studyVoiceAssistant?.pauseWakeListening?.();
    window.speechSynthesis?.cancel?.();
    window.dispatchEvent(new CustomEvent("voiceRecordingChange", { detail: { isRecording: false } }));

    if (splashTimeoutRef.current) {
      window.clearTimeout(splashTimeoutRef.current);
    }

    setEntrySplash(false);
    setUserProfile(null);
    setWorkspaceLoaded(false);
    applyWorkspace({}, null);
    setNotification(message);
  };

  const saveMaterialBookmark = (bookmark) => {
    const exists = materialBookmarks.some((item) => item.href === bookmark.href);

    if (exists) {
      setNotification("Material already saved.");
      return;
    }

    setMaterialBookmarks([
      {
        id: crypto.randomUUID(),
        savedAt: new Date().toISOString(),
        ...bookmark,
      },
      ...materialBookmarks,
    ]);
    setNotification("Material saved to bookmarks.");
  };

  const removeMaterialBookmark = (id) => {
    setMaterialBookmarks(materialBookmarks.filter((item) => item.id !== id));
    setNotification("Bookmark removed.");
  };

  const clearMaterialBookmarks = () => {
    if (!materialBookmarks.length) return;
    setMaterialBookmarks([]);
    setNotification("Saved material library cleared.");
  };

  const overviewCards = [
    {
      label: "Subjects",
      value: subjects.length,
      detail: subjects.length ? "Active focus areas" : "Start by adding a subject",
    },
    {
      label: "Planned tasks",
      value: metrics.totalTasks,
      detail: metrics.totalTasks ? "Across your generated schedule" : "Generate a study plan to begin",
    },
    {
      label: "Completed",
      value: metrics.completedTasks,
      detail: `${metrics.completionRate}% completion rate`,
    },
    {
      label: "Remaining",
      value: metrics.remainingTasks,
      detail: metrics.remainingTasks ? "Tasks still pending" : "You are fully caught up",
    },
  ];

  const showCompletionReward = (reward) => {
    if (!reward) return;

    if (rewardTimeoutRef.current) {
      window.clearTimeout(rewardTimeoutRef.current);
    }

    setCompletionReward(reward);
    rewardTimeoutRef.current = window.setTimeout(() => {
      setCompletionReward(null);
    }, 5200);
  };

  const updateCompletedWithRewards = (nextCompleted) => {
    const resolvedCompleted = typeof nextCompleted === "function" ? nextCompleted(completed) : nextCompleted;
    const reward = getCompletionReward(schedule, completed, resolvedCompleted);

    setCompleted(resolvedCompleted);
    showCompletionReward(reward);
  };

  const confirmPlannerReset = () => {
    setSubjects([]);
    setSchedule([]);
    setCompleted([]);
    setResetConfirmOpen(false);
    setNotification("Planner reset successfully.");
    return true;
  };

  const resetPlanner = () => {
    setResetConfirmOpen(true);
    return "pending";
  };

  useEffect(() => {
    let isMounted = true;

    api.me()
      .then((payload) => {
        if (!isMounted) return;
        setUserProfile(payload.user);
        applyWorkspace(payload.workspace, payload.user);
        setWorkspaceLoaded(true);

        // Trigger entry splash on session recovery (same as explicit login)
        if (splashTimeoutRef.current) {
          window.clearTimeout(splashTimeoutRef.current);
        }
        setEntrySplash(true);
        splashTimeoutRef.current = window.setTimeout(() => {
          setEntrySplash(false);
        }, 2400);
      })
      .catch((error) => {
        if (!isMounted) return;
        setUserProfile(null);
        setWorkspaceLoaded(false);
        setEntrySplash(false);

        if (error?.code === "PASSWORD_CHANGED") {
          setNotification("Your password was changed. Please log in again.");
          return;
        }

        if (error?.status === 401) {
          return;
        }

        setNotification(HAS_CONFIGURED_API
          ? "Backend is waking up or temporarily offline. Please wait a moment and refresh."
          : "Backend URL is not configured. Set VITE_API_URL in Vercel to keep login sessions active."
        );
      })
      .finally(() => {
        if (isMounted) setAuthLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const handleSessionEnded = (event) => {
      clearAuthenticatedUi(event.detail?.message || "Please log in again to continue.");
    };

    window.addEventListener("prepmatrixAuthSessionEnded", handleSessionEnded);
    return () => window.removeEventListener("prepmatrixAuthSessionEnded", handleSessionEnded);
  }, []);

  useEffect(() => {
    if (!userProfile || !workspaceLoaded) {
      return undefined;
    }

    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = window.setTimeout(() => {
      api.saveWorkspace({
        subjects,
        schedule,
        completed,
        academicLevel,
        academicTrack,
        materialBookmarks,
        goalReminderData,
        goalReminderSettings,
        darkMode,
        scheduleStartDate,
      }).catch((error) => {
        setNotification(error instanceof Error ? error.message : "Could not save workspace.");
      });
    }, 350);

    return () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [academicLevel, academicTrack, completed, darkMode, goalReminderData, goalReminderSettings, materialBookmarks, schedule, subjects, userProfile, workspaceLoaded, scheduleStartDate]);

  useEffect(() => {
    const backgroundImageId = localStorage.getItem("prepmatrix_bg_image_id") || "";
    const hasBackgroundImage = !isAuthRoute && BACKGROUND_PRESETS.some(({ id }) => id === backgroundImageId);
    const effectiveDarkMode = resolveEffectiveDarkMode(darkMode, hasBackgroundImage);

    document.body.classList.toggle("dark", effectiveDarkMode);
    document.documentElement.classList.toggle("dark", effectiveDarkMode);
    localStorage.setItem("prepmatrix_default_theme", darkMode ? "dark" : "light");
    
    // Dynamically apply accent color according to theme
    const rgbLight = localStorage.getItem("prepmatrix_accent_rgb_light") || "7, 143, 120";
    const rgbDark = localStorage.getItem("prepmatrix_accent_rgb_dark") || "36, 199, 177";
    const activeRgb = effectiveDarkMode ? rgbDark : rgbLight;
    document.documentElement.style.setProperty("--accent-rgb", activeRgb);
    document.body.style.setProperty("--accent-rgb", activeRgb);
    
    document.documentElement.style.setProperty("--accent", `rgb(${activeRgb})`);
    document.body.style.setProperty("--accent", `rgb(${activeRgb})`);
  }, [darkMode, isAuthRoute]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js")
        .then((reg) => {
          console.log("Service Worker registered successfully with scope:", reg.scope);
        })
        .catch((err) => {
          console.warn("Service Worker registration failed:", err);
        });
    }

    const handleSWMessage = (event) => {
      if (event.data && event.data.type === "SHOW_TOAST") {
        toast.info(event.data.message, {
          position: "top-right",
          autoClose: 5000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
          toastId: "daily-reminder-push-toast"
        });
      }
    };

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", handleSWMessage);
    }
    return () => {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", handleSWMessage);
      }
    };
  }, []);

  useEffect(() => {
    if (!userProfile || localStorage.getItem(NOTIFICATION_INTENT_KEY) !== "true") {
      return undefined;
    }

    let isActive = true;
    let reconcileInFlight = false;
    let retryIndex = 0;
    let retryTimeoutId = null;

    const scheduleRetry = () => {
      if (!isActive || retryIndex >= NOTIFICATION_RECONCILE_RETRY_DELAYS_MS.length) return;
      const delay = NOTIFICATION_RECONCILE_RETRY_DELAYS_MS[retryIndex];
      retryIndex += 1;
      retryTimeoutId = window.setTimeout(runReconciliation, delay);
    };

    const runReconciliation = async () => {
      if (
        !isActive ||
        reconcileInFlight ||
        localStorage.getItem(NOTIFICATION_INTENT_KEY) !== "true"
      ) {
        return;
      }

      reconcileInFlight = true;
      try {
        const state = await reconcileStudyReminders();
        if (!isActive) return;

        if (notificationStateIsDefinitivelyOff(state)) {
          localStorage.setItem(NOTIFICATION_INTENT_KEY, "false");
          return;
        }

        retryIndex = 0;
      } catch (error) {
        if (!isActive) return;

        if (notificationErrorIsDefinitive(error)) {
          localStorage.setItem(NOTIFICATION_INTENT_KEY, "false");
          return;
        }

        console.warn("Push notification reconciliation failed:", getPushNotificationDiagnostic(error));
        scheduleRetry();
      } finally {
        reconcileInFlight = false;
      }
    };

    const retryWhenOnline = () => {
      if (localStorage.getItem(NOTIFICATION_INTENT_KEY) !== "true") return;
      if (retryTimeoutId !== null) window.clearTimeout(retryTimeoutId);
      retryTimeoutId = null;
      retryIndex = 0;
      runReconciliation();
    };

    runReconciliation();
    window.addEventListener("online", retryWhenOnline);

    return () => {
      isActive = false;
      if (retryTimeoutId !== null) window.clearTimeout(retryTimeoutId);
      window.removeEventListener("online", retryWhenOnline);
    };
  }, [userProfile]);

  useEffect(() => {
    if (logoutConfirmOpen) {
      document.body.classList.add("modal-open");
    } else {
      document.body.classList.remove("modal-open");
    }
    return () => {
      document.body.classList.remove("modal-open");
    };
  }, [logoutConfirmOpen]);

  useEffect(() => {
    if (resetConfirmOpen) {
      document.body.classList.add("popover-open");
    } else {
      document.body.classList.remove("popover-open");
    }
    return () => {
      document.body.classList.remove("popover-open");
    };
  }, [resetConfirmOpen]);

  useEffect(() => {
    const bgImgId = localStorage.getItem("prepmatrix_bg_image_id") || "";
    const imgPreset = !isAuthRoute ? BACKGROUND_PRESETS.find(({ id }) => id === bgImgId) : undefined;
    const effectiveDarkMode = resolveEffectiveDarkMode(darkMode, Boolean(imgPreset));

    document.body.classList.toggle("dark", effectiveDarkMode);
    document.documentElement.classList.toggle("dark", effectiveDarkMode);

    // Font scale
    const font = localStorage.getItem("prepmatrix_font_size") || "medium";
    document.documentElement.style.setProperty(
      "--base-font-size",
      font === "small" ? "14px" : font === "large" ? "18px" : "16px"
    );
    document.body.style.setProperty(
      "--base-font-size",
      font === "small" ? "14px" : font === "large" ? "18px" : "16px"
    );

    // Card scale
    const card = localStorage.getItem("prepmatrix_card_size") || "cozy";
    document.documentElement.style.setProperty(
      "--card-padding",
      card === "compact" ? "18px" : card === "spacious" ? "40px" : "30px"
    );
    document.body.style.setProperty(
      "--card-padding",
      card === "compact" ? "18px" : card === "spacious" ? "40px" : "30px"
    );
    document.documentElement.style.setProperty(
      "--radius-lg",
      card === "compact" ? "16px" : card === "spacious" ? "32px" : "24px"
    );
    document.body.style.setProperty(
      "--radius-lg",
      card === "compact" ? "16px" : card === "spacious" ? "32px" : "24px"
    );

    // Opacity and contrast
    const opacity = localStorage.getItem("prepmatrix_accent_opacity") || "0.16";
    const borderOp = localStorage.getItem("prepmatrix_border_opacity") || "0.3";
    document.documentElement.style.setProperty("--accent-opacity", opacity);
    document.body.style.setProperty("--accent-opacity", opacity);
    document.documentElement.style.setProperty("--border-opacity", borderOp);
    document.body.style.setProperty("--border-opacity", borderOp);

    // Accent colors
    const rgbLight = localStorage.getItem("prepmatrix_accent_rgb_light") || "7, 143, 120";
    const rgbDark = localStorage.getItem("prepmatrix_accent_rgb_dark") || "36, 199, 177";
    const activeRgb = effectiveDarkMode ? rgbDark : rgbLight;
    document.documentElement.style.setProperty("--accent-rgb", activeRgb);
    document.body.style.setProperty("--accent-rgb", activeRgb);
    document.documentElement.style.setProperty("--accent", `rgb(${activeRgb})`);
    document.body.style.setProperty("--accent", `rgb(${activeRgb})`);

    // Canvas Background colors
    const bgLight = localStorage.getItem("prepmatrix_bg_light") || "#f8fafc";
    const bgDark = localStorage.getItem("prepmatrix_bg_dark") || "#090d16";
    const activeBg = effectiveDarkMode ? bgDark : bgLight;
    document.documentElement.style.setProperty("--bg", activeBg);
    document.body.style.setProperty("--bg", activeBg);
    document.documentElement.style.setProperty("--bg-secondary", activeBg);
    document.body.style.setProperty("--bg-secondary", activeBg);

    // Glassy toggles
    const glassyC = localStorage.getItem("prepmatrix_glassy_panels") !== "false";
    const glassyB = localStorage.getItem("prepmatrix_glassy_buttons") !== "false";
    document.body.classList.toggle("no-glass-cards", !glassyC);
    document.body.classList.toggle("no-glass-buttons", !glassyB);

    // Font family style
    const fontS = localStorage.getItem("prepmatrix_font_style") || "sans";
    let baseFamily = '"Manrope", sans-serif';
    let displayFamily = '"Space Grotesk", sans-serif';
    if (fontS === "clean") {
      baseFamily = '"Inter", sans-serif';
      displayFamily = '"Outfit", sans-serif';
    } else if (fontS === "rounded") {
      baseFamily = '"Nunito", sans-serif';
      displayFamily = '"Quicksand", sans-serif';
    } else if (fontS === "geometric") {
      baseFamily = '"Poppins", sans-serif';
      displayFamily = '"Raleway", sans-serif';
    } else if (fontS === "humanist") {
      baseFamily = '"Source Sans 3", sans-serif';
      displayFamily = '"DM Sans", sans-serif';
    } else if (fontS === "editorial") {
      baseFamily = '"Plus Jakarta Sans", sans-serif';
      displayFamily = '"Raleway", sans-serif';
    } else if (fontS === "serif") {
      baseFamily = '"Lora", serif';
      displayFamily = '"Playfair Display", serif';
    } else if (fontS === "classic") {
      baseFamily = '"Merriweather", serif';
      displayFamily = '"Crimson Text", serif';
    } else if (fontS === "mono") {
      baseFamily = '"Fira Code", monospace';
      displayFamily = '"Space Mono", monospace';
    }
    document.documentElement.style.setProperty("--font-family-base", baseFamily);
    document.body.style.setProperty("--font-family-base", baseFamily);
    document.documentElement.style.setProperty("--font-family-display", displayFamily);
    document.body.style.setProperty("--font-family-display", displayFamily);

    // Font weight preset
    const fontW = localStorage.getItem("prepmatrix_font_weight") || "regular";
    let normalWeight = "400";
    let mediumWeight = "500";
    let boldWeight = "600";
    let titleWeight = "700";
    if (fontW === "light") {
      normalWeight = "300";
      mediumWeight = "400";
      boldWeight = "500";
      titleWeight = "600";
    } else if (fontW === "medium") {
      normalWeight = "500";
      mediumWeight = "600";
      boldWeight = "700";
      titleWeight = "800";
    } else if (fontW === "bold") {
      normalWeight = "600";
      mediumWeight = "700";
      boldWeight = "800";
      titleWeight = "900";
    }
    document.documentElement.style.setProperty("--font-weight-normal", normalWeight);
    document.body.style.setProperty("--font-weight-normal", normalWeight);
    document.documentElement.style.setProperty("--font-weight-medium", mediumWeight);
    document.body.style.setProperty("--font-weight-medium", mediumWeight);
    document.documentElement.style.setProperty("--font-weight-bold", boldWeight);
    document.body.style.setProperty("--font-weight-bold", boldWeight);
    document.documentElement.style.setProperty("--font-weight-title", titleWeight);
    document.body.style.setProperty("--font-weight-title", titleWeight);

    // Glass opacity
    const glassOp = localStorage.getItem("prepmatrix_glass_opacity") || "0.6";
    document.documentElement.style.setProperty("--glass-opacity", glassOp);
    document.body.style.setProperty("--glass-opacity", glassOp);

    // Background image — suppressed entirely on auth routes
    const bgOvOp = localStorage.getItem("prepmatrix_bg_overlay_opacity") || "0.55";
    if (imgPreset) {
      document.body.classList.add("has-bg-image");
      document.documentElement.style.setProperty("--bg-image", `url(${imgPreset.file})`);
      document.documentElement.style.setProperty("--bg-surface-rgb", imgPreset.surfaceRgb);
      const parsedOvOp = parseFloat(bgOvOp);
      const mappedOverlay = (parsedOvOp * 0.5).toString();
      document.documentElement.style.setProperty("--bg-overlay-opacity", mappedOverlay);
      document.body.style.setProperty("--bg-overlay-opacity", mappedOverlay);
      const bgBrightness = Math.pow(Math.max(0, 1 - parsedOvOp * 0.5), 4.5);
      document.documentElement.style.setProperty("--bg-brightness", bgBrightness.toString());
      document.body.style.setProperty("--bg-brightness", bgBrightness.toString());
      // Override accent with image-derived theme colour
      document.documentElement.style.setProperty("--accent-rgb", imgPreset.accentRgb);
      document.body.style.setProperty("--accent-rgb", imgPreset.accentRgb);
      document.documentElement.style.setProperty("--accent", `rgb(${imgPreset.accentRgb})`);
      document.body.style.setProperty("--accent", `rgb(${imgPreset.accentRgb})`);
    } else {
      document.body.classList.remove("has-bg-image");
      document.documentElement.style.removeProperty("--bg-image");
      document.documentElement.style.removeProperty("--bg-surface-rgb");
      document.documentElement.style.removeProperty("--bg-overlay-opacity");
      document.body.style.removeProperty("--bg-overlay-opacity");
      document.documentElement.style.removeProperty("--bg-brightness");
      document.body.style.removeProperty("--bg-brightness");
    }
  }, [darkMode, isAuthRoute]);

  useEffect(() => {
    document.title = `PrepMatrix | ${titleLabel}`;
  }, [titleLabel]);

  useEffect(() => {
    if (!resetConfirmOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (!resetConfirmRef.current?.contains(event.target)) {
        setResetConfirmOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setResetConfirmOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [resetConfirmOpen]);

  useEffect(() => () => {
    if (rewardTimeoutRef.current) {
      window.clearTimeout(rewardTimeoutRef.current);
    }

    if (splashTimeoutRef.current) {
      window.clearTimeout(splashTimeoutRef.current);
    }

    if (profilePreviewTimerRef.current) {
      window.clearTimeout(profilePreviewTimerRef.current);
    }
  }, []);

  return (
    <div className={`app-container app-shell-layout ${userProfile && !isAuthRoute ? "has-sidebar" : "auth-layout"} cursor-mode--${cursorStyle}`}>
      <CustomCursor mode={cursorStyle} />
      <div className="page-glow page-glow-left" />
      <div className="page-glow page-glow-right" />
      <div className="motion-stage" aria-hidden="true">
        <span className="motion-beam motion-beam-one" />
        <span className="motion-beam motion-beam-two" />
        <span className="motion-ring motion-ring-one" />
        <span className="motion-ring motion-ring-two" />
        <span className="motion-grid" />
      </div>
      {entrySplash && <EntrySplash />}

      {userProfile && !isAuthRoute && sidebarOpen && (
        <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}

      {userProfile && !isAuthRoute && (
        <aside className={`app-sidebar ${sidebarOpen ? "open" : ""}`}>
          <div className="sidebar-header">
            <Link to="/dashboard" className="workspace-logo-wrap" aria-label="PrepMatrix">
              <span className="workspace-logo-mark" aria-hidden="true">P</span>
              <h1 className="workspace-logo-title">PrepMatrix</h1>
            </Link>
            <button
              className="sidebar-close-btn"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close sidebar"
              type="button"
            >
              <X size={20} />
            </button>
          </div>
          <nav className="sidebar-nav" aria-label="Primary navigation">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  className={({ isActive }) =>
                    isActive ? "sidebar-link active" : "sidebar-link"
                  }
                  key={item.to}
                  title={item.helper}
                  to={item.to}
                  onClick={() => setSidebarOpen(false)}
                >
                  <Icon aria-hidden="true" className="sidebar-link-icon" size={18} strokeWidth={2.2} />
                  <span className="sidebar-link-label">{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
          
          <div className="sidebar-widgets">
            <div className="sidebar-companion-row">
              <SidebarStudyPet />
              <GoalReminderCenter
                data={goalReminderData}
                onDataChange={setGoalReminderData}
                onOpen={() => setSidebarOpen(false)}
                onSettingsChange={setGoalReminderSettings}
                settings={goalReminderSettings}
              />
            </div>
            <Suspense fallback={null}>
              <div className="sidebar-widget-cell">
                <FloatingAnalytics completed={completed} schedule={schedule} subjects={subjects} />
              </div>
            </Suspense>
            <div className="sidebar-widget-cell sidebar-exam-widget">
                <NavLink
                  aria-label="Open exam workspace"
                  className={({ isActive }) => `exam-widget-btn${isActive ? " active" : ""}`}
                  onClick={() => setSidebarOpen(false)}
                  title="Exam workspace"
                  to="/exam"
                >
                  <ClipboardList aria-hidden="true" size={15} strokeWidth={2.25} />
                  <span>Exam</span>
                </NavLink>
              </div>
              <Chatbot
                academicLevel={academicLevel}
                academicTrack={academicTrack}
                completed={completed}
                onReset={resetPlanner}
                schedule={schedule}
                setDarkMode={setDarkMode}
              />
            <Link
              to="/about"
              className="about-info-btn"
              title="About application"
              aria-label="About application"
            >
              <Info size={16} />
            </Link>
          </div>

          <div className="sidebar-footer" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
            <div className="profile-chip-vertical" title={userProfile.institutionName} style={{ flex: 1, minWidth: 0 }}>
              <button
                aria-label="Open profile picture preview"
                className={`profile-avatar profile-avatar-button${userProfile.profileImage ? " has-image" : ""}`}
                onClick={openProfilePreview}
                title="Open profile picture preview"
                type="button"
              >
                {userProfile.profileImage ? (
                  <img alt="Profile" src={userProfile.profileImage} />
                ) : (
                  <UserRound size={18} />
                )}
              </button>
              <div className="profile-details">
                <strong>{userProfile.username}</strong>
                <span>{userProfile.academicLevel}</span>
              </div>
            </div>
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                isActive ? "settings-icon-btn active" : "settings-icon-btn"
              }
              title="Settings"
              aria-label="Settings"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "36px",
                height: "36px",
                borderRadius: "50%",
                transition: "all 0.2s"
              }}
            >
              <SettingsIcon size={18} />
            </NavLink>
          </div>
        </aside>
      )}

      <div className="app-main-content">
        {userProfile && !isAuthRoute && (
          <header className="workspace-topbar">
            <div className="topbar-left">
              <button
                className="hamburger-btn"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open navigation menu"
                type="button"
              >
                <Menu size={22} />
              </button>
              <div className="page-header-info">
                <h2 className="page-title">{titleLabel}</h2>
                <p className="page-subtitle">
                  {location.pathname.startsWith("/exam/about")
                    ? "Understand every exam tool, rule, and workflow"
                    : location.pathname.startsWith("/settings")
                    ? "Manage profile, update credentials, and customize appearance"
                    : location.pathname.startsWith("/exam")
                      ? "Attend exams, generate question papers, and review results"
                      : activeRoute?.helper || "Study planning platform"}
                </p>
              </div>
            </div>

            <div className="topbar-right">
              {/* Global browser VoiceAssistant service */}
              <VoiceAssistant
                academicLevel={academicLevel}
                academicTrack={academicTrack}
                completed={completed}
                schedule={schedule}
                hidden
                assistant={voiceAssistant}
              />

              <button
                aria-label="Reset planner"
                aria-expanded={resetConfirmOpen}
                aria-haspopup="dialog"
                className="icon-shell-btn reset-icon-btn"
                onClick={resetPlanner}
                title="Reset planner"
                type="button"
              >
                <RotateCcw aria-hidden="true" size={20} strokeWidth={2.4} />
              </button>

              {resetConfirmOpen && (
                <div
                  aria-labelledby="reset-confirm-title"
                  className="reset-confirm-popover"
                  ref={resetConfirmRef}
                  role="dialog"
                >
                  <div className="reset-confirm-icon" aria-hidden="true">
                    <RotateCcw size={18} strokeWidth={2.5} />
                  </div>
                  <div className="reset-confirm-copy">
                    <strong id="reset-confirm-title">Reset planner?</strong>
                    <p>Clear study plan, completion data, and progress.</p>
                  </div>
                  <div className="reset-confirm-actions">
                    <button className="secondary-btn" onClick={() => setResetConfirmOpen(false)} type="button">
                      Cancel
                    </button>
                    <button className="reset-confirm-danger" onClick={confirmPlannerReset} type="button">
                      Reset
                    </button>
                  </div>
                </div>
              )}

              <button
                aria-label={darkMode ? "Switch to light theme" : "Switch to dark theme"}
                className="icon-shell-btn theme-icon-btn"
                onClick={() => setDarkMode((value) => !value)}
                title={darkMode ? "Light theme" : "Dark theme"}
                type="button"
              >
                {darkMode ? (
                  <Sun aria-hidden="true" size={20} strokeWidth={2.4} />
                ) : (
                  <Moon aria-hidden="true" size={20} strokeWidth={2.4} />
                )}
              </button>

              <button
                aria-label="Logout"
                className="icon-shell-btn logout-icon-btn"
                onClick={() => setLogoutConfirmOpen(true)}
                title="Logout"
                type="button"
              >
                <LogOut aria-hidden="true" size={20} strokeWidth={2.4} />
              </button>
            </div>
          </header>
        )}

        <Notification message={notification} />
        <CompletionRewardPopup reward={completionReward} onClose={() => setCompletionReward(null)} />

        {logoutConfirmOpen && (
          <div className="confirm-modal-backdrop" role="presentation">
            <section
              aria-labelledby="logout-confirm-title"
              aria-modal="true"
              className="confirm-modal"
              role="dialog"
            >
              <div className="confirm-modal-icon warning" aria-hidden="true">
                <LogOut size={22} strokeWidth={2.5} />
              </div>
              <div className="confirm-modal-copy">
                <span className="section-tag">Confirm</span>
                <h2 id="logout-confirm-title">Log out of PrepMatrix?</h2>
                <p>Your current workspace will stay saved. You will need to log in again to continue.</p>
              </div>
              <div className="confirm-modal-actions">
                <button className="secondary-btn" onClick={() => setLogoutConfirmOpen(false)} type="button">
                  Cancel
                </button>
                <button
                  className="confirm-danger-btn"
                  onClick={() => {
                    setLogoutConfirmOpen(false);
                    handleLogout();
                  }}
                  type="button"
                >
                  Log out
                </button>
              </div>
            </section>
          </div>
        )}

        <main className="workspace-main">
          {/* Auth pages rendered OUTSIDE Routes so the component instance is
              shared between /login and /register — no flash on route change */}
          {isAuthRoute ? (
            authLoading ? null : (
              <Suspense fallback={<RouteLoading />}>
                <AuthPage onLogin={handleLogin} />
              </Suspense>
            )
          ) : (
            <div className="route-stage" key={location.pathname}>
              {authLoading ? null : (
                <Suspense fallback={<RouteLoading />}>
                  <Routes>
                    {userProfile ? (
                      <>
                        <Route
                          element={
                            <DashboardPage
                              academicLevel={academicLevel}
                              academicTrack={academicTrack}
                              completed={completed}
                              metrics={metrics}
                              overviewCards={overviewCards}
                              schedule={schedule}
                            />
                          }
                          path="/dashboard"
                        />
                        <Route
                          element={
                            <SubjectsPage
                              academicLevel={academicLevel}
                              academicTrack={academicTrack}
                              onAcademicProfileChange={updateAcademicProfile}
                              setSubjects={updateSubjects}
                              subjects={subjects}
                              userProfile={userProfile}
                            />
                          }
                          path="/subjects"
                        />
                        <Route
                          element={
                            <PlannerPage
                              completed={completed}
                              schedule={schedule}
                              setCompleted={updateCompletedWithRewards}
                              setSchedule={setSchedule}
                              subjects={subjects}
                              scheduleStartDate={scheduleStartDate}
                              setScheduleStartDate={setScheduleStartDate}
                            />
                          }
                          path="/planner"
                        />
                        <Route
                          element={
                            <AnalyticsPage
                              completed={completed}
                              schedule={schedule}
                              subjects={subjects}
                            />
                          }
                          path="/analytics"
                        />
                        <Route
                          element={
                            <NotesPage
                              completed={completed}
                              schedule={schedule}
                              setNotification={setNotification}
                              setSchedule={setSchedule}
                            />
                          }
                          path="/notes"
                        />
                        <Route
                          element={
                            <QuizPage
                              academicLevel={academicLevel}
                              academicTrack={academicTrack}
                              subjects={subjects}
                              userProfile={userProfile}
                            />
                          }
                          path="/quiz"
                        />
                        <Route
                          element={<ExamAboutPage />}
                          path="/exam/about"
                        />
                        <Route
                          element={
                            <ExamPage
                              academicLevel={academicLevel}
                              academicTrack={academicTrack}
                              examReadiness={metrics.completionRate}
                              isExamEligible={metrics.isExamEligible}
                              subjects={subjects}
                              tasksToExamEligibility={metrics.tasksToExamEligibility}
                              userProfile={userProfile}
                            />
                          }
                          path="/exam"
                        />
                        <Route
                          element={
                            <ReportPage
                              completed={completed}
                              materialBookmarks={materialBookmarks}
                              schedule={schedule}
                              subjects={subjects}
                              userProfile={userProfile}
                            />
                          }
                          path="/report"
                        />
                        <Route
                          element={
                            <ResourcesPage
                              academicLevel={academicLevel}
                              academicTrack={academicTrack}
                              completed={completed}
                              materialBookmarks={materialBookmarks}
                              onClearBookmarks={clearMaterialBookmarks}
                              onRemoveBookmark={removeMaterialBookmark}
                              onSaveBookmark={saveMaterialBookmark}
                              schedule={schedule}
                              subjects={subjects}
                            />
                          }
                          path="/resources"
                        />
                        <Route
                          element={
                            <SettingsPage
                              userProfile={userProfile}
                              setUserProfile={setUserProfile}
                              onAcademicProfileChange={updateAcademicProfile}
                              darkMode={darkMode}
                              setDarkMode={setDarkMode}
                              subjects={subjects}
                              schedule={schedule}
                              scheduleStartDate={scheduleStartDate}
                              completed={completed}
                              materialBookmarks={materialBookmarks}
                              goalReminderData={goalReminderData}
                              goalReminderSettings={goalReminderSettings}
                              academicLevel={academicLevel}
                              academicTrack={academicTrack}
                              setAcademicLevel={setAcademicLevel}
                              setAcademicTrack={setAcademicTrack}
                              setSubjects={updateSubjects}
                              setSchedule={setSchedule}
                              setCompleted={setCompleted}
                              setMaterialBookmarks={setMaterialBookmarks}
                              setGoalReminderData={setGoalReminderData}
                              setGoalReminderSettings={setGoalReminderSettings}
                              setNotification={setNotification}
                              onAccountDeleted={handleAccountDeleted}
                              cursorStyle={cursorStyle}
                              setCursorStyle={setCursorStyle}
                            />
                          }
                          path="/settings"
                        />
                        <Route
                          element={
                            <AboutPage />
                          }
                          path="/about"
                        />
                        <Route element={<Navigate replace to="/dashboard" />} path="*" />
                      </>
                    ) : (
                      <Route element={<Navigate replace to="/login" />} path="*" />
                    )}
                  </Routes>
                </Suspense>
              )}
            </div>
          )}
        </main>
      </div>


      {profilePreviewOpen && userProfile && (
        <div
          aria-label="Profile picture preview"
          className="profile-preview-backdrop"
          onClick={closeProfilePreview}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Escape" || event.key === "Enter" || event.key === " ") {
              closeProfilePreview();
            }
          }}
        >
          <button
            aria-label="Rotate profile preview"
            className="profile-preview-flip"
            onClick={toggleProfilePreviewSide}
            type="button"
          >
            <span className="profile-preview-visual" key={profilePreviewSide}>
              {profilePreviewSide === "photo" && userProfile.profileImage ? (
                <img alt={`${userProfile.username || "User"} profile`} src={userProfile.profileImage} />
              ) : (
                <span className="profile-preview-brand-mark">{profileInitial}</span>
              )}
            </span>
          </button>
        </div>
      )}

      {voiceAssistant.voiceStatus !== "idle" && (
        <VoiceAssistantOverlay
          voiceStatus={voiceAssistant.voiceStatus}
          lastText={voiceAssistant.lastText}
          error={voiceAssistant.error}
          reply={voiceAssistant.overlayReply}
          chatSessionId={voiceAssistant.latestChatSessionId}
          onGoToChat={voiceAssistant.openLatestAnswerInChat}
          onMute={voiceAssistant.muteCurrentReply}
          onClose={voiceAssistant.dismissOverlay}
          speechState={voiceAssistant.replySpeechState}
        />
      )}

      <ToastContainer
        autoClose={2200}
        closeOnClick
        draggable
        limit={3}
        newestOnTop
        pauseOnFocusLoss={false}
        position="top-right"
        toastClassName="prepmatrix-toast"
      />
    </div>
  );
}

export default App;

