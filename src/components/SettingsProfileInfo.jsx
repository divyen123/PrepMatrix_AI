import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";
import { isSchoolAcademicLevel } from "../utils/academicProfile";
import { getPlannerMetrics } from "../utils/plannerMetrics";

function displayValue(value, fallback = "Not set") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function formatAccountCreatedAt(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatAppSessionDuration(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const totalMinutes = Math.floor(safeSeconds / 60);
  if (totalMinutes === 0) return "Just started";

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes}m`;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function getAppSessionSeconds() {
  if (typeof window === "undefined") return 0;
  return Math.floor((window.performance?.now?.() || 0) / 1000);
}

export default function SettingsProfileInfo({
  academicProfile = {},
  activeProfileLabel = "Profile A",
  completed = [],
  schedule = [],
  subjects = [],
  userProfile = {},
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [appSessionSeconds, setAppSessionSeconds] = useState(0);
  const [panelPosition, setPanelPosition] = useState({ left: 16, top: 16 });
  const containerRef = useRef(null);
  const panelRef = useRef(null);
  const triggerRef = useRef(null);
  const panelId = useId();
  const metrics = getPlannerMetrics(schedule, completed);
  const isSchoolProfile = isSchoolAcademicLevel(academicProfile.academicLevel);
  const subjectCount = Array.isArray(subjects) ? subjects.length : 0;
  const completedSet = new Set(Array.isArray(completed) ? completed : []);
  const todayCompleted = metrics.todayTasks.filter((task) => completedSet.has(task?.task)).length;
  const studyStatus = metrics.hasScheduledPlanner
    ? `${subjectCount} ${subjectCount === 1 ? "subject" : "subjects"} · Study plan active`
    : subjectCount
      ? `${subjectCount} ${subjectCount === 1 ? "subject" : "subjects"} · Plan not generated`
      : "Add a subject to begin";
  const performance = metrics.hasScheduledPlanner
    ? `${metrics.completedTasks}/${metrics.totalTasks} tasks · ${metrics.completionRate}% complete`
    : "No plan performance yet";
  const todayStatus = metrics.todayTasks.length
    ? `${todayCompleted}/${metrics.todayTasks.length} planned tasks complete`
    : "No tasks scheduled today";
  const academicRows = [
    ["Account created", formatAccountCreatedAt(userProfile?.createdAt)],
    ["Active profile", displayValue(activeProfileLabel, "Default profile")],
    ["Academic stage", displayValue(academicProfile.academicLevel)],
    [isSchoolProfile ? "Board / curriculum" : "Field / stream", displayValue(academicProfile.academicTrack)],
    [isSchoolProfile ? "Grade / class" : "Degree / major", displayValue(isSchoolProfile ? academicProfile.grade : academicProfile.degree)],
    ...(isSchoolProfile ? [] : [["Specialization", displayValue(academicProfile.department)]]),
    ["Institution", displayValue(academicProfile.institutionName || userProfile?.institutionName)],
  ];

  const updatePanelPosition = useCallback(() => {
    if (typeof window === "undefined" || !triggerRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const gutter = 16;
    const panelWidth = Math.min(
      panelRef.current?.offsetWidth || 370,
      Math.max(0, window.innerWidth - gutter * 2),
    );
    const panelHeight = Math.min(
      panelRef.current?.offsetHeight || 480,
      Math.max(0, window.innerHeight - gutter * 2),
    );
    const preferredTop = triggerRect.bottom + 10;
    const top = preferredTop + panelHeight <= window.innerHeight - gutter
      ? preferredTop
      : Math.max(gutter, triggerRect.top - panelHeight - 10);
    const left = Math.min(
      Math.max(gutter, triggerRect.left),
      Math.max(gutter, window.innerWidth - panelWidth - gutter),
    );

    setPanelPosition({ left, top });
  }, [setPanelPosition]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const updateSessionDuration = () => setAppSessionSeconds(getAppSessionSeconds());
    updateSessionDuration();
    const timer = window.setInterval(updateSessionDuration, 30_000);
    return () => window.clearInterval(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;

    updatePanelPosition();
    window.addEventListener("resize", updatePanelPosition);
    window.addEventListener("scroll", updatePanelPosition, true);
    return () => {
      window.removeEventListener("resize", updatePanelPosition);
      window.removeEventListener("scroll", updatePanelPosition, true);
    };
  }, [isOpen, updatePanelPosition]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handlePointerDown = (event) => {
      if (
        !containerRef.current?.contains(event.target)
        && !panelRef.current?.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      setIsOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleToggle = () => {
    if (isOpen) {
      setIsOpen(false);
      return;
    }

    updatePanelPosition();
    setIsOpen(true);
  };

  const panel = (
    <section
      aria-hidden={!isOpen}
      aria-label="Profile and study information"
      className={["settings-profile-info-panel", isOpen && "is-open"].filter(Boolean).join(" ")}
      id={panelId}
      ref={panelRef}
      role="dialog"
      style={{
        "--settings-profile-info-panel-left": String(panelPosition.left) + "px",
        "--settings-profile-info-panel-top": String(panelPosition.top) + "px",
      }}
    >
      <header className="settings-profile-info-panel-header">
        <strong>User information</strong>
        <span>Account, academic profile, and current study snapshot.</span>
      </header>

      <section className="settings-profile-info-section" aria-label="Academic profile details">
        <span className="settings-profile-info-section-label">Academic profile</span>
        <dl className="settings-profile-info-list">
          {academicRows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="settings-profile-info-section" aria-label="Study activity details">
        <span className="settings-profile-info-section-label">Study activity</span>
        <dl className="settings-profile-info-list">
          <div><dt>Study status</dt><dd>{studyStatus}</dd></div>
          <div><dt>Plan performance</dt><dd>{performance}</dd></div>
          <div><dt>Today</dt><dd>{todayStatus}</dd></div>
          <div><dt>This app session</dt><dd>{formatAppSessionDuration(appSessionSeconds)}</dd></div>
        </dl>
      </section>
    </section>
  );

  return (
    <div className="settings-profile-info" ref={containerRef}>
      <button
        aria-controls={panelId}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label="Show profile and study information"
        className="settings-profile-info-trigger"
        onClick={handleToggle}
        ref={triggerRef}
        title="Profile and study information"
        type="button"
      >
        <Info aria-hidden="true" size={15} strokeWidth={2.25} />
      </button>

      {typeof document === "undefined" ? panel : createPortal(panel, document.body)}
    </div>
  );
}
