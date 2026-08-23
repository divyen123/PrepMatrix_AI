import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BarChart3,
  Clock3,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  RotateCcw,
  Save,
  ShieldCheck,
  Volume2,
  X,
} from "lucide-react";
import {
  KIDS_SUBJECTS,
  getKidsCopy,
  isValidParentPin,
} from "../../utils/kidsLearning";

const TIME_LIMIT_OPTIONS = [10, 15, 20, 30, 45, 60];

export default function KidsParentCorner({
  open,
  onClose,
  progress,
  settings,
  onSave,
  onResetSession,
  onAuthorizePin,
  onAuthorized,
  onLock,
  onOpenSettings,
  pinSetupStorageKey = "prepmatrix_kids_pin_setup_pending",
  requiredSetup = false,
  sessionAuthorized = false,
}) {
  const language = settings?.language || "en";
  const copy = getKidsCopy(language);
  const dialogRef = useRef(null);
  const previousFocusRef = useRef(null);
  const [pin, setPin] = useState("");
  const [pinVisible, setPinVisible] = useState(false);
  const [pinError, setPinError] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [draft, setDraft] = useState(settings);
  const [savedMessage, setSavedMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [working, setWorking] = useState(false);
  const [authorizedPin, setAuthorizedPin] = useState("");
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const hasPin = Boolean(settings?.parentPinConfigured);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement;
    setDraft(settingsRef.current);
    setPin("");
    setPinError("");
    setSavedMessage("");
    setSaveError("");
    setUnlocked(Boolean(sessionAuthorized));
    setAuthorizedPin("");
    setWorking(false);
    window.setTimeout(() => dialogRef.current?.focus(), 0);
    return () => {
      const previousFocus = previousFocusRef.current;
      if (previousFocus && typeof previousFocus.focus === "function") {
        window.setTimeout(() => previousFocus.focus(), 0);
      }
    };
  }, [open, sessionAuthorized]);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        if (!requiredSetup || unlocked) onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...(dialogRef.current?.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ) || [])].filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current?.focus();
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
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open, requiredSetup, unlocked]);

  const overview = useMemo(() => {
    const masteryValues = Object.values(progress?.mastery || {}).map((entry) => Number(entry?.percentage) || 0);
    return {
      mastery: masteryValues.length
        ? Math.round(masteryValues.reduce((sum, value) => sum + value, 0) / masteryValues.length)
        : 0,
      attempts: Number(progress?.totalAttempts) || (Array.isArray(progress?.attempts) ? progress.attempts.length : 0),
      retry: Array.isArray(progress?.retryQueue) ? progress.retryQueue.length : 0,
    };
  }, [progress]);

  if (!open) return null;

  const unlock = async (event) => {
    event.preventDefault();
    if (!isValidParentPin(pin)) {
      setPinError(copy.invalidPin);
      return;
    }
    setWorking(true);
    setPinError("");
    try {
      const outcome = await onAuthorizePin?.(pin, { create: !hasPin });
      if (!outcome?.ok) {
        setPinError(outcome?.message || (hasPin ? copy.wrongPin : "Unable to save the parent PIN."));
        return;
      }
      setDraft(outcome.settings || settingsRef.current);
      setAuthorizedPin(pin);
      setUnlocked(true);
      setPin("");
      onAuthorized?.(outcome);
      if (!hasPin) {
        try {
          window.sessionStorage.removeItem(pinSetupStorageKey);
          window.sessionStorage.removeItem("prepmatrix_kids_pin_setup_pending");
        } catch {
          // The server-backed parent access state remains authoritative.
        }
        window.dispatchEvent(new CustomEvent("prepmatrixKidsPinSetupComplete"));
      }
      if (outcome.offline) {
        setSavedMessage("Parent controls are available offline and will sync later.");
      }
    } finally {
      setWorking(false);
    }
  };

  const save = async (event) => {
    event.preventDefault();
    setWorking(true);
    setSaveError("");
    try {
      const outcome = await onSave(draft, { currentParentPin: authorizedPin });
      if (!outcome?.ok) {
        setSaveError(outcome?.message || "Unable to save settings right now.");
        return;
      }
      setDraft(outcome.settings || draft);
      setSavedMessage(getKidsCopy(draft.language).settingsSaved);
    } finally {
      setWorking(false);
    }
  };

  return createPortal(
    <div className="kids-parent-backdrop" onMouseDown={(event) => {
      if (event.currentTarget === event.target && (!requiredSetup || unlocked)) onClose();
    }}>
      <section
        aria-labelledby="kids-parent-title"
        aria-modal="true"
        className={`kids-parent-dialog${unlocked ? "" : " kids-parent-dialog--pin-gate"}`}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header>
          <div>
            <span aria-hidden="true"><ShieldCheck size={22} /></span>
            <div>
              <small>{copy.grownUpsOnly}</small>
              <h2 id="kids-parent-title">{copy.parentCorner}</h2>
            </div>
          </div>
          {(!requiredSetup || unlocked) ? (
            <button aria-label="Close Parent Corner" onClick={onClose} type="button"><X aria-hidden="true" size={20} /></button>
          ) : null}
        </header>

        {!unlocked ? (
          <form className="kids-pin-gate" onSubmit={unlock}>
            <span aria-hidden="true" className="kids-pin-icon"><KeyRound size={30} /></span>
            <h3>{hasPin ? copy.enterPin : copy.setupPin}</h3>
            <label className="kids-pin-label">
              <span>{hasPin ? copy.enterPin : copy.setupPin}</span>
              <div>
                <input
                  autoComplete={hasPin ? "current-password" : "new-password"}
                  autoFocus
                  inputMode="numeric"
                  maxLength={4}
                  onChange={(event) => {
                    setPin(event.target.value.replace(/\D/g, "").slice(0, 4));
                    setPinError("");
                  }}
                  pattern="\d{4}"
                  placeholder="••••"
                  type={pinVisible ? "text" : "password"}
                  value={pin}
                />
                <button aria-label={pinVisible ? "Hide PIN" : "Show PIN"} onClick={() => setPinVisible((value) => !value)} type="button">
                  {pinVisible ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
                </button>
              </div>
            </label>
            {pinError && <p aria-live="assertive" className="kids-pin-error" role="alert">{pinError}</p>}
            <button className="kids-parent-primary" disabled={working} type="submit">
              <Lock aria-hidden="true" size={17} />
              {working ? "Checking..." : hasPin ? copy.unlock : copy.createPin}
            </button>
          </form>
        ) : (
          <div className="kids-parent-content">
            <section aria-labelledby="kids-parent-overview">
              <div className="kids-parent-section-title">
                <BarChart3 aria-hidden="true" size={20} />
                <h3 id="kids-parent-overview">{copy.parentOverview}</h3>
              </div>
              <div className="kids-parent-metrics">
                <article><strong>{overview.mastery}%</strong><span>{copy.mastery}</span></article>
                <article><strong>{overview.attempts}</strong><span>{copy.attempts}</span></article>
                <article><strong>{overview.retry}</strong><span>{copy.tricky}</span></article>
              </div>
              <div className="kids-parent-subjects">
                {Object.entries(progress?.mastery || {}).map(([subjectId, mastery]) => (
                  <div key={subjectId}>
                    <span>{KIDS_SUBJECTS[subjectId]?.icon || "📘"} {KIDS_SUBJECTS[subjectId]?.name || subjectId}</span>
                    <div><i style={{ width: `${Math.max(0, Math.min(100, Number(mastery?.percentage) || 0))}%` }} /></div>
                    <strong>{Math.max(0, Math.min(100, Number(mastery?.percentage) || 0))}%</strong>
                  </div>
                ))}
                {!Object.keys(progress?.mastery || {}).length && <p>Progress appears here after the first game.</p>}
              </div>
            </section>

            <form aria-labelledby="kids-parent-settings" onSubmit={save}>
              <div className="kids-parent-section-title">
                <Clock3 aria-hidden="true" size={20} />
                <h3 id="kids-parent-settings">{copy.parentSettings}</h3>
              </div>

              <label className="kids-parent-field">
                <span>{copy.timeLimit}</span>
                <select onChange={(event) => setDraft((value) => ({ ...value, timeLimitMinutes: Number(event.target.value) }))} value={draft.timeLimitMinutes}>
                  {TIME_LIMIT_OPTIONS.map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}
                </select>
              </label>

              <label className="kids-parent-toggle">
                <span><Volume2 aria-hidden="true" size={18} /><span><strong>{copy.audio}</strong><small>Uses your device’s speech voice.</small></span></span>
                <input checked={Boolean(draft.audioEnabled)} onChange={(event) => setDraft((value) => ({ ...value, audioEnabled: event.target.checked }))} type="checkbox" />
              </label>

              <label className="kids-parent-toggle">
                <span><Clock3 aria-hidden="true" size={18} /><span><strong>{copy.timer}</strong><small>The limit still works when hidden.</small></span></span>
                <input checked={Boolean(draft.timerVisible)} onChange={(event) => setDraft((value) => ({ ...value, timerVisible: event.target.checked }))} type="checkbox" />
              </label>

              <fieldset className="kids-language-choice">
                <legend>{copy.language}</legend>
                <label><input checked={draft.language === "en"} name="kids-language" onChange={() => setDraft((value) => ({ ...value, language: "en" }))} type="radio" /> English</label>
                <label><input checked={draft.language === "hi"} name="kids-language" onChange={() => setDraft((value) => ({ ...value, language: "hi" }))} type="radio" /> हिन्दी</label>
              </fieldset>

              <div className="kids-safety-note">
                <ShieldCheck aria-hidden="true" size={21} />
                <div><strong>{copy.childSafety}</strong><p>{copy.safetyCopy}</p></div>
              </div>

              {savedMessage && <p aria-live="polite" className="kids-settings-saved" role="status">{savedMessage}</p>}
              {saveError && <p aria-live="assertive" className="kids-pin-error" role="alert">{saveError}</p>}
              <div className="kids-parent-actions">
                <button className="kids-parent-secondary" onClick={() => {
                  onResetSession();
                  setSavedMessage("A fresh learning session is ready.");
                }} type="button">
                  <RotateCcw aria-hidden="true" size={17} />
                  Fresh session
                </button>
                <button className="kids-parent-primary" disabled={working} type="submit">
                  <Save aria-hidden="true" size={17} />
                  {working ? "Saving..." : copy.saveSettings}
                </button>
              </div>
            </form>
          </div>
        )}

        {unlocked && (
          <footer>
            {onOpenSettings ? (
              <button className="kids-parent-settings-link" onClick={onOpenSettings} type="button">
                Open Settings
              </button>
            ) : null}
            <button onClick={async () => {
              await onLock?.();
              setUnlocked(false);
            }} type="button"><Lock aria-hidden="true" size={16} /> {copy.lock}</button>
          </footer>
        )}
      </section>
    </div>,
    document.body,
  );
}
