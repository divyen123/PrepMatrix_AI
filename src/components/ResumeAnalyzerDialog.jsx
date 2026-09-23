import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  CheckCircle2,
  ClipboardPaste,
  FileSearch,
  FileText,
  Save,
  UploadCloud,
  X,
} from "lucide-react";
import api from "../utils/apiClient";
import { acquireDocumentScrollLock } from "../utils/documentScrollLock";
import { normalizeResumeDraft } from "../utils/resumeBuilder";
import { analyzeSkillGap } from "../utils/skillGapAnalysis";
import "./ResumeAnalyzerDialog.css";

const MAX_RESUME_FILE_BYTES = 5 * 1024 * 1024;
const MAX_RESUME_TEXT_LENGTH = 50000;
const MAX_JOB_DESCRIPTION_LENGTH = 12000;
const DIALOG_EXIT_MS = 220;
const FINDING_PRIORITY = { high: 0, medium: 1, low: 2 };

function hasResumeContent(draft) {
  return Boolean(
    draft.summary.trim()
    || draft.skills.length
    || draft.tools.length
    || draft.experience.some((item) => item.role || item.highlights.some(Boolean))
    || draft.projects.some((item) => item.name || item.technologies || item.highlights.some(Boolean))
    || draft.certifications.some((item) => item.name)
    || draft.achievements.some((item) => item.title || item.description),
  );
}

const SOURCE_OPTIONS = [
  { id: "builder", label: "Current draft", icon: FileText },
  { id: "upload", label: "Upload resume", icon: UploadCloud },
  { id: "paste", label: "Paste text", icon: ClipboardPaste },
];

export function getResumeReviewPriority(findings = []) {
  if (findings.some((item) => String(item?.priority).toLowerCase() === "high")) return "High";
  if (findings.some((item) => String(item?.priority).toLowerCase() === "medium")) return "Medium";
  return "Low";
}

export function formatResumeReviewNote(results, findings = []) {
  const targetRole = results?.targetRole || results?.roleNames?.[0] || "Target role";
  const sections = [`Target Role: ${targetRole}`];

  if (findings.length > 0) {
    const findingsText = findings.map((finding, index) => {
      const priorityTag = String(finding.priority || "medium").toUpperCase();
      const lines = [`${index + 1}. [${priorityTag}] ${finding.title}`];
      if (finding.suggestion) lines.push(`   Suggestion: ${finding.suggestion}`);
      if (finding.evidence) lines.push(`   Found: ${finding.evidence}`);
      if (finding.example) lines.push(`   Example: ${finding.example}`);
      return lines.join("\n");
    }).join("\n\n");
    sections.push(`Areas to improve:\n${findingsText}`);
  } else {
    sections.push("Areas to improve:\nNo clear issues were found in the text provided.");
  }

  const notShown = results?.notShown || [];
  if (notShown.length > 0) {
    const list = notShown.map((item) => `• ${item.skill}${item.action ? ` - ${item.action}` : ""}`).join("\n");
    sections.push(`Skills to add / develop:\n${list}`);
  }

  const needsEvidence = results?.needsEvidence || [];
  if (needsEvidence.length > 0) {
    const list = needsEvidence.map((item) => `• ${item.skill}${item.action ? ` - ${item.action}` : ""}`).join("\n");
    sections.push(`Skills needing evidence:\n${list}`);
  }

  const matched = results?.matched || [];
  if (matched.length > 0) {
    const list = matched.map((item) => `• ${item.skill}`).join("\n");
    sections.push(`Matched skills:\n${list}`);
  }

  sections.push("Saved from Resume Analyzer.");
  return sections.join("\n\n");
}

