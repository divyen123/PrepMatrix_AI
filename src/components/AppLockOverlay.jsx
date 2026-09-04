import { useEffect, useRef, useState } from "react";
import { LockKeyhole, LogOut, UnlockKeyhole } from "lucide-react";
import "./AppLockOverlay.css";

export default function AppLockOverlay({
  busy = false,
  errorMessage = "",
  onLogout,
  onUnlock,
  userLabel = "your account",
}) {
  const [password, setPassword] = useState("");
  const passwordRef = useRef(null);

  useEffect(() => {
    passwordRef.current?.focus();
  }, []);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!password.trim() || busy) return;
    onUnlock?.(password);
  };

  return (
    <div className="app-lock-backdrop">
      <section
        aria-labelledby="app-lock-title"
        aria-modal="true"
        className="app-lock-panel"
        role="dialog"
      >
        <div aria-hidden="true" className="app-lock-mark">
          <LockKeyhole size={25} strokeWidth={2.25} />
        </div>
        <span className="app-lock-kicker">Session locked</span>
        <h2 id="app-lock-title">PrepMatrix is locked</h2>
        <p>Enter the password for <strong>{userLabel}</strong> to continue.</p>

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
