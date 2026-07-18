import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Save, Shield, Palette, User, Check, Settings2, Download, Upload, Trash2, Volume2, Mic, Image as ImageIcon, Lock, Eye, EyeOff, ArrowRight, Pencil, BellRing, History } from "lucide-react";
import api from "../utils/apiClient";
import GoalSettingsPanel from "../components/GoalSettingsPanel";
import {
  DEFAULT_GOAL_REMINDER_DATA,
  DEFAULT_GOAL_REMINDER_SETTINGS,
  normalizePlannerData,
  normalizePlannerSettings,
  syncStudyTargetReminders,
} from "../utils/goalReminderStore";
import {
  ACADEMIC_LEVEL_OPTIONS,
  DEPARTMENT_OPTIONS,
  SCHOOL_CLASS_OPTIONS,
  TRACK_OPTIONS,
  academicProfilePayload,
  isSchoolAcademicLevel,
  normalizeAcademicProfile,
} from "../utils/academicProfile";
import BACKGROUND_PRESETS from "../utils/backgroundPresets";
import {
  BACKGROUND_IMAGE_BLUR_MAX_PX,
  BACKGROUND_IMAGE_BLUR_STORAGE_KEY,
  normalizeBackgroundImageBlurPx,
  resolveBackgroundImageBlurPx,
  resolveEffectiveDarkMode,
} from "../utils/appearanceTheme";
import {
  disableStudyReminders,
  enableStudyReminders,
  getPushNotificationDiagnostic,
  getPushNotificationErrorMessage,
  getStudyReminderState,
  reconcileStudyReminders,
  sendTestStudyReminder,
} from "../utils/pushNotifications";
import { toast } from "react-toastify";
import "./SettingsPage.css";

const COLOR_PRESETS = [
  { name: "Teal (Default)", light: "7, 143, 120", dark: "36, 199, 177" },
  { name: "Blue", light: "29, 78, 216", dark: "59, 130, 246" },
  { name: "Greyish White", light: "100, 116, 139", dark: "226, 232, 240" },
  { name: "Indigo", light: "67, 56, 202", dark: "99, 102, 241" },
  { name: "Orange", light: "194, 65, 12", dark: "249, 115, 22" },
  { name: "Rose", light: "190, 24, 74", dark: "244, 63, 94" },
];

function applyBackgroundImageBlurVariables(value, hasBackgroundImage) {
  const resolvedBlur = resolveBackgroundImageBlurPx(value, hasBackgroundImage);
  const blurInset = resolvedBlur > 0 ? -Math.ceil(resolvedBlur * 1.5) : 0;

  for (const target of [document.documentElement, document.body]) {
    target.style.setProperty("--bg-image-blur", `${resolvedBlur}px`);
    target.style.setProperty("--bg-image-blur-inset", `${blurInset}px`);
  }
}

const NOTIFICATION_INTENT_KEY = "prepmatrix_notifications_enabled";
const PUSH_DEVICE_ID_STORAGE_KEY = "prepmatrix_push_device_id";
const PUSH_SUBSCRIPTION_VERSION_STORAGE_KEY = "prepmatrix_push_subscription_version";
const NOTIFICATION_STATUS_RETRY_DELAYS_MS = [5000, 15000];
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/i;
const DEFINITIVE_NOTIFICATION_ERROR_CODES = new Set([
  "unsupported",
  "insecure-context",
  "permission-denied",
  "not-subscribed",
  "subscription-expired",
]);

function storeNotificationIntent(enabled) {
  try {
    localStorage.setItem(NOTIFICATION_INTENT_KEY, enabled ? "true" : "false");
  } catch {
    // Browser privacy settings may block local storage. The live browser
    // subscription remains the source of truth for the current page.
  }
}

function readNotificationIntent() {
  try {
    return localStorage.getItem(NOTIFICATION_INTENT_KEY) === "true";
  } catch {
    return false;
  }
}

function hasStoredNotificationBinding() {
  try {
    const deviceId = localStorage.getItem(PUSH_DEVICE_ID_STORAGE_KEY) || "";
    const subscriptionVersion = localStorage.getItem(PUSH_SUBSCRIPTION_VERSION_STORAGE_KEY) || "";
    return (
      UUID_V4_PATTERN.test(deviceId.trim()) &&
      SHA256_PATTERN.test(subscriptionVersion.trim())
    );
  } catch {
    return false;
  }
}

function getNotificationStateDisposition(state, preferred) {
  if (!state?.supported) return { clearIntent: true, enabled: false, status: "unsupported" };
  if (!state?.secure) return { clearIntent: true, enabled: false, status: "insecure" };
  if (state?.permission === "denied") {
    return { clearIntent: true, enabled: false, status: "blocked" };
  }
  if (preferred && state?.subscribed) {
    return { clearIntent: false, enabled: true, status: "connected" };
  }
  if (preferred) {
    return { clearIntent: true, enabled: false, status: "reconnect-needed" };
  }
  return { clearIntent: false, enabled: false, status: "off" };
}

function getNotificationErrorDisposition(error) {
  const diagnostic = getPushNotificationDiagnostic(error);
  if (diagnostic.code === "unsupported") {
    return { clearIntent: true, status: "unsupported" };
  }
  if (diagnostic.code === "insecure-context") {
    return { clearIntent: true, status: "insecure" };
  }
  if (diagnostic.code === "permission-denied") {
    return { clearIntent: true, status: "blocked" };
  }
  if (["not-subscribed", "subscription-expired"].includes(diagnostic.code)) {
    return { clearIntent: true, status: "reconnect-needed" };
  }
  if (["browser-cleanup-failed", "subscription-refresh", "subscription-state", "unsubscribe-state"].includes(diagnostic.code)) {
    return { clearIntent: false, status: "reconnect-needed" };
  }
  if (diagnostic.code === "server-config" && diagnostic.status !== 503) {
    return { clearIntent: true, status: "reconnect-needed" };
  }
  return {
    clearIntent: DEFINITIVE_NOTIFICATION_ERROR_CODES.has(diagnostic.code),
    status: "error",
  };
}

// Helper to convert hex to rgb string: "#0d9488" -> "13, 148, 136"
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
    : null;
}

function ToggleSwitch({ checked, onChange, label, subtitle, disabled = false }) {
  return (
    <div className="toggle-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ flex: 1 }}>
        <strong style={{ fontSize: '0.95rem' }}>{label}</strong>
        {subtitle && <p className="card-subtext" style={{ margin: '4px 0 0', fontSize: '0.82rem' }}>{subtitle}</p>}
      </div>
      <label className="toggle-switch-label" style={{ position: 'relative', display: 'inline-block', width: '48px', height: '26px', cursor: disabled ? 'wait' : 'pointer', opacity: disabled ? 0.65 : 1 }}>
        <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }} />
        <span style={{
          position: 'absolute', inset: 0, borderRadius: '999px',
          background: checked ? 'rgba(var(--accent-rgb), 0.6)' : 'var(--surface-muted)',
          border: `1px solid ${checked ? 'rgba(var(--accent-rgb), 0.4)' : 'var(--border)'}`,
          transition: 'all 0.25s ease'
        }}>
          <span style={{
            position: 'absolute', top: '3px', left: checked ? '24px' : '3px',
            width: '18px', height: '18px', borderRadius: '50%',
            background: checked ? 'var(--accent)' : 'var(--text-muted)',
            transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
            boxShadow: '0 2px 4px rgba(0,0,0,0.15)'
          }} />
        </span>
      </label>
    </div>
  );
}

