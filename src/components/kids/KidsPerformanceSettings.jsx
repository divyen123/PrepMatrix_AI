import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Clock3,
  Gamepad2,
  Languages,
  LockKeyhole,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Timer,
  Volume2,
} from "lucide-react";
import api from "../../utils/apiClient";
import { normalizeAcademicProfile } from "../../utils/academicProfile";
import "./KidsPerformanceSettings.css";

const PLAY_LIMIT_OPTIONS = Object.freeze([10, 15, 20, 30, 45, 60]);

function normalizeSettings(value = {}) {
  const requestedLimit = Number(value.dailyPlayLimitMinutes ?? value.timeLimitMinutes);
  return {
    dailyPlayLimitMinutes: PLAY_LIMIT_OPTIONS.includes(requestedLimit) ? requestedLimit : 20,
    audioEnabled: value.audioEnabled === undefined ? true : Boolean(value.audioEnabled),
    timerVisible: value.timerVisible === undefined ? true : Boolean(value.timerVisible),
    language: value.language === "hi" ? "hi" : "en",
  };
}

function percent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : 0;
}

function progressOverview(progress = {}) {
  const subjectSummaries = Object.values(progress.bySubject || {}).filter(Boolean);
  const correctItems = subjectSummaries.reduce((sum, entry) => sum + (Number(entry.correctItems) || 0), 0);
  const totalItems = subjectSummaries.reduce((sum, entry) => sum + (Number(entry.totalItems) || 0), 0);
  const masteryValues = Object.values(progress.mastery || {})
    .map((entry) => Number(entry?.percentage))
    .filter(Number.isFinite);
  const mastery = totalItems
    ? percent((correctItems / totalItems) * 100)
    : percent(masteryValues.length
      ? masteryValues.reduce((sum, value) => sum + value, 0) / masteryValues.length
      : 0);

  return {
    mastery,
    gamesPlayed: Math.max(0, Number(progress.totalAttempts) || progress.attempts?.length || 0),
    retryCount: Array.isArray(progress.retryQueue) ? progress.retryQueue.length : 0,
    streakDays: Math.max(0, Number(progress.streakDays ?? progress.streak) || 0),
    minutesToday: Math.max(0, Number(progress.playTime?.minutesToday) || 0),
  };
}

export function KidsExperienceSwitch({ checked, icon: Icon, label, onChange }) {
  return (
    <label className="kids-performance-toggle-row">
      <span className="kids-performance-toggle-copy">
        {Icon ? <Icon aria-hidden="true" size={18} /> : null}
        <span>{label}</span>
      </span>
      <span className="kids-performance-switch-control">
        <input
          aria-label={label}
          checked={checked}
          onChange={(event) => onChange?.(event.target.checked)}
          role="switch"
          type="checkbox"
        />
        <span aria-hidden="true" className="kids-performance-switch-track" />
        <span aria-hidden="true" className="kids-performance-switch-status">
          {checked ? "On" : "Off"}
        </span>
      </span>
    </label>
  );
}

