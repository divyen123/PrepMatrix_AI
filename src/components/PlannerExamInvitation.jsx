import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { GraduationCap, LoaderCircle } from "lucide-react";
import { acknowledgeScheduleExam, getScheduleCompletion } from "../utils/plannerLifecycle.js";
import "./PlannerExamInvitation.css";

function ExamDialog({ onLater, onAttend }) {
  const ref = useRef(null);
  const laterRef = useRef(onLater);
  const savingRef = useRef(false);
  const activeRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { laterRef.current = onLater; }, [onLater]);
  useEffect(() => {
    activeRef.current = true;
    const previousFocus = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.querySelector("button")?.focus();
    const keydown = (event) => {
      if (event.key === "Escape" && !savingRef.current) {
        event.preventDefault(); laterRef.current();
      }
      if (event.key !== "Tab") return;
      const buttons = [...ref.current.querySelectorAll("button:not(:disabled)")];
      if (!buttons.length) { event.preventDefault(); ref.current.focus(); return; }
      if (event.shiftKey && (document.activeElement === buttons[0] || !buttons.includes(document.activeElement))) {
        event.preventDefault(); buttons.at(-1).focus();
      } else if (!event.shiftKey && (document.activeElement === buttons.at(-1) || !buttons.includes(document.activeElement))) {
        event.preventDefault(); buttons[0].focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      activeRef.current = false;
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", keydown);
      if (previousFocus?.isConnected) previousFocus.focus?.();
    };
  }, []);

  const attend = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true); setError("");
    try { await onAttend(); }
    catch (failure) {
      if (activeRef.current) setError(failure.message || "Could not save your progress. Please try again.");
    } finally {
      savingRef.current = false;
      if (activeRef.current) setSaving(false);
    }
  };

  return createPortal(
    <div className="planner-exam-backdrop">
      <section className="planner-exam-dialog" role="dialog" aria-modal="true" aria-labelledby="planner-exam-title" aria-describedby="planner-exam-description" ref={ref} tabIndex={-1}>
        <span className="planner-exam-icon"><GraduationCap size={28} aria-hidden="true" /></span>
        <span className="planner-exam-badge">100% complete</span>
        <h2 id="planner-exam-title">Ready to put it to the test?</h2>
        <p id="planner-exam-description">You have finished every task in this schedule. Attend an exam to check what you know, or come back when you are ready.</p>
        {error && <p className="planner-exam-error" role="alert">{error}</p>}
        <div className="planner-exam-actions">
          <button className="secondary-btn" disabled={saving} onClick={onLater} type="button">Maybe later</button>
          <button className="action-btn" disabled={saving} onClick={attend} type="button">{saving && <LoaderCircle className="planner-exam-spinner" size={16} aria-hidden="true" />}{saving ? "Saving progress…" : "Attend exam"}</button>
        </div>
      </section>
    </div>, document.body,
  );
}

export default function PlannerExamInvitation({ schedule, completed, setSchedule, onBeforeAttendExam }) {
  const navigate = useNavigate();
  const completion = getScheduleCompletion(schedule, completed);
  const [unobstructed, setUnobstructed] = useState(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    if (!completion.shouldInvite) return undefined;
    const check = () => setUnobstructed(![...document.querySelectorAll('[aria-modal="true"]')]
      .some((element) => !element.classList.contains("planner-exam-dialog")));
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    check();
    return () => observer.disconnect();
  }, [completion.shouldInvite]);

  const dismiss = () => setSchedule((current) => {
    // Ignore a stale dialog if a new schedule was generated while saving.
    return getScheduleCompletion(current, completed).key === completion.key
      ? acknowledgeScheduleExam(current, completion.key) : current;
  });

  if (!completion.shouldInvite || !unobstructed) return null;
  return <ExamDialog onLater={dismiss} onAttend={async () => {
    await onBeforeAttendExam?.();
    if (!mounted.current) return;
    dismiss();
    navigate("/exam?section=attend");
  }} />;
}
