import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Gauge,
  GraduationCap,
  Info,
  Mail,
  Pencil,
  Repeat2,
  Save,
  ShieldCheck,
  Sparkles,
  Target,
  UserRound,
  UserRoundPlus,
  X,
} from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getAcademicProfileDisplayName } from "../utils/academicProfileNames";
import { toast } from "react-toastify";
import { isSchoolAcademicLevel, normalizeAcademicProfile } from "../utils/academicProfile";
import { getAcademicProfileSlots } from "../utils/academicProfileSlots";
import {
  APP_USAGE_LIMIT_OPTIONS,
  APP_USAGE_UPDATED_EVENT,
  buildAppUsageSummary,
  getAppUsageStorageKey,
  readAppUsageRecord,
  resolveAppUsageIdentity,
  saveAppUsageLimit,
} from "../utils/appUsage";
import { getPlannerMetrics } from "../utils/plannerMetrics";
import { getScheduleDateKey, toLocalDateKey } from "../utils/scheduleDates";
import AcademicProfileCreateDialog from "../components/AcademicProfileCreateDialog";
import "./SettingsProfilePage.css";

function displayValue(value, fallback = "Not set") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function formatDate(value, fallback = "Not recorded") {
  const normalizedValue = typeof value === "string" ? value.trim() : value;
  if (normalizedValue === null || normalizedValue === undefined || normalizedValue === "") {
    return fallback;
  }

  const isDateKey = typeof normalizedValue === "string"
    && /^\d{4}-\d{2}-\d{2}$/.test(normalizedValue);
  const localDateKey = isDateKey ? toLocalDateKey(normalizedValue) : "";
  if (isDateKey && !localDateKey) return fallback;

  const date = localDateKey
    ? new Date(`${localDateKey}T12:00:00`)
    : normalizedValue instanceof Date ? normalizedValue : new Date(normalizedValue);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDuration(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  if (safeSeconds < 60) return safeSeconds > 0 ? "<1m" : "0m";
  const totalMinutes = Math.floor(safeSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes}m`;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function formatAxisMinutes(value) {
  const minutes = Number(value) || 0;
  if (minutes >= 60) {
    const hours = minutes / 60;
    return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
  }
  return `${Math.round(minutes)}m`;
}

function UsageTooltip({ active, payload }) {
  const day = payload?.find((item) => item?.dataKey === "minutes")?.payload;
  if (!active || !day) return null;
  return (
    <div className="settings-profile-chart-tooltip">
      <span>{day.fullLabel}</span>
      <strong>{formatDuration(day.seconds)} active</strong>
    </div>
  );
}

function DetailList({ rows }) {
  return (
    <dl className="settings-profile-detail-list">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function usageComparison(todaySeconds, averageSeconds) {
  if (!todaySeconds && !averageSeconds) return "Insights start building as you use PrepMatrix.";
  if (!averageSeconds) return "Today is your first recorded active day.";
  const difference = todaySeconds - averageSeconds;
  if (Math.abs(difference) < 60) return "Today is close to your selected-range average.";
  return difference > 0
    ? `${formatDuration(difference)} above your daily average today.`
    : `${formatDuration(Math.abs(difference))} below your daily average today.`;
}

function UsageDetailDialog({
  children,
  describedBy,
  dialogId,
  labelledBy,
  onClose,
  open,
  returnFocusRef,
}) {
  const [rendered, setRendered] = useState(open);
  const [entered, setEntered] = useState(false);
  const dialogRef = useRef(null);
  const closeTimerRef = useRef(null);
  const animationFrameRef = useRef(null);
  const focusReturnRef = useRef(null);
  const bodyOverflowRef = useRef("");
  const bodyLockedRef = useRef(false);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;

    const restorePage = () => {
      if (bodyLockedRef.current) {
        document.body.style.overflow = bodyOverflowRef.current;
        bodyLockedRef.current = false;
      }
      const focusTarget = focusReturnRef.current;
      if (typeof focusTarget?.focus === "function") focusTarget.focus();
    };

    if (open) {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
      focusReturnRef.current = returnFocusRef?.current || focusReturnRef.current || document.activeElement;
      if (!bodyLockedRef.current) {
        bodyOverflowRef.current = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        bodyLockedRef.current = true;
      }
      setRendered(true);
      animationFrameRef.current = window.requestAnimationFrame(() => {
        setEntered(true);
        dialogRef.current?.focus();
      });
      return () => window.cancelAnimationFrame(animationFrameRef.current);
    }

    setEntered(false);
    if (rendered) {
      closeTimerRef.current = window.setTimeout(() => {
        setRendered(false);
        restorePage();
      }, 220);
    }
    return () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    };
  }, [open, rendered, returnFocusRef]);

  useEffect(() => {
    if (!open || !rendered || typeof document === "undefined") return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = [...dialogRef.current.querySelectorAll(
        'a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )].filter((element) => !element.hasAttribute("hidden"));
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open, rendered]);

  useEffect(() => () => {
    if (typeof document === "undefined") return;
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    if (animationFrameRef.current) window.cancelAnimationFrame(animationFrameRef.current);
    if (bodyLockedRef.current) document.body.style.overflow = bodyOverflowRef.current;
  }, []);

  if (!rendered || typeof document === "undefined") return null;

  return createPortal(
    <div
      aria-hidden={!open || undefined}
      className={"settings-profile-dialog-layer" + (entered && open ? " is-visible" : "")}
      inert={!open}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-describedby={describedBy}
        aria-labelledby={labelledBy}
        aria-modal="true"
        className="settings-profile-dialog"
        id={dialogId}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <button
          aria-label="Close dialog"
          className="settings-profile-dialog-close"
          onClick={onClose}
          type="button"
        >
          <X aria-hidden="true" size={18} />
        </button>
        {children}
      </section>
    </div>,
    document.body,
  );
}
export default function SettingsProfilePage({
  academicLevel,
  academicTrack,
  completed = [],
  kidsParentAccess = null,
  onCreateAcademicProfile,
  onVisitAcademicProfile,
  schedule = [],
  scheduleStartDate,
  subjects = [],
  userProfile = {},
  workspaceTransitioning = false,
  youngKidsMode = false,
}) {
  const navigate = useNavigate();
  const usageIdentity = useMemo(() => resolveAppUsageIdentity(userProfile), [userProfile]);
  const [usageRecord, setUsageRecord] = useState(() => readAppUsageRecord(usageIdentity));
  const [rangeDays, setRangeDays] = useState(7);
  const [activeUsageDialog, setActiveUsageDialog] = useState({ kind: null, open: false });
  const [draftLimit, setDraftLimit] = useState(() => usageRecord.dailyLimitMinutes ?? "");
  const [createProfileDialogOpen, setCreateProfileDialogOpen] = useState(false);
  const [switchingProfile, setSwitchingProfile] = useState(false);
  const createProfileTriggerRef = useRef(null);
  const limitTriggerRef = useRef(null);
  const insightsTriggerRef = useRef(null);

  const academicProfile = useMemo(() => normalizeAcademicProfile({
    ...userProfile,
    academicLevel: academicLevel || userProfile?.academicLevel,
    academicTrack: academicTrack || userProfile?.academicTrack,
  }), [academicLevel, academicTrack, userProfile]);
  const profileSlots = useMemo(() => getAcademicProfileSlots(userProfile), [userProfile]);
  const plannerMetrics = useMemo(
    () => getPlannerMetrics(schedule, completed),
    [completed, schedule],
  );
  const usageSummary = useMemo(
    () => buildAppUsageSummary(usageRecord, { dayCount: rangeDays }),
    [rangeDays, usageRecord],
  );

  useEffect(() => {
    const refresh = () => setUsageRecord(readAppUsageRecord(usageIdentity));
    const handleUsageUpdate = (event) => {
      if (!event?.detail?.identity || event.detail.identity === usageIdentity) refresh();
    };
    const handleStorage = (event) => {
      if (event.key === getAppUsageStorageKey(usageIdentity)) refresh();
    };

    refresh();
    setDraftLimit(readAppUsageRecord(usageIdentity).dailyLimitMinutes ?? "");
    if (typeof window === "undefined") return undefined;
    const timer = window.setInterval(refresh, 15_000);
    window.addEventListener(APP_USAGE_UPDATED_EVENT, handleUsageUpdate);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(APP_USAGE_UPDATED_EVENT, handleUsageUpdate);
      window.removeEventListener("storage", handleStorage);
    };
  }, [usageIdentity]);

  const completedSet = new Set(Array.isArray(completed) ? completed : []);
  const todayDateKey = toLocalDateKey(new Date());
  const todaySchedule = schedule.find((day, index) => (
    getScheduleDateKey(day, index, scheduleStartDate) === todayDateKey
  ));
  const todayTasks = Array.isArray(todaySchedule?.tasks) ? todaySchedule.tasks : [];
  const todayCompleted = todayTasks.filter((task) => (
    completedSet.has(task?.task)
  )).length;
  const planStartDate = plannerMetrics.hasScheduledPlanner
    ? getScheduleDateKey(schedule[0], 0, scheduleStartDate)
    : null;
  const subjectCount = Array.isArray(subjects) ? subjects.length : 0;
  const activeProfileLabel = getAcademicProfileDisplayName(profileSlots.activeProfile);
  const otherProfile = profileSlots.inactiveProfile;
  const schoolProfile = isSchoolAcademicLevel(academicProfile.academicLevel);
  const avatarInitial = displayValue(userProfile?.username || userProfile?.email, "P")
    .charAt(0)
    .toUpperCase();
  const limitLabel = usageSummary.dailyLimitSeconds
    ? `${usageSummary.limitUsedPercent}% of ${formatDuration(usageSummary.dailyLimitSeconds)}`
    : "No daily limit set";
  const chartSummary = usageSummary.hasRecordedUsage
    ? `${formatDuration(usageSummary.totalSeconds)} total with a ${formatDuration(usageSummary.averageSeconds)} daily average over ${rangeDays} days.`
    : `No active time has been recorded in the last ${rangeDays} days.`;

  const handleSaveLimit = (event) => {
    event.preventDefault();
    const minutes = draftLimit === "" ? null : Number(draftLimit);
    const next = saveAppUsageLimit(usageIdentity, minutes);
    setUsageRecord(next);
    setDraftLimit(next.dailyLimitMinutes ?? "");
    toast.success(next.dailyLimitMinutes
      ? `Daily usage reminder set to ${formatDuration(next.dailyLimitMinutes * 60)}.`
      : "Daily usage reminder removed.");
  };

  const handleChangeProfile = async (event) => {
    if (youngKidsMode && !kidsParentAccess?.unlocked) {
      toast.error("Open Parent Corner before changing academic profiles.");
      return;
    }
    if (!profileSlots.hasTwoProfiles || !otherProfile?.id) {
      if (!onCreateAcademicProfile) {
        toast.error("Profile creation is unavailable right now.");
        return;
      }
      createProfileTriggerRef.current = event?.currentTarget || null;
      setCreateProfileDialogOpen(true);
      return;
    }
    if (!onVisitAcademicProfile) {
      toast.error("Profile switching is unavailable right now.");
      return;
    }

    setSwitchingProfile(true);
    try {
      await onVisitAcademicProfile(otherProfile);
      toast.success(`Now viewing ${getAcademicProfileDisplayName(otherProfile)}.`);
    } catch (error) {
      toast.error(error?.message || "Could not change the academic profile.");
    } finally {
      setSwitchingProfile(false);
    }
  };

  const accountRows = [
    ["Full name", displayValue(userProfile?.username)],
    ["Email address", displayValue(userProfile?.email)],
    ["Age", userProfile?.age ? String(userProfile.age) : "Not set"],
    ["Account created", formatDate(userProfile?.createdAt)],
    ["Account status", "Signed in"],
  ];
  const academicRows = [
    ["Active profile", activeProfileLabel],
    ["Academic profiles", `${profileSlots.profiles.length} of 2 configured`],
    ["Academic stage", displayValue(academicProfile.academicLevel)],
    [schoolProfile ? "Board / curriculum" : "Field / stream", displayValue(academicProfile.academicTrack)],
    [schoolProfile ? "Grade / class" : "Degree / major", displayValue(schoolProfile ? academicProfile.grade : academicProfile.degree)],
    ...(schoolProfile ? [] : [["Specialization", displayValue(academicProfile.department)]]),
    ["Institution", displayValue(academicProfile.institutionName || userProfile?.institutionName)],
  ];
  const studyRows = [
    ["Subjects", `${subjectCount} ${subjectCount === 1 ? "subject" : "subjects"}`],
    ["Plan progress", plannerMetrics.totalTasks
      ? `${plannerMetrics.completedTasks}/${plannerMetrics.totalTasks} tasks · ${plannerMetrics.completionRate}%`
      : "No study plan generated"],
    ["Today", todayTasks.length
      ? `${todayCompleted}/${todayTasks.length} planned tasks complete`
      : "No tasks scheduled"],
    ["Plan start", formatDate(planStartDate, "Not scheduled")],
  ];

  return (
    <section className="settings-profile-page page-stack">
      <header className="settings-profile-page-header">
        <button
          aria-label="Back to Settings"
          className="settings-profile-back page-back-control"
          onClick={() => navigate("/settings")}
          title="Back to Settings"
          type="button"
        >
          <ArrowLeft aria-hidden="true" size={19} />
        </button>
        <div>
          <span className="settings-profile-eyebrow">Settings / User information</span>
          <h1>User information</h1>
          <p>Your account, academic profile, study progress, and private app-activity insights.</p>
        </div>
        <span className="settings-profile-local-badge">
          <ShieldCheck aria-hidden="true" size={15} /> Synced account
        </span>
      </header>

      <section className="settings-profile-hero settings-profile-surface">
        <div className="settings-profile-identity">
          <div className={`settings-profile-avatar${userProfile?.profileImage ? " has-image" : ""}`}>
            {userProfile?.profileImage
              ? <img alt="" src={userProfile.profileImage} />
              : <span aria-hidden="true">{avatarInitial}</span>}
          </div>
          <div>
            <span className="settings-profile-status"><i /> Active account</span>
            <h2>{displayValue(userProfile?.username, "PrepMatrix learner")}</h2>
            <p><Mail aria-hidden="true" size={14} /> {displayValue(userProfile?.email)}</p>
            <div className="settings-profile-chips">
              <span><UserRound aria-hidden="true" size={13} /> {activeProfileLabel}</span>
              <span><GraduationCap aria-hidden="true" size={13} /> {displayValue(academicProfile.academicLevel)}</span>
            </div>
          </div>
        </div>
        <div className="settings-profile-actions" aria-label="User information actions">
          <button
            aria-controls="settings-profile-usage-dialog"
            aria-expanded={activeUsageDialog.open && activeUsageDialog.kind === "limit"}
            aria-haspopup="dialog"
            className="settings-profile-action is-secondary"
            onClick={() => setActiveUsageDialog({ kind: "limit", open: true })}
            ref={limitTriggerRef}
            type="button"
          >
            <Gauge aria-hidden="true" size={17} /> Active limit
          </button>
          <button
            aria-controls="settings-profile-usage-dialog"
            aria-expanded={activeUsageDialog.open && activeUsageDialog.kind === "insights"}
            aria-haspopup="dialog"
            className="settings-profile-action is-secondary"
            onClick={() => setActiveUsageDialog({ kind: "insights", open: true })}
            ref={insightsTriggerRef}
            type="button"
          >
            <Activity aria-hidden="true" size={17} /> Active insights
          </button>
          <button
            aria-controls={!profileSlots.hasTwoProfiles ? "academic-profile-create-dialog" : undefined}
            aria-expanded={!profileSlots.hasTwoProfiles ? createProfileDialogOpen : undefined}
            aria-haspopup={!profileSlots.hasTwoProfiles ? "dialog" : undefined}
            className="settings-profile-action is-profile-switch"
            disabled={switchingProfile || workspaceTransitioning || Boolean(otherProfile?.deletionPending)}
            onClick={handleChangeProfile}
            type="button"
          >
            {profileSlots.hasTwoProfiles
              ? <Repeat2 aria-hidden="true" size={17} />
              : <UserRoundPlus aria-hidden="true" size={17} />}
            {profileSlots.hasTwoProfiles
              ? switchingProfile || workspaceTransitioning ? "Changing..." : "Change profile"
              : "Create Profile B"}
          </button>
        </div>
      </section>

      <section aria-label="Usage overview" className="settings-profile-metrics">
        <article className="settings-profile-metric settings-profile-surface">
          <span><Clock3 aria-hidden="true" size={17} /> Today active</span>
          <strong>{formatDuration(usageSummary.today.seconds)}</strong>
          <small>Across your signed-in devices</small>
        </article>
        <article className="settings-profile-metric settings-profile-surface">
          <span><BarChart3 aria-hidden="true" size={17} /> Daily average</span>
          <strong>{formatDuration(usageSummary.averageSeconds)}</strong>
          <small>Across the selected {rangeDays} days</small>
        </article>
        <article className="settings-profile-metric settings-profile-surface">
          <span><CalendarDays aria-hidden="true" size={17} /> Range total</span>
          <strong>{formatDuration(usageSummary.totalSeconds)}</strong>
          <small>{usageSummary.activeDays} active {usageSummary.activeDays === 1 ? "day" : "days"}</small>
        </article>
        <article className="settings-profile-metric settings-profile-surface">
          <span><Target aria-hidden="true" size={17} /> Usage limit</span>
          <strong>{usageSummary.dailyLimitSeconds ? `${usageSummary.limitUsedPercent}%` : "Off"}</strong>
          <small>{limitLabel}</small>
        </article>
      </section>

      <div className="settings-profile-usage-grid">
        <figure className="settings-profile-chart-card settings-profile-surface">
          <figcaption>
            <div>
              <span className="settings-profile-section-label">Active time</span>
              <h2>Daily app usage</h2>
              <p>{chartSummary}</p>
            </div>
            <div className="settings-profile-range" aria-label="Usage chart range">
              {[7, 30].map((days) => (
                <button
                  aria-pressed={rangeDays === days}
                  key={days}
                  onClick={() => setRangeDays(days)}
                  type="button"
                >
                  {days} days
                </button>
              ))}
            </div>
          </figcaption>
          <div
            aria-label={`Daily active-time chart. ${chartSummary}`}
            className="settings-profile-chart"
            role="img"
          >
            <ResponsiveContainer
              height="100%"
              initialDimension={{ height: 300, width: 800 }}
              minWidth={0}
              width="100%"
            >
              <ComposedChart data={usageSummary.daily} margin={{ top: 18, right: 10, left: -12, bottom: 4 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="4 7" vertical={false} />
                <XAxis
                  axisLine={false}
                  dataKey="label"
                  interval={rangeDays === 7 ? 0 : 4}
                  tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                  tickLine={false}
                  tickMargin={10}
                />
                <YAxis
                  axisLine={false}
                  tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                  tickFormatter={formatAxisMinutes}
                  tickLine={false}
                  width={48}
                />
                <Tooltip content={<UsageTooltip />} cursor={{ fill: "rgba(var(--accent-rgb), 0.08)" }} />
                {usageSummary.dailyLimitMinutes ? (
                  <ReferenceLine
                    stroke="var(--profile-limit-line)"
                    strokeDasharray="5 5"
                    y={usageSummary.dailyLimitMinutes}
                  />
                ) : null}
                <Bar dataKey="minutes" fill="var(--accent)" maxBarSize={46} radius={[9, 9, 3, 3]} />
                <Line
                  dataKey="averageMinutes"
                  dot={false}
                  stroke="var(--profile-average-line)"
                  strokeDasharray="7 5"
                  strokeWidth={2.5}
                  type="monotone"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="settings-profile-chart-legend" aria-label="Chart legend">
            <span><i className="is-active" /> Active time</span>
            <span><i className="is-average" /> Daily average</span>
            {usageSummary.dailyLimitMinutes ? <span><i className="is-limit" /> Daily limit</span> : null}
          </div>
          <ul className="settings-profile-day-strip" aria-label="Recent daily usage values">
            {usageSummary.daily.slice(-7).map((day) => (
              <li key={day.dayKey}><span>{day.label}</span><strong>{formatDuration(day.seconds)}</strong></li>
            ))}
          </ul>
        </figure>

        <aside className="settings-profile-limit-card settings-profile-surface">
          <div>
            <span className="settings-profile-section-label">Today</span>
            <h2>Limit progress</h2>
            <p>See how today compares with your personal reminder.</p>
          </div>
          <div
            aria-label={usageSummary.dailyLimitSeconds
              ? `${usageSummary.limitUsedPercent}% of today's usage limit used`
              : "No daily usage limit is set"}
            className={`settings-profile-usage-ring${usageSummary.dailyLimitSeconds ? " has-limit" : ""}`}
            role="img"
            style={{ "--usage-ring-progress": `${usageSummary.limitProgressPercent * 3.6}deg` }}
          >
            <div>
              <strong>{formatDuration(usageSummary.today.seconds)}</strong>
              <span>{usageSummary.dailyLimitSeconds
                ? `of ${formatDuration(usageSummary.dailyLimitSeconds)}`
                : "today"}</span>
            </div>
          </div>
          <div className="settings-profile-limit-copy">
            <strong>{usageSummary.dailyLimitSeconds
              ? usageSummary.limitUsedPercent >= 100 ? "Daily reminder reached" : `${100 - usageSummary.limitUsedPercent}% remaining`
              : "No limit is active"}</strong>
            <span>{usageSummary.dailyLimitSeconds
              ? "You stay in control; the reminder does not lock the app."
              : "Open Active limit to set a personal reminder."}</span>
          </div>
        </aside>
      </div>

      <UsageDetailDialog
        describedBy={activeUsageDialog.kind === "limit"
          ? "usage-limit-description"
          : "active-insights-description"}
        dialogId="settings-profile-usage-dialog"
        labelledBy={activeUsageDialog.kind === "limit"
          ? "usage-limit-heading"
          : "active-insights-heading"}
        onClose={() => setActiveUsageDialog((current) => ({ ...current, open: false }))}
        open={activeUsageDialog.open}
        returnFocusRef={activeUsageDialog.kind === "limit" ? limitTriggerRef : insightsTriggerRef}
      >
        {activeUsageDialog.kind === "limit" ? (
          <>
        <header className="settings-profile-dialog-heading">
          <div className="settings-profile-expandable-icon"><Gauge aria-hidden="true" size={21} /></div>
          <div>
            <span className="settings-profile-section-label">Usage controls</span>
            <h2 id="usage-limit-heading">Active time</h2>
            <p id="usage-limit-description">
              Review today’s active time and set an optional reminder without blocking study sessions or exams.
            </p>
          </div>
        </header>
        <div className="settings-profile-dialog-stat-grid is-limit-summary">
          <article>
            <span>Today active</span>
            <strong>{formatDuration(usageSummary.today.seconds)}</strong>
            <small>Synced visible and focused time</small>
          </article>
          <article>
            <span>Current reminder</span>
            <strong>{usageSummary.dailyLimitSeconds
              ? formatDuration(usageSummary.dailyLimitSeconds)
              : "Not set"}</strong>
            <small>{limitLabel}</small>
          </article>
          <article>
            <span>Limit used</span>
            <strong>{usageSummary.dailyLimitSeconds
              ? `${usageSummary.limitUsedPercent}%`
              : "Off"}</strong>
            <small>{usageSummary.dailyLimitSeconds
              ? `${Math.max(0, 100 - usageSummary.limitUsedPercent)}% remaining today`
              : "Choose a reminder below"}</small>
          </article>
        </div>
        <form className="settings-profile-limit-form" onSubmit={handleSaveLimit}>
          <label htmlFor="settings-profile-daily-limit">Daily reminder</label>
          <select
            id="settings-profile-daily-limit"
            onChange={(event) => setDraftLimit(event.target.value)}
            value={draftLimit}
          >
            {APP_USAGE_LIMIT_OPTIONS.map((option) => (
              <option key={option.label} value={option.value ?? ""}>{option.label}</option>
            ))}
          </select>
          <button className="settings-profile-action is-dialog-confirm" type="submit">
            <Save aria-hidden="true" size={16} /> Save limit
          </button>
        </form>
        <p className="settings-profile-dialog-note">
          This reminder setting stays on this device and compares against your synced account activity. Reaching it never locks PrepMatrix.
        </p>
          </>
        ) : activeUsageDialog.kind === "insights" ? (
          <>

        <header className="settings-profile-dialog-heading">
          <div className="settings-profile-expandable-icon"><Sparkles aria-hidden="true" size={21} /></div>
          <div>
            <span className="settings-profile-section-label">Pattern review</span>
            <h2 id="active-insights-heading">Active insights</h2>
            <p id="active-insights-description">
              Understand your selected {rangeDays}-day activity range in plain language—not as a productivity score.
            </p>
          </div>
        </header>
        <p className="settings-profile-dialog-summary">{chartSummary}</p>
        <div className="settings-profile-insight-grid">
          <article>
            <strong>{usageSummary.mostActiveDay?.label || "—"}</strong>
            <span>Most active day</span>
            <small>{usageSummary.mostActiveDay
              ? formatDuration(usageSummary.mostActiveDay.seconds)
              : "No activity recorded yet"}</small>
          </article>
          <article>
            <strong>{usageSummary.activeDays}/{rangeDays}</strong>
            <span>Active-day consistency</span>
            <small>Days with visible, focused use</small>
          </article>
          <article>
            <strong>{formatDuration(usageSummary.averageSeconds)}</strong>
            <span>Average active time</span>
            <small>{usageComparison(usageSummary.today.seconds, usageSummary.averageSeconds)}</small>
          </article>
          <article>
            <strong>{plannerMetrics.completionRate}%</strong>
            <span>Study-plan completion</span>
            <small>{plannerMetrics.totalTasks
              ? `${plannerMetrics.remainingTasks} tasks remaining`
              : "Generate a plan to start tracking"}</small>
          </article>
        </div>
        <p className="settings-profile-dialog-note">
          Active time combines the moments when PrepMatrix is visible and focused across your signed-in devices.
        </p>
          </>
        ) : null}
      </UsageDetailDialog>

      <section className="settings-profile-details-grid" aria-label="Detailed user information">
        <article className="settings-profile-detail-card settings-profile-surface">
          <header><UserRound aria-hidden="true" size={19} /><div><span>Account</span><h2>Personal details</h2></div></header>
          <DetailList rows={accountRows} />
          <button className="settings-profile-inline-action" onClick={() => navigate("/settings")} type="button">
            <Pencil aria-hidden="true" size={15} /> Edit in Settings
          </button>
        </article>
        <article className="settings-profile-detail-card settings-profile-surface">
          <header><GraduationCap aria-hidden="true" size={19} /><div><span>Academic</span><h2>Profile information</h2></div></header>
          <DetailList rows={academicRows} />
        </article>
        <article className="settings-profile-detail-card settings-profile-surface">
          <header><BookOpenCheck aria-hidden="true" size={19} /><div><span>Learning</span><h2>Study snapshot</h2></div></header>
          <DetailList rows={studyRows} />
        </article>
      </section>

      <footer className="settings-profile-privacy-note settings-profile-surface">
        <Info aria-hidden="true" size={18} />
        <div>
          <strong>How active time is measured</strong>
          <span>Each signed-in device records time only while PrepMatrix is visible and focused, then syncs it to your account. PrepMatrix does not monitor other apps, websites, or idle background time.</span>
        </div>
        <CheckCircle2 aria-hidden="true" className="settings-profile-privacy-check" size={20} />
      </footer>

      <AcademicProfileCreateDialog
        activeProfile={profileSlots.activeProfile || academicProfile}
        institutionName={academicProfile.institutionName || userProfile?.institutionName}
        onClose={() => setCreateProfileDialogOpen(false)}
        onCreateAcademicProfile={onCreateAcademicProfile}
        open={createProfileDialogOpen}
        returnFocusRef={createProfileTriggerRef}
      />
    </section>
  );
}
