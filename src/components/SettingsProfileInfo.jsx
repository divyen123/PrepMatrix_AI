import { useEffect, useId, useRef, useState } from "react";
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
  const containerRef = useRef(null);
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

  useEffect(() => {
    if (!isOpen) return undefined;

    const updateSessionDuration = () => setAppSessionSeconds(getAppSessionSeconds());
    updateSessionDuration();
    const timer = window.setInterval(updateSessionDuration, 30_000);
    return () => window.clearInterval(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) {
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

  return (
    <div className="settings-profile-info" ref={containerRef}>
      <button
        aria-controls={panelId}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label="Show profile and study information"
        className="settings-profile-info-trigger"
        onClick={() => setIsOpen((current) => !current)}
        ref={triggerRef}
        title="Profile and study information"
        type="button"
      >
        <Info aria-hidden="true" size={15} strokeWidth={2.25} />
      </button>

      <section
        aria-hidden={!isOpen}
        aria-label="Profile and study information"
        className={`settings-profile-info-panel${isOpen ? " is-open" : ""}`}
        id={panelId}
        role="dialog"
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
    </div>
  );
}
