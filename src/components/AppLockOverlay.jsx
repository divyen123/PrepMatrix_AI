import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { LockKeyhole, LogOut, UnlockKeyhole } from "lucide-react";
import "./AppLockOverlay.css";

function LockRingsFallback() {
  return (
    <div className="magic-rings">
      <span className="entry-splash-rings-fallback" />
    </div>
  );
}

const MagicRings = lazy(() => import("./MagicRings")
  .catch(() => ({ default: LockRingsFallback })));

export default function AppLockOverlay({
  busy = false,
  errorMessage = "",
  onLogout,
  onUnlock,
  userLabel = "your account",
}) {
  const [password, setPassword] = useState("");
  const panelRef = useRef(null);
  const passwordRef = useRef(null);

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
    <div className="app-lock-backdrop">
      <div aria-hidden="true" className="app-lock-rings">
        <Suspense fallback={<LockRingsFallback />}>
          <MagicRings
            alphaMode="luminance"
            attenuation={24}
            baseRadius={0.24}
            blur={0.35}
            clickBurst={false}
            color="#bf6fff"
            colorTwo="#ff9ffc"
            fadeIn={0.75}
            fadeOut={0.65}
            followMouse={false}
            hoverScale={1}
            lineThickness={0.9}
            noiseAmount={0}
            opacity={0.3}
            parallax={0.015}
            radiusStep={0.055}
            ringCount={8}
            ringGap={1.1}
            rotation={20}
            scaleRate={0.045}
            speed={0.38}
          />
        </Suspense>
      </div>
      <section
        aria-describedby="app-lock-description"
        aria-labelledby="app-lock-title"
        aria-modal="true"
        className="app-lock-panel"
        ref={panelRef}
        role="dialog"
      >
        <span aria-hidden="true" className="app-lock-brand-mark">P</span>
        <h2 aria-label="PrepMatrix is locked" id="app-lock-title">PrepMatrix</h2>
        <span className="app-lock-kicker">
          <LockKeyhole aria-hidden="true" size={14} strokeWidth={2.3} />
          Session locked
        </span>
        <p id="app-lock-description">
          Enter the password for <strong>{userLabel}</strong> to continue.
        </p>

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
          <button className="app-lock-unlock-btn" disabled={busy || !password.trim()} type="submit">
            <UnlockKeyhole aria-hidden="true" size={17} />
            {busy ? "Unlocking..." : "Unlock app"}
          </button>
        </form>

        <button className="app-lock-logout-btn" disabled={busy} onClick={onLogout} type="button">
          <LogOut aria-hidden="true" size={16} />
          Log out instead
        </button>
      </section>
    </div>
  );
}
