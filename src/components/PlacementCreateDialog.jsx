import { AnimatePresence, motion as Motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { BrainCircuit, Plus, X } from "lucide-react";
import LatticeLoader from "./LatticeLoader";
import {
  acceptPlacementPlaceholder,
  MAX_PLACEMENT_CREATION_TOPICS,
  MAX_PLACEMENT_ROLE_CHARS,
  MAX_PLACEMENT_TOPIC_CHARS,
  parsePlacementCreationTopics,
  PLACEMENT_CUSTOM_SOURCE_VALUE,
} from "../utils/placementCreation.js";
import "./PlacementCreateDialog.css";

export default function PlacementCreateDialog({
  open, onClose, suspended = false,
  sourceValue = PLACEMENT_CUSTOM_SOURCE_VALUE, onSourceChange, notebooks = [],
  role = "", onRoleChange, rolePlaceholder = "Software engineering intern",
  topics = "", onTopicsChange, topicsPlaceholder = "",
  quickTopics = [], onQuickAdd, onSubmit, busy = false, canSubmit = true, error = "", creditCost,
}) {
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  const headingId = useId();
  const roleHintId = useId();
  const topicHintId = useId();
  const errorId = useId();
  const reducedMotion = useReducedMotion();
  const parsedTopics = parsePlacementCreationTopics(topics);
  const validSource = sourceValue === PLACEMENT_CUSTOM_SOURCE_VALUE || notebooks.some((notebook) => notebook.id === sourceValue);
  const invalidTopics = parsedTopics.length > MAX_PLACEMENT_CREATION_TOPICS || parsedTopics.some((topic) => topic.length > MAX_PLACEMENT_TOPIC_CHARS);
  const canAnalyze = canSubmit && validSource && role.trim().length > 0 && role.trim().length <= MAX_PLACEMENT_ROLE_CHARS && parsedTopics.length > 0 && !invalidTopics && !busy && !suspended;
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open || suspended) return undefined;
    const frame = requestAnimationFrame(() => (dialogRef.current?.querySelector("input:not(:disabled), textarea:not(:disabled)") || dialogRef.current?.querySelector("button"))?.focus());
    const visibleControls = () => [...(dialogRef.current?.querySelectorAll("input:not(:disabled), textarea:not(:disabled), select:not(:disabled), button:not(:disabled), [tabindex='0']") || [])]
      .filter((element) => element.getClientRects().length && element.getAttribute("aria-hidden") !== "true");
    const handleKey = (event) => {
      if (event.defaultPrevented || event.isComposing) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeRef.current(); return; }
      if (event.key !== "Tab") return;
      const elements = visibleControls();
      const first = elements[0];
      const last = elements.at(-1);
      if (!first) { event.preventDefault(); dialogRef.current?.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    const handleFocus = (event) => {
      if (!dialogRef.current?.contains(event.target)) (visibleControls()[0] || dialogRef.current)?.focus();
    };
    document.addEventListener("keydown", handleKey);
    document.addEventListener("focusin", handleFocus);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("keydown", handleKey); document.removeEventListener("focusin", handleFocus); };
  }, [open, suspended]);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    return () => { if (previous?.isConnected) previous.focus(); };
  }, [open]);

  if (typeof document === "undefined") return null;
  const duration = reducedMotion ? 0 : .2;
  return createPortal(<AnimatePresence>{open && <Motion.div className="placement-create-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration }} onMouseDown={(event) => { if (event.target === event.currentTarget && !suspended) onClose(); }}>
    <Motion.section className="placement-create-dialog" role="dialog" aria-labelledby={headingId} aria-modal={!suspended} aria-hidden={suspended || undefined} inert={suspended ? true : undefined} ref={dialogRef} tabIndex={-1} initial={{ opacity: 0, y: -12, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: .98 }} transition={{ duration }}>
      <header><h2 id={headingId}>New topic</h2><button className="placement-create-close" type="button" aria-label="Close new topic" onClick={onClose}><X size={17} /></button></header>
      <form onSubmit={(event) => { event.preventDefault(); if (canAnalyze) onSubmit(); }}>
        <label className="placement-create-field"><span id={`${headingId}-source-label`}>Preparation source</span><select value={sourceValue} onChange={(event) => onSourceChange(event.target.value)} disabled={busy} aria-labelledby={`${headingId}-source-label`}>
          <option value={PLACEMENT_CUSTOM_SOURCE_VALUE}>Topics</option>
          {notebooks.length > 0 && <optgroup label="Saved notebooks">{notebooks.map((notebook) => <option key={notebook.id} value={notebook.id}>{notebook.title || notebook.subjectName || "Learning notebook"}{notebook.title && notebook.subjectName && notebook.title !== notebook.subjectName ? ` · ${notebook.subjectName}` : ""}</option>)}</optgroup>}
        </select></label>
        <label className="placement-create-field"><span id={`${roleHintId}-label`}>Target role</span><input value={role} placeholder={rolePlaceholder} maxLength={MAX_PLACEMENT_ROLE_CHARS} onChange={(event) => onRoleChange(event.target.value)} onKeyDown={(event) => { if (acceptPlacementPlaceholder(event, role, rolePlaceholder)) onRoleChange(rolePlaceholder.slice(0, MAX_PLACEMENT_ROLE_CHARS)); }} disabled={busy} aria-labelledby={`${roleHintId}-label`} aria-describedby={roleHintId} autoComplete="off" /><small id={roleHintId}>Press Tab in an empty field to use the example.</small></label>
        <label className="placement-create-field"><span id={`${topicHintId}-label`}>Topics to analyze</span><textarea value={topics} placeholder={topicsPlaceholder} onChange={(event) => onTopicsChange(event.target.value)} onKeyDown={(event) => { if (acceptPlacementPlaceholder(event, topics, topicsPlaceholder)) onTopicsChange(topicsPlaceholder); }} disabled={busy} aria-labelledby={`${topicHintId}-label`} aria-describedby={topicHintId} aria-invalid={invalidTopics || undefined} rows={5} /><small id={topicHintId}>{invalidTopics ? `Use up to ${MAX_PLACEMENT_CREATION_TOPICS} topics, each no longer than ${MAX_PLACEMENT_TOPIC_CHARS} characters.` : `Separate topics with commas or new lines. Up to ${MAX_PLACEMENT_CREATION_TOPICS}; Tab fills the suggestions.`}</small></label>
        {quickTopics.length > 0 && <div className="placement-create-quick"><span>Quick add</span><div>{quickTopics.map((title) => {
          const alreadyAdded = parsedTopics.some((topic) => topic.normalize("NFKC").toLocaleLowerCase() === title.normalize("NFKC").toLocaleLowerCase());
          return <button key={title} type="button" onClick={() => onQuickAdd(title)} disabled={busy || alreadyAdded || parsedTopics.length >= MAX_PLACEMENT_CREATION_TOPICS} aria-label={`Add ${title}`}><Plus size={13} /><span>{title}</span></button>;
        })}</div></div>}
        {error && <p id={errorId} className="placement-create-error" role="alert">{error}</p>}
        <footer>{busy ? <div className="placement-create-status"><LatticeLoader className="generation-lattice-loader" label="Analyzing preparation topics" /><p>You can close this popup while it finishes.</p></div> : <button className="placement-create-submit" type="submit" disabled={!canAnalyze} aria-describedby={error ? errorId : undefined}><BrainCircuit size={17} /><span>Analyze topics</span>{creditCost}</button>}</footer>
      </form>
    </Motion.section>
  </Motion.div>}</AnimatePresence>, document.body);
}
