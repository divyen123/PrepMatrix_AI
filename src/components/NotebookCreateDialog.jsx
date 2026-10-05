import { AnimatePresence, motion as Motion, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export default function NotebookCreateDialog({ open, onClose, suspended = false, children }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  const reducedMotion = useReducedMotion();
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open || suspended) return undefined;
    const previous = document.activeElement;
    const frame = requestAnimationFrame(() => (dialogRef.current?.querySelector("input:not(:disabled), textarea:not(:disabled)") || dialogRef.current?.querySelector("button"))?.focus());
    const handleKey = (event) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeRef.current(); }
      if (event.key !== "Tab") return;
      const elements = [...(dialogRef.current?.querySelectorAll("input:not(:disabled), textarea:not(:disabled), button:not(:disabled), [tabindex='0']") || [])].filter((element) => element.getClientRects().length);
      const first = elements[0];
      const last = elements.at(-1);
      if (!first) { event.preventDefault(); dialogRef.current?.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("keydown", handleKey); if (previous?.isConnected) previous.focus(); };
  }, [open, suspended]);
  if (typeof document === "undefined") return null;
  const duration = reducedMotion ? 0 : 0.2;
  return createPortal(<AnimatePresence>{open && <Motion.div className="notebook-create-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration }} onMouseDown={(event) => { if (event.target === event.currentTarget && !suspended) onClose(); }}>
    <Motion.section aria-labelledby="notebook-create-title" aria-modal={!suspended} className="notebook-create-dialog" role="dialog" ref={dialogRef} tabIndex={-1} initial={{ opacity: 0, y: -12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.98 }} transition={{ duration }}>
      <header><h2 id="notebook-create-title">New notebook</h2><button aria-label="Close new notebook" onClick={onClose} type="button"><X size={17} /></button></header>
      {children}
    </Motion.section>
  </Motion.div>}</AnimatePresence>, document.body);
}
