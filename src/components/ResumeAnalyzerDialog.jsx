import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CheckCircle2,
  ClipboardPaste,
  FileSearch,
  FileText,
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

export default function ResumeAnalyzerDialog({ academicProfileId = "", onClose, onEditResume, resumeBuilder, userProfile }) {
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
  const [results, setResults] = useState(null);
  const foundSkills = results ? [...results.matched, ...results.needsEvidence] : [];
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
    if (!results?.requestedSkills.length) return;
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
  };

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    const sequence = ++uploadSequence.current;
    setResults(null);
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
    if (!nextResults.requestedSkills.length) {
      setError("Couldn’t identify the role or its skills. Try a more specific job title or paste the requirements.");
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
            <h2 id="resume-analyzer-dialog-title">Find skills missing from your resume for a job role or description.</h2>
          </div>
          <button aria-label="Close resume analyzer" className="resume-analyzer-dialog-close" onClick={() => requestClose()} ref={closeRef} type="button"><X size={20} aria-hidden="true" /></button>
        </header>

        <div className="resume-analyzer-dialog-body">

      <div className="resume-analyzer-layout">
        <section className="resume-analyzer-card resume-analyzer-input-card" aria-labelledby="resume-analyzer-resume-title">
          <div className="resume-analyzer-card__heading">
            <span className="resume-analyzer-step">01</span>
            <div><h2 id="resume-analyzer-resume-title">Your resume</h2><p>Choose what to compare against the role.</p></div>
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
                rows={6}
                value={resumeText}
              />
            </label>
          )}
        </section>

        <section className="resume-analyzer-card resume-analyzer-input-card" aria-labelledby="resume-analyzer-job-title">
          <div className="resume-analyzer-card__heading">
            <span className="resume-analyzer-step">02</span>
            <div><h2 id="resume-analyzer-job-title">Job role or description</h2><p>Enter a job title or paste its requirements.</p></div>
          </div>
          <div className="resume-analyzer-field resume-analyzer-job-field">
            <textarea
              aria-label="Job role or description"
              maxLength={MAX_JOB_DESCRIPTION_LENGTH}
              onChange={(event) => { setJobDescription(event.target.value); setResults(null); setError(""); }}
              placeholder="e.g. Software developer, or paste a job description…"
              rows={7}
              value={jobDescription}
            />
          </div>
          <div className="resume-analyzer-actions">
            <button disabled={fileLoading} onClick={handleAnalyze} type="button"><FileSearch size={18} aria-hidden="true" /> Find Missing Skills</button>
          </div>
        </section>
      </div>

      {error && <div className="resume-analyzer-message" role="alert">{error}</div>}

      {results && results.requestedSkills.length > 0 && (
        <section className="resume-analyzer-results" aria-label="Skill gap results" aria-live="polite" ref={resultsRef}>
          <div className="resume-analyzer-result-panel">
            <h2>Missing from your resume</h2>
            {results.notShown.length ? (
              <ul className="resume-analyzer-skill-list">
                {results.notShown.map(({ skill }) => <li key={skill}>{skill}</li>)}
              </ul>
            ) : <p className="resume-analyzer-result-empty">No missing skills found.</p>}
          </div>
          {foundSkills.length > 0 && (
            <div className="resume-analyzer-result-panel resume-analyzer-result-panel--found">
              <h3>Found in your resume</h3>
              <ul className="resume-analyzer-skill-list">
                {foundSkills.map(({ skill }) => <li key={skill}>{skill}</li>)}
              </ul>
            </div>
          )}
          {results.inputType === "role" && <p className="resume-analyzer-role-note">These are common skills for the role. Check the job posting for exact requirements.</p>}
        </section>
      )}
        </div>
      </section>
    </div>
  );
  return typeof document === "undefined" ? content : createPortal(content, document.body);
}
