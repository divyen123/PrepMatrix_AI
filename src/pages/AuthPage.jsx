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
    <section className="auth-page">
      {/* Antigravity particle background */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
        }}
        aria-hidden="true"
      >
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

      <div className="auth-bg-orbs" aria-hidden="true">
        <div className="auth-orb auth-orb-1" />
        <div className="auth-orb auth-orb-2" />
        <div className="auth-orb auth-orb-3" />
      </div>

      <div className="auth-brand-lockup" aria-label="PrepMatrix">
        <span className="auth-logo-mark" aria-hidden="true">P</span>
        <h1>PrepMatrix</h1>
      </div>

      <article className="auth-card">
        <div className="auth-copy">
          <h2>{isRegister ? "Create your study profile" : "Welcome back"}</h2>
          <p>
            Save your class, institution, and learning path so quizzes, reports,
            materials, and planner suggestions can adapt to your level.
          </p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="field-stack">
            Email address
            <input
              autoComplete="email"
              onChange={(event) => updateField("email", event.target.value)}
              placeholder="Example: student@example.com"
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

          {isRegister && (
            <>
              <label className="field-stack">
                Institution name
                <input
                  onChange={(event) => updateField("institutionName", event.target.value)}
                  placeholder="School or college name"
                  value={form.institutionName}
                />
              </label>

              <div className="auth-grid">
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
              </div>

              {form.academicLevel === "College" && (
                <label className="field-stack">
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
            </>
          )}

          {message && <p className="auth-message">{message}</p>}

          <button type="submit">{submitLabel}</button>
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










