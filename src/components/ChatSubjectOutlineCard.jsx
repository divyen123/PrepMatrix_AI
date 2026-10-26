import { useEffect, useId, useRef, useState } from "react";
import { BookOpen, Check, ChevronRight, Loader2, Pencil, Plus } from "lucide-react";
import {
  mergeChatSubjectOutline,
  normalizeChatSubjectOutline,
  resolveChatSubjectTarget,
  validateChatSubjectOutline,
} from "../utils/chatSubjectOutline";
import "./ChatSubjectOutlineCard.css";

const nameKey = (value) => String(value || "").normalize("NFKC").replace(/\s+/gu, " ").trim().toLowerCase();
const lines = (value) => value.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
const subjectId = (subject) => subject?.id || subject?._id || null;

function resolveSelectedSubject(subjects, selection) {
  if (!selection || selection.kind === "new") return { index: selection ? null : undefined, error: "" };
  const referenceIndex = subjects.indexOf(selection.reference);
  if (referenceIndex >= 0 && nameKey(subjects[referenceIndex]?.name) === nameKey(selection.name)) {
    return { index: referenceIndex, error: "" };
  }
  const matches = subjects.flatMap((subject, index) => {
    const matchesIdentity = selection.id
      ? subjectId(subject) === selection.id && nameKey(subject?.name) === nameKey(selection.name)
      : nameKey(subject?.name) === nameKey(selection.name);
    return matchesIdentity ? [index] : [];
  });
  return matches.length === 1
    ? { index: matches[0], error: "" }
    : { index: undefined, error: "The selected subject changed. Choose the destination again." };
}

