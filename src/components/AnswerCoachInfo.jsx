import { useEffect, useId, useRef, useState } from "react";
import { Info } from "lucide-react";
import "./AnswerCoachInfo.css";

export default function AnswerCoachInfo() {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const containerRef = useRef(null);
  const closeTimerRef = useRef(null);
  const id = useId();

  const show = () => {
    window.clearTimeout(closeTimerRef.current);
    setOpen(true);
  };
  const hide = () => {
    window.clearTimeout(closeTimerRef.current);
    setPinned(false);
    setOpen(false);
  };

  useEffect(() => () => window.clearTimeout(closeTimerRef.current), []);
  useEffect(() => {
    if (!open) return undefined;
    const dismissOutside = (event) => {
      if (containerRef.current?.contains(event.target)) return;
      window.clearTimeout(closeTimerRef.current);
      setPinned(false);
      setOpen(false);
    };
    const dismissEscape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      window.clearTimeout(closeTimerRef.current);
      setPinned(false);
      setOpen(false);
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("focusin", dismissOutside);
    document.addEventListener("keydown", dismissEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("focusin", dismissOutside);
      document.removeEventListener("keydown", dismissEscape);
    };
  }, [open]);

  return (
    <span
      className="answer-coach-info"
      onPointerEnter={(event) => { if (event.pointerType !== "touch") show(); }}
      onPointerLeave={() => {
        if (!pinned) closeTimerRef.current = window.setTimeout(() => setOpen(false), 120);
      }}
      ref={containerRef}
    >
      <button
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        aria-label="About Answer coach"
        className="answer-coach-info__trigger"
        onBlur={(event) => {
          if (!pinned && !containerRef.current?.contains(event.relatedTarget)) hide();
        }}
        onClick={() => {
          window.clearTimeout(closeTimerRef.current);
          setPinned(!pinned);
          setOpen(!pinned);
        }}
        onFocus={show}
        type="button"
      ><Info aria-hidden="true" size={18} /></button>
      <span
        aria-hidden={!open}
        className={`answer-coach-info__popup${open ? " is-open" : ""}`}
        id={id}
        role="tooltip"
      >
        <strong>Review written answers</strong>
        <span>Choose one of your generated papers, upload clearly numbered answers, and get provisional step feedback. Only readable answers are scored.</span>
      </span>
    </span>
  );
}
