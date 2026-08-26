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
  BookOpenCheck,
  Trophy,
  ClipboardList,
  Library,
  FileUser,
  Menu,
  X,
  Settings as SettingsIcon,
  Info,
  LockKeyhole,
  Gamepad2,
  MessageCircle,
  PanelLeft,
  PanelLeftClose,
  ChevronLeft,
} from "lucide-react";
import { Link, NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import Notification from "./components/Notification";
import Chatbot from "./components/Chatbot";
import VoiceAssistant from "./components/VoiceAssistant";
import VoiceAssistantOverlay from "./components/VoiceAssistantOverlay";
import { AiCreditIndicator } from "./components/AiQuotaProvider";
import useVoiceAssistant from "./hooks/useVoiceAssistant";
import useAppUsageTracker from "./hooks/useAppUsageTracker";
import api, {
  ACADEMIC_PROFILE_DELETE_TIMEOUT_MS,
  AUTH_RECOVERY_TIMEOUT_MS,
  clearStoredAuthState,
  getApiAcademicProfileScope,
  HAS_CONFIGURED_API,
  setApiAcademicProfileScope,
} from "./utils/apiClient";
import {
  getPushNotificationDiagnostic,
  reconcileStudyReminders,
} from "./utils/pushNotifications";
import { resolveBackgroundPresetForProfile } from "./utils/backgroundPresets";
import { resolveKidsGamepadIcon } from "./utils/backgroundPresets";
import {
  applyBackgroundPresentation,
  clearBackgroundPresentation,
} from "./utils/backgroundPresentation";
import {
  BACKGROUND_IMAGE_BLUR_STORAGE_KEY,
  resolveBackgroundImageBlurPx,
  resolveEffectiveDarkMode,
} from "./utils/appearanceTheme";
import { getPlannerMetrics } from "./utils/plannerMetrics";
import { readStoredActiveExamAttemptId } from "./utils/examTiming";
import {
  normalizeMaterialBookmark,
  normalizeMaterialBookmarks,
} from "./utils/materialBookmarks";
import { reconcileScheduleWithSubjects } from "./utils/scheduleReconciliation";
import {
  academicProfilePayload,
  normalizeAcademicProfile,
} from "./utils/academicProfile";
import { buildAcademicProfileDeletePayload } from "./utils/academicProfileSlots";
import {
  clearAcademicProfileBrowserData,
  clearOwnedLegacyAcademicProfileBrowserData,
  clearPendingAcademicProfileActions,
  getAcademicProfileDataId,
  isValidAcademicProfileDataId,
  legacyAcademicProfileOwnerStorageKey,
  resolveAcademicProfileContext,
} from "./utils/academicProfileScope";
import { recoverAcademicProfileTransitionAfterFailure } from "./utils/academicProfileTransitionRecovery";
import {
  getLearnerRoutePolicy,
  getYoungKidsParentRouteDecision,
  isYoungKidsNavRoute,
} from "./utils/learnerRouting";
import { buildLoginRedirect } from "./utils/authReturnTo";
import {
  SUBJECT_SCHEDULE_MUTATION_MODES,
  getSubjectScheduleMutationMode,
} from "./utils/subjectWorkspace";
import {
  getLearningCareerEligibility,
  getLearningMedicalTrainingEligibility,
} from "./utils/learningNotebook";
import { getGoalReminderShortcutRoutes } from "./utils/homeNavigationCommands";
import { getPrimarySidebarNavItems } from "./utils/sidebarNavigation";
import {
  getResumeEligibility,
  normalizeResumeBuilderState,
} from "./utils/resumeBuilder";
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
import SidebarProximityNav from "./components/SidebarProximityNav";
import LearningRouteBoundary from "./components/LearningRouteBoundary";
import PwaManager from "./components/PwaManager";
import AcademicProfileIntroDialog from "./components/AcademicProfileIntroDialog";
import { claimFirstProfileBGuide } from "./utils/academicProfileGuide";
import "./App.css";
import "./components/GoalReminderCenter.css";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const lazyRetry = (componentImport) =>
  lazy(async () => {
    const pageHasAlreadyBeenForceRefreshed = JSON.parse(
      window.sessionStorage.getItem('page-has-been-force-refreshed') || 'false'
    );
    try {
      const component = await componentImport();
      window.sessionStorage.setItem('page-has-been-force-refreshed', 'false');
      return component;
    } catch (error) {
      if (!pageHasAlreadyBeenForceRefreshed) {
        window.sessionStorage.setItem('page-has-been-force-refreshed', 'true');
        window.location.reload();
        // Return a promise that never resolves so React Suspense hangs until reload completes
        return new Promise(() => {});
      }
      throw error;
    }
  });

const FloatingAnalytics = lazyRetry(() => import("./components/FloatingAnalytics"));
const AnalyticsPage = lazyRetry(() => import("./pages/AnalyticsPage"));
const AuthPage = lazyRetry(() => import("./pages/AuthPage"));
const DashboardPage = lazyRetry(() => import("./pages/DashboardPage"));
const NotesPage = lazyRetry(() => import("./pages/NotesPage"));
const StartLearningPage = lazyRetry(() => import("./pages/StartLearningPage"));
const PlannerPage = lazyRetry(() => import("./pages/PlannerPage"));
const QuizPage = lazyRetry(() => import("./pages/QuizPage"));
const KidsLearningPage = lazyRetry(() => import("./pages/KidsLearningPage"));
const KidsAiChatPage = lazyRetry(() => import("./pages/KidsAiChatPage"));
const KidsStartLearningPage = lazyRetry(() => import("./pages/KidsStartLearningPage"));
const SchoolKnowledgePage = lazyRetry(() => import("./pages/SchoolKnowledgePage"));
const ReportPage = lazyRetry(() => import("./pages/ReportPage"));
const ResourcesPage = lazyRetry(() => import("./pages/ResourcesPage"));
const SubjectsPage = lazyRetry(() => import("./pages/SubjectsPage"));
const ResumeBuilderPage = lazyRetry(() => import("./pages/ResumeBuilderPage"));
const SettingsPage = lazyRetry(() => import("./pages/SettingsPage"));
const SettingsProfilePage = lazyRetry(() => import("./pages/SettingsProfilePage"));
const AcademicProfilesGuidePage = lazyRetry(() => import("./pages/AcademicProfilesGuidePage"));
const NotificationHistoryPage = lazyRetry(() => import("./pages/NotificationHistoryPage"));
const AboutPage = lazyRetry(() => import("./pages/AboutPage"));
const ExamPage = lazyRetry(() => import("./pages/ExamPage"));
const ExamAboutPage = lazyRetry(() => import("./pages/ExamAboutPage"));

const LOGOUT_TRANSITION_MIN_MS = 700;
const LOGOUT_TRANSITION_EXIT_MS = 280;
const TOPBAR_HIDE_DELAY_MS = 3500;

const NOTIFICATION_INTENT_KEY = "prepmatrix_notifications_enabled";
const TOPBAR_AUTO_HIDE_STORAGE_KEY = "prepmatrix_topbar_auto_hide";
const NOTIFICATION_RECONCILE_RETRY_DELAYS_MS = [4000, 15000];
const LOCKED_KIDS_PARENT_ACCESS = Object.freeze({
  unlocked: false,
  expiresAt: null,
  setupRequired: null,
  resolved: false,
});
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
  { to: "/kids", label: "Play & Learn", helper: "Games, adventures, and rewards", icon: Gamepad2, kidsOnly: true },
  { to: "/ai-chat", label: "AI Chat", helper: "Safe learning questions and explanations", icon: MessageCircle, youngKidsOnly: true },
  { to: "/subjects", label: "Subjects", helper: "Manage chapters and load", icon: BookOpen },
  { to: "/learn", label: "Start Learning", helper: "Upload, map, and revise", icon: BookOpenCheck },
  { to: "/planner", label: "Planner", helper: "Generate and rebalance work", icon: Calendar },
  { to: "/analytics", label: "Analytics", helper: "Progress, readiness, patterns", icon: TrendingUp },
  { to: "/notes", label: "Notes", helper: "Doubts and left topics", icon: StickyNote },
  { to: "/quiz", label: "Quiz", helper: "Topic-level checks", icon: Trophy },
  { to: "/exam", label: "Exam", helper: "Parent-guided tests and papers", icon: ClipboardList, youngKidsOnly: true },
  { to: "/report", label: "Report", helper: "Planner intelligence", icon: ClipboardList },
  { to: "/resources", label: "Materials", helper: "Suggested study resources", icon: Library },
  {
    to: "/resume-builder",
    label: "Resume Builder",
    helper: "Create, edit, and export a professional resume",
    icon: FileUser,
    resumeOnly: true,
  },
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

function LogoutTransition({ phase }) {
  return (
    <div className={`logout-transition${phase === "exiting" ? " is-exiting" : ""}`}>
      <div aria-hidden="true" className="logout-transition-halo" />
      <div
        aria-atomic="true"
        aria-live="polite"
        autoFocus
        className="logout-transition-panel"
        role="status"
        tabIndex={-1}
      >
        <span aria-hidden="true" className="logout-transition-icon">
          <LogOut size={28} strokeWidth={2.3} />
        </span>
        <div className="logout-transition-copy">
          <span>PrepMatrix</span>
          <h2>Logging out...</h2>
          <p>Closing your session securely.</p>
        </div>
        <div aria-hidden="true" className="logout-transition-progress">
          <span />
        </div>
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
  const workspaceSavePromiseRef = useRef(Promise.resolve());
  const workspaceScopeEpochRef = useRef(0);
  const workspaceMutationInFlightRef = useRef(false);
  const academicProfileDeletionRetryRef = useRef(null);
  const academicProfileEventRevisionRef = useRef(0);
  const currentUserProfileRef = useRef(null);
  const applyWorkspaceRef = useRef(null);
  const academicProfileSaveRef = useRef(null);
  const academicProfileRevisionRef = useRef(0);
  const rewardTimeoutRef = useRef(null);
  const splashTimeoutRef = useRef(null);
  const logoutTransitionTimeoutRef = useRef(null);
  const logoutInFlightRef = useRef(false);
  const resetConfirmRef = useRef(null);
  const parentLockTriggerRef = useRef(null);
  const parentLockDialogRef = useRef(null);
  const parentLockWasOpenRef = useRef(false);
  const profilePreviewTimerRef = useRef(null);
  const topBarHideTimeoutRef = useRef(null);
  const [subjects, setSubjects] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [completed, setCompleted] = useState([]);
  const [scheduleStartDate, setScheduleStartDate] = useState(null);
  const [academicLevel, setAcademicLevel] = useState("College");
  const [academicTrack, setAcademicTrack] = useState("General");
  const [materialBookmarks, setMaterialBookmarks] = useState([]);
  const [resumeBuilder, setResumeBuilder] = useState(() => normalizeResumeBuilderState());
  const [goalReminderData, setGoalReminderData] = useState(() => normalizePlannerData(DEFAULT_GOAL_REMINDER_DATA));
  const [goalReminderSettings, setGoalReminderSettings] = useState(() => normalizePlannerSettings(DEFAULT_GOAL_REMINDER_SETTINGS));
  const [darkMode, setDarkMode] = useState(() => {
    const savedDefault = localStorage.getItem("prepmatrix_default_theme");
    if (savedDefault) return savedDefault === "dark";
    return false;
  });
  const [activeBackgroundImageId, setActiveBackgroundImageId] = useState(
    () => localStorage.getItem("prepmatrix_bg_image_id") || "",
  );
  const [userProfile, setUserProfile] = useState(null);
  const [profileContext, setProfileContext] = useState(() => resolveAcademicProfileContext());
  const [kidsParentAccess, setKidsParentAccess] = useState(LOCKED_KIDS_PARENT_ACCESS);
  const [activeExamAttemptId, setActiveExamAttemptId] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);
  const [workspaceTransitioning, setWorkspaceTransitioning] = useState(false);
  const [notification, setNotification] = useState("");
  const [completionReward, setCompletionReward] = useState(null);
  const [entrySplash, setEntrySplash] = useState(true);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [parentLockConfirmOpen, setParentLockConfirmOpen] = useState(false);
  const [parentLockWorking, setParentLockWorking] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [logoutTransitionPhase, setLogoutTransitionPhase] = useState("idle");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [profilePreviewOpen, setProfilePreviewOpen] = useState(false);
  const [profilePreviewSide, setProfilePreviewSide] = useState("photo");
  const [academicProfileIntro, setAcademicProfileIntro] = useState(null);
  const [academicProfileIntroOpen, setAcademicProfileIntroOpen] = useState(false);
  const academicProfileIntroTimerRef = useRef(null);
  const resetAcademicProfileIntro = () => {
    if (academicProfileIntroTimerRef.current) {
      window.clearTimeout(academicProfileIntroTimerRef.current);
      academicProfileIntroTimerRef.current = null;
    }
    setAcademicProfileIntroOpen(false);
    setAcademicProfileIntro(null);
  };
  useEffect(() => () => {
    if (academicProfileIntroTimerRef.current) {
      window.clearTimeout(academicProfileIntroTimerRef.current);
    }
  }, []);
  const [cursorStyle, setCursorStyle] = useState(() => {
    const saved = localStorage.getItem("prepmatrix_cursor_style") || "app-cursor";
    // Migrate old neon-cursor preference to blob-cursor
    if (saved === "neon-cursor") {
      localStorage.setItem("prepmatrix_cursor_style", "blob-cursor");
      return "blob-cursor";
    }
    return saved;
  });
  const [autoHideTopBar, setAutoHideTopBar] = useState(
    () => localStorage.getItem(TOPBAR_AUTO_HIDE_STORAGE_KEY) === "true"
  );
  const [topBarVisible, setTopBarVisible] = useState(true);
  const clearTopBarHideTimeout = useCallback(() => {
    if (!topBarHideTimeoutRef.current) return;

    window.clearTimeout(topBarHideTimeoutRef.current);
    topBarHideTimeoutRef.current = null;
  }, []);
  const handleAutoHideTopBarChange = useCallback((enabled) => {
    const nextValue = Boolean(enabled);

    clearTopBarHideTimeout();
    setTopBarVisible(true);
    setAutoHideTopBar(nextValue);
    localStorage.setItem(TOPBAR_AUTO_HIDE_STORAGE_KEY, String(nextValue));
  }, [clearTopBarHideTimeout]);
  const showTopBar = useCallback(() => {
    if (!autoHideTopBar) return;

    clearTopBarHideTimeout();
    setTopBarVisible(true);
  }, [autoHideTopBar, clearTopBarHideTimeout]);
  const scheduleTopBarHide = useCallback(() => {
    if (!autoHideTopBar) return;

    clearTopBarHideTimeout();
    topBarHideTimeoutRef.current = window.setTimeout(() => {
      topBarHideTimeoutRef.current = null;
      setTopBarVisible(false);
    }, TOPBAR_HIDE_DELAY_MS);
  }, [autoHideTopBar, clearTopBarHideTimeout]);
  const handleTopBarBlur = useCallback((event) => {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    scheduleTopBarHide();
  }, [scheduleTopBarHide]);

  useEffect(() => {
    clearTopBarHideTimeout();
    setTopBarVisible(true);

    if (!autoHideTopBar) return undefined;

    topBarHideTimeoutRef.current = window.setTimeout(() => {
      topBarHideTimeoutRef.current = null;
      setTopBarVisible(false);
    }, TOPBAR_HIDE_DELAY_MS);

    return clearTopBarHideTimeout;
  }, [autoHideTopBar, clearTopBarHideTimeout]);

  const learnerRoutePolicy = useMemo(
    () => getLearnerRoutePolicy({
      ...(userProfile || {}),
      academicLevel,
      academicTrack,
    }),
    [academicLevel, academicTrack, userProfile],
  );
  const isKidsLearner = learnerRoutePolicy.isKidsLearner;
  const userIdentity = userProfile?.id || userProfile?._id || userProfile?.email || "";
  useAppUsageTracker(userProfile, Boolean(userIdentity));
  const kidsGamepadIcon = resolveKidsGamepadIcon(activeBackgroundImageId);
  const activeAcademicProfileDataId = profileContext?.dataId || "";
  const updateKidsParentAccess = useCallback((value = {}) => {
    const parentAccess = value?.parentAccess || value;
    setKidsParentAccess((current) => ({
      ...current,
      resolved: true,
      unlocked: Boolean(parentAccess?.unlocked),
      expiresAt: parentAccess?.expiresAt || null,
      setupRequired: typeof parentAccess?.setupRequired === "boolean"
        ? parentAccess.setupRequired
        : current.setupRequired,
    }));
  }, []);

  const confirmKidsParentLock = useCallback(async () => {
    if (parentLockWorking) return;

    setParentLockWorking(true);
    try {
      const payload = await api.post("/api/kids/parent-access/lock", {});
      updateKidsParentAccess(payload?.parentAccess || { unlocked: false });
      toast.success("Parent Corner locked.");
      setParentLockConfirmOpen(false);
      setSidebarOpen(false);
    } catch {
      toast.error("Could not exit Parent Corner. Check your connection and try again.");
    } finally {
      setParentLockWorking(false);
    }
  }, [parentLockWorking, updateKidsParentAccess]);

  useEffect(() => {
    const wasOpen = parentLockWasOpenRef.current;
    parentLockWasOpenRef.current = parentLockConfirmOpen;

    if (parentLockConfirmOpen) {
      parentLockDialogRef.current?.focus();
    } else if (wasOpen) {
      parentLockTriggerRef.current?.focus();
    }
  }, [parentLockConfirmOpen]);

  useEffect(() => {
    let active = true;
    if (!userIdentity || !learnerRoutePolicy.isYoungKidsLearner) {
      setKidsParentAccess(LOCKED_KIDS_PARENT_ACCESS);
      return undefined;
    }

    api.get("/api/kids/parent-access", { academicProfileId: activeAcademicProfileDataId })
      .then((payload) => {
        if (active) updateKidsParentAccess(payload);
      })
      .catch(() => {
        if (active) setKidsParentAccess({ ...LOCKED_KIDS_PARENT_ACCESS, resolved: true });
      });

    return () => {
      active = false;
    };
  }, [activeAcademicProfileDataId, learnerRoutePolicy.isYoungKidsLearner, updateKidsParentAccess, userIdentity]);

  useEffect(() => {
    if (!kidsParentAccess.unlocked || !kidsParentAccess.expiresAt) return undefined;
    const expiresAt = new Date(kidsParentAccess.expiresAt).getTime();
    if (!Number.isFinite(expiresAt)) return undefined;
    const delay = Math.max(0, expiresAt - Date.now());
    const timer = window.setTimeout(() => {
      setKidsParentAccess((current) => ({ ...current, unlocked: false, expiresAt: null }));
    }, Math.min(delay + 100, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [kidsParentAccess.expiresAt, kidsParentAccess.unlocked]);

  const metrics = useMemo(
    () => getPlannerMetrics(schedule, completed),
    [schedule, completed]
  );

  const isAuthRoute = location.pathname === "/login" || location.pathname === "/register";
  const resumeEligibility = useMemo(
    () => getResumeEligibility({
      ...(userProfile || {}),
      academicLevel,
      academicTrack,
    }),
    [academicLevel, academicTrack, userProfile]
  );
  const learningCareerEligibility = useMemo(
    () => getLearningCareerEligibility({
      ...(userProfile || {}),
      academicLevel,
      academicTrack,
    }),
    [academicLevel, academicTrack, userProfile]
  );
  const learningMedicalTrainingEligibility = useMemo(
    () => getLearningMedicalTrainingEligibility({
      ...(userProfile || {}),
      academicLevel,
      academicTrack,
    }),
    [academicLevel, academicTrack, userProfile]
  );
  const visibleNavItems = useMemo(
    () => NAV_ITEMS
      .filter(
        (item) => (
          (!item.resumeOnly || (userProfile && resumeEligibility.enabled))
          && (!item.kidsOnly || learnerRoutePolicy.canAccessKidsRoute)
          && (!item.youngKidsOnly || learnerRoutePolicy.isYoungKidsLearner)
          && (!learnerRoutePolicy.isYoungKidsLearner || isYoungKidsNavRoute(item.to))
        )
      )
      .map((item) => (
        item.to === "/kids" && learnerRoutePolicy.isSchoolChallengeLearner
          ? { ...item, label: "Knowledge Quest", helper: "Daily General Knowledge and personal scores" }
          : item
      )),
    [learnerRoutePolicy, resumeEligibility.enabled, userProfile]
  );
  const primarySidebarNavItems = useMemo(
    () => getPrimarySidebarNavItems(visibleNavItems, {
      isYoungKidsLearner: learnerRoutePolicy.isYoungKidsLearner,
    }),
    [learnerRoutePolicy.isYoungKidsLearner, visibleNavItems],
  );
  const dashboardAvailableRoutes = useMemo(() => {
    const visibleRoutes = new Set(visibleNavItems.map((item) => item.to));
    const contentRoutes = [
      ...(visibleRoutes.has("/dashboard") ? [
        "/dashboard#smart-suggestions",
        "/dashboard#progress-status",
        "/dashboard#weekly-review",
      ] : []),
      ...getGoalReminderShortcutRoutes({
        hasDashboard: visibleRoutes.has("/dashboard"),
        isKidsLearner,
      }),
      ...(visibleRoutes.has("/subjects") ? ["/subjects#subject-library"] : []),
      ...(visibleRoutes.has("/learn") && !learnerRoutePolicy.isYoungKidsLearner
        ? ["/learn#subject-mastery"]
        : []),
      ...(visibleRoutes.has("/learn")
        && learningCareerEligibility.enabled
        && !learningMedicalTrainingEligibility.enabled
        ? ["/learn#placement-prep"]
        : []),
      ...(visibleRoutes.has("/learn") && learningMedicalTrainingEligibility.enabled
        ? ["/learn#medical-training"]
        : []),
      ...(visibleRoutes.has("/analytics") ? ["/analytics#topic-progress"] : []),
      ...(visibleRoutes.has("/resume-builder")
        ? ["/resume-builder#resume-history"]
        : []),
    ];

    return [
      ...visibleNavItems,
      ...contentRoutes,
      "/settings",
      "/settings/profile",
      "/settings/profiles",
      "/about",
      ...(!isKidsLearner ? [
        "/exam",
        "/exam/about",
        "/notification-history",
      ] : []),
    ];
  }, [
    isKidsLearner,
    learnerRoutePolicy.isYoungKidsLearner,
    learningCareerEligibility.enabled,
    learningMedicalTrainingEligibility.enabled,
    visibleNavItems,
  ]);
  const voiceAvailableRoutes = useMemo(
    () => [...dashboardAvailableRoutes, "/ai-chat"],
    [dashboardAvailableRoutes],
  );
  const voiceAssistant = useVoiceAssistant({
    academicProfileDataId: activeAcademicProfileDataId,
    academicLevel,
    academicTrack,
    schedule,
    completed,
    allowExternalNavigation: !learnerRoutePolicy.isYoungKidsLearner || kidsParentAccess.unlocked,
    availableRoutes: voiceAvailableRoutes,
    disabled: authLoading || !userProfile,
    homeRoute: learnerRoutePolicy.homeRoute,
    setDarkMode,
  });

  const standardOnlyRoute = (element) => (
    isKidsLearner ? <Navigate replace to={learnerRoutePolicy.homeRoute} /> : element
  );
  const parentGuidedKidsRoute = (
    element,
    returnTo,
    feature,
    { allowActiveExamAttempt = false } = {},
  ) => {
    const decision = getYoungKidsParentRouteDecision({
      hasActiveExamAttempt: allowActiveExamAttempt && Boolean(activeExamAttemptId),
      isYoungKidsLearner: learnerRoutePolicy.isYoungKidsLearner,
      parentAccess: kidsParentAccess,
      route: returnTo,
    });
    if (decision === "allowed") return element;
    if (decision === "pending") return <RouteLoading />;
    return (
      <Navigate
        replace
        state={{ parentAccess: feature, returnTo }}
        to="/kids"
      />
    );
  };
  const activeRoute = visibleNavItems.find((item) => location.pathname.startsWith(item.to));
  const titleLabel = activeRoute?.label || (
    location.pathname.startsWith("/exam/about") ? "Exam Guide" :
    location.pathname.startsWith("/exam") ? "Exam" :
    location.pathname.startsWith("/notification-history") ? "Notification History" :
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

  const applyWorkspace = (workspace = {}, profile = null, requestedContext = null) => {
    const nextProfileContext = resolveAcademicProfileContext(
      requestedContext || workspace?.profileContext || {},
      profile || {},
    );
    const workspaceProfileId = String(
      workspace?.academicProfileId || workspace?.profileContext?.academicProfileId || "",
    ).trim();
    if (
      workspaceProfileId
      && nextProfileContext.dataId
      && workspaceProfileId !== nextProfileContext.dataId
    ) {
      throw new Error("The server returned a workspace for a different academic profile.");
    }
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
    const selectedProfile = Array.isArray(profile?.academicProfiles)
      ? profile.academicProfiles.find((item) => (
        getAcademicProfileDataId(item) === nextProfileContext.dataId
      ))
      : null;
    const effectiveProfile = { ...(profile || {}), ...(selectedProfile || {}) };
    const profileLevel = String(effectiveProfile?.academicLevel || "").trim();
    const workspaceLevel = String(workspace?.academicLevel || "").trim();
    const profileTrack = String(effectiveProfile?.academicTrack || "").trim();
    const workspaceTrack = String(workspace?.academicTrack || "").trim();
    const profileIsGeneric = !profileLevel || /^(school|college|college \/ university)$/i.test(profileLevel);
    const nextAcademicProfile = normalizeAcademicProfile({
      ...effectiveProfile,
      academicLevel: profileIsGeneric && workspaceLevel ? workspaceLevel : profileLevel || workspaceLevel,
      academicTrack: profileIsGeneric && (!profileTrack || profileTrack === "General")
        ? workspaceTrack || profileTrack
        : profileTrack,
    });
    setSubjects(nextSubjects);
    setSchedule(nextSchedule);
    setCompleted(Array.isArray(workspace?.completed) ? workspace.completed : []);
    setAcademicLevel(nextAcademicProfile.academicLevel);
    setAcademicTrack(nextAcademicProfile.academicTrack);
    if (profile) {
      setUserProfile((current) => ({ ...(current || profile), ...nextAcademicProfile }));
    }
    setProfileContext(nextProfileContext);
    setApiAcademicProfileScope(nextProfileContext);
    if (typeof window !== "undefined" && nextProfileContext.dataId && profile) {
      const legacyOwnerKey = legacyAcademicProfileOwnerStorageKey(profile);
      if (legacyOwnerKey && !window.localStorage.getItem(legacyOwnerKey)) {
        window.localStorage.setItem(legacyOwnerKey, nextProfileContext.dataId);
      }
    }
    setMaterialBookmarks(normalizeMaterialBookmarks(workspace?.materialBookmarks));
    setResumeBuilder(normalizeResumeBuilderState(workspace?.resumeBuilder, {
      ...(profile || {}),
      ...nextAcademicProfile,
    }));
    const nextGoalReminderSettings = normalizePlannerSettings(workspace?.goalReminderSettings || DEFAULT_GOAL_REMINDER_SETTINGS);
    const nextGoalReminderData = syncStudyTargetReminders(workspace?.goalReminderData || DEFAULT_GOAL_REMINDER_DATA, nextGoalReminderSettings);
    setGoalReminderData(nextGoalReminderData);
    setGoalReminderSettings(nextGoalReminderSettings);
    setDarkMode(Boolean(workspace.darkMode));
    setScheduleStartDate(workspace.scheduleStartDate || null);
    setActiveExamAttemptId(
      typeof window === "undefined"
        ? ""
        : readStoredActiveExamAttemptId(window.localStorage, nextProfileContext.dataId),
    );
  };
  currentUserProfileRef.current = userProfile;
  applyWorkspaceRef.current = applyWorkspace;

  useEffect(() => {
    let disposed = false;
    let retryTimer = null;

    const recoverAuthoritativeWorkspace = async (revision) => {
      if (disposed || revision !== academicProfileEventRevisionRef.current) return;
      if (workspaceMutationInFlightRef.current) {
        retryTimer = window.setTimeout(
          () => recoverAuthoritativeWorkspace(revision),
          120,
        );
        return;
      }

      workspaceMutationInFlightRef.current = true;
      setWorkspaceTransitioning(true);
      try {
        await workspaceSavePromiseRef.current;
        if (disposed || revision !== academicProfileEventRevisionRef.current) return;

        const recovered = await api.me({ academicProfileId: null });
        if (disposed || revision !== academicProfileEventRevisionRef.current) return;
        const recoveredUser = recovered?.user;
        const recoveredContext = resolveAcademicProfileContext(
          recovered?.profileContext || {},
          recoveredUser || {},
        );
        if (!recoveredUser || !recoveredContext.dataId) {
          throw new Error("The active academic profile could not be refreshed.");
        }

        const rememberedDeletion = academicProfileDeletionRetryRef.current;
        if (
          rememberedDeletion?.id
          && !recoveredUser.academicProfiles?.some(
            (profile) => (
              profile?.id === rememberedDeletion.id
              && getAcademicProfileDataId(profile) === rememberedDeletion.dataId
            ),
          )
        ) {
          academicProfileDeletionRetryRef.current = null;
        }

        workspaceScopeEpochRef.current += 1;
        setCompletionReward(null);
        setResetConfirmOpen(false);
        setKidsParentAccess(LOCKED_KIDS_PARENT_ACCESS);
        setUserProfile(recoveredUser);
        applyWorkspaceRef.current?.(
          recovered?.workspace || {},
          recoveredUser,
          recoveredContext,
        );
        setWorkspaceLoaded(true);
      } catch (error) {
        if (!disposed && revision === academicProfileEventRevisionRef.current) {
          setWorkspaceLoaded(false);
          setNotification(error instanceof Error
            ? error.message
            : "The active academic profile changed in another tab. Refresh to continue.");
        }
      } finally {
        workspaceMutationInFlightRef.current = false;
        if (!disposed && revision === academicProfileEventRevisionRef.current) {
          setWorkspaceTransitioning(false);
        }
      }
    };

    const handleAcademicProfileStorageEvent = (event) => {
      if (event.key !== "prepmatrix_academic_profile_event" || !event.newValue) return;
      let payload;
      try {
        payload = JSON.parse(event.newValue);
      } catch {
        return;
      }
      const deletedDataId = String(payload?.deletedDataId || "").trim();
      const eventProfileDataId = String(payload?.profileDataId || "").trim();
      if (
        !Number.isFinite(Number(payload?.at))
        || (deletedDataId && !isValidAcademicProfileDataId(deletedDataId))
        || (!deletedDataId && !isValidAcademicProfileDataId(eventProfileDataId))
      ) return;

      if (deletedDataId) {
        clearAcademicProfileBrowserData(deletedDataId);
        clearOwnedLegacyAcademicProfileBrowserData(
          currentUserProfileRef.current || {},
          deletedDataId,
        );
      }
      clearPendingAcademicProfileActions(deletedDataId);
      workspaceScopeEpochRef.current += 1;
      setWorkspaceLoaded(false);
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }

      const revision = academicProfileEventRevisionRef.current + 1;
      academicProfileEventRevisionRef.current = revision;
      if (currentUserProfileRef.current) recoverAuthoritativeWorkspace(revision);
    };

    window.addEventListener("storage", handleAcademicProfileStorageEvent);
    return () => {
      disposed = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      window.removeEventListener("storage", handleAcademicProfileStorageEvent);
    };
  }, []);

  const workspaceSnapshot = () => ({
    subjects,
    schedule,
    completed,
    materialBookmarks,
    resumeBuilder,
    goalReminderData,
    goalReminderSettings,
    darkMode,
    scheduleStartDate,
  });

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

  const runAcademicProfileTransition = async (payload, { deletedProfile = null } = {}) => {
    if (workspaceMutationInFlightRef.current) {
      throw new Error("Another workspace change is still in progress.");
    }

    const previousContext = profileContext;
    const previousDataId = previousContext?.dataId || "";
    workspaceMutationInFlightRef.current = true;
    setWorkspaceTransitioning(true);
    setWorkspaceLoaded(false);

    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    try {
      await workspaceSavePromiseRef.current;
      if (previousDataId) {
        const finalSave = api.saveWorkspace(workspaceSnapshot(), {
          academicProfileId: previousDataId,
        });
        workspaceSavePromiseRef.current = finalSave.catch(() => undefined);
        await finalSave;
      }

      const response = await api.updateProfile(payload, {
        academicProfileId: previousDataId || null,
        ...(deletedProfile ? { timeoutMs: ACADEMIC_PROFILE_DELETE_TIMEOUT_MS } : {}),
      });
      const nextUser = response?.user;
      if (!nextUser) throw new Error("The updated academic profile could not be loaded.");
      const nextContext = resolveAcademicProfileContext(response?.profileContext || {}, nextUser);
      if (!nextContext.dataId) {
        throw new Error("The updated academic profile is missing its data scope.");
      }

      workspaceScopeEpochRef.current += 1;
      clearPendingAcademicProfileActions();
      setCompletionReward(null);
      setResetConfirmOpen(false);
      setKidsParentAccess(LOCKED_KIDS_PARENT_ACCESS);
      setUserProfile(nextUser);
      applyWorkspace(response?.workspace || {}, nextUser, nextContext);

      if (deletedProfile?.dataId) {
        academicProfileDeletionRetryRef.current = null;
        clearAcademicProfileBrowserData(deletedProfile.dataId);
        clearOwnedLegacyAcademicProfileBrowserData(nextUser, deletedProfile.dataId);
      }
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem("prepmatrix_academic_profile_event", JSON.stringify({
            at: Date.now(),
            deletedDataId: deletedProfile?.dataId || "",
            profileDataId: nextContext.dataId,
          }));
        } catch {
          // The server response remains authoritative when browser storage is unavailable.
        }
      }
      setWorkspaceLoaded(true);
      return response;
    } catch (error) {
        if (deletedProfile?.id) {
          academicProfileDeletionRetryRef.current = {
            id: deletedProfile.id,
            dataId: deletedProfile.dataId || "",
          };
        }
        try {
          const {
            recovered,
            recoveredUser,
            recoveredContext,
            committed,
          } = await recoverAcademicProfileTransitionAfterFailure({
            loadAuthoritativeState: (options) => api.me(options),
            timeoutMs: AUTH_RECOVERY_TIMEOUT_MS,
            payload,
            previousDataId,
            deletedProfile,
          });

          let recoveredTarget = null;
          let deletionCompleted = false;
          if (deletedProfile?.id) {
            recoveredTarget = recoveredUser.academicProfiles?.find(
              (profile) => (
                profile?.id === deletedProfile.id
                && getAcademicProfileDataId(profile) === deletedProfile.dataId
              ),
            );
            deletionCompleted = !recoveredTarget;
            if (recoveredTarget?.deletionPending) {
              academicProfileDeletionRetryRef.current = {
                id: recoveredTarget.id,
                dataId: getAcademicProfileDataId(recoveredTarget)
                  || deletedProfile.dataId
                  || "",
              };
            } else {
              academicProfileDeletionRetryRef.current = null;
            }
          }

          workspaceScopeEpochRef.current += 1;
          clearPendingAcademicProfileActions();
          setCompletionReward(null);
          setResetConfirmOpen(false);
          setKidsParentAccess(LOCKED_KIDS_PARENT_ACCESS);
          setUserProfile(recoveredUser);
          applyWorkspace(recovered?.workspace || {}, recoveredUser, recoveredContext);

          const recoveredDeletionDataId = getAcademicProfileDataId(recoveredTarget)
            || deletedProfile?.dataId
            || "";
          const deletionScopeChanged = deletionCompleted
            || Boolean(recoveredTarget?.deletionPending);
          if (deletionScopeChanged && recoveredDeletionDataId) {
            clearAcademicProfileBrowserData(recoveredDeletionDataId);
            clearOwnedLegacyAcademicProfileBrowserData(
              recoveredUser,
              recoveredDeletionDataId,
            );
          }
          if (typeof window !== "undefined") {
            const deletedDataId = deletionScopeChanged ? recoveredDeletionDataId : "";
            try {
              window.localStorage.setItem("prepmatrix_academic_profile_event", JSON.stringify({
                at: Date.now(),
                deletedDataId,
                deletionState: deletedProfile
                  ? deletionCompleted
                    ? "completed"
                    : recoveredTarget?.deletionPending
                      ? "pending"
                      : "unchanged"
                  : undefined,
                transitionState: committed ? "committed" : "unchanged",
                profileDataId: recoveredContext.dataId,
              }));
            } catch {
              // The recovered server state remains authoritative.
            }
          }

          setWorkspaceLoaded(true);
          if (deletionCompleted) return recovered;
          if (committed) return recovered;
        } catch (recoveryError) {
          setWorkspaceLoaded(false);
          setNotification(recoveryError instanceof Error
            ? recoveryError.message
            : "The active academic profile could not be recovered.");
        }
        throw error;
    } finally {
      workspaceMutationInFlightRef.current = false;
      setWorkspaceTransitioning(false);
    }
  };

  const createAcademicProfile = async (payload) => {
    const response = await runAcademicProfileTransition(payload);
    const nextUser = response?.user || {};
    const nextContext = resolveAcademicProfileContext(response?.profileContext || {}, nextUser);
    const activeProfile = Array.isArray(nextUser.academicProfiles)
      ? nextUser.academicProfiles.find((profile) => (
        getAcademicProfileDataId(profile) === nextContext.dataId
      ))
      : null;

    if (activeProfile && claimFirstProfileBGuide(activeProfile)) {
      const otherProfile = nextUser.academicProfiles.find((profile) => profile !== activeProfile);
      if (academicProfileIntroTimerRef.current) {
        window.clearTimeout(academicProfileIntroTimerRef.current);
      }
      setAcademicProfileIntro({
        activeProfileLabel: activeProfile.label || "Profile B",
        otherProfileLabel: otherProfile?.label || "Profile A",
        userName: nextUser.username || "",
      });
      academicProfileIntroTimerRef.current = window.setTimeout(() => {
        setAcademicProfileIntroOpen(true);
        academicProfileIntroTimerRef.current = null;
      }, 650);
    }
    return response;
  };
  const visitAcademicProfile = (profile) => runAcademicProfileTransition({
    visitAcademicProfileId: profile?.id,
  });
  const deleteAcademicProfile = (profile) => {
    const payload = buildAcademicProfileDeletePayload(profile);
    if (!payload) throw new Error("The selected academic profile is missing its immutable data scope.");
    return runAcademicProfileTransition(payload, { deletedProfile: profile });
  };

  const importActiveProfileWorkspace = async (backup = {}) => {
    if (
      !activeAcademicProfileDataId
      || workspaceTransitioning
      || workspaceMutationInFlightRef.current
    ) {
      throw new Error("The active academic profile is not ready.");
    }

    const requestedAcademicProfileId = activeAcademicProfileDataId;
    const requestedEpoch = workspaceScopeEpochRef.current;
    const scopeIsCurrent = () => (
      requestedEpoch === workspaceScopeEpochRef.current
      && requestedAcademicProfileId === getApiAcademicProfileScope()
    );
    let importAccepted = false;
    workspaceMutationInFlightRef.current = true;
    setWorkspaceTransitioning(true);
    setWorkspaceLoaded(false);

    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    try {
      await workspaceSavePromiseRef.current;
      if (!scopeIsCurrent()) {
        throw new Error("The active academic profile changed before the workspace update started.");
      }

      const importRequest = api.importWorkspace(backup, {
        academicProfileId: requestedAcademicProfileId,
      });
      workspaceSavePromiseRef.current = importRequest.catch(() => undefined);
      const response = await importRequest;
      importAccepted = true;
      if (!scopeIsCurrent()) {
        throw new Error("The active academic profile changed while the workspace update was running.");
      }

      const responseContext = resolveAcademicProfileContext(
        response?.profileContext || profileContext,
        userProfile || {},
      );
      if (responseContext.dataId !== requestedAcademicProfileId) {
        throw new Error("The imported workspace belongs to a different academic profile.");
      }
      workspaceScopeEpochRef.current += 1;
      applyWorkspace(response?.workspace || {}, userProfile, responseContext);
      setWorkspaceLoaded(true);
      return response;
    } catch (error) {
      if (!importAccepted && scopeIsCurrent()) setWorkspaceLoaded(true);
      throw error;
    } finally {
      workspaceMutationInFlightRef.current = false;
      setWorkspaceTransitioning(false);
    }
  };

  const updateSubjects = (nextSubjects, options = {}) => {
    const normalizedSubjects = Array.isArray(nextSubjects) ? nextSubjects : [];
    setSubjects(normalizedSubjects);
    const scheduleMutationMode = getSubjectScheduleMutationMode({
      isYoungKidsLearner: learnerRoutePolicy.isYoungKidsLearner,
      parentAccessGranted: kidsParentAccess.unlocked,
      preserveSchedule: options.preserveSchedule,
    });
    if (scheduleMutationMode === SUBJECT_SCHEDULE_MUTATION_MODES.KEEP) {
      return;
    }
    if (scheduleMutationMode === SUBJECT_SCHEDULE_MUTATION_MODES.RECONCILE) {
      const reconciled = reconcileScheduleWithSubjects(
        schedule,
        completed,
        subjects,
        normalizedSubjects,
      );
      if (reconciled.changed) {
        setSchedule(reconciled.schedule);
        setCompleted(reconciled.completed);
      }
      return;
    }
    setSchedule([]);
    setCompleted([]);
    setScheduleStartDate(null);
  };

  const handleLogin = (profile, workspace, requestedContext = null) => {
    setUserProfile(profile);
    applyWorkspace(workspace, profile, requestedContext);
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
    if (logoutInFlightRef.current) return;

    logoutInFlightRef.current = true;
    setLogoutConfirmOpen(false);
    setLogoutTransitionPhase("active");
    setSidebarOpen(false);
    setProfilePreviewOpen(false);
    resetAcademicProfileIntro();

    voiceAssistant.pauseWakeMode?.();
    window.studyVoiceAssistant?.pauseWakeListening?.();
    window.speechSynthesis?.cancel?.();
    window.dispatchEvent(new CustomEvent("voiceRecordingChange", { detail: { isRecording: false } }));

    const minimumTransition = new Promise((resolve) => {
      window.setTimeout(resolve, LOGOUT_TRANSITION_MIN_MS);
    });
    const logoutRequest = api.logout().catch(() => undefined);

    await Promise.all([
      logoutRequest,
      minimumTransition,
    ]);

    clearStoredAuthState();

    if (splashTimeoutRef.current) {
      window.clearTimeout(splashTimeoutRef.current);
    }

    setEntrySplash(false);
    setUserProfile(null);
    setWorkspaceLoaded(false);
    applyWorkspace({}, null);
    setNotification("Logged out of PrepMatrix.");
    setLogoutTransitionPhase("exiting");

    if (logoutTransitionTimeoutRef.current) {
      window.clearTimeout(logoutTransitionTimeoutRef.current);
    }
    const logoutExitDelay = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
      ? 0
      : LOGOUT_TRANSITION_EXIT_MS;

    logoutTransitionTimeoutRef.current = window.setTimeout(() => {
      setLogoutTransitionPhase("idle");
      logoutInFlightRef.current = false;
      logoutTransitionTimeoutRef.current = null;
    }, logoutExitDelay);
  };

  const handleAccountDeleted = () => {
    resetAcademicProfileIntro();
    clearStoredAuthState();
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
    resetAcademicProfileIntro();
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
    const normalizedBookmark = normalizeMaterialBookmark(bookmark);
    if (!normalizedBookmark) {
      setNotification("This material link cannot be saved.");
      return;
    }

    const exists = materialBookmarks.some((item) => item.href === normalizedBookmark.href);

    if (exists) {
      setNotification("Material already saved.");
      return;
    }

    setMaterialBookmarks((current) => {
      if (current.some((item) => item.href === normalizedBookmark.href)) {
        return current;
      }

      return [
        {
          id: crypto.randomUUID(),
          savedAt: new Date().toISOString(),
          ...normalizedBookmark,
        },
        ...current,
      ];
    });
    setNotification("Material saved to library.");
  };

  const removeMaterialBookmark = (id) => {
    setMaterialBookmarks(materialBookmarks.filter((item) => (item.id || item.href) !== id));
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
        applyWorkspace(payload.workspace, payload.user, payload.profileContext);
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
    if (
      !userProfile
      || !workspaceLoaded
      || workspaceTransitioning
      || workspaceMutationInFlightRef.current
      || !activeAcademicProfileDataId
    ) {
      return undefined;
    }

    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }

    const requestedAcademicProfileId = activeAcademicProfileDataId;
    const requestedEpoch = workspaceScopeEpochRef.current;
    const snapshot = {
        subjects,
        schedule,
        completed,
        materialBookmarks,
        resumeBuilder,
        goalReminderData,
        goalReminderSettings,
        darkMode,
        scheduleStartDate,
      };

    saveTimeoutRef.current = window.setTimeout(() => {
      saveTimeoutRef.current = null;
      const saveRequest = api.saveWorkspace(snapshot, {
        academicProfileId: requestedAcademicProfileId,
      });
      workspaceSavePromiseRef.current = saveRequest.catch(() => undefined);
      saveRequest.catch((error) => {
        if (
          requestedEpoch !== workspaceScopeEpochRef.current
          || requestedAcademicProfileId !== getApiAcademicProfileScope()
        ) return;
        setNotification(error instanceof Error ? error.message : "Could not save workspace.");
      });
    }, 350);

    return () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [
    activeAcademicProfileDataId,
    completed,
    darkMode,
    goalReminderData,
    goalReminderSettings,
    materialBookmarks,
    resumeBuilder,
    schedule,
    scheduleStartDate,
    subjects,
    userProfile,
    workspaceLoaded,
    workspaceTransitioning,
  ]);

  useEffect(() => {
    const backgroundImageId = localStorage.getItem("prepmatrix_bg_image_id") || "";
    const hasBackgroundImage = !isAuthRoute && Boolean(resolveBackgroundPresetForProfile(
      backgroundImageId,
      {
        profile: learnerRoutePolicy.academicProfile,
        youngKidsMode: learnerRoutePolicy.isYoungKidsLearner,
      },
    ));
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
  }, [darkMode, isAuthRoute, learnerRoutePolicy.academicProfile, learnerRoutePolicy.isYoungKidsLearner]);

  useEffect(() => {
    const handleSWMessage = (event) => {
      if (event.data && event.data.type === "SHOW_TOAST") {
        toast.info(event.data.message, {
          position: "top-right",
          autoClose: 5000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
          toastId: event.data.tag || "study-reminder-push-toast",
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
        const state = await reconcileStudyReminders({}, { repairMissing: true });
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
    if (logoutConfirmOpen || logoutTransitionPhase !== "idle") {
      document.body.classList.add("modal-open");
    } else {
      document.body.classList.remove("modal-open");
    }
    return () => {
      document.body.classList.remove("modal-open");
    };
  }, [logoutConfirmOpen, logoutTransitionPhase]);

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
    const imgPreset = !isAuthRoute
      ? resolveBackgroundPresetForProfile(bgImgId, {
        profile: learnerRoutePolicy.academicProfile,
        youngKidsMode: learnerRoutePolicy.isYoungKidsLearner,
      })
      : undefined;
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
    const backgroundImageBlur = resolveBackgroundImageBlurPx(localStorage.getItem(BACKGROUND_IMAGE_BLUR_STORAGE_KEY), Boolean(imgPreset));
    const backgroundImageBlurInset = backgroundImageBlur > 0 ? -Math.ceil(backgroundImageBlur * 1.5) : 0;
    document.documentElement.style.setProperty("--bg-image-blur", `${backgroundImageBlur}px`);
    document.body.style.setProperty("--bg-image-blur", `${backgroundImageBlur}px`);
    document.documentElement.style.setProperty("--bg-image-blur-inset", `${backgroundImageBlurInset}px`);
    document.body.style.setProperty("--bg-image-blur-inset", `${backgroundImageBlurInset}px`);

    // Background image — suppressed entirely on auth routes
    const bgOvOp = localStorage.getItem("prepmatrix_bg_overlay_opacity") || "0.55";
    if (imgPreset) {
      document.body.classList.add("has-bg-image");
      document.documentElement.style.setProperty("--bg-image", `url(${imgPreset.file})`);
      applyBackgroundPresentation([document.documentElement, document.body], imgPreset);
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
      clearBackgroundPresentation([document.documentElement, document.body]);
      document.documentElement.style.removeProperty("--bg-surface-rgb");
      document.documentElement.style.removeProperty("--bg-overlay-opacity");
      document.body.style.removeProperty("--bg-overlay-opacity");
      document.documentElement.style.removeProperty("--bg-brightness");
      document.body.style.removeProperty("--bg-brightness");
    }
  }, [darkMode, isAuthRoute, learnerRoutePolicy.academicProfile, learnerRoutePolicy.isYoungKidsLearner]);

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

    if (logoutTransitionTimeoutRef.current) {
      window.clearTimeout(logoutTransitionTimeoutRef.current);
    }
    logoutInFlightRef.current = false;

    if (profilePreviewTimerRef.current) {
      window.clearTimeout(profilePreviewTimerRef.current);
    }

    if (topBarHideTimeoutRef.current) {
      window.clearTimeout(topBarHideTimeoutRef.current);
    }
  }, []);

  return (
    <div className={`app-container app-shell-layout ${userProfile && !isAuthRoute ? "has-sidebar" : "auth-layout"} ${sidebarCollapsed ? "is-sidebar-collapsed" : ""} cursor-mode--${cursorStyle}${isKidsLearner ? " is-kids-mode" : ""}`}>
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
      {logoutTransitionPhase !== "idle" && <LogoutTransition phase={logoutTransitionPhase} />}

      {userProfile && !isAuthRoute && sidebarOpen && (
        <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}

      {userProfile && !isAuthRoute && (
        <aside
          aria-hidden={logoutTransitionPhase !== "idle"}
          className={`app-sidebar ${sidebarOpen ? "open" : ""}`}
          inert={logoutTransitionPhase !== "idle" ? true : undefined}
        >
          <div className="sidebar-header">
            <Link to={learnerRoutePolicy.homeRoute} className="workspace-logo-wrap" aria-label="PrepMatrix">
              <span className="workspace-logo-mark" aria-hidden="true">P</span>
              <h1 className="workspace-logo-title">PrepMatrix</h1>
            </Link>
            <div className="sidebar-header-actions">
              <button
                className="sidebar-collapse-btn"
                onClick={() => {
                  setParentLockConfirmOpen(false);
                  setSidebarCollapsed(!sidebarCollapsed);
                }}
                aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                type="button"
              >
                {sidebarCollapsed ? <Menu size={18} /> : <ChevronLeft size={20} />}
              </button>
              <button
                className="sidebar-close-btn"
                onClick={() => setSidebarOpen(false)}
                aria-label="Close sidebar"
                type="button"
              >
                <X size={20} />
              </button>
            </div>
          </div>
          <SidebarProximityNav
            items={primarySidebarNavItems}
            onNavigate={() => setSidebarOpen(false)}
          />
          
          <div className="sidebar-widgets">
            {isKidsLearner && (
              <div aria-label="Kids quick launchers" className="sidebar-companion-row sidebar-kids-launchers">
                <SidebarStudyPet />
                <NavLink
                  aria-label="Open Game Town"
                  className={({ isActive }) => `sidebar-game-town-link${isActive ? " active" : ""}`}
                  onClick={() => setSidebarOpen(false)}
                  title="Play and learn in Game Town"
                  to="/kids"
                >
                  <img alt="" aria-hidden="true" src={kidsGamepadIcon} />
                </NavLink>
                {kidsParentAccess.unlocked && !sidebarCollapsed && (
                  <div className="parent-corner-lock-control parent-corner-lock-control--expanded">
                    <button
                      aria-controls="parent-corner-lock-confirmation"
                      aria-expanded={parentLockConfirmOpen}
                      aria-haspopup="dialog"
                      aria-label="Exit Parent Corner"
                      className="parent-corner-lock-btn"
                      onClick={() => setParentLockConfirmOpen((open) => !open)}
                      ref={parentLockTriggerRef}
                      title="Exit Parent Corner"
                      type="button"
                    >
                      <LockKeyhole aria-hidden="true" size={18} />
                    </button>
                    {parentLockConfirmOpen && (
                      <div
                        aria-labelledby="parent-corner-lock-title"
                        className="parent-corner-lock-confirmation"
                        id="parent-corner-lock-confirmation"
                        onKeyDown={(event) => {
                          if (event.key === "Escape") setParentLockConfirmOpen(false);
                        }}
                        ref={parentLockDialogRef}
                        role="dialog"
                        tabIndex={-1}
                      >
                        <div className="parent-corner-lock-copy">
                          <span aria-hidden="true"><LockKeyhole size={18} /></span>
                          <div>
                            <strong id="parent-corner-lock-title">Exit Parent Corner?</strong>
                            <p>Settings and parent-only tools will be locked again.</p>
                          </div>
                        </div>
                        <div className="parent-corner-lock-actions">
                          <button disabled={parentLockWorking} onClick={() => setParentLockConfirmOpen(false)} type="button">
                            Stay here
                          </button>
                          <button
                            className="parent-corner-lock-confirm-btn"
                            disabled={parentLockWorking}
                            onClick={confirmKidsParentLock}
                            type="button"
                          >
                            {parentLockWorking ? "Locking..." : "Lock & exit"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            {!isKidsLearner && (<>
              <div className="sidebar-companion-row">
              <SidebarStudyPet />
              <GoalReminderCenter
                academicProfile={learnerRoutePolicy.academicProfile}
                data={goalReminderData}
                onDataChange={setGoalReminderData}
                onOpen={() => setSidebarOpen(false)}
                onSettingsChange={setGoalReminderSettings}
                settings={goalReminderSettings}
              />
              <div className="sidebar-mobile-actions" aria-label="Mobile workspace actions">
                <AiCreditIndicator />
                <button
                  aria-label="Reset planner"
                  aria-expanded={resetConfirmOpen}
                  aria-haspopup="dialog"
                  className="icon-shell-btn reset-icon-btn sidebar-reset-icon-btn"
                  onClick={() => {
                    setSidebarOpen(false);
                    resetPlanner();
                  }}
                  title="Reset planner"
                  type="button"
                >
                  <RotateCcw aria-hidden="true" size={18} strokeWidth={2.4} />
                </button>
              </div>
              </div>
              <Suspense fallback={null}>
              <div className="sidebar-widget-cell">
                <FloatingAnalytics completed={completed} schedule={schedule} subjects={subjects} />
              </div>
              </Suspense>
            </>)}
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
              key={activeAcademicProfileDataId || "no-academic-profile"}
              academicProfile={learnerRoutePolicy.academicProfile}
              academicProfileDataId={activeAcademicProfileDataId}
              academicLevel={academicLevel}
              academicTrack={academicTrack}
              availableRoutes={dashboardAvailableRoutes}
              childMode={isKidsLearner}
              completed={completed}
              materialBookmarks={materialBookmarks}
              onReset={resetPlanner}
              onSaveBookmark={saveMaterialBookmark}
              schedule={schedule}
              setDarkMode={setDarkMode}
              subjects={subjects}
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
            <div className="sidebar-footer-actions">
              {isKidsLearner && kidsParentAccess.unlocked && sidebarCollapsed && (
                <div className="parent-corner-lock-control parent-corner-lock-control--collapsed">
                  <button
                    aria-controls="parent-corner-lock-confirmation"
                    aria-expanded={parentLockConfirmOpen}
                    aria-haspopup="dialog"
                    aria-label="Exit Parent Corner"
                    className="parent-corner-lock-btn"
                    onClick={() => setParentLockConfirmOpen((open) => !open)}
                    ref={parentLockTriggerRef}
                    title="Exit Parent Corner"
                    type="button"
                  >
                    <LockKeyhole aria-hidden="true" size={18} />
                  </button>
                  {parentLockConfirmOpen && (
                    <div
                      aria-labelledby="parent-corner-lock-title"
                      className="parent-corner-lock-confirmation"
                      id="parent-corner-lock-confirmation"
                      onKeyDown={(event) => {
                        if (event.key === "Escape") setParentLockConfirmOpen(false);
                      }}
                      ref={parentLockDialogRef}
                      role="dialog"
                      tabIndex={-1}
                    >
                      <div className="parent-corner-lock-copy">
                        <span aria-hidden="true"><LockKeyhole size={18} /></span>
                        <div>
                          <strong id="parent-corner-lock-title">Exit Parent Corner?</strong>
                          <p>Settings and parent-only tools will be locked again.</p>
                        </div>
                      </div>
                      <div className="parent-corner-lock-actions">
                        <button disabled={parentLockWorking} onClick={() => setParentLockConfirmOpen(false)} type="button">
                          Stay here
                        </button>
                        <button
                          className="parent-corner-lock-confirm-btn"
                          disabled={parentLockWorking}
                          onClick={confirmKidsParentLock}
                          type="button"
                        >
                          {parentLockWorking ? "Locking..." : "Lock & exit"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {(!isKidsLearner || kidsParentAccess.unlocked) && <NavLink
                to="/settings"
                className={({ isActive }) =>
                  isActive ? "settings-icon-btn active" : "settings-icon-btn"
                }
                title="Settings"
                aria-label="Settings"
              >
                <SettingsIcon size={18} />
              </NavLink>}
            </div>
            {sidebarCollapsed && (
              <button
                className="sidebar-collapse-btn"
                onClick={() => {
                  setParentLockConfirmOpen(false);
                  setSidebarCollapsed(false);
                }}
                aria-label="Expand sidebar"
                title="Expand sidebar"
                type="button"
                style={{ margin: 0, padding: "8px" }}
              >
                <Menu size={18} />
              </button>
            )}
          </div>
        </aside>
      )}

      <div
        aria-hidden={logoutTransitionPhase !== "idle"}
        className={`app-main-content${autoHideTopBar ? " topbar-auto-hide-enabled" : ""}${
          autoHideTopBar && topBarVisible ? " topbar-visible" : ""
        }`}
        inert={logoutTransitionPhase !== "idle" ? true : undefined}
      >
        {userProfile && !isAuthRoute && (
          <>
            {autoHideTopBar && (
              <div
                aria-hidden="true"
                className="topbar-reveal-zone"
                onPointerEnter={showTopBar}
                onPointerLeave={scheduleTopBarHide}
              />
            )}
            <header
              className="workspace-topbar"
              onBlurCapture={handleTopBarBlur}
              onFocusCapture={showTopBar}
              onPointerEnter={showTopBar}
              onPointerLeave={scheduleTopBarHide}
            >
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

              </div>
            </div>

            <div className="topbar-right">
              <AiCreditIndicator />
              {/* Global browser VoiceAssistant service */}
              <VoiceAssistant
                academicLevel={academicLevel}
                academicTrack={academicTrack}
                completed={completed}
                schedule={schedule}
                hidden
                assistant={voiceAssistant}
              />


              {!isKidsLearner && <button
                aria-label="Reset planner"
                aria-expanded={resetConfirmOpen}
                aria-haspopup="dialog"
                className="icon-shell-btn reset-icon-btn"
                onClick={resetPlanner}
                title="Reset planner"
                type="button"
              >
                <RotateCcw aria-hidden="true" size={20} strokeWidth={2.4} />
              </button>}

              {!isKidsLearner && resetConfirmOpen && (
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
          </>
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
                  onClick={handleLogout}
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
            <div className="route-stage" key={`${location.pathname}:${activeAcademicProfileDataId}`}>
              {authLoading ? null : (
                <Suspense fallback={<RouteLoading />}>
                  <Routes>
                    {userProfile ? (
                      <>
                        <Route
                          element={
                            <DashboardPage
                              academicProfileDataId={activeAcademicProfileDataId}
                              academicLevel={academicLevel}
                              academicTrack={academicTrack}
                              childMode={learnerRoutePolicy.isYoungKidsLearner}
                              availableRoutes={dashboardAvailableRoutes}
                              homeRoute={learnerRoutePolicy.homeRoute}
                              voiceAssistant={voiceAssistant}
                              completed={completed}
                              metrics={metrics}
                              overviewCards={overviewCards}
                              schedule={schedule}
                              userProfile={userProfile}
                              subjects={subjects}
                              setSubjects={updateSubjects}
                              hasActiveSchedule={schedule.length > 0}
                            />
                          }
                          path="/dashboard"
                        />
                        <Route
                          element={
                            learnerRoutePolicy.isYoungKidsLearner ? (
                              <KidsLearningPage
                                academicProfileDataId={activeAcademicProfileDataId}
                                academicLevel={academicLevel}
                                academicTrack={academicTrack}
                                onParentAccessChange={updateKidsParentAccess}
                                parentAccess={kidsParentAccess}
                                subjects={subjects}
                                userProfile={userProfile}
                              />
                            ) : learnerRoutePolicy.isSchoolChallengeLearner ? (
                              <SchoolKnowledgePage
                                academicProfileDataId={activeAcademicProfileDataId}
                                grade={learnerRoutePolicy.academicProfile.grade}
                                userProfile={{
                                  ...userProfile,
                                  ...learnerRoutePolicy.academicProfile,
                                }}
                              />
                            ) : (
                              <Navigate replace to={learnerRoutePolicy.homeRoute} />
                            )
                          }
                          path="/kids"
                        />
                        <Route
                          element={
                            learnerRoutePolicy.isYoungKidsLearner
                              ? <KidsAiChatPage />
                              : <Navigate replace to={learnerRoutePolicy.homeRoute} />
                          }
                          path="/ai-chat"
                        />
                        {(
                          <>
                        <Route
                          element={
                            <SubjectsPage
                              academicLevel={academicLevel}
                              academicTrack={academicTrack}
                              hasActiveSchedule={schedule.length > 0}
                              kidsMode={learnerRoutePolicy.isYoungKidsLearner}
                              setSubjects={updateSubjects}
                              subjects={subjects}
                              userProfile={userProfile}
                            />
                          }
                          path="/subjects"
                        />
                        <Route
                          element={
                            <LearningRouteBoundary>
                              {learnerRoutePolicy.isYoungKidsLearner ? (
                                <KidsStartLearningPage
                                  academicLevel={academicLevel}
                                  academicTrack={academicTrack}
                                  setNotification={setNotification}
                                  subjects={subjects}
                                  userProfile={userProfile}
                                />
                              ) : (
                                <StartLearningPage
                                  academicProfileDataId={activeAcademicProfileDataId}
                                  academicLevel={academicLevel}
                                  academicTrack={academicTrack}
                                  completed={completed}
                                  schedule={schedule}
                                  scheduleStartDate={scheduleStartDate}
                                  setCompleted={updateCompletedWithRewards}
                                  setNotification={setNotification}
                                  setSchedule={setSchedule}
                                  setSubjects={updateSubjects}
                                  subjects={subjects}
                                  userProfile={userProfile}
                                />
                              )}
                            </LearningRouteBoundary>
                          }
                          path="/learn"
                        />
                        <Route
                          element={
                            <PlannerPage
                              academicProfile={learnerRoutePolicy.academicProfile}
                              academicProfileDataId={activeAcademicProfileDataId}
                              completed={completed}
                              kidsMode={learnerRoutePolicy.isYoungKidsLearner}
                              parentAccessGranted={kidsParentAccess.unlocked}
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
                              academicProfileDataId={activeAcademicProfileDataId}
                              completed={completed}
                              quizBattlesEnabled={!learnerRoutePolicy.isYoungKidsLearner}
                              schedule={schedule}
                              subjects={subjects}
                              userProfile={userProfile}
                            />
                          }
                          path="/analytics"
                        />
                        <Route
                          element={
                            <NotesPage
                              academicProfileDataId={activeAcademicProfileDataId}
                              completed={completed}
                              kidsMode={learnerRoutePolicy.isYoungKidsLearner}
                              parentAccessGranted={kidsParentAccess.unlocked}
                              userProfile={userProfile}
                              schedule={schedule}
                              scheduleStartDate={scheduleStartDate}
                              setCompleted={updateCompletedWithRewards}
                              setNotification={setNotification}
                              setSchedule={setSchedule}
                            />
                          }
                          path="/notes"
                        />
                        <Route
                          element={parentGuidedKidsRoute(
                            <QuizPage
                              academicProfileDataId={activeAcademicProfileDataId}
                              academicLevel={academicLevel}
                              academicTrack={academicTrack}
                              completed={completed}
                              schedule={schedule}
                              subjects={subjects}
                              userProfile={userProfile}
                            />,
                            "/quiz",
                            "quiz",
                          )}
                          path="/quiz"
                        />
                        <Route
                          element={parentGuidedKidsRoute(<ExamAboutPage />, "/exam/about", "exam")}
                          path="/exam/about"
                        />
                        <Route
                          element={parentGuidedKidsRoute(
                            <ExamPage
                              academicProfileDataId={activeAcademicProfileDataId}
                              activeAttemptId={activeExamAttemptId}
                              academicLevel={academicLevel}
                              academicTrack={academicTrack}
                              examReadiness={metrics.completionRate}
                              isExamEligible={metrics.isExamEligible}
                              onActiveAttemptChange={setActiveExamAttemptId}
                              parentAccessGranted={kidsParentAccess.unlocked}
                              subjects={subjects}
                              tasksToExamEligibility={metrics.tasksToExamEligibility}
                              userProfile={userProfile}
                              youngKidsMode={learnerRoutePolicy.isYoungKidsLearner}
                            />,
                            "/exam",
                            "exam",
                            { allowActiveExamAttempt: true },
                          )}
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
                            isKidsLearner ? (
                              <Navigate replace to={learnerRoutePolicy.homeRoute} />
                            ) : resumeEligibility.enabled ? (
                              <ResumeBuilderPage
                                academicProfileDataId={activeAcademicProfileDataId}
                                academicProfile={learnerRoutePolicy.academicProfile}
                                onResumeBuilderChange={setResumeBuilder}
                                resumeBuilder={resumeBuilder}
                                userProfile={userProfile}
                              />
                            ) : (
                              <Navigate replace to="/subjects" />
                            )
                          }
                          path="/resume-builder"
                        />
                        <Route
                          element={standardOnlyRoute(
                            <ResourcesPage
                              academicProfile={learnerRoutePolicy.academicProfile}
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
                          )}
                          path="/resources"
                        />
                        <Route
                          element={parentGuidedKidsRoute(
                            <AcademicProfilesGuidePage
                              academicProfileDeletionRetryTarget={academicProfileDeletionRetryRef.current}
                              onCreateAcademicProfile={createAcademicProfile}
                              onDeleteAcademicProfile={deleteAcademicProfile}
                              onVisitAcademicProfile={visitAcademicProfile}
                              userProfile={userProfile}
                              workspaceTransitioning={workspaceTransitioning}
                            />,
                            "/settings/profiles",
                            "settings",
                          )}
                          path="/settings/profiles"
                        />
                        <Route
                          element={parentGuidedKidsRoute(
                            <SettingsProfilePage
                              academicLevel={academicLevel}
                              academicTrack={academicTrack}
                              completed={completed}
                              kidsParentAccess={kidsParentAccess}
                              onCreateAcademicProfile={createAcademicProfile}
                              onVisitAcademicProfile={visitAcademicProfile}
                              schedule={schedule}
                              scheduleStartDate={scheduleStartDate}
                              subjects={subjects}
                              userProfile={userProfile}
                              workspaceTransitioning={workspaceTransitioning}
                              youngKidsMode={learnerRoutePolicy.isYoungKidsLearner}
                            />,
                            "/settings/profile",
                            "settings",
                          )}
                          path="/settings/profile"
                        />
                        <Route
                          element={parentGuidedKidsRoute(
                            <SettingsPage
                              activeVoiceName={voiceAssistant.activeVoiceName}
                              onPreviewVoice={voiceAssistant.previewVoice}
                              setVoicePreferences={voiceAssistant.setVoicePreferences}
                              voicePreferences={voiceAssistant.voicePreferences}
                              userProfile={userProfile}
                              setUserProfile={setUserProfile}
                              onAcademicProfileChange={updateAcademicProfile}
                              academicProfileDataId={activeAcademicProfileDataId}
                              profileContext={profileContext}
                              onCreateAcademicProfile={createAcademicProfile}
                              onImportActiveProfileWorkspace={importActiveProfileWorkspace}
                              workspaceTransitioning={workspaceTransitioning}
                              darkMode={darkMode}
                              setDarkMode={setDarkMode}
                              subjects={subjects}
                              schedule={schedule}
                              onBackgroundThemeChange={setActiveBackgroundImageId}
                              scheduleStartDate={scheduleStartDate}
                              completed={completed}
                              materialBookmarks={materialBookmarks}
                              goalReminderData={goalReminderData}
                              goalReminderSettings={goalReminderSettings}
                              resumeBuilder={resumeBuilder}
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
                              setResumeBuilder={setResumeBuilder}
                              setNotification={setNotification}
                              onAccountDeleted={handleAccountDeleted}
                              cursorStyle={cursorStyle}
                              setCursorStyle={setCursorStyle}
                              autoHideTopBar={autoHideTopBar}
                              onAutoHideTopBarChange={handleAutoHideTopBarChange}
                              kidsParentAccess={kidsParentAccess}
                              onKidsParentAccessChange={updateKidsParentAccess}
                              onKidsParentLocked={updateKidsParentAccess}
                              youngKidsMode={learnerRoutePolicy.isYoungKidsLearner}
                            />,
                            "/settings",
                            "settings",
                          )}
                          path="/settings"
                        />
                        <Route
                          element={parentGuidedKidsRoute(
                            <NotificationHistoryPage />,
                            "/notification-history",
                            "settings",
                          )}
                          path="/notification-history"
                        />
                        <Route element={<AboutPage academicProfile={learnerRoutePolicy.academicProfile} />} path="/about" />
                          </>
                        )}
                        <Route element={<Navigate replace to={learnerRoutePolicy.homeRoute} />} path="*" />
                      </>
                    ) : (
                      <Route
                        element={(
                          <Navigate
                            replace
                            to={buildLoginRedirect(location.pathname, location.search, location.hash)}
                          />
                        )}
                        path="*"
                      />
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

      <AcademicProfileIntroDialog
        activeProfileLabel={academicProfileIntro?.activeProfileLabel}
        onClose={() => setAcademicProfileIntroOpen(false)}
        open={academicProfileIntroOpen}
        otherProfileLabel={academicProfileIntro?.otherProfileLabel}
        userName={academicProfileIntro?.userName}
      />

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
      <PwaManager />
    </div>
  );
}

export default App;