function SubjectOutlineDraft({ academicProfileDataId, onAdd, onOpenSubject, outline, subjects }) {
  const titleId = useId();
  const editorId = useId();
  const targetId = useId();
  const [subjectName, setSubjectName] = useState(outline.subjectName);
  const [chapterText, setChapterText] = useState(outline.chapterNames.join("\n"));
  const [topicText, setTopicText] = useState(outline.topics.join("\n"));
  const [difficulty, setDifficulty] = useState(outline.difficulty);
  const [editing, setEditing] = useState(false);
  const [showTargetPicker, setShowTargetPicker] = useState(false);
  const [targetSelection, setTargetSelection] = useState(null);
  const [createdName, setCreatedName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const mountedRef = useRef(true);
  const savingRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const validation = validateChatSubjectOutline({
    subjectName,
    difficulty,
    chapterNames: lines(chapterText),
    topics: lines(topicText),
  });
  const draft = validation.outline;
  const target = resolveChatSubjectTarget(subjects, subjectName);
  const selected = resolveSelectedSubject(subjects, targetSelection);
  const effectiveTargetIndex = targetSelection?.kind === "new"
    && createdName === nameKey(subjectName) && target.status === "existing"
    ? target.index : selected.index;
  const needsTarget = !targetSelection && target.status === "ambiguous";
  const showPicker = showTargetPicker || needsTarget || Boolean(selected.error);
  let preview = null;
  let previewError = "";
  if (draft && !needsTarget && !selected.error) {
    try {
      preview = mergeChatSubjectOutline(subjects, draft, {
        targetIndex: effectiveTargetIndex,
        ...(targetSelection?.kind === "existing" ? { expectedTargetName: targetSelection.name } : {}),
      });
    } catch (error) {
      previewError = error instanceof Error ? error.message : "Review this outline before adding it.";
    }
  }
  const alreadyAdded = preview?.changed === false;
  const targetName = preview?.subject?.name || subjectName.trim();
  const validationIssue = selected.error || validation.errors[0] || previewError;
  const issue = saveError || validationIssue;
  const destination = preview
    ? `${preview.created ? "Create" : "Add to existing"} ${targetName}`
    : needsTarget ? "Choose which subject should receive this outline." : "Review the subject and outline below.";
  const chapterNames = draft?.chapterNames || lines(chapterText);
  const topics = draft?.topics || lines(topicText);
  const selectedValue = targetSelection?.kind === "new"
    ? "new"
    : targetSelection ? selected.error ? "unavailable" : `subject:${selected.index}` : "auto";

  const changeTarget = (event) => {
    setSaveError("");
    setShowTargetPicker(true);
    setCreatedName("");
    const value = event.target.value;
    if (value === "auto") setTargetSelection(null);
    else if (value === "new") setTargetSelection({ kind: "new" });
    else {
      const index = Number(value.slice("subject:".length));
      const subject = subjects[index];
      if (subject && typeof subject.name === "string") {
        setTargetSelection({ kind: "existing", id: subjectId(subject), name: subject.name, reference: subject });
      }
    }
  };

  const addOutline = async () => {
    if (savingRef.current || !draft || !preview?.changed || validationIssue || needsTarget) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError("");
    try {
      const result = await onAdd(draft, {
        academicProfileDataId,
        targetIndex: effectiveTargetIndex,
        ...(targetSelection?.kind === "existing" ? {
          targetSubjectName: targetSelection.name,
          targetSubject: subjects[effectiveTargetIndex],
        } : {}),
      });
      if (mountedRef.current) {
        setEditing(false);
        if (result?.created && targetSelection?.kind === "new") setCreatedName(nameKey(subjectName));
        if (result?.subject && targetSelection?.kind === "existing") {
          setTargetSelection((selection) => ({ ...selection, reference: result.subject }));
        }
      }
    } catch (error) {
      if (mountedRef.current) {
        setSaveError(error instanceof Error ? error.message : "The outline could not be saved. Try again.");
      }
    } finally {
      savingRef.current = false;
      if (mountedRef.current) setSaving(false);
    }
  };

  return (
    <section aria-busy={saving} aria-labelledby={titleId} className="chat-subject-outline">
      <div className="chat-subject-outline-heading">
        <span aria-hidden="true" className="chat-subject-outline-icon"><BookOpen size={19} /></span>
        <div>
          <span className="chat-subject-outline-label">AI-suggested outline</span>
          <h4 id={titleId}>{subjectName.trim() || "Subject outline"}</h4>
          <p>{chapterNames.length} {chapterNames.length === 1 ? "chapter" : "chapters"} · {topics.length} {topics.length === 1 ? "focus topic" : "focus topics"}</p>
        </div>
      </div>

      <div className="chat-subject-outline-destination">
        <p>{alreadyAdded ? `This outline is already in ${targetName}.` : destination}</p>
        {!showPicker && subjects.length > 0 && (
          <button disabled={saving} onClick={() => setShowTargetPicker(true)} type="button">Change subject</button>
        )}
      </div>

      {showPicker && (
        <label className="chat-subject-outline-field" htmlFor={targetId}>
          Destination subject
          <select disabled={saving} id={targetId} onChange={changeTarget} value={selectedValue}>
            <option disabled={needsTarget} value="auto">{needsTarget ? "Choose a subject" : "Match subject name automatically"}</option>
            {selected.error && <option disabled value="unavailable">Selected subject unavailable</option>}
            <option value="new">Create {subjectName.trim() || "a new subject"}</option>
            {subjects.map((subject, index) => typeof subject?.name === "string" && (
              <option key={`${index}:${subject.name}`} value={`subject:${index}`}>{subject.name}</option>
            ))}
          </select>
        </label>
      )}

      {editing ? (
        <fieldset className="chat-subject-outline-editor" disabled={saving} id={editorId}>
          <legend>Edit outline</legend>
          <label className="chat-subject-outline-field">
            Subject name
            <input maxLength={160} onChange={(event) => { setSubjectName(event.target.value); setSaveError(""); setCreatedName(""); }} value={subjectName} />
          </label>
          {preview?.created && (
            <label className="chat-subject-outline-field">
              Difficulty
              <select onChange={(event) => { setDifficulty(event.target.value); setSaveError(""); }} value={difficulty}>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </label>
          )}
          <label className="chat-subject-outline-field">
            Chapter names · one per line
            <textarea onChange={(event) => { setChapterText(event.target.value); setSaveError(""); }} rows={5} value={chapterText} />
          </label>
          <label className="chat-subject-outline-field">
            Focus topics · one per line
            <textarea onChange={(event) => { setTopicText(event.target.value); setSaveError(""); }} rows={5} value={topicText} />
          </label>
        </fieldset>
      ) : (
        <details className="chat-subject-outline-preview" id={editorId} open>
          <summary>View chapters and topics</summary>
          {chapterNames.length > 0 && <div><h5>Chapter names</h5><ol>{chapterNames.map((name, index) => <li key={`${index}:${name}`}>{name}</li>)}</ol></div>}
          {topics.length > 0 && <div><h5>Focus topics</h5><ul>{topics.map((name, index) => <li key={`${index}:${name}`}>{name}</li>)}</ul></div>}
        </details>
      )}

      {preview?.changed && (
        <p className="chat-subject-outline-summary">
          {preview.addedChapters} new {preview.addedChapters === 1 ? "chapter" : "chapters"}, {preview.addedTopics} new {preview.addedTopics === 1 ? "topic" : "topics"}
          {preview.skippedCount > 0 ? ` · ${preview.skippedCount} already included` : ""}
        </p>
      )}
      {issue && <p className="chat-subject-outline-error" role="alert">{issue}</p>}
      <div className="chat-subject-outline-actions">
        <button
          aria-controls={editorId}
          aria-expanded={editing}
          className="chat-subject-outline-edit"
          disabled={saving}
          onClick={() => setEditing((current) => !current)}
          type="button"
        >
          <Pencil aria-hidden="true" size={14} />{editing ? "Done editing" : "Edit outline"}
        </button>
        <button
          className="chat-subject-outline-add"
          disabled={saving || alreadyAdded || !preview?.changed || Boolean(validationIssue) || needsTarget}
          onClick={addOutline}
          type="button"
        >
          {saving ? <Loader2 aria-hidden="true" className="spinner" size={15} /> : alreadyAdded ? <Check aria-hidden="true" size={15} /> : <Plus aria-hidden="true" size={15} />}
          {saving ? "Adding…" : alreadyAdded ? "Added" : saveError ? "Retry add" : "Add to subject"}
        </button>
        {alreadyAdded && onOpenSubject && (
          <button className="chat-subject-outline-open" onClick={() => onOpenSubject(targetName)} type="button">
            Open subject<ChevronRight aria-hidden="true" size={14} />
          </button>
        )}
      </div>
      <span className="chat-subject-outline-status" role="status">{saving ? "Saving subject outline…" : alreadyAdded ? "Outline added." : ""}</span>
    </section>
  );
}

export default function ChatSubjectOutlineCard({ outline, subjects = [], academicProfileDataId = "", onAdd, onOpenSubject }) {
  const normalized = normalizeChatSubjectOutline(outline);
  if (!normalized || typeof onAdd !== "function") return null;
  return (
    <SubjectOutlineDraft
      academicProfileDataId={academicProfileDataId}
      key={academicProfileDataId}
      onAdd={onAdd}
      onOpenSubject={onOpenSubject}
      outline={normalized}
      subjects={Array.isArray(subjects) ? subjects : []}
    />
  );
}