function SettingsPage({
  userProfile, setUserProfile, setAcademicLevel, setAcademicTrack,
  darkMode, setDarkMode, subjects, schedule, scheduleStartDate, completed, materialBookmarks,
  goalReminderData, goalReminderSettings,
  academicLevel, academicTrack, setSubjects, setSchedule, setCompleted,
  setMaterialBookmarks, setGoalReminderData, setGoalReminderSettings,
  setNotification, onAccountDeleted,
  onAcademicProfileChange,
  cursorStyle: parentCursorStyle, setCursorStyle: setParentCursorStyle
}) {
  const navigate = useNavigate();
  const initialAcademicProfile = normalizeAcademicProfile({
    ...userProfile,
    academicLevel: academicLevel || userProfile?.academicLevel,
    academicTrack: academicTrack || userProfile?.academicTrack,
  });
  // Account settings state
  const [username, setUsername] = useState(userProfile?.username || "");
  const [age, setAge] = useState(userProfile?.age || "");
  const [institutionName, setInstitutionName] = useState(userProfile?.institutionName || "");
  const [educationStage, setEducationStage] = useState(initialAcademicProfile.academicLevel);
  const [profileTrack, setProfileTrack] = useState(initialAcademicProfile.academicTrack);
  const [department, setDepartment] = useState(initialAcademicProfile.department);
  const [grade, setGrade] = useState(initialAcademicProfile.grade);
  const [degree, setDegree] = useState(initialAcademicProfile.degree);
  const [profileImage, setProfileImage] = useState(userProfile?.profileImage || "");
  const [savingProfile, setSavingProfile] = useState(false);
  const profileImageInputRef = useRef(null);

  useEffect(() => {
    const normalizedProfile = normalizeAcademicProfile({
      ...userProfile,
      academicLevel: academicLevel || userProfile?.academicLevel,
      academicTrack: academicTrack || userProfile?.academicTrack,
    });
    setEducationStage(normalizedProfile.academicLevel);
    setProfileTrack(normalizedProfile.academicTrack);
    setDepartment(normalizedProfile.department);
    setGrade(normalizedProfile.grade);
    setDegree(normalizedProfile.degree);
  }, [academicLevel, academicTrack, userProfile]);

  useEffect(() => {
    setInstitutionName(userProfile?.institutionName || "");
  }, [userProfile?.institutionName]);

  // Security state
  const [email, setEmail] = useState(userProfile?.email || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [isCurrentPasswordCorrect, setIsCurrentPasswordCorrect] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [isOtpVerified, setIsOtpVerified] = useState(false);
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [isOtpLimitReached, setIsOtpLimitReached] = useState(false);

  useEffect(() => {
    if (!currentPassword) {
      setIsCurrentPasswordCorrect(false);
      return undefined;
    }

    const delayDebounce = setTimeout(async () => {
      try {
        const data = await api.post("/api/auth/check-password", { password: currentPassword });
        setIsCurrentPasswordCorrect(!!data.correct);
      } catch (err) {
        setIsCurrentPasswordCorrect(false);
      }
    }, 250);

    return () => clearTimeout(delayDebounce);
  }, [currentPassword]);

  useEffect(() => {
    if (otpCountdown <= 0 || isOtpVerified) return;
    const interval = setInterval(() => {
      setOtpCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [otpCountdown, isOtpVerified]);

  // System Preferences state
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const stored = localStorage.getItem("prepmatrix_sound_enabled");
    return stored === null ? true : stored === "true";
  });
  const [notificationsEnabled, setNotificationsEnabled] = useState(readNotificationIntent);
  const [notificationsBusy, setNotificationsBusy] = useState(true);
  const [notificationStatus, setNotificationStatus] = useState("checking");
  const [notificationIntent, setNotificationIntent] = useState(readNotificationIntent);
  const [notificationTestBusy, setNotificationTestBusy] = useState(false);

  useEffect(() => {
    let isActive = true;
    let inspectionInFlight = false;
    let retryIndex = 0;
    let retryTimeoutId = null;

    const scheduleInspectionRetry = () => {
      if (!isActive || retryIndex >= NOTIFICATION_STATUS_RETRY_DELAYS_MS.length) return;
      const delay = NOTIFICATION_STATUS_RETRY_DELAYS_MS[retryIndex];
      retryIndex += 1;
      retryTimeoutId = window.setTimeout(inspectNotifications, delay);
    };

    const inspectNotifications = async () => {
      if (inspectionInFlight) return;
      inspectionInFlight = true;
      const preferred = readNotificationIntent();
      if (isActive) {
        setNotificationsBusy(true);
        setNotificationStatus("checking");
        setNotificationIntent(preferred);
      }

      try {
        let state = preferred
          ? await reconcileStudyReminders({}, { repairMissing: true })
          : await getStudyReminderState();
        if (!preferred && isActive && (state.subscribed || hasStoredNotificationBinding())) {
          await disableStudyReminders();
          state = await getStudyReminderState();
        }
        if (!isActive) return;
        const disposition = getNotificationStateDisposition(state, preferred);
        if (disposition.clearIntent) {
          storeNotificationIntent(false);
          setNotificationIntent(false);
        }
        if (!disposition.clearIntent) retryIndex = 0;
        setNotificationsEnabled(disposition.enabled);
        setNotificationStatus(disposition.status);
      } catch (error) {
        if (!isActive) return;
        const disposition = getNotificationErrorDisposition(error);
        if (disposition.clearIntent) {
          storeNotificationIntent(false);
          setNotificationIntent(false);
        }
        const shouldKeepEnabled = (
          !disposition.clearIntent && disposition.status === "error" && preferred
        );
        if (shouldKeepEnabled) scheduleInspectionRetry();
        setNotificationsEnabled(shouldKeepEnabled);
        setNotificationStatus(disposition.status);
        console.warn("Push notification status check failed:", getPushNotificationDiagnostic(error));
      } finally {
        if (isActive) setNotificationsBusy(false);
        inspectionInFlight = false;
      }
    };

    const inspectWhenOnline = () => {
      if (retryTimeoutId !== null) window.clearTimeout(retryTimeoutId);
      retryTimeoutId = null;
      retryIndex = 0;
      inspectNotifications();
    };
    inspectNotifications();
    window.addEventListener("online", inspectWhenOnline);
    return () => {
      isActive = false;
      if (retryTimeoutId !== null) window.clearTimeout(retryTimeoutId);
      window.removeEventListener("online", inspectWhenOnline);
    };
  }, []);

  const notificationSubtitle = notificationsBusy
    ? "Checking the browser notification connection..."
    : notificationStatus === "connected"
      ? "Connected securely. Scheduled reminders arrive around their due time, with a 6:00 PM study check when today's tasks are incomplete."
      : notificationStatus === "blocked"
        ? "Notifications are blocked by the browser or operating system. Allow them in site settings first."
        : notificationStatus === "unsupported"
          ? "Push notifications are not supported by this browser."
          : notificationStatus === "insecure"
            ? "Push notifications require a secure HTTPS connection."
            : notificationStatus === "reconnect-needed"
              ? "This browser is no longer connected. Turn reminders on to reconnect it."
              : notificationStatus === "error"
                ? notificationIntent
                  ? "The connection could not be verified. Your reminder preference is saved and the app will retry."
                  : "Notification cleanup could not be confirmed. Try the switch again when you are online."
                : "Reminders are off on this browser. Turn them on to receive the 6:00 PM study check.";
  const notificationToggleDisabled = notificationsBusy || ["unsupported", "insecure"].includes(notificationStatus);
  const notificationToggleChecked = notificationsBusy ? notificationIntent : notificationsEnabled;

  const [wakeMode, setWakeMode] = useState(() =>
    localStorage.getItem("prepmatrix_wake_mode") === "true"
  );

  const toggleWakeMode = () => {
    const next = !wakeMode;
    setWakeMode(next);
    localStorage.setItem("prepmatrix_wake_mode", next ? "true" : "false");
    if (next) {
      window.studyVoiceAssistant?.startWakeListening?.();
    } else {
      window.studyVoiceAssistant?.stopWakeListening?.();
    }
    toast.success(next ? "Wake mode enabled. Say Hey Prep, Prep Matrix, or Hey PrepMatrix." : "Wake mode disabled.");
  };

  const toggleNotifications = async () => {
    if (notificationToggleDisabled) return;
    const nextVal = !notificationToggleChecked;
    setNotificationsBusy(true);
    setNotificationStatus("checking");

    if (nextVal) {
      storeNotificationIntent(true);
      setNotificationIntent(true);
      try {
        await enableStudyReminders();
        setNotificationsEnabled(true);
        setNotificationStatus("connected");
        toast.success("Study reminders enabled!");
      } catch (error) {
        const disposition = getNotificationErrorDisposition(error);
        console.warn("Push notification setup failed:", getPushNotificationDiagnostic(error));
        if (disposition.clearIntent) {
          storeNotificationIntent(false);
          setNotificationIntent(false);
        }
        setNotificationsEnabled(
          !disposition.clearIntent && disposition.status === "error"
        );
        setNotificationStatus(disposition.status);
        toast.error(getPushNotificationErrorMessage(error));
      } finally {
        setNotificationsBusy(false);
      }
      return;
    }

    try {
      await disableStudyReminders();
      storeNotificationIntent(false);
      setNotificationIntent(false);
      setNotificationsEnabled(false);
      setNotificationStatus("off");
      toast.success("Study reminders disabled.");
    } catch (error) {
      const diagnostic = getPushNotificationDiagnostic(error);
      console.warn("Push notification cleanup warning:", diagnostic);

      if (diagnostic.code === "browser-cleanup-failed") {
        storeNotificationIntent(false);
        setNotificationIntent(false);
        setNotificationsEnabled(false);
        setNotificationStatus("reconnect-needed");
      } else {
        storeNotificationIntent(true);
        setNotificationIntent(true);
        setNotificationsEnabled(true);
        setNotificationStatus("error");
      }
      toast.warn(getPushNotificationErrorMessage(error));
    } finally {
      setNotificationsBusy(false);
    }
  };

  const sendTestNotification = async () => {
    if (notificationTestBusy || notificationsBusy || !notificationsEnabled) return;
    setNotificationTestBusy(true);
    try {
      await sendTestStudyReminder();
      setNotificationStatus("connected");
      toast.success("Test notification sent. It should appear shortly.");
    } catch (error) {
      const diagnostic = getPushNotificationDiagnostic(error);
      const disposition = getNotificationErrorDisposition(error);
      console.warn("Push notification test failed:", diagnostic);
      if (disposition.clearIntent) {
        storeNotificationIntent(false);
        setNotificationIntent(false);
        setNotificationsEnabled(false);
        setNotificationStatus(disposition.status);
      } else if (diagnostic.status !== 429) {
        setNotificationStatus("error");
      }
      toast.error(getPushNotificationErrorMessage(error));
    } finally {
      setNotificationTestBusy(false);
    }
  };
  // Study Target Goals state
  const [dailyTarget, setDailyTarget] = useState(() => {
    return goalReminderSettings?.dailyStudyTarget || parseFloat(localStorage.getItem("prepmatrix_daily_target") || "4");
  });
  const [weeklyReview, setWeeklyReview] = useState(() => {
    return goalReminderSettings?.weeklyReviewTarget || localStorage.getItem("prepmatrix_weekly_review") || "2";
  });

  useEffect(() => {
    setDailyTarget(goalReminderSettings?.dailyStudyTarget || 4);
    setWeeklyReview(goalReminderSettings?.weeklyReviewTarget || "2");
  }, [goalReminderSettings?.dailyStudyTarget, goalReminderSettings?.weeklyReviewTarget]);

  // Data Management state
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);
  const [showPasswordStep, setShowPasswordStep] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deletePasswordError, setDeletePasswordError] = useState("");
  const [showDeletePassword, setShowDeletePassword] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  // Appearance state
  const [fontSize, setFontSize] = useState(
    localStorage.getItem("prepmatrix_font_size") || "medium"
  );
  const [cardSize, setCardSize] = useState(
    localStorage.getItem("prepmatrix_card_size") || "cozy"
  );

  // Background presets and custom state
  const [bgLight, setBgLight] = useState(
    localStorage.getItem("prepmatrix_bg_light") || "#e2e8f0"
  );
  const [bgDark, setBgDark] = useState(
    localStorage.getItem("prepmatrix_bg_dark") || "#1e293b"
  );

  // Glassy toggles state
  const [glassyCards, setGlassyCards] = useState(() => {
    const stored = localStorage.getItem("prepmatrix_glassy_panels");
    return stored === null ? true : stored === "true";
  });
  const [glassyButtons, setGlassyButtons] = useState(() => {
    const stored = localStorage.getItem("prepmatrix_glassy_buttons");
    return stored === null ? true : stored === "true";
  });

  // Font family and weight style configurations
  const [fontFamilyStyle, setFontFamilyStyle] = useState(
    localStorage.getItem("prepmatrix_font_style") || "sans"
  );
  const [fontWeightStyle, setFontWeightStyle] = useState(
    localStorage.getItem("prepmatrix_font_weight") || "regular"
  );
  const [bgImageId, setBgImageId] = useState(
    localStorage.getItem("prepmatrix_bg_image_id") || ""
  );
  const [bgOverlayOpacity, setBgOverlayOpacity] = useState(
    parseFloat(localStorage.getItem("prepmatrix_bg_overlay_opacity") || "0.55")
  );
  const [glassOpacity, setGlassOpacity] = useState(
    parseFloat(localStorage.getItem("prepmatrix_glass_opacity") || "0.6")
  );
  const [backgroundImageBlur, setBackgroundImageBlur] = useState(() =>
    normalizeBackgroundImageBlurPx(localStorage.getItem(BACKGROUND_IMAGE_BLUR_STORAGE_KEY))
  );
  const hasSelectedBackgroundImage = BACKGROUND_PRESETS.some(
    ({ id }) => id === bgImageId
  );

  // Color Palette state
  const [customColorLight, setCustomColorLight] = useState("#078f78");
  const [customColorDark, setCustomColorDark] = useState("#24c7b1");
  const [accentRgbLight, setAccentRgbLight] = useState(
    localStorage.getItem("prepmatrix_accent_rgb_light") || "7, 143, 120"
  );
  const [accentRgbDark, setAccentRgbDark] = useState(
    localStorage.getItem("prepmatrix_accent_rgb_dark") || "36, 199, 177"
  );
  const [transparency, setTransparency] = useState(
    parseFloat(localStorage.getItem("prepmatrix_accent_opacity") || "0.16")
  );
  const [contrast, setContrast] = useState(
    parseFloat(localStorage.getItem("prepmatrix_border_opacity") || "0.3")
  );

  const savedRef = useRef(false);
  const deleteConfirmRef = useRef(null);

  // Dynamic Typography Helpers
  const applyFontFamilyVars = (style) => {
    let base = '"Manrope", sans-serif';
    let display = '"Space Grotesk", sans-serif';

    if (style === "clean") {
      base = '"Inter", sans-serif';
      display = '"Outfit", sans-serif';
    } else if (style === "rounded") {
      base = '"Nunito", sans-serif';
      display = '"Quicksand", sans-serif';
    } else if (style === "geometric") {
      base = '"Poppins", sans-serif';
      display = '"Raleway", sans-serif';
    } else if (style === "humanist") {
      base = '"Source Sans 3", sans-serif';
      display = '"DM Sans", sans-serif';
    } else if (style === "editorial") {
      base = '"Plus Jakarta Sans", sans-serif';
      display = '"Raleway", sans-serif';
    } else if (style === "serif") {
      base = '"Lora", serif';
      display = '"Playfair Display", serif';
    } else if (style === "classic") {
      base = '"Merriweather", serif';
      display = '"Crimson Text", serif';
    } else if (style === "mono") {
      base = '"Fira Code", monospace';
      display = '"Space Mono", monospace';
    }

    document.documentElement.style.setProperty("--font-family-base", base);
    document.body.style.setProperty("--font-family-base", base);
    document.documentElement.style.setProperty("--font-family-display", display);
    document.body.style.setProperty("--font-family-display", display);
  };

  const applyFontWeightVars = (weight) => {
    let normal = "400";
    let medium = "500";
    let bold = "600";
    let title = "700";

    if (weight === "light") {
      normal = "300";
      medium = "400";
      bold = "500";
      title = "600";
    } else if (weight === "medium") {
      normal = "500";
      medium = "600";
      bold = "700";
      title = "800";
    } else if (weight === "bold") {
      normal = "600";
      medium = "700";
      bold = "800";
      title = "900";
    }

    document.documentElement.style.setProperty("--font-weight-normal", normal);
    document.body.style.setProperty("--font-weight-normal", normal);
    
    document.documentElement.style.setProperty("--font-weight-medium", medium);
    document.body.style.setProperty("--font-weight-medium", medium);
    
    document.documentElement.style.setProperty("--font-weight-bold", bold);
    document.body.style.setProperty("--font-weight-bold", bold);
    
    document.documentElement.style.setProperty("--font-weight-title", title);
    document.body.style.setProperty("--font-weight-title", title);
  };

  // Store initial settings for reverting if unsaved
  const initialSettings = useRef({
    darkMode: darkMode,
    fontSize: localStorage.getItem("prepmatrix_font_size") || "medium",
    cardSize: localStorage.getItem("prepmatrix_card_size") || "cozy",
    accentRgbLight: localStorage.getItem("prepmatrix_accent_rgb_light") || "7, 143, 120",
    accentRgbDark: localStorage.getItem("prepmatrix_accent_rgb_dark") || "36, 199, 177",
    transparency: localStorage.getItem("prepmatrix_accent_opacity") || "0.16",
    contrast: localStorage.getItem("prepmatrix_border_opacity") || "0.3",
    bgLight: localStorage.getItem("prepmatrix_bg_light") || "#f8fafc",
    bgDark: localStorage.getItem("prepmatrix_bg_dark") || "#090d16",
    glassyCards: localStorage.getItem("prepmatrix_glassy_panels") !== "false",
    glassyButtons: localStorage.getItem("prepmatrix_glassy_buttons") !== "false",
    fontStyle: localStorage.getItem("prepmatrix_font_style") || "sans",
    fontWeight: localStorage.getItem("prepmatrix_font_weight") || "regular",
    bgImageId: localStorage.getItem("prepmatrix_bg_image_id") || "",
    bgOverlayOpacity: parseFloat(localStorage.getItem("prepmatrix_bg_overlay_opacity") || "0.55"),
    glassOpacity: parseFloat(localStorage.getItem("prepmatrix_glass_opacity") || "0.6"),
    backgroundImageBlur: normalizeBackgroundImageBlurPx(localStorage.getItem(BACKGROUND_IMAGE_BLUR_STORAGE_KEY)),
  });

  // 1. Real-time preview of style options on change
  useEffect(() => {
    const imgPreset = BACKGROUND_PRESETS.find(({ id }) => id === bgImageId);
    const isDark = resolveEffectiveDarkMode(darkMode, Boolean(imgPreset));
    document.body.classList.toggle("dark", isDark);
    document.documentElement.classList.toggle("dark", isDark);

    const activeRgb = isDark ? accentRgbDark : accentRgbLight;
    document.documentElement.style.setProperty("--accent-rgb", activeRgb);
    document.body.style.setProperty("--accent-rgb", activeRgb);

    document.documentElement.style.setProperty("--accent", `rgb(${activeRgb})`);
    document.body.style.setProperty("--accent", `rgb(${activeRgb})`);

    document.documentElement.style.setProperty("--accent-opacity", transparency.toString());
    document.body.style.setProperty("--accent-opacity", transparency.toString());
    
    document.documentElement.style.setProperty("--border-opacity", contrast.toString());
    document.body.style.setProperty("--border-opacity", contrast.toString());

    document.documentElement.style.setProperty(
      "--base-font-size",
      fontSize === "small" ? "14px" : fontSize === "large" ? "18px" : "16px"
    );
    document.body.style.setProperty(
      "--base-font-size",
      fontSize === "small" ? "14px" : fontSize === "large" ? "18px" : "16px"
    );

    document.documentElement.style.setProperty(
      "--card-padding",
      cardSize === "compact" ? "18px" : cardSize === "spacious" ? "40px" : "30px"
    );
    document.body.style.setProperty(
      "--card-padding",
      cardSize === "compact" ? "18px" : cardSize === "spacious" ? "40px" : "30px"
    );
    
    document.documentElement.style.setProperty(
      "--radius-lg",
      cardSize === "compact" ? "16px" : cardSize === "spacious" ? "32px" : "24px"
    );
    document.body.style.setProperty(
      "--radius-lg",
      cardSize === "compact" ? "16px" : cardSize === "spacious" ? "32px" : "24px"
    );

    // Apply Background colors
    const activeBg = isDark ? bgDark : bgLight;
    document.documentElement.style.setProperty("--bg", activeBg);
    document.body.style.setProperty("--bg", activeBg);
    
    document.documentElement.style.setProperty("--bg-secondary", activeBg);
    document.body.style.setProperty("--bg-secondary", activeBg);

    // Apply Glassy toggles
    document.body.classList.toggle("no-glass-cards", !glassyCards);
    document.body.classList.toggle("no-glass-buttons", !glassyButtons);

    // Apply custom typography options
    applyFontFamilyVars(fontFamilyStyle);
    applyFontWeightVars(fontWeightStyle);

    // Background image live-preview
    if (imgPreset) {
      document.body.classList.add("has-bg-image");
      document.documentElement.style.setProperty("--bg-image", `url(${imgPreset.file})`);
      document.documentElement.style.setProperty("--bg-surface-rgb", imgPreset.surfaceRgb);
      const mappedOverlay = (bgOverlayOpacity * 0.5).toString();
      document.documentElement.style.setProperty("--bg-overlay-opacity", mappedOverlay);
      document.body.style.setProperty("--bg-overlay-opacity", mappedOverlay);
      const bgBrightness = Math.pow(Math.max(0, 1 - bgOverlayOpacity * 0.5), 4.5);
      document.documentElement.style.setProperty("--bg-brightness", bgBrightness.toString());
      document.body.style.setProperty("--bg-brightness", bgBrightness.toString());
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

    document.documentElement.style.setProperty("--glass-opacity", glassOpacity.toString());
    document.body.style.setProperty("--glass-opacity", glassOpacity.toString());
    applyBackgroundImageBlurVariables(backgroundImageBlur, Boolean(imgPreset));

  }, [
    darkMode, accentRgbLight, accentRgbDark, transparency, contrast, fontSize, cardSize,
    bgLight, bgDark, glassyCards, glassyButtons, fontFamilyStyle, fontWeightStyle, bgImageId, bgOverlayOpacity, glassOpacity, backgroundImageBlur
  ]);

  // 2. Revert styles on unmount if changes were not saved
  useEffect(() => {
    const initialSnapshot = initialSettings.current;

    return () => {
      if (!savedRef.current) {
        const init = initialSnapshot;
        const imgPreset = BACKGROUND_PRESETS.find(({ id }) => id === init.bgImageId);
        const isDark = resolveEffectiveDarkMode(init.darkMode, Boolean(imgPreset));
        setDarkMode(init.darkMode);
        document.body.classList.toggle("dark", isDark);
        document.documentElement.classList.toggle("dark", isDark);

        document.documentElement.style.setProperty(
          "--base-font-size",
          init.fontSize === "small" ? "14px" : init.fontSize === "large" ? "18px" : "16px"
        );
        document.body.style.setProperty(
          "--base-font-size",
          init.fontSize === "small" ? "14px" : init.fontSize === "large" ? "18px" : "16px"
        );

        document.documentElement.style.setProperty(
          "--card-padding",
          init.cardSize === "compact" ? "18px" : init.cardSize === "spacious" ? "40px" : "30px"
        );
        document.body.style.setProperty(
          "--card-padding",
          init.cardSize === "compact" ? "18px" : init.cardSize === "spacious" ? "40px" : "30px"
        );
        
        document.documentElement.style.setProperty(
          "--radius-lg",
          init.cardSize === "compact" ? "16px" : init.cardSize === "spacious" ? "32px" : "24px"
        );
        document.body.style.setProperty(
          "--radius-lg",
          init.cardSize === "compact" ? "16px" : init.cardSize === "spacious" ? "32px" : "24px"
        );
        
        const activeRgb = isDark ? init.accentRgbDark : init.accentRgbLight;
        document.documentElement.style.setProperty("--accent-rgb", activeRgb);
        document.body.style.setProperty("--accent-rgb", activeRgb);
        
        document.documentElement.style.setProperty("--accent", `rgb(${activeRgb})`);
        document.body.style.setProperty("--accent", `rgb(${activeRgb})`);

        document.documentElement.style.setProperty("--accent-opacity", init.transparency);
        document.body.style.setProperty("--accent-opacity", init.transparency);
        
        document.documentElement.style.setProperty("--border-opacity", init.contrast);
        document.body.style.setProperty("--border-opacity", init.contrast);

        // Revert Background colors
        const activeBg = isDark ? init.bgDark : init.bgLight;
        document.documentElement.style.setProperty("--bg", activeBg);
        document.body.style.setProperty("--bg", activeBg);
        document.documentElement.style.setProperty("--bg-secondary", activeBg);
        document.body.style.setProperty("--bg-secondary", activeBg);

        // Revert Glassy toggles
        document.body.classList.toggle("no-glass-cards", !init.glassyCards);
        document.body.classList.toggle("no-glass-buttons", !init.glassyButtons);

        // Revert typography choices
        applyFontFamilyVars(init.fontStyle);
        applyFontWeightVars(init.fontWeight);

        // Revert background image
        if (imgPreset) {
          document.body.classList.add("has-bg-image");
          document.documentElement.style.setProperty("--bg-image", `url(${imgPreset.file})`);
          document.documentElement.style.setProperty("--bg-surface-rgb", imgPreset.surfaceRgb);
          const initOverlay = (init.bgOverlayOpacity * 0.5).toString();
          document.documentElement.style.setProperty("--bg-overlay-opacity", initOverlay);
          document.body.style.setProperty("--bg-overlay-opacity", initOverlay);
          const initBrightness = Math.pow(Math.max(0, 1 - init.bgOverlayOpacity * 0.5), 4.5);
          document.documentElement.style.setProperty("--bg-brightness", initBrightness.toString());
          document.body.style.setProperty("--bg-brightness", initBrightness.toString());
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

        // Revert glass opacity
        document.documentElement.style.setProperty("--glass-opacity", init.glassOpacity.toString());
        document.body.style.setProperty("--glass-opacity", init.glassOpacity.toString());
        applyBackgroundImageBlurVariables(init.backgroundImageBlur, Boolean(imgPreset));
      }
    };
  }, [setDarkMode]);

  // Persist toggle preferences to localStorage
  useEffect(() => {
    localStorage.setItem("prepmatrix_sound_enabled", String(soundEnabled));
  }, [soundEnabled]);

  useEffect(() => {
    if (!confirmDeleteAccount && !showPasswordStep) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (deleteConfirmRef.current && !deleteConfirmRef.current.contains(event.target)) {
        setConfirmDeleteAccount(false);
        setShowPasswordStep(false);
        setDeletePassword("");
        setDeletePasswordError("");
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setConfirmDeleteAccount(false);
        setShowPasswordStep(false);
        setDeletePassword("");
        setDeletePasswordError("");
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [confirmDeleteAccount, showPasswordStep]);

  // Save profile & account settings (with loading guard and proper error handling)
  const handleSaveAccount = async () => {
    if (savingProfile) return;
    setSavingProfile(true);
    try {
      const normalizedAcademic = normalizeAcademicProfile({
        academicLevel: educationStage,
        academicTrack: profileTrack,
        department,
        grade,
        degree,
        institutionName,
      });
      const payload = {
        username,
        age: Number(age) || null,
        ...academicProfilePayload(normalizedAcademic),
        institutionName: institutionName.trim(),
        profileImage,
      };

      const response = await api.updateProfile(payload);
      setUserProfile(response.user);

      if (onAcademicProfileChange) {
        onAcademicProfileChange(response.user, { persist: false });
      } else {
        setAcademicLevel?.(response.user.academicLevel);
        setAcademicTrack?.(response.user.academicTrack);
      }

      toast.success("Account profile updated successfully!");
    } catch (error) {
      toast.error(error?.message || "Failed to update profile.");
    } finally {
      setSavingProfile(false);
    }
  };

  const persistProfileImage = async (nextImage) => {
    const previousImage = profileImage;
    setProfileImage(nextImage);

    try {
      const response = await api.updateProfile({ profileImage: nextImage });
      setUserProfile(response.user);
      toast.success(nextImage ? "Profile picture updated." : "Profile picture removed.");
    } catch (error) {
      setProfileImage(previousImage);
      toast.error(error?.message || "Failed to update profile picture.");
    }
  };

  const handleProfileImageChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Profile picture must be under 2 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      persistProfileImage(String(reader.result || ""));
    };
    reader.onerror = () => toast.error("Could not read that image file.");
    reader.readAsDataURL(file);
  };

  const handleRemoveProfileImage = () => {
    persistProfileImage("");
  };

  // Helper to format countdown timer (MM:SS)
  const formatCountdown = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  // Send OTP for forgot password
  const handleSendOtp = async () => {
    try {
      const response = await api.post("/api/auth/send-otp");
      setShowOtpInput(true);
      setIsOtpVerified(false);
      setIsOtpLimitReached(false);
      setOtp("");
      setOtpCountdown(120); // Start 2-minute countdown
      toast.success("OTP sent successfully to your registered email! Please check your inbox.");
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "";
      if (errMsg.includes("Too many OTP requests") || errMsg.includes("limit") || errMsg.includes("429")) {
        setIsOtpLimitReached(true);
        setOtpCountdown(0);
      }
      toast.error(error instanceof Error ? error.message : "Failed to send OTP.");
    }
  };

  // Verify OTP for forgot password
  const handleVerifyOtp = async () => {
    if (otpCountdown === 0 && !isOtpLimitReached) {
      toast.error("OTP has expired. Please click Resend OTP to request a new one.");
      return;
    }
    if (isOtpLimitReached) {
      toast.error("OTP limit reached. Please wait for the lockout window to end.");
      return;
    }
    try {
      if (!otp.trim()) {
        toast.error("Please enter the OTP code first.");
        return;
      }
      await api.post("/api/auth/verify-otp", { otp: otp.trim() });
      setIsOtpVerified(true);
      toast.success("OTP verified successfully! You can now type your new password.");
    } catch (error) {
      setIsOtpVerified(false);
      toast.error(error instanceof Error ? error.message : "Invalid OTP code.");
    }
  };

  // Save security settings
  const handleSaveSecurity = async () => {
    try {
      if (password && !showOtpInput && !currentPassword) {
        toast.error("Please enter your current password first.");
        return;
      }
      if (password && showOtpInput && !isOtpVerified) {
        toast.error("Please verify the OTP sent to your email first.");
        return;
      }
      if (password && password !== confirmPassword) {
        toast.error("Passwords do not match.");
        return;
      }

      const payload = { email };
      if (password) {
        if (showOtpInput) {
          payload.otp = otp;
        } else {
          payload.currentPassword = currentPassword;
        }
        payload.password = password;
        payload.confirmPassword = confirmPassword;
      }

      const response = await api.updateProfile(payload);
      setUserProfile(response.user);
      setCurrentPassword("");
      setOtp("");
      setIsOtpVerified(false);
      setIsOtpLimitReached(false);
      setShowOtpInput(false);
      setOtpCountdown(0);
      setPassword("");
      setConfirmPassword("");
      toast.success(response.passwordChanged ? "Password updated. Other devices were signed out." : "Security credentials updated successfully!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update security credentials.");
    }
  };

  const handlePlannerSettingsChange = (value) => {
    const nextSettings = normalizePlannerSettings(value);
    setGoalReminderSettings(nextSettings);
    setGoalReminderData(syncStudyTargetReminders(goalReminderData, nextSettings));
  };

  // Save study target goals
  const handleSaveStudyTargets = () => {
    localStorage.setItem("prepmatrix_daily_target", String(dailyTarget));
    localStorage.setItem("prepmatrix_weekly_review", weeklyReview);
    const nextSettings = normalizePlannerSettings({
      ...goalReminderSettings,
      dailyStudyTarget: dailyTarget,
      weeklyReviewTarget: weeklyReview,
      targetRemindersEnabled: true,
    });
    setGoalReminderSettings(nextSettings);
    setGoalReminderData(syncStudyTargetReminders(goalReminderData, nextSettings));
    toast.success("Study targets saved and reminder schedule refreshed!");
  };

  // Export backup
  const handleExportBackup = () => {
    const data = {
      subjects,
      schedule,
      completed,
      materialBookmarks,
      goalReminderData,
      goalReminderSettings,
      academicLevel,
      academicTrack,
      darkMode,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const date = new Date().toISOString().split("T")[0];
    a.href = url;
    a.download = `prepmatrix-backup-${date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Backup exported successfully!");
  };

  // Import backup
  const handleImportBackup = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (data.subjects) setSubjects(data.subjects);
        if (data.schedule) setSchedule(data.schedule);
        if (data.completed) setCompleted(data.completed);
        if (data.materialBookmarks) setMaterialBookmarks(data.materialBookmarks);
        if (data.goalReminderData) setGoalReminderData(normalizePlannerData(data.goalReminderData));
        if (data.goalReminderSettings) setGoalReminderSettings(normalizePlannerSettings(data.goalReminderSettings));
        if (data.academicLevel) setAcademicLevel(data.academicLevel);
        if (data.academicTrack) setAcademicTrack(data.academicTrack);
        if (typeof data.darkMode === "boolean") setDarkMode(data.darkMode);
        toast.success("Backup imported and workspace restored!");
      } catch {
        toast.error("Invalid backup file. Please upload a valid JSON file.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // Reset entire workspace
  const handleResetWorkspace = () => {
    setSubjects([]);
    setSchedule([]);
    setCompleted([]);
    setMaterialBookmarks([]);
    setGoalReminderData(normalizePlannerData(DEFAULT_GOAL_REMINDER_DATA));
    setGoalReminderSettings(normalizePlannerSettings(DEFAULT_GOAL_REMINDER_SETTINGS));
    setDailyTarget(4);
    setWeeklyReview("2");
    localStorage.setItem("prepmatrix_daily_target", "4");
    localStorage.setItem("prepmatrix_weekly_review", "2");
    setConfirmReset(false);
    toast.success("Workspace has been reset to defaults.");
  };

  const handleDeleteAccount = async () => {
    if (deletingAccount) return;
    if (!deletePassword.trim()) {
      setDeletePasswordError("Please enter your password.");
      return;
    }
    setDeletePasswordError("");
    setDeletingAccount(true);

    try {
      await api.deleteAccount(deletePassword);
      setConfirmDeleteAccount(false);
      setShowPasswordStep(false);
      setDeletePassword("");
      setDeletePasswordError("");
      setSubjects([]);
      setSchedule([]);
      setCompleted([]);
      setMaterialBookmarks([]);
      setNotification?.("Account deleted successfully.");
      onAccountDeleted?.();
      toast.success("Account deleted successfully.");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Could not delete account.";
      setDeletePasswordError(msg);
    } finally {
      setDeletingAccount(false);
    }
  };

  // Apply appearance styles to DOM
  const applyAppearanceStyles = (theme, font, card, rgbLight, rgbDark, opacity, borderOp, bgL, bgD, glassC, glassB, fontS, fontW, bgImgId, bgOvOpacity, glassOp, bgImageBlur) => {
    // 1. Theme
    localStorage.setItem("prepmatrix_default_theme", theme);
    const imgPreset = BACKGROUND_PRESETS.find(({ id }) => id === bgImgId);
    const isDark = resolveEffectiveDarkMode(theme === "dark", Boolean(imgPreset));

    document.body.classList.toggle("dark", isDark);
    document.documentElement.classList.toggle("dark", isDark);
    
    // 2. Font Size
    localStorage.setItem("prepmatrix_font_size", font);
    document.documentElement.style.setProperty(
      "--base-font-size",
      font === "small" ? "14px" : font === "large" ? "18px" : "16px"
    );
    document.body.style.setProperty(
      "--base-font-size",
      font === "small" ? "14px" : font === "large" ? "18px" : "16px"
    );

    // 3. Card Size
    localStorage.setItem("prepmatrix_card_size", card);
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

    // 4. Accent Color
    localStorage.setItem("prepmatrix_accent_rgb_light", rgbLight);
    localStorage.setItem("prepmatrix_accent_rgb_dark", rgbDark);
    const activeRgb = isDark ? rgbDark : rgbLight;
    document.documentElement.style.setProperty("--accent-rgb", activeRgb);
    document.body.style.setProperty("--accent-rgb", activeRgb);
    
    document.documentElement.style.setProperty("--accent", `rgb(${activeRgb})`);
    document.body.style.setProperty("--accent", `rgb(${activeRgb})`);

    // 5. Transparency & Contrast
    localStorage.setItem("prepmatrix_accent_opacity", opacity.toString());
    localStorage.setItem("prepmatrix_border_opacity", borderOp.toString());
    document.documentElement.style.setProperty("--accent-opacity", opacity.toString());
    document.body.style.setProperty("--accent-opacity", opacity.toString());
    document.documentElement.style.setProperty("--border-opacity", borderOp.toString());
    document.body.style.setProperty("--border-opacity", borderOp.toString());

    // 6. Background colors
    localStorage.setItem("prepmatrix_bg_light", bgL);
    localStorage.setItem("prepmatrix_bg_dark", bgD);
    const activeBg = isDark ? bgD : bgL;
    document.documentElement.style.setProperty("--bg", activeBg);
    document.body.style.setProperty("--bg", activeBg);
    document.documentElement.style.setProperty("--bg-secondary", activeBg);
    document.body.style.setProperty("--bg-secondary", activeBg);

    // 7. Glassy states
    localStorage.setItem("prepmatrix_glassy_panels", String(glassC));
    localStorage.setItem("prepmatrix_glassy_buttons", String(glassB));
    document.body.classList.toggle("no-glass-cards", !glassC);
    document.body.classList.toggle("no-glass-buttons", !glassB);

    // 8. Typography choices
    localStorage.setItem("prepmatrix_font_style", fontS);
    localStorage.setItem("prepmatrix_font_weight", fontW);
    applyFontFamilyVars(fontS);
    applyFontWeightVars(fontW);

    localStorage.setItem("prepmatrix_bg_image_id", imgPreset ? bgImgId : "");
    localStorage.setItem("prepmatrix_bg_overlay_opacity", String(bgOvOpacity));
    localStorage.setItem("prepmatrix_glass_opacity", String(glassOp));
    const normalizedBackgroundImageBlur = normalizeBackgroundImageBlurPx(bgImageBlur);
    localStorage.setItem(BACKGROUND_IMAGE_BLUR_STORAGE_KEY, String(normalizedBackgroundImageBlur));
    document.documentElement.style.setProperty("--glass-opacity", String(glassOp));
    document.body.style.setProperty("--glass-opacity", String(glassOp));
    applyBackgroundImageBlurVariables(normalizedBackgroundImageBlur, Boolean(imgPreset));

    if (imgPreset) {
      document.body.classList.add("has-bg-image");
      document.documentElement.style.setProperty("--bg-image", `url(${imgPreset.file})`);
      document.documentElement.style.setProperty("--bg-surface-rgb", imgPreset.surfaceRgb);
      const saveOverlay = (bgOvOpacity * 0.5).toString();
      document.documentElement.style.setProperty("--bg-overlay-opacity", saveOverlay);
      document.body.style.setProperty("--bg-overlay-opacity", saveOverlay);
      const saveBrightness = Math.pow(Math.max(0, 1 - bgOvOpacity * 0.5), 4.5);
      document.documentElement.style.setProperty("--bg-brightness", saveBrightness.toString());
      document.body.style.setProperty("--bg-brightness", saveBrightness.toString());
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
  };

  // Save appearance settings
  const handleSaveAppearance = () => {
    savedRef.current = true; // Mark as saved to prevent unmount reversion

    applyAppearanceStyles(
      darkMode ? "dark" : "light",
      fontSize,
      cardSize,
      accentRgbLight,
      accentRgbDark,
      transparency,
      contrast,
      bgLight,
      bgDark,
      glassyCards,
      glassyButtons,
      fontFamilyStyle,
      fontWeightStyle,
      bgImageId,
      bgOverlayOpacity,
      glassOpacity,
      backgroundImageBlur
    );


    toast.success("Appearance configurations applied successfully!");
  };

  const handleSelectPreset = (preset) => {
    setAccentRgbLight(preset.light);
    setAccentRgbDark(preset.dark);
  };

  const handleCustomColorChange = (hex, mode) => {
    const rgb = hexToRgb(hex);
    if (rgb) {
      if (mode === "light") {
        setCustomColorLight(hex);
        setAccentRgbLight(rgb);
      } else {
        setCustomColorDark(hex);
        setAccentRgbDark(rgb);
      }
    }
  };

  const isButtonDisabled = (() => {
    if (password || confirmPassword) {
      return !password || !confirmPassword || password !== confirmPassword;
    }
    if (email !== userProfile?.email) {
      return false;
    }
    return true;
  })();

  return (
    <section className="settings-page route-stage">
      <div className="compact-intro">
        <span className="section-tag" style={{ marginBottom: '12px' }}>PREFERENCES</span>
        <h2>Settings</h2>
        <p className="card-subtext">Manage profile, update password, and customize application appearance.</p>
      </div>

      <div className="dashboard-feature-grid settings-grid" style={{ marginTop: "24px" }}>
        
        {/* Profile Card */}
        <div className="card settings-card settings-account-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="settings-account-header">
            <div className="settings-account-copy">
              <span className="section-tag" style={{ marginBottom: '12px' }}>ACCOUNT</span>
              <h3 style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                <User size={20} className="status-success" /> Profile & Institution
              </h3>
              <p className="card-subtext account-card-description">Update your personal details and academic institution properties.</p>
            </div>

            <div className="profile-photo-control">
              <input
                accept="image/*"
                aria-label="Upload profile picture"
                className="profile-photo-input"
                onChange={handleProfileImageChange}
                ref={profileImageInputRef}
                type="file"
              />
              <button
                aria-label={profileImage ? "Change profile picture" : "Upload profile picture"}
                className={`profile-photo-circle${profileImage ? " has-image" : ""}`}
                onClick={() => profileImageInputRef.current?.click()}
                title={profileImage ? "Change profile picture" : "Upload profile picture"}
                type="button"
              >
                {profileImage ? (
                  <img alt="Profile" src={profileImage} />
                ) : (
                  <User size={22} aria-hidden="true" />
                )}
              </button>
              <button
                aria-label={profileImage ? "Remove profile picture" : "Upload profile picture"}
                className={`profile-photo-mini-action${profileImage ? " delete" : " edit"}`}
                onClick={profileImage ? handleRemoveProfileImage : () => profileImageInputRef.current?.click()}
                title={profileImage ? "Remove profile picture" : "Upload profile picture"}
                type="button"
              >
                {profileImage ? <Trash2 size={10} strokeWidth={2.4} /> : <Pencil size={10} strokeWidth={2.4} />}
              </button>
            </div>
          </div>
          
          <div className="form-grid">
            <label className="field-stack">
              <span>Full Name</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="User name"
              />
            </label>
            <label className="field-stack">
              <span>Age</span>
              <input
                type="number"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="Age"
              />
            </label>
          </div>

          <div className="form-grid">
            <label className="field-stack">
              <span>Academic Stage</span>
              <select
                value={educationStage}
                onChange={(e) => setEducationStage(e.target.value)}
              >
                {[...new Set([educationStage, ...ACADEMIC_LEVEL_OPTIONS].filter(Boolean))].map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
            <label className="field-stack">
              <span>Institution Name</span>
              <input
                value={institutionName}
                onChange={(e) => setInstitutionName(e.target.value)}
                placeholder="e.g. Stanford University"
              />
            </label>
          </div>

          <div className="form-grid">
            {isSchoolAcademicLevel(educationStage) ? (
              <label className="field-stack">
                <span>Grade / Class</span>
                <select
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                >
                  <option value="">Select class</option>
                  {[...new Set([grade, ...SCHOOL_CLASS_OPTIONS].filter(Boolean))].map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="field-stack">
                <span>Degree / Major</span>
                <input
                  value={degree}
                  onChange={(e) => setDegree(e.target.value)}
                  placeholder="e.g. B.Tech IT, MBBS, LLB, M.Sc"
                />
              </label>
            )}
            <label className="field-stack">
              <span>{isSchoolAcademicLevel(educationStage) ? "Board / Curriculum" : "Field / Stream"}</span>
              <select value={profileTrack} onChange={(e) => setProfileTrack(e.target.value)}>
                {[...new Set([profileTrack, ...TRACK_OPTIONS].filter(Boolean))].map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
          </div>

          {!isSchoolAcademicLevel(educationStage) && (
            <label className="field-stack">
              <span>Specialization / Department</span>
              <input
                list="settings-department-options"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="e.g. Information Technology, Cardiology, Constitutional Law"
              />
              <datalist id="settings-department-options">
                {DEPARTMENT_OPTIONS.map((option) => <option key={option} value={option} />)}
              </datalist>
            </label>
          )}

          <button
            onClick={handleSaveAccount}
            disabled={savingProfile}
            style={{ alignSelf: "flex-end", display: "flex", alignItems: "center", gap: "8px", opacity: savingProfile ? 0.6 : 1 }}
          >
            <Save size={16} /> {savingProfile ? "Saving..." : "Save Profile"}
          </button>
        </div>

        {/* Security Credentials */}
        <div className="card settings-card settings-security-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <span className="section-tag" style={{ marginBottom: '12px' }}>SECURITY</span>
            <h3 style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
              <Shield size={20} className="status-warning" /> Credentials & Security
            </h3>
            <p className="card-subtext">Update your login email and choose a strong password.</p>
          </div>

          <label className="field-stack">
            <span>Email Address</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
            />
          </label>

          <div className="form-grid">
            {showOtpInput ? (
              <label className="field-stack" style={{ position: "relative" }}>
                <span>Enter OTP code</span>
                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                  <input
                    type="text"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleVerifyOtp()}
                    placeholder="e.g. 123456"
                    maxLength={6}
                    disabled={isOtpVerified}
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      paddingRight: "40px",
                      borderColor: isOtpVerified ? "var(--success)" : undefined,
                      background: isOtpVerified ? "rgba(34, 197, 94, 0.05)" : undefined
                    }}
                  />
                  {!isOtpVerified && (
                    <button
                      className="otp-arrow-btn"
                      type="button"
                      onClick={handleVerifyOtp}
                      style={{
                        position: "absolute",
                        right: "6px",
                        top: "50%",
                        transform: "translateY(-50%)"
                      }}
                    >
                      <ArrowRight size={16} />
                    </button>
                  )}
                  {isOtpVerified && (
                    <span
                      style={{
                        position: "absolute",
                        right: "12px",
                        color: "var(--success)",
                        fontSize: "0.8rem",
                        fontWeight: 700
                      }}
                    >
                      ✓ Verified
                    </span>
                  )}
                </div>
                {!isOtpVerified && (
                  <div style={{ marginTop: "4px", fontSize: "0.78rem" }}>
                    {otpCountdown > 0 ? (
                      <span style={{ color: "var(--text-muted)" }}>
                        OTP expires in <strong style={{ color: "var(--accent)" }}>{formatCountdown(otpCountdown)}</strong>
                      </span>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <span style={{ color: "var(--danger)", fontWeight: 600 }}>
                          {isOtpLimitReached ? "OTP limit reached (5 requests/24 hours limit)." : "OTP has expired."}
                        </span>
                        <button
                          type="button"
                          className="secondary-btn"
                          onClick={handleSendOtp}
                          disabled={isOtpLimitReached}
                          style={{
                            fontSize: "0.76rem",
                            padding: "4px 8px",
                            width: "fit-content",
                            borderRadius: "8px",
                            height: "26px",
                            minHeight: "26px",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            opacity: isOtpLimitReached ? 0.4 : 1,
                            cursor: isOtpLimitReached ? "not-allowed" : "pointer"
                          }}
                        >
                          Resend OTP
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </label>
            ) : (
              <label className="field-stack">
                <span>Current Password</span>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              </label>
            )}
            <label className="field-stack">
              <span>New Password</span>
              <input
                type="password"
                value={password}
                disabled={!isCurrentPasswordCorrect && !isOtpVerified}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                style={{ opacity: (isCurrentPasswordCorrect || isOtpVerified) ? 1 : 0.5, cursor: (isCurrentPasswordCorrect || isOtpVerified) ? 'text' : 'not-allowed' }}
              />
            </label>
            <label className="field-stack">
              <span>Confirm Password</span>
              <input
                type="password"
                value={confirmPassword}
                disabled={!isCurrentPasswordCorrect && !isOtpVerified}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                style={{ opacity: (isCurrentPasswordCorrect || isOtpVerified) ? 1 : 0.5, cursor: (isCurrentPasswordCorrect || isOtpVerified) ? 'text' : 'not-allowed' }}
              />
            </label>
          </div>

          <div className="security-action-row">
            {!showOtpInput && (
              <button 
                type="button" 
                className="secondary-btn forgot-pw-btn"
                onClick={handleSendOtp}
              >
                Forgot password?
              </button>
            )}
            <button
              className="update-cred-btn"
              onClick={handleSaveSecurity}
              disabled={isButtonDisabled}
              style={{ 
                opacity: isButtonDisabled ? 0.55 : 1,
                cursor: isButtonDisabled ? "not-allowed" : "pointer"
              }}
            >
              <Save size={14} /> Update Credentials
            </button>
          </div>
        </div>

        {/* System Preferences & Toggles */}
        <div className="card settings-card settings-system-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <span className="section-tag" style={{ marginBottom: '12px' }}>SYSTEM</span>
            <h3 style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
              <Settings2 size={20} className="status-success" /> System Preferences & Toggles
            </h3>
            <p className="card-subtext">Configure study sounds, wake mode, and notification preferences.</p>
          </div>

          <ToggleSwitch
            checked={soundEnabled}
            onChange={() => setSoundEnabled((prev) => !prev)}
            label="Completion Sound Effects"
            subtitle="Play audio chimes when clearing scheduled days or unlocking streaks"
          />


          <ToggleSwitch
            checked={wakeMode}
            onChange={toggleWakeMode}
            label="Wake Mode (Hands-Free)"
            subtitle='Keep wake mode on while the app is open. Say Hey Prep, Prep Matrix, or Hey PrepMatrix followed by a command or question.'
          />

          <div aria-live="polite" className="notification-setting">
            <ToggleSwitch
              checked={notificationToggleChecked}
              onChange={toggleNotifications}
              disabled={notificationToggleDisabled}
              label="Study Reminders (Push Notifications)"
              subtitle={notificationSubtitle}
            />
            {notificationsEnabled && notificationStatus === "connected" && (
              <div className="notification-test-row">
                <span className="card-subtext">
                  Test notifications always appear as system notifications so you can verify background delivery.
                </span>
                <button
                  aria-busy={notificationTestBusy}
                  className="secondary-btn notification-test-btn"
                  disabled={notificationTestBusy || notificationsBusy}
                  onClick={sendTestNotification}
                  type="button"
                >
                  <BellRing aria-hidden="true" size={14} />
                  {notificationTestBusy ? "Sending..." : "Send test"}
                </button>
              </div>
            )}
            <div className="notification-history-setting-row">
              <div className="notification-history-setting-copy">
                <span className="notification-history-setting-icon">
                  <History aria-hidden="true" size={15} />
                </span>
                <div>
                  <strong>Notification history</strong>
                  <span>Review full messages and remove alerts you no longer need.</span>
                </div>
              </div>
              <button
                className="secondary-btn notification-history-setting-btn"
                onClick={() => navigate("/notification-history")}
                type="button"
              >
                <History aria-hidden="true" size={14} />
                View history
              </button>
            </div>
          </div>
        </div>

        <GoalSettingsPanel
          completed={completed}
          dailyTarget={dailyTarget}
          onDailyTargetChange={setDailyTarget}
          onPlannerSettingsChange={handlePlannerSettingsChange}
          onSaveTargets={handleSaveStudyTargets}
          onWeeklyReviewChange={setWeeklyReview}
          plannerData={goalReminderData}
          plannerSettings={goalReminderSettings}
          schedule={schedule}
          scheduleStartDate={scheduleStartDate}
          weeklyReview={weeklyReview}
        />


        {/* Appearance Configuration */}
        <div className="card dashboard-full-span settings-card settings-appearance-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <span className="section-tag" style={{ marginBottom: '12px' }}>APPEARANCE</span>
            <h3 style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
              <Palette size={20} className="status-success" /> Custom Color Palette & Layout
            </h3>
            <p className="card-subtext">Change default startup theme, font/card scales, and set color values with transparency & contrast controls.</p>
          </div>

          {/* Background Image Picker */}
          <div className="settings-appearance-section" style={{ borderBottom: "1px solid var(--border)", paddingBottom: "18px" }}>
            <span className="card-subtext" style={{ fontSize: "0.8rem", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
              <ImageIcon size={14} /> Background Theme
            </span>
            <p className="card-subtext" style={{ marginBottom: "12px", fontSize: "0.82rem" }}>
              Choose an image background or use the color palette theme. Image backgrounds automatically set matching theme colours.
            </p>
            <div className="settings-bg-presets-grid" style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: "10px", overflowX: "hidden", padding: "0 2px 6px", minWidth: 0 }}>
              {/* None / Color Palette option */}
              <button
                onClick={() => setBgImageId("")}
                type="button"
                className="bg-palette-thumbnail-btn"
                style={{
                  aspectRatio: "16 / 10",
                  border: bgImageId === "" ? "2.5px solid var(--accent)" : "1.5px solid var(--border)",
                  borderRadius: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  position: "relative",
                  overflow: "hidden",
                  fontSize: "0.78rem",
                  color: "var(--text)",
                  fontWeight: 600,
                  gap: "5px",
                  transition: "all 0.2s ease",
                }}
              >
                <Palette size={15} /> Color Palette
                {bgImageId === "" && <Check size={12} style={{ position: "absolute", top: "5px", right: "5px", color: "var(--accent)" }} />}
              </button>

              {/* Image thumbnails */}
              {BACKGROUND_PRESETS.map((preset) => {
                const isActive = bgImageId === preset.id;
                return (
                  <button
                    key={preset.id}
                    onClick={() => setBgImageId(preset.id)}
                    type="button"
                    className={`bg-preset-thumbnail-btn bg-preset-${preset.id}`}
                    style={{
                      aspectRatio: "16 / 10",
                      border: isActive ? `2.5px solid rgb(${preset.accentRgb})` : "1.5px solid var(--border)",
                      borderRadius: "12px",
                      cursor: "pointer",
                      position: "relative",
                      overflow: "hidden",
                      padding: 0,
                      transition: "all 0.2s ease",
                      boxShadow: isActive ? `0 0 0 1px rgb(${preset.accentRgb}), 0 4px 12px rgba(${preset.accentRgb}, 0.25)` : "none",
                    }}
                  >
                    <span style={{
                      position: "absolute",
                      bottom: 0,
                      left: 0,
                      right: 0,
                      padding: "16px 8px 5px",
                      background: "transparent",
                      color: "#fff",
                      fontSize: "0.72rem",
                      fontWeight: 600,
                      textAlign: "left",
                      letterSpacing: "0.02em",
                    }}>
                      {preset.name}
                    </span>
                    {isActive && <Check size={13} style={{ position: "absolute", top: "5px", right: "5px", color: "#fff", filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.6))" }} />}
                  </button>
                );
              })}
            </div>

            {/* Brightness/Dimness Slider — only visible when an image bg is selected */}
            {bgImageId && (
              <div style={{ marginTop: "14px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                  <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text)" }}>Background Brightness</span>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                    {Math.round((1 - bgOverlayOpacity) * 100)}%
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Dim</span>
                  <input
                    type="range"
                    min="0.02"
                    max="1.00"
                    step="0.02"
                    value={1 - bgOverlayOpacity}
                    onChange={(e) => setBgOverlayOpacity(1 - parseFloat(e.target.value))}
                    style={{
                      flex: 1,
                      accentColor: "rgb(var(--accent-rgb))",
                      height: "6px",
                      cursor: "pointer",
                    }}
                  />
                  <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Bright</span>
                </div>
              </div>
            )}
          </div>

          <div className="workspace-grid settings-appearance-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
            
            {/* Left Column: Layout & Typography */}
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div className="form-grid">
                <label className="field-stack">
                  <span>Font Scale</span>
                  <select
                    value={fontSize}
                    onChange={(e) => setFontSize(e.target.value)}
                  >
                    <option value="small">Small</option>
                    <option value="medium">Medium (Default)</option>
                    <option value="large">Large</option>
                  </select>
                </label>

                <label className="field-stack">
                  <span>Card Scale</span>
                  <select
                    value={cardSize}
                    onChange={(e) => setCardSize(e.target.value)}
                  >
                    <option value="compact">Compact</option>
                    <option value="cozy">Cozy (Default)</option>
                    <option value="spacious">Spacious</option>
                  </select>
                </label>
              </div>

              <div className="form-grid">
                <label className="field-stack">
                  <span>Font Style (Family)</span>
                  <select
                    value={fontFamilyStyle}
                    onChange={(e) => setFontFamilyStyle(e.target.value)}
                  >
                    <option value="sans">Modern Sans (Manrope / Space Grotesk)</option>
                    <option value="clean">Sleek Clean (Inter / Outfit)</option>
                    <option value="rounded">Rounded Friendly (Nunito / Quicksand)</option>
                    <option value="geometric">Geometric Modern (Poppins / Raleway)</option>
                    <option value="humanist">Humanist Neutral (Source Sans 3 / DM Sans)</option>
                    <option value="editorial">Editorial Sharp (Plus Jakarta Sans / Raleway)</option>
                    <option value="serif">Elegant Serif (Lora / Playfair Display)</option>
                    <option value="classic">Classic Serif (Merriweather / Crimson Text)</option>
                    <option value="mono">Tech Mono (Fira Code / Space Mono)</option>
                  </select>
                </label>

                <label className="field-stack">
                  <span>Font Weight Modifier</span>
                  <select
                    value={fontWeightStyle}
                    onChange={(e) => setFontWeightStyle(e.target.value)}
                  >
                    <option value="light">Light</option>
                    <option value="regular">Regular (Default)</option>
                    <option value="medium">Medium</option>
                    <option value="bold">Bold</option>
                  </select>
                </label>
              </div>

              {/* Glassmorphism Customization Section */}
              <div className="settings-glass-section" style={{ marginTop: "18px", borderTop: "1px solid var(--border)", paddingTop: "14px" }}>
                <span className="card-subtext" style={{ fontSize: "0.8rem", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "8px" }}>Glassmorphism Customization</span>
                <ToggleSwitch
                  checked={glassyCards}
                  onChange={() => setGlassyCards((prev) => !prev)}
                  label="Glassy Cards & Panels"
                  subtitle="Apply glass blur and transparency to containers"
                />

                <div className="settings-glass-controls">
                {/* Glass Card Transparency Slider */}
                <div style={{ marginTop: "14px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text)" }}>Glass Panel Opacity</span>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                      {Math.round(glassOpacity * 100)}%
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Transparent</span>
                    <input
                      type="range"
                      min="0.10"
                      max="0.90"
                      step="0.05"
                      value={glassOpacity}
                      disabled={!glassyCards}
                      onChange={(e) => setGlassOpacity(parseFloat(e.target.value))}
                      style={{
                        flex: 1,
                        accentColor: "rgb(var(--accent-rgb))",
                        height: "6px",
                        cursor: glassyCards ? "pointer" : "not-allowed",
                        opacity: glassyCards ? 1 : 0.4,
                      }}
                    />
                    <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Opaque</span>
                  </div>
                </div>

                {/* Background Image Blur Slider */}
                <div
                  style={{
                    marginTop: "14px",
                    opacity: hasSelectedBackgroundImage ? 1 : 0.5,
                    transition: "opacity 0.2s ease",
                  }}
                  title={!hasSelectedBackgroundImage ? "Select an image background to adjust blur." : undefined}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text)" }}>Background Image Blur</span>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                      {Math.round(backgroundImageBlur)}px
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Sharp</span>
                    <input
                      aria-label="Background image blur"
                      aria-disabled={!hasSelectedBackgroundImage}
                      type="range"
                      min="0"
                      max={BACKGROUND_IMAGE_BLUR_MAX_PX}
                      step="1"
                      value={backgroundImageBlur}
                      disabled={!hasSelectedBackgroundImage}
                      onChange={(e) => setBackgroundImageBlur(normalizeBackgroundImageBlurPx(e.target.value))}
                      style={{
                        flex: 1,
                        accentColor: "rgb(var(--accent-rgb))",
                        height: "6px",
                        cursor: hasSelectedBackgroundImage ? "pointer" : "not-allowed",
                      }}
                    />
                    <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Blurred</span>
                  </div>
                </div>
                </div>
              </div>
            </div>

            {/* Right Column: Customization Presets & Mouse Settings */}
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

              {/* Cursor Style Selector — hidden on mobile via CSS */}
              <div className="settings-cursor-selector" style={{ borderBottom: "1px solid var(--border)", paddingBottom: "14px" }}>
                <span className="field-stack"><span>Mouse Cursor Style</span></span>
                <div className="cursor-style-cards">
                  {/* Default OS Cursor */}
                  <button
                    type="button"
                    className={`cursor-style-card ${(parentCursorStyle === "default" || !parentCursorStyle) ? "active" : ""}`}
                    onClick={() => {
                      if (setParentCursorStyle) setParentCursorStyle("default");
                      localStorage.setItem("prepmatrix_cursor_style", "default");
                    }}
                  >
                    <div className="cursor-card-preview cursor-preview-default">
                      <svg width="18" height="22" viewBox="0 0 18 22" fill="none">
                        <path d="M1 1L1 17L5.5 13L8 20L10 19L7.5 12H13L1 1Z" fill="white" stroke="rgba(255,255,255,0.3)" strokeWidth="1"/>
                      </svg>
                    </div>
                    <span className="cursor-card-label">Default</span>
                    <span className="cursor-card-sub">OS Pointer</span>
                  </button>

                  {/* App Cursor */}
                  <button
                    type="button"
                    className={`cursor-style-card ${parentCursorStyle === "app-cursor" ? "active" : ""}`}
                    onClick={() => {
                      if (setParentCursorStyle) setParentCursorStyle("app-cursor");
                      localStorage.setItem("prepmatrix_cursor_style", "app-cursor");
                    }}
                  >
                    <div className="cursor-card-preview cursor-preview-app">
                      <div className="ccp-app-ring" />
                      <div className="ccp-app-dot" />
                    </div>
                    <span className="cursor-card-label">App</span>
                    <span className="cursor-card-sub">Purple dot + ring</span>
                  </button>

                  {/* Blob Cursor */}
                  <button
                    type="button"
                    className={`cursor-style-card ${parentCursorStyle === "blob-cursor" ? "active" : ""}`}
                    onClick={() => {
                      if (setParentCursorStyle) setParentCursorStyle("blob-cursor");
                      localStorage.setItem("prepmatrix_cursor_style", "blob-cursor");
                    }}
                  >
                    <div className="cursor-card-preview cursor-preview-blob">
                      <div className="ccp-blob-body" />
                      <div className="ccp-blob-dot" />
                    </div>
                    <span className="cursor-card-label">Blob</span>
                    <span className="cursor-card-sub">Morphing fluid</span>
                  </button>
                </div>
              </div>


              <div className="field-stack">
                <span>Preset Accent Color Palette</span>
                <div className="preset-palette-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", marginTop: "8px" }}>
                  {COLOR_PRESETS.map((preset) => {
                    const isActive = accentRgbLight === preset.light;
                    return (
                      <button
                        key={preset.name}
                        onClick={() => handleSelectPreset(preset)}
                        className="preset-color-btn"
                        type="button"
                        style={{
                          minHeight: "40px",
                          padding: "6px 12px",
                          fontSize: "0.82rem",
                          border: isActive ? "2px solid var(--accent)" : "1px solid var(--border)",
                          background: `rgba(${preset.light}, 0.1)`,
                          color: `rgb(${preset.light})`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "6px",
                          borderRadius: "8px"
                        }}
                        title={preset.name}
                      >
                        <span
                          className="preset-color-dot"
                          style={{
                            width: "12px",
                            height: "12px",
                            borderRadius: "50%",
                            backgroundColor: `rgb(${preset.light})`,
                            display: "inline-block",
                            flexShrink: 0
                          }}
                        />
                        <span className="preset-name-text">{preset.name}</span>
                        {isActive && <Check size={12} style={{ flexShrink: 0 }} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

          </div>

          <button
            onClick={handleSaveAppearance}
            style={{ alignSelf: "flex-end", display: "flex", alignItems: "center", gap: "8px" }}
          >
            <Save size={16} /> Save Appearance Settings
          </button>
        </div>

        {/* Data Management & Danger Zone */}
        <div className="card dashboard-full-span settings-card settings-data-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <span className="section-tag" style={{ marginBottom: '12px' }}>DATA</span>
            <h3 style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
              <Download size={20} className="status-warning" /> Data Management & Danger Zone
            </h3>
            <p className="card-subtext">Export, import, or reset your study workspace data.</p>
          </div>

          <div className="form-grid">
            <div className="field-stack">
              <span>Export Backup</span>
              <button
                onClick={handleExportBackup}
                style={{ display: "flex", alignItems: "center", gap: "8px", width: "fit-content" }}
              >
                <Download size={16} /> Download Backup (.json)
              </button>
            </div>

            <div className="field-stack">
              <span>Import Backup</span>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", padding: "8px 16px", border: "1px solid var(--border)", borderRadius: "8px", width: "fit-content", fontSize: "0.9rem" }}>
                <Upload size={16} /> Upload Backup File
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportBackup}
                  style={{ display: "none" }}
                />
              </label>
            </div>
          </div>

          <div style={{ borderTop: "1px solid var(--border)", paddingTop: "16px" }}>
            <div className="field-stack">
              <span style={{ color: "var(--text-muted)" }}>Reset Entire Workspace</span>
              <p className="card-subtext" style={{ marginBottom: "8px" }}>This clears subjects, schedules, progress, bookmarks, goals, reminders, and to-do tasks. This action cannot be undone.</p>
              {!confirmReset ? (
                <button
                  onClick={() => setConfirmReset(true)}
                  style={{
                    display: "flex", alignItems: "center", gap: "8px", width: "fit-content",
                    background: "rgba(239, 68, 68, 0.1)", color: "#ef4444",
                    border: "1px solid rgba(239, 68, 68, 0.3)"
                  }}
                >
                  <Trash2 size={16} /> Reset Workspace
                </button>
              ) : (
                <div className="reset-confirm-actions" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <button
                    onClick={handleResetWorkspace}
                    style={{
                      display: "flex", alignItems: "center", gap: "8px",
                      background: "rgba(239, 68, 68, 0.2)", color: "#ef4444",
                      border: "1px solid rgba(239, 68, 68, 0.5)", fontWeight: 600
                    }}
                  >
                    <Trash2 size={16} /> Confirm Reset
                  </button>
                  <button
                    onClick={() => setConfirmReset(false)}
                    style={{ display: "flex", alignItems: "center", gap: "8px" }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>

          <div style={{ borderTop: "1px solid rgba(239, 68, 68, 0.24)", paddingTop: "16px" }}>
            <div className="field-stack" style={{ position: "relative" }}>
              <span style={{ color: "var(--danger)", fontWeight: 800 }}>Delete Account</span>
              <p className="card-subtext" style={{ marginBottom: "8px" }}>
                Permanently remove your account and all PrepMatrix data from the database.
              </p>
              <button
                className="confirm-danger-btn delete-account-trigger-btn"
                onClick={() => { setConfirmDeleteAccount(true); setShowPasswordStep(false); setDeletePassword(""); setDeletePasswordError(""); setShowDeletePassword(false); }}
                style={{ display: "flex", alignItems: "center", gap: "8px", width: "fit-content" }}
                type="button"
              >
                <Trash2 size={16} /> Delete Account
              </button>

              {/* Step 1: Confirmation popup */}
              {confirmDeleteAccount && !showPasswordStep && (
                <div
                  className="delete-confirm-popover"
                  ref={deleteConfirmRef}
                  style={{
                    position: "absolute",
                    bottom: "55px",
                    left: "0",
                    width: "340px",
                    padding: "18px",
                    borderRadius: "12px",
                    zIndex: 10,
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                    animation: "fadeSlideUp 0.2s ease"
                  }}
                >
                  <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                    <Trash2 size={18} style={{ color: "#ef4444", marginTop: "2px", flexShrink: 0 }} />
                    <div>
                      <strong style={{ fontSize: "0.95rem", color: "var(--text-strong)", display: "block", marginBottom: "4px" }}>Delete Account?</strong>
                      <p className="card-subtext" style={{ margin: 0, fontSize: "0.82rem", lineHeight: "1.4" }}>
                        This permanently removes all your workspace data, profile, mind maps, and active sessions. This action <strong>cannot be undone</strong>.
                      </p>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "4px" }}>
                    <button
                      className="secondary-btn"
                      onClick={() => setConfirmDeleteAccount(false)}
                      style={{ padding: "6px 14px", fontSize: "0.82rem" }}
                      type="button"
                    >
                      Cancel
                    </button>
                    <button
                      className="confirm-danger-btn"
                      onClick={() => setShowPasswordStep(true)}
                      style={{
                        padding: "6px 14px", fontSize: "0.82rem",
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

              {/* Step 2: Password verification popup */}
              {showPasswordStep && (
                <div
                  className="delete-confirm-popover"
                  ref={deleteConfirmRef}
                  style={{
                    position: "absolute",
                    bottom: "55px",
                    left: "0",
                    width: "340px",
                    padding: "18px",
                    borderRadius: "12px",
                    zIndex: 10,
                    display: "flex",
                    flexDirection: "column",
                    gap: "14px",
                    animation: "fadeSlideUp 0.2s ease"
                  }}
                >
                  <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                    <Lock size={18} style={{ color: "#ef4444", marginTop: "2px", flexShrink: 0 }} />
                    <div>
                      <strong style={{ fontSize: "0.95rem", color: "var(--text-strong)", display: "block", marginBottom: "4px" }}>Confirm Your Password</strong>
                      <p className="card-subtext" style={{ margin: 0, fontSize: "0.82rem", lineHeight: "1.4" }}>
                        Enter your login password to permanently delete your account.
                      </p>
                    </div>
                  </div>

                  <div style={{ position: "relative" }}>
                    <input
                      autoFocus
                      type={showDeletePassword ? "text" : "password"}
                      className="text-input"
                      value={deletePassword}
                      onChange={(e) => { setDeletePassword(e.target.value); setDeletePasswordError(""); }}
                      onKeyDown={(e) => e.key === "Enter" && handleDeleteAccount()}
                      placeholder="Enter your password..."
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        paddingRight: "38px",
                        border: deletePasswordError ? "1px solid #ef4444" : undefined
                      }}
                    />
                    <button
                      type="button"
                      className="eye-toggle-btn"
                      onClick={() => setShowDeletePassword(!showDeletePassword)}
                      tabIndex={-1}
                    >
                      {showDeletePassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>

                  {deletePasswordError && (
                    <p style={{ margin: 0, fontSize: "0.78rem", color: "#ef4444", lineHeight: "1.3" }}>
                      {deletePasswordError}
                    </p>
                  )}

                  <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                    <button
                      className="secondary-btn"
                      disabled={deletingAccount}
                      onClick={() => { setShowPasswordStep(false); setConfirmDeleteAccount(false); setDeletePassword(""); setDeletePasswordError(""); setShowDeletePassword(false); }}
                      style={{ padding: "6px 14px", fontSize: "0.82rem" }}
                      type="button"
                    >
                      Cancel
                    </button>
                    <button
                      className="confirm-danger-btn"
                      disabled={deletingAccount || !deletePassword.trim()}
                      onClick={handleDeleteAccount}
                      style={{
                        padding: "6px 14px", fontSize: "0.82rem",
                        background: deletePassword.trim() ? "rgba(239, 68, 68, 0.2)" : "rgba(239, 68, 68, 0.08)",
                        color: deletePassword.trim() ? "#ef4444" : "rgba(239, 68, 68, 0.4)",
                        border: "1px solid rgba(239, 68, 68, 0.4)", fontWeight: 600,
                        transition: "all 0.2s ease"
                      }}
                      type="button"
                    >
                      {deletingAccount ? "Deleting..." : "Confirm Delete"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}

export default SettingsPage;
