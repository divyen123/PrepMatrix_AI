import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LoaderCircle, UserRound, X } from "lucide-react";
import api from "../utils/apiClient";
import { STUDENT_AGE_MAX, STUDENT_AGE_MIN, STUDENT_NAME_MAX_LENGTH, validateStudentDetails } from "../utils/studentOnboarding.js";
import "./StudentDetailsDialog.css";

export default function StudentDetailsDialog({ user, onSaved, onLater }) {
  // Registration's email-derived username is a placeholder, not the student's name.
  const [username, setUsername] = useState("");
  const [age, setAge] = useState(user.age || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef(null);
  const nameRef = useRef(null);
  const activeRef = useRef(false);
  const savingRef = useRef(false);
  const laterRef = useRef(onLater);
  useEffect(() => { laterRef.current = onLater; }, [onLater]);

  useEffect(() => {
    activeRef.current = true;
    const previousFocus = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => nameRef.current?.focus());
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !savingRef.current) {
        event.preventDefault();
        laterRef.current();
      }
      if (event.key !== "Tab") return;
      const controls = [...dialogRef.current.querySelectorAll("button:not(:disabled), input:not(:disabled)")];
      if (!controls.length) { event.preventDefault(); dialogRef.current.focus(); return; }
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !controls.includes(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      activeRef.current = false;
      cancelAnimationFrame(frame);
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus?.();
    };
  }, []);

  const save = async (event) => {
    event.preventDefault();
    if (savingRef.current) return;
    const details = validateStudentDetails({ username, age });
    if (details.error) { setError(details.error); return; }
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const response = await api.updateProfile({ ...details, completeOnboardingProfile: true });
      if (!response?.user || response.user.id !== user.id) throw new Error("Your profile could not be saved. Please try again.");
      if (activeRef.current) onSaved(response.user);
    } catch (failure) {
      if (activeRef.current) setError(failure instanceof Error ? failure.message : "Could not save your details. Please try again.");
    } finally {
      savingRef.current = false;
      if (activeRef.current) setSaving(false);
    }
  };

  return createPortal(
    <div className="student-details-backdrop">
      <section aria-describedby="student-details-description" aria-labelledby="student-details-title" aria-modal="true" className="student-details-dialog" ref={dialogRef} role="dialog" tabIndex={-1}>
        <button aria-label="Add profile details later" className="student-details-close" disabled={saving} onClick={onLater} type="button"><X size={18} /></button>
        <span className="student-details-icon"><UserRound aria-hidden="true" size={24} /></span>
        <h2 id="student-details-title">A little about you</h2>
        <p id="student-details-description">Add your name and age to your profile. You can update them anytime in Settings → Profile &amp; Information.</p>
        <form onSubmit={save}>
          <label htmlFor="student-details-name">Student name</label>
          <input autoComplete="name" disabled={saving} id="student-details-name" maxLength={STUDENT_NAME_MAX_LENGTH} onChange={(event) => setUsername(event.target.value)} placeholder="Your full name" ref={nameRef} required value={username} />
          <label htmlFor="student-details-age">Age</label>
          <input disabled={saving} id="student-details-age" inputMode="numeric" max={STUDENT_AGE_MAX} min={STUDENT_AGE_MIN} onChange={(event) => setAge(event.target.value)} placeholder="Your age" required step="1" type="number" value={age} />
          {error && <p className="student-details-error" role="alert">{error}</p>}
          <div className="student-details-actions">
            <button disabled={saving} onClick={onLater} type="button">Later</button>
            <button className="student-details-save" disabled={saving} type="submit">{saving && <LoaderCircle aria-hidden="true" className="student-details-spinner" size={16} />}{saving ? "Saving…" : "Save & continue"}</button>
          </div>
        </form>
      </section>
    </div>, document.body,
  );
}
