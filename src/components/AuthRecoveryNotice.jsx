import "./AuthRecoveryNotice.css";

export default function AuthRecoveryNotice({ busy, onRetry, onSignIn }) {
  return (
    <section aria-labelledby="auth-recovery-title" className="auth-recovery-notice card">
      <span className="section-tag">Connection interrupted</span>
      <h1 id="auth-recovery-title">Reconnecting to your session</h1>
      <p aria-live="polite" className="card-subtext">
        {busy
          ? "Checking your saved sign-in..."
          : "PrepMatrix could not confirm your sign-in. It will try again automatically."}
      </p>
      <div className="auth-recovery-actions">
        <button disabled={busy} onClick={onRetry} type="button">
          {busy ? "Reconnecting..." : "Try again now"}
        </button>
        <button className="secondary-btn" disabled={busy} onClick={onSignIn} type="button">
          Sign in instead
        </button>
      </div>
    </section>
  );
}
