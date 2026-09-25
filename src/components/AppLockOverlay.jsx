import { useEffect, useMemo, useRef, useState } from "react";
import { LockKeyhole, LogOut, UnlockKeyhole } from "lucide-react";
import { buildLockSuggestions } from "../utils/lockSuggestions.js";
import "./AppLockOverlay.css";

const EMPTY_STUDY_DATA = [];

export default function AppLockOverlay({
  background = null,
  busy = false,
  errorMessage = "",
  onLogout,
  onUnlock,
  schedule = EMPTY_STUDY_DATA,
  subjects = EMPTY_STUDY_DATA,
}) {
  const [password, setPassword] = useState("");
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const panelRef = useRef(null);
  const passwordRef = useRef(null);
  const suggestions = useMemo(
    () => buildLockSuggestions({ subjects, schedule }),
    [subjects, schedule],
  );

  useEffect(() => {
    if (suggestions.length < 2) return undefined;
    const interval = window.setInterval(() => {
      setSuggestionIndex((current) => (current + 1) % suggestions.length);
    }, 6000);
    return () => window.clearInterval(interval);
  }, [suggestions]);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const panel = panelRef.current;
    passwordRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key !== "Tab" || !panel) return;

      const focusableElements = Array.from(panel.querySelectorAll(
        'input:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ));
      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;
      if (!focusableElements.includes(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? lastElement : firstElement).focus();
      } else if (event.shiftKey && activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused?.isConnected && !previouslyFocused.closest?.("[inert]")) {
        previouslyFocused.focus();
      }
    };
  }, []);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!password.trim() || busy) return;
    onUnlock?.(password);
  };

  return (
    <div className={`app-lock-backdrop${background ? " has-selected-background" : ""}`}>
      {background}
      <section
        aria-labelledby="app-lock-title"
        aria-modal="true"
        className="app-lock-panel"
        ref={panelRef}
        role="dialog"
      >
        <div aria-label="PrepMatrix" className="workspace-logo-wrap app-lock-logo" role="img">
          <span aria-hidden="true" className="workspace-logo-mark">P</span>
          <span aria-hidden="true" className="workspace-logo-title">PrepMatrix</span>
        </div>
        <h2 id="app-lock-title">
          <LockKeyhole aria-hidden="true" size={20} strokeWidth={2.1} />
          Session locked
        </h2>

        <form onSubmit={handleSubmit}>
          <label htmlFor="app-lock-password">Account password</label>
          <input
            autoComplete="current-password"
            id="app-lock-password"
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter your password"
            ref={passwordRef}
            type="password"
            value={password}
          />
          {errorMessage && <p className="app-lock-error" role="alert">{errorMessage}</p>}
          <div className="app-lock-actions">
            <button className="app-lock-unlock-btn" disabled={busy || !password.trim()} type="submit">
              <UnlockKeyhole aria-hidden="true" size={17} />
              {busy ? "Unlocking..." : "Unlock app"}
            </button>
            <button className="app-lock-logout-btn" disabled={busy} onClick={onLogout} type="button">
              <LogOut aria-hidden="true" size={16} />
              Log out instead
            </button>
          </div>
        </form>
        <p className="app-lock-suggestion" key={suggestions[suggestionIndex % suggestions.length]}>
          {suggestions[suggestionIndex % suggestions.length]}
        </p>
      </section>
    </div>
  );
}
