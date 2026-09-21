import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CheckCircle2,
  ClipboardPaste,
  FileSearch,
  FileText,
  Lightbulb,
  ListChecks,
  ShieldCheck,
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
    || draft.certifications.some((item) => item.name),
  );
}

const SOURCE_OPTIONS = [
  { id: "builder", label: "Current draft", icon: FileText },
  { id: "upload", label: "Upload resume", icon: UploadCloud },
  { id: "paste", label: "Paste text", icon: ClipboardPaste },
];

const RESULT_GROUPS = [
  {
    id: "matched",
    title: "Supported in your resume",
    subtitle: "The resume gives a concrete example of these requirements.",
    icon: CheckCircle2,
    empty: "No requirements have clear supporting examples yet.",
  },
  {
    id: "needsEvidence",
    title: "Add stronger evidence",
    subtitle: "These appear in your resume, but need an experience or project example.",
    icon: ListChecks,
    empty: "No skills are waiting for stronger evidence.",
  },
  {
    id: "notShown",
    title: "Not shown in your resume",
    subtitle: "The job mentions these, but this resume does not. You may already know them.",
    icon: Lightbulb,
    empty: "Every recognized requirement appears somewhere in your resume.",
  },
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
      setError("Paste the job description to compare its requirements with your resume.");
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
      setError("No specific skills were recognized in that job description. Try including its requirements or qualifications section.");
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
            <h2 id="resume-analyzer-dialog-title">Compare your resume with a job description and see where to add clearer proof of your skills.</h2>
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
            <div><h2 id="resume-analyzer-job-title">Target job description</h2><p>Paste the role&apos;s requirements and qualifications.</p></div>
          </div>
          <div className="resume-analyzer-field resume-analyzer-job-field">
            <textarea
              aria-label="Target job description"
              maxLength={MAX_JOB_DESCRIPTION_LENGTH}
              onChange={(event) => { setJobDescription(event.target.value); setResults(null); setError(""); }}
              placeholder="Paste the job description, especially its skills and requirements…"
              rows={7}
              value={jobDescription}
            />
          </div>
          <div className="resume-analyzer-actions">
            <span>Comparison uses the text you provide.</span>
            <button disabled={fileLoading} onClick={handleAnalyze} type="button"><FileSearch size={18} aria-hidden="true" /> Check Skill Gaps</button>
          </div>
        </section>
      </div>

      {error && <div className="resume-analyzer-message" role="alert">{error}</div>}

      {results && results.requestedSkills.length > 0 && (
        <section className="resume-analyzer-results" aria-label="Skill gap results" aria-live="polite" ref={resultsRef}>
          <header className="resume-analyzer-results__heading">
            <div><span className="resume-analyzer-eyebrow">Comparison complete</span><h2>What this role asks for</h2><p>{results.requestedSkills.length} specific requirements recognized in the job description.</p></div>
            <span className="resume-analyzer-results__count">{results.requestedSkills.length} skills reviewed</span>
          </header>
          <div className="resume-analyzer-result-grid">
            {RESULT_GROUPS.map(({ id, title, subtitle, icon: Icon, empty }) => (
              <section className={`resume-analyzer-result-group resume-analyzer-result-group--${id}`} key={id}>
                <header><span className="resume-analyzer-result-group__icon">{createElement(Icon, { size: 18, "aria-hidden": "true" })}</span><div><h3>{title}</h3><p>{subtitle}</p></div><b>{results[id].length}</b></header>
                <div className="resume-analyzer-result-list">
                  {results[id].length ? results[id].map((item) => (
                    <article className="resume-analyzer-result-item" key={item.skill}>
                      <strong>{item.skill}</strong>
                      {item.requirement && <p><span>Job:</span> {item.requirement}</p>}
                      {item.evidence && <p><span>Resume:</span> {item.evidence}</p>}
                      {item.action && <small>{item.action}</small>}
                    </article>
                  )) : <p className="resume-analyzer-result-empty">{empty}</p>}
                </div>
              </section>
            ))}
          </div>
          <p className="resume-analyzer-caveat"><ShieldCheck size={16} aria-hidden="true" /> This checks explicit wording in the supplied text. “Not shown” means the resume did not mention a recognized skill; it does not measure your ability.</p>
        </section>
      )}
        </div>
      </section>
    </div>
  );
  return typeof document === "undefined" ? content : createPortal(content, document.body);
}