export default function KidsPerformanceSettings({
  userProfile = {},
  onParentAccessChange,
  onLocked,
}) {
  const [settings, setSettings] = useState(() => normalizeSettings());
  const [progress, setProgress] = useState({});
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [locking, setLocking] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const registeredClass = useMemo(() => {
    const profile = normalizeAcademicProfile(userProfile);
    return profile.grade
      || String(userProfile.grade || userProfile.classStandard || userProfile.className || "Registered class");
  }, [userProfile]);
  const overview = useMemo(() => progressOverview(progress), [progress]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setSuccess("");
    const [settingsResult, profileResult] = await Promise.allSettled([
      api.get("/api/kids/parent-settings"),
      api.get("/api/kids/profile"),
    ]);

    if (settingsResult.status === "rejected") {
      setError(settingsResult.reason?.message || "Parent settings could not be loaded.");
      setLoaded(false);
      setLoading(false);
      return;
    }

    const payload = settingsResult.value || {};
    setSettings(normalizeSettings(payload.settings));
    setProgress(payload.progress || {});
    onParentAccessChange?.(payload.parentAccess);
    if (profileResult.status === "fulfilled") {
      setProgress(profileResult.value?.progress || {});
      if (profileResult.value?.parentAccess) onParentAccessChange?.(profileResult.value.parentAccess);
    }
    setLoaded(true);
    setLoading(false);
  }, [onParentAccessChange]);

  useEffect(() => {
    let active = true;
    const loadWhenActive = async () => {
      if (!active) return;
      await load();
    };
    loadWhenActive();
    return () => {
      active = false;
    };
  }, [load]);

  const update = (key, value) => {
    setSettings((current) => ({ ...current, [key]: value }));
    setSuccess("");
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const requestBody = {
        dailyPlayLimitMinutes: settings.dailyPlayLimitMinutes,
        audioEnabled: settings.audioEnabled,
        timerVisible: settings.timerVisible,
        language: settings.language,
      };
      const payload = await api.put("/api/kids/parent-settings", requestBody);
      setSettings(normalizeSettings(payload?.settings || requestBody));
      if (payload?.parentAccess) onParentAccessChange?.(payload.parentAccess);
      setSuccess("Kids learning settings saved.");
    } catch (saveError) {
      setError(saveError?.message || "Kids learning settings could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const lockParentAccess = async () => {
    setLocking(true);
    setError("");
    setSuccess("");
    try {
      const payload = await api.post("/api/kids/parent-access/lock", {});
      const parentAccess = payload?.parentAccess || { unlocked: false };
      onParentAccessChange?.(parentAccess);
      onLocked?.(parentAccess);
    } catch (lockError) {
      setError(lockError?.message || "Parent access could not be locked. Please try again.");
    } finally {
      setLocking(false);
    }
  };

  if (loading) {
    return (
      <section aria-busy="true" aria-labelledby="kids-performance-settings-title" className="kids-performance-settings">
        <div className="kids-performance-state" role="status">
          <span aria-hidden="true" className="kids-performance-spinner" />
          <p>Loading parent controls…</p>
        </div>
      </section>
    );
  }

  if (!loaded) {
    return (
      <section aria-labelledby="kids-performance-settings-title" className="kids-performance-settings">
        <header className="kids-performance-header">
          <span aria-hidden="true" className="kids-performance-header-icon"><ShieldCheck size={24} /></span>
          <div>
            <small>Parent controls</small>
            <h2 id="kids-performance-settings-title">Kids learning settings</h2>
          </div>
        </header>
        <div className="kids-performance-message is-error" role="alert">
          <p>{error || "Parent settings could not be loaded."}</p>
          <button onClick={load} type="button">
            <RotateCcw aria-hidden="true" size={16} /> Retry
          </button>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="kids-performance-settings-title" className="kids-performance-settings">
      <header className="kids-performance-header">
        <span aria-hidden="true" className="kids-performance-header-icon"><ShieldCheck size={24} /></span>
        <div>
          <small>Parent controls</small>
          <h2 id="kids-performance-settings-title">Kids learning settings</h2>
          <p>Adjust the learning session without changing the child’s registered class.</p>
        </div>
      </header>

      {error ? (
        <div className="kids-performance-message is-error" role="alert">
          <p>{error}</p>
          <button disabled={saving || locking} onClick={load} type="button">
            <RotateCcw aria-hidden="true" size={16} /> Retry
          </button>
        </div>
      ) : null}
      {success ? <p className="kids-performance-message is-success" role="status">{success}</p> : null}

      <div aria-label="Learning overview" className="kids-performance-overview">
        <article>
          <BarChart3 aria-hidden="true" />
          <strong>{overview.mastery}%</strong>
          <span>Mastery</span>
        </article>
        <article>
          <Gamepad2 aria-hidden="true" />
          <strong>{overview.gamesPlayed}</strong>
          <span>Games played</span>
        </article>
        <article>
          <Sparkles aria-hidden="true" />
          <strong>{overview.retryCount}</strong>
          <span>Questions to retry</span>
        </article>
        <article>
          <Clock3 aria-hidden="true" />
          <strong>{overview.streakDays}</strong>
          <span>Day streak</span>
        </article>
      </div>

      <form className="kids-performance-form" onSubmit={save}>
        <label className="kids-performance-field">
          <span>Registered class</span>
          <input aria-readonly="true" readOnly value={registeredClass} />
          <small>The class is fixed from the learner’s account.</small>
        </label>

        <label className="kids-performance-field">
          <span><Timer aria-hidden="true" size={17} /> Daily play limit</span>
          <select
            onChange={(event) => update("dailyPlayLimitMinutes", Number(event.target.value))}
            value={settings.dailyPlayLimitMinutes}
          >
            {PLAY_LIMIT_OPTIONS.map((minutes) => (
              <option key={minutes} value={minutes}>{minutes} minutes</option>
            ))}
          </select>
          <small>{overview.minutesToday} minutes used today.</small>
        </label>

        <fieldset className="kids-performance-toggles">
          <legend>Child experience</legend>
          <KidsExperienceSwitch
            checked={settings.audioEnabled}
            icon={Volume2}
            label="Read questions aloud"
            onChange={(checked) => update("audioEnabled", checked)}
          />
          <KidsExperienceSwitch
            checked={settings.timerVisible}
            icon={Clock3}
            label="Show countdown to child"
            onChange={(checked) => update("timerVisible", checked)}
          />
        </fieldset>

        <fieldset className="kids-performance-language">
          <legend><Languages aria-hidden="true" size={18} /> Kid-facing language</legend>
          <label>
            <input
              checked={settings.language === "en"}
              name="kids-language"
              onChange={() => update("language", "en")}
              type="radio"
            />
            English
          </label>
          <label>
            <input
              checked={settings.language === "hi"}
              name="kids-language"
              onChange={() => update("language", "hi")}
              type="radio"
            />
            हिन्दी
          </label>
        </fieldset>

        <div className="kids-performance-actions">
          <button className="kids-performance-save" disabled={saving || locking} type="submit">
            <Save aria-hidden="true" size={18} /> {saving ? "Saving…" : "Save settings"}
          </button>
          <button className="kids-performance-lock" disabled={saving || locking} onClick={lockParentAccess} type="button">
            <LockKeyhole aria-hidden="true" size={18} /> {locking ? "Locking…" : "Lock Parent Access"}
          </button>
        </div>
      </form>
    </section>
  );
}