export default function ResumeAnalyzerDialog({
  academicProfileId = "",
  initialResults = null,
  onClose,
  onEditResume,
  onSaveToNotes,
  resumeBuilder,
  userProfile,
}) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const resultsRef = useRef(null);
  const builderDraft = useMemo(
    () => normalizeResumeDraft(resumeBuilder?.draft, userProfile),
    [resumeBuilder?.draft, userProfile],
  );
  const builderHasContent = hasResumeContent(builderDraft);
  const [source, setSource] = useState(() => builderHasContent ? "builder" : "upload");
  const [resumeText, setResumeText] = useState("");
  const [uploadedText, setUploadedText] = useState("");
  const [uploadedName, setUploadedName] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [fileLoading, setFileLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState(initialResults);
  const [saveStatus, setSaveStatus] = useState("idle");
  const findings = results?.findings?.slice().sort((a, b) => (FINDING_PRIORITY[a.priority] ?? 3) - (FINDING_PRIORITY[b.priority] ?? 3)) || [];
  const [isClosing, setIsClosing] = useState(false);
  const uploadSequence = useRef(0);
  const exitTimer = useRef(null);

  const requestClose = useCallback((afterClose = onClose) => {
    if (exitTimer.current !== null) return;
    setIsClosing(true);
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    exitTimer.current = window.setTimeout(() => {
      exitTimer.current = null;
      afterClose?.();
    }, reducedMotion ? 0 : DIALOG_EXIT_MS);
  }, [onClose]);

  useEffect(() => {
    if (!results) return;
    resultsRef.current?.scrollIntoView({
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
  }, [results]);

  useEffect(() => {
    const releaseScrollLock = acquireDocumentScrollLock();
    const focusFrame = window.requestAnimationFrame(() => closeRef.current?.focus({ preventScroll: true }));
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        requestClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) || []).filter((element) => element.getClientRects().length);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!dialogRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      releaseScrollLock();
      uploadSequence.current += 1;
      window.clearTimeout(exitTimer.current);
    };
  }, [requestClose]);

  const chooseSource = (nextSource) => {
    uploadSequence.current += 1;
    setSource(nextSource);
    setFileLoading(false);
    setError("");
    setResults(null);
    setSaveStatus("idle");
  };

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    const sequence = ++uploadSequence.current;
    setResults(null);
    setSaveStatus("idle");
    setUploadedText("");
    setUploadedName("");
    setError("");
    if (!file) return;

    const accepted = /\.(pdf|txt)$/i.test(file.name);
    if (!accepted || file.size === 0 || file.size > MAX_RESUME_FILE_BYTES) {
      setError("Choose a PDF or .txt resume smaller than 5 MB.");
      event.target.value = "";
      return;
    }

    setFileLoading(true);
    try {
      const response = await api.extractResumeText(file, { academicProfileId });
      if (sequence !== uploadSequence.current) return;
      const text = String(response?.text || "").trim().slice(0, MAX_RESUME_TEXT_LENGTH);
      if (!text) throw new Error("No readable text was found. Try a text-based PDF or paste the resume text.");
      setUploadedText(text);
      setUploadedName(file.name);
    } catch (uploadError) {
      if (sequence !== uploadSequence.current) return;
      setError(uploadError instanceof Error ? uploadError.message : "The resume could not be read.");
      event.target.value = "";
    } finally {
      if (sequence === uploadSequence.current) setFileLoading(false);
    }
  };

  const handleAnalyze = () => {
    setError("");
    setResults(null);
    setSaveStatus("idle");
    if (!jobDescription.trim()) {
      setError("Enter a job role or paste a job description.");
      return;
    }
    if (source === "builder" && !builderHasContent) {
      setError("Add skills, projects, or experience in Resume Builder first, or choose another resume source.");
      return;
    }
    const selectedResumeText = source === "upload" ? uploadedText : resumeText;
    if (source !== "builder" && !selectedResumeText.trim()) {
      setError(source === "upload" ? "Upload a readable resume first." : "Paste your resume text first.");
      return;
    }
    const nextResults = analyzeSkillGap({
      draft: source === "builder" ? builderDraft : null,
      resumeText: source === "builder" ? "" : selectedResumeText,
      jobDescription,
    });
    setResults(nextResults);
  };

  const handleSaveToNotes = async () => {
    if (!results || saveStatus === "saving" || saveStatus === "saved") return;
    setSaveStatus("saving");
    setError("");

    const targetRole = results.targetRole || results.roleNames?.[0] || "Target role";
    const noteTopic = `Resume Review: ${targetRole}`.slice(0, 120);
    const noteDetails = formatResumeReviewNote(results, findings);
    const notePriority = getResumeReviewPriority(findings);
    const timestamp = new Date().toISOString();
    const noteCandidate = {
      id: globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `note-${Date.now()}`,
      topic: noteTopic,
      leftTopics: [],
      details: noteDetails,
      priority: notePriority,
      status: "Open",
      source: "resume-analyzer",
      createdAt: timestamp,
      learningContext: {
        subject: "Placement Preparation",
        chapter: "Resume Review",
        topic: `${noteTopic} (${new Date().toLocaleDateString()})`,
      },
    };

    try {
      if (typeof onSaveToNotes === "function") {
        await onSaveToNotes(noteCandidate);
      } else {
        let saved = false;
        if (typeof api.createNote === "function") {
          try {
            const response = await api.createNote(noteCandidate, { academicProfileId });
            if (response?.created) {
              saved = true;
            }
          } catch {
            // fallback to getNotes + saveNotes
          }
        }
        if (!saved && typeof api.getNotes === "function" && typeof api.saveNotes === "function") {
          const response = await api.getNotes({ academicProfileId }).catch(() => ({ notes: [] }));
          const currentNotes = Array.isArray(response?.notes) ? response.notes : [];
          await api.saveNotes([noteCandidate, ...currentNotes], { academicProfileId });
          saved = true;
        }
        if (!saved && typeof api.createNote !== "function" && typeof api.saveNotes !== "function") {
          throw new Error("Unable to save note. Note service is unavailable.");
        }
      }
      setSaveStatus("saved");
    } catch (saveError) {
      setSaveStatus("idle");
      setError(saveError instanceof Error ? saveError.message : "Could not save review to notes.");
    }
  };

  const content = (
    <div
      className={`resume-analyzer-dialog-backdrop${isClosing ? " is-closing" : ""}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
      role="presentation"
    >
      <section
        aria-labelledby="resume-analyzer-dialog-title"
        aria-modal="true"
        className="resume-analyzer-dialog resume-analyzer-page"
        id="resume-analyzer-dialog"
        ref={dialogRef}
        role="dialog"
      >
        <header className="resume-analyzer-dialog-header">
          <div>
            <h2 id="resume-analyzer-dialog-title">Review your resume for a role</h2>
          </div>
          <button aria-label="Close resume analyzer" className="resume-analyzer-dialog-close" onClick={() => requestClose()} ref={closeRef} type="button"><X size={20} aria-hidden="true" /></button>
        </header>

        <div className="resume-analyzer-dialog-body">

      {!results && (
      <div className="resume-analyzer-layout resume-analyzer-layout--stacked">
        <section className="resume-analyzer-card resume-analyzer-input-card" aria-labelledby="resume-analyzer-resume-title">
          <div className="resume-analyzer-card__heading">
            <span className="resume-analyzer-step">01</span>
            <div><p id="resume-analyzer-resume-title">Choose what you want reviewed.</p></div>
          </div>
          <div className="resume-analyzer-source-grid" role="group" aria-label="Resume source">
            {SOURCE_OPTIONS.map(({ id, label, icon: Icon }) => (
              <button
                aria-pressed={source === id}
                className={source === id ? "resume-analyzer-source is-selected" : "resume-analyzer-source"}
                key={id}
                onClick={() => chooseSource(id)}
                type="button"
              >
                {createElement(Icon, { size: 19, "aria-hidden": "true" })}
                <strong>{label}</strong>
              </button>
            ))}
          </div>

          {source === "builder" && (
            <div className="resume-analyzer-source-panel">
              {builderHasContent ? (
                <><CheckCircle2 size={19} aria-hidden="true" /><div className="resume-analyzer-draft-details"><strong>{builderDraft.personal.fullName || "Name not added"}</strong><span>{builderDraft.personal.headline || "Headline not added"}</span></div></>
              ) : (
                <><FileText size={19} aria-hidden="true" /><p><strong>Your draft has no career details yet.</strong> <button onClick={() => requestClose(onEditResume)} type="button">Add skills or experience</button> to use it here.</p></>
              )}
            </div>
          )}
          {source === "upload" && (
            <label className="resume-analyzer-upload">
              <UploadCloud size={25} aria-hidden="true" />
              <strong>{fileLoading ? "Reading resume…" : uploadedName || "Choose a resume file"}</strong>
              <span>{uploadedName ? "Choose another PDF or .txt file" : "PDF or .txt · maximum 5 MB"}</span>
              <input accept=".pdf,.txt,application/pdf,text/plain" aria-label="Upload resume" disabled={fileLoading} onChange={handleUpload} type="file" />
            </label>
          )}
          {source === "paste" && (
            <label className="resume-analyzer-field resume-analyzer-paste-field">
              <span>Resume text</span>
              <textarea
                maxLength={MAX_RESUME_TEXT_LENGTH}
                onChange={(event) => { setResumeText(event.target.value); setResults(null); setError(""); }}
                placeholder="Paste your resume content here…"
                rows={4}
                value={resumeText}
              />
            </label>
          )}
        </section>

        <section className="resume-analyzer-card resume-analyzer-input-card resume-analyzer-job-card" aria-labelledby="resume-analyzer-job-title">
          <div className="resume-analyzer-card__heading">
            <span className="resume-analyzer-step">02</span>
            <div><p id="resume-analyzer-job-title">Enter a job title or paste its requirements.</p></div>
          </div>
          <div className="resume-analyzer-field resume-analyzer-job-field">
            <textarea
              aria-label="Job role or description"
              maxLength={MAX_JOB_DESCRIPTION_LENGTH}
              onChange={(event) => { setJobDescription(event.target.value); setResults(null); setError(""); }}
              placeholder="e.g. Software developer, or paste a job description…"
              rows={1}
              value={jobDescription}
            />
          </div>
          <div className="resume-analyzer-actions">
            <button disabled={fileLoading} onClick={handleAnalyze} type="button"><FileSearch size={16} aria-hidden="true" /> Review</button>
          </div>
        </section>
      </div>
      )}

      {error && <div className="resume-analyzer-message" role="alert">{error}</div>}

      {results && (
        <section className="resume-analyzer-results" aria-label="Resume review results" aria-live="polite" ref={resultsRef}>
          <div className="resume-analyzer-results-heading">
            <div>
              <span className="resume-analyzer-eyebrow">{results.targetRole || (results.roleNames?.[0] || "Target role")}</span>
              <h2>Where your resume can improve</h2>
            </div>
            <div className="resume-analyzer-results-actions">
              <button
                aria-label={saveStatus === "saved" ? "Saved to notes" : "Save review to notes"}
                className={`resume-analyzer-save-button${saveStatus === "saved" ? " is-saved" : ""}`}
                disabled={saveStatus === "saving" || saveStatus === "saved"}
                onClick={handleSaveToNotes}
                type="button"
              >
                {saveStatus === "saved" ? (
                  <>
                    <Check aria-hidden="true" size={15} />
                    <span>Saved</span>
                  </>
                ) : saveStatus === "saving" ? (
                  <span>Saving...</span>
                ) : (
                  <>
                    <Save aria-hidden="true" size={15} />
                    <span>Save</span>
                  </>
                )}
              </button>
              {source === "builder" && onEditResume && (
                <button className="resume-analyzer-edit-button" onClick={() => requestClose(onEditResume)} type="button">
                  Edit resume
                </button>
              )}
            </div>
          </div>
          {findings.length ? (
            <ol className="resume-analyzer-findings">
              {findings.map((finding) => (
                <li className={`resume-analyzer-finding resume-analyzer-finding--${finding.priority}`} key={finding.id}>
                  <div className="resume-analyzer-finding__top">
                    <span className="resume-analyzer-finding__category">{finding.category}</span>
                    <span className="resume-analyzer-finding__priority">{finding.priority} priority</span>
                  </div>
                  <h3>{finding.title}</h3>
                  {finding.evidence && <p className="resume-analyzer-finding__evidence"><strong>What I found:</strong> {finding.evidence}</p>}
                  <p className="resume-analyzer-finding__suggestion"><strong>Improve it:</strong> {finding.suggestion}</p>
                  {finding.example && <p className="resume-analyzer-finding__example"><strong>Example structure:</strong> {finding.example}</p>}
                </li>
              ))}
            </ol>
          ) : <p className="resume-analyzer-result-empty">No clear issues were found in the text provided. Review the role requirements below and check your resume manually before applying.</p>}
          {results.requestedSkills.length > 0 ? (
            <div className="resume-analyzer-result-panel resume-analyzer-role-panel">
              <div className="resume-analyzer-role-heading">
                <h3>Role requirement check</h3>
                <p>{results.inputType === "role" ? "Common skills for this role; a job posting gives a more precise comparison." : "Skills explicitly mentioned in the job description."}</p>
              </div>
              {[
                { label: "Not shown", items: results.notShown, tone: "missing" },
                { label: "Mentioned without an example", items: results.needsEvidence, tone: "evidence" },
                { label: "Supported by an example", items: results.matched, tone: "supported" },
              ].filter(({ items }) => items.length > 0).map(({ label, items, tone }) => (
                <div className="resume-analyzer-skill-group" key={tone}>
                  <h4>{label} <span>{items.length}</span></h4>
                  <ul className="resume-analyzer-skill-list">
                    {items.map(({ skill, action }) => <li className={`resume-analyzer-skill resume-analyzer-skill--${tone}`} key={skill}><strong>{skill}</strong><span>{action}</span></li>)}
                  </ul>
                </div>
              ))}
            </div>
          ) : <p className="resume-analyzer-role-note">No specific skills could be identified from that role description. Paste a job posting for a more tailored comparison.</p>}
        </section>
      )}
        </div>
      </section>
    </div>
  );
  return typeof document === "undefined" ? content : createPortal(content, document.body);
}
