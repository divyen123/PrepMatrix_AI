import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  CLASS_OPTIONS,
  DEPARTMENT_OPTIONS,
  TRACK_OPTIONS,
} from "../utils/userStore";
import api from "../utils/apiClient";
import Antigravity from "../components/Antigravity";

const emptyProfile = {
  email: "",
  password: "",
  institutionName: "",
  academicLevel: "College",
  academicTrack: "General",
  department: "Computer Science",
};

function AuthPage({ mode = "login", onLogin }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState(emptyProfile);
  const [message, setMessage] = useState("");
  const isRegister = mode === "register";

  const submitLabel = useMemo(
    () => (isRegister ? "Create account" : "Login"),
    [isRegister]
  );

  useEffect(() => {
    const notice = window.sessionStorage.getItem("prepmatrix_auth_notice");
    if (notice) {
      setMessage(notice);
      window.sessionStorage.removeItem("prepmatrix_auth_notice");
    }
  }, [location.pathname]);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage("");

    if (!form.email.trim() || !form.password.trim()) {
      setMessage("Enter both email and password.");
      return;
    }

    if (isRegister && !form.institutionName.trim()) {
      setMessage("Enter your institution name to personalize PrepMatrix.");
      return;
    }

    try {
      const result = isRegister
        ? await api.register(form)
        : await api.login({ email: form.email, password: form.password });

      if (isRegister) {
        localStorage.setItem("prepmatrix_wake_mode", "false");
        window.dispatchEvent(new CustomEvent("prepmatrixWakeModeChange", { detail: { enabled: false } }));
      }

      onLogin(result.user, result.workspace);
      navigate("/dashboard", { replace: true });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Authentication failed.");
    }
  };

  return (
    <section className="auth-page auth-page--isolated">
      {/* Fixed dark background — always overrides any app theme */}
      <div className="auth-fixed-bg" aria-hidden="true" />

      {/* Antigravity particle animation */}
      <div className="auth-particle-layer" aria-hidden="true">
        <Antigravity
          count={300}
          magnetRadius={6}
          ringRadius={7}
          waveSpeed={0.4}
          waveAmplitude={1}
          particleSize={1.5}
          lerpSpeed={0.05}
          color={"#FF9FFC"}
          autoAnimate={true}
          particleVariance={1}
        />
      </div>

      {/* Subtle radial glow accents */}
      <div className="auth-glow auth-glow-top" aria-hidden="true" />
      <div className="auth-glow auth-glow-bottom" aria-hidden="true" />

      {/* Brand lockup */}
      <div className="auth-brand-lockup" aria-label="PrepMatrix">
        <span className="auth-logo-mark" aria-hidden="true">P</span>
        <h1>PrepMatrix</h1>
      </div>

      {/* Card — expands to 2-col for register */}
      <article className={`auth-card auth-card--v2${isRegister ? " auth-card--register" : ""}`}>
        <div className="auth-copy">
          <h2>{isRegister ? "Create your study profile" : "Welcome back"}</h2>
          <p>
            {isRegister
              ? "Set up your institution, class, and learning path to get personalised quizzes and plans."
              : "Sign in to continue your personalised study journey."}
          </p>
        </div>

        <form className="auth-form auth-form--v2" onSubmit={handleSubmit}>
          {/* ── Login fields (always shown, stacked single-column) ── */}
          <div className="auth-fields-base">
            <label className="field-stack">
              Email address
              <input
                autoComplete="email"
                onChange={(event) => updateField("email", event.target.value)}
                placeholder="student@example.com"
                type="email"
                value={form.email}
              />
            </label>

            <label className="field-stack">
              Password
              <input
                onChange={(event) => updateField("password", event.target.value)}
                placeholder="Enter password"
                type="password"
                value={form.password}
              />
            </label>
          </div>

          {/* ── Register-only fields (2-column grid, animated in) ── */}
          {isRegister && (
            <div className="auth-fields-register">
              <label className="field-stack auth-field-full">
                Institution name
                <input
                  onChange={(event) => updateField("institutionName", event.target.value)}
                  placeholder="School or college name"
                  value={form.institutionName}
                />
              </label>

              <label className="field-stack">
                Class / level
                <select
                  onChange={(event) => updateField("academicLevel", event.target.value)}
                  value={form.academicLevel}
                >
                  {CLASS_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>

              <label className="field-stack">
                Board / stream
                <select
                  onChange={(event) => updateField("academicTrack", event.target.value)}
                  value={form.academicTrack}
                >
                  {TRACK_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>

              {form.academicLevel === "College" && (
                <label className="field-stack auth-field-full">
                  Department
                  <select
                    onChange={(event) => updateField("department", event.target.value)}
                    value={form.department}
                  >
                    {DEPARTMENT_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}

          {message && <p className="auth-message">{message}</p>}

          <button type="submit" className="auth-submit-btn">{submitLabel}</button>
        </form>

        <div className="auth-switch">
          {isRegister ? (
            <span>Already have a profile? <Link to="/login">Login</Link></span>
          ) : (
            <span>New to PrepMatrix? <Link to="/register">Create account</Link></span>
          )}
        </div>
      </article>
    </section>
  );
}

export default AuthPage;
