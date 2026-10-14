import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardPaste,
  CircleHelp,
  FileSearch,
  FileText,
  LoaderCircle,
  Plus,
  Save,
  ShieldCheck,
  UploadCloud,
  X,
} from "lucide-react";
import api from "../utils/apiClient";
import { acquireDocumentScrollLock } from "../utils/documentScrollLock";
import { normalizeResumeDraft } from "../utils/resumeBuilder";
import { analyzeSkillGap } from "../utils/skillGapAnalysis";
import { analyzeResumeEligibility } from "../utils/resumeEligibilityAnalysis";
import { formatResumeReviewNote, getResumeReviewPriority } from "../utils/resumeReviewNotes";
import CometDial from "./CometDial";
import "./ResumeAnalyzerDialog.css";

const MAX_RESUME_FILE_BYTES = 5 * 1024 * 1024;
const MAX_RESUME_TEXT_LENGTH = 50000;
const MAX_JOB_DESCRIPTION_LENGTH = 12000;
const DIALOG_EXIT_MS = 260;
const FINDING_PRIORITY = { high: 0, medium: 1, low: 2 };
const ELIGIBILITY_STATUS_LABELS = {
  evidence: "Evidence found",
  "not-shown": "Not shown",
  review: "Review manually",
  manual: "Check manually",
};

function getEligibilityDialColors(score) {
  const numericScore = Number(score);
  if (!Number.isFinite(numericScore)) {
    return {
      accent: "var(--ra-accent)",
      ink: "color-mix(in srgb, var(--text, #eef3fb) 45%, transparent)",
    };
  }

  const accent = numericScore <= 25
    ? "#ef4444"
    : numericScore <= 50
      ? "#f97316"
      : numericScore <= 75
        ? "#eab308"
        : "#22c55e";

  return {
    accent,
    ink: `color-mix(in srgb, ${accent} 48%, var(--text, #eef3fb))`,
  };
}

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

export default function ResumeAnalyzerDialog({
  academicProfileId = "",
  autoAnalyze = true,
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
  const builderHeadline = builderDraft.personal.headline.trim();
  const canAnalyzeDraft = autoAnalyze && builderHasContent && Boolean(builderHeadline);
  const [source, setSource] = useState(() => builderHasContent ? "builder" : "upload");
  const [resumeText, setResumeText] = useState("");
  const [uploadedText, setUploadedText] = useState("");
  const [uploadedName, setUploadedName] = useState("");
  const [jobDescription, setJobDescription] = useState(builderHeadline);
  const [targetInputEdited, setTargetInputEdited] = useState(false);
  const [isDraggingResume, setIsDraggingResume] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [error, setError] = useState(() => !initialResults && autoAnalyze && builderHasContent && !builderHeadline
    ? "Add a professional headline to your draft or enter a job role below."
    : "");
  const [results, setResults] = useState(initialResults);
  const [resultSource, setResultSource] = useState(source);
  const [view, setView] = useState(() => initialResults ? "results" : canAnalyzeDraft ? "loading" : "inputs");
  const [analysisRequest, setAnalysisRequest] = useState(() => !initialResults && canAnalyzeDraft ? {
    draft: builderDraft,
    resumeText: "",
    jobDescription: builderHeadline,
    source: "builder",
    automatic: true,
  } : null);
  const [saveStatus, setSaveStatus] = useState("idle");
  const findings = results?.findings?.slice().sort((a, b) => (FINDING_PRIORITY[a.priority] ?? 3) - (FINDING_PRIORITY[b.priority] ?? 3)) || [];
  const eligibility = results?.eligibilityReview || analyzeResumeEligibility();
  const isRoleProfileEligibility = eligibility.basis === "role-profile";
  const isHybridEligibility = eligibility.basis === "hybrid";
  const eligibilityTargetRole = eligibility.targetRole || results?.targetRole || results?.roleNames?.[0] || "this role";
  const eligibilityDialColors = getEligibilityDialColors(eligibility.score);
  const [isClosing, setIsClosing] = useState(false);
  const [eligibilityHelpOpen, setEligibilityHelpOpen] = useState(false);
  const [openEligibilityIds, setOpenEligibilityIds] = useState(() => new Set());
  const [showAllFindings, setShowAllFindings] = useState(false);
  const uploadSequence = useRef(0);
  const resumeDropDepth = useRef(0);
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
    if (!analysisRequest || isClosing) return;
    const timer = window.setTimeout(() => {
      try {
        const nextResults = analyzeSkillGap(analysisRequest);
        const eligibilityReview = analyzeResumeEligibility({
          draft: analysisRequest.draft,
          resumeText: analysisRequest.resumeText,
          jobDescription: analysisRequest.jobDescription,
          roleAnalysis: nextResults,
        });
        setResults({
          ...nextResults,
          targetRole: eligibilityReview.targetRole || nextResults.targetRole || analysisRequest.jobDescription,
          eligibilityReview,
        });
        setResultSource(analysisRequest.source);
        setSaveStatus("idle");
        setEligibilityHelpOpen(false);
        setOpenEligibilityIds(new Set());
        setShowAllFindings(false);
        setView("results");
      } catch (analysisError) {
        setError(analysisError instanceof Error ? analysisError.message : "The resume could not be analyzed. Please try again.");
        setView("inputs");
      }
      setAnalysisRequest(null);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [analysisRequest, isClosing]);

  useEffect(() => {
    if (!results || view !== "results") return;
    resultsRef.current?.scrollIntoView({
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
  }, [results, view]);

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
    resumeDropDepth.current = 0;
    setIsDraggingResume(false);
    setSource(nextSource);
    if (!targetInputEdited && nextSource !== "builder" && jobDescription.trim() === builderHeadline) {
      setJobDescription("");
    }
    if (!targetInputEdited && nextSource === "builder" && !jobDescription.trim()) {
      setJobDescription(builderHeadline);
    }
    setFileLoading(false);
    setError("");
  };

  const openSpecifications = () => {
    uploadSequence.current += 1;
    setAnalysisRequest(null);
    setFileLoading(false);
    setError("");
    setView("inputs");
  };

  const returnToResults = () => {
    uploadSequence.current += 1;
    setFileLoading(false);
    setError("");
    setView("results");
  };

  const toggleEligibilityCriterion = (criterionId) => {
    setOpenEligibilityIds((openIds) => {
      const nextOpenIds = new Set(openIds);
      if (nextOpenIds.has(criterionId)) {
        nextOpenIds.delete(criterionId);
      } else {
        nextOpenIds.add(criterionId);
      }
      return nextOpenIds;
    });
  };

  const readResumeFile = async (file) => {
    const sequence = ++uploadSequence.current;
    setUploadedText("");
    setUploadedName("");
    setError("");
    if (!file) return;

    const accepted = /\.(pdf|txt)$/i.test(file.name);
    if (!accepted || file.size === 0 || file.size > MAX_RESUME_FILE_BYTES) {
      setError("Choose a PDF or .txt resume smaller than 5 MB.");
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
    } finally {
      if (sequence === uploadSequence.current) setFileLoading(false);
    }
  };

  const handleUpload = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    void readResumeFile(file);
  };

  const handleResumeDragEnter = (event) => {
    event.preventDefault();
    resumeDropDepth.current += 1;
    setIsDraggingResume(true);
  };

  const handleResumeDragLeave = (event) => {
    event.preventDefault();
    resumeDropDepth.current = Math.max(0, resumeDropDepth.current - 1);
    if (resumeDropDepth.current === 0) setIsDraggingResume(false);
  };

  const handleResumeDrop = (event) => {
    event.preventDefault();
    resumeDropDepth.current = 0;
    setIsDraggingResume(false);
    void readResumeFile(event.dataTransfer?.files?.[0]);
  };

  const handleAnalyze = () => {
    setError("");
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
    setAnalysisRequest({
      draft: source === "builder" ? builderDraft : null,
      resumeText: source === "builder" ? "" : selectedResumeText,
      jobDescription: jobDescription.trim(),
      source,
    });
    setView("loading");
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
          <div className="resume-analyzer-dialog-controls">
            {view === "inputs" ? results && <button
              className="resume-analyzer-back-button"
              disabled={isClosing}
              onClick={returnToResults}
              type="button"
            >Back to results</button> : <button
              aria-label="New resume analysis"
              className="resume-analyzer-new-button"
              disabled={isClosing || saveStatus === "saving"}
              onClick={openSpecifications}
              title="Choose a resume and target role"
              type="button"
            ><Plus size={18} aria-hidden="true" /></button>}
            <button aria-label="Close resume analyzer" className="resume-analyzer-dialog-close" onClick={() => requestClose()} ref={closeRef} type="button"><X size={18} aria-hidden="true" /></button>
          </div>
        </header>

        <div className="resume-analyzer-dialog-body">

      {view === "loading" && (
        <div className="resume-analyzer-loading" aria-live="polite" role="status">
          <LoaderCircle className="spinner" aria-hidden="true" size={26} />
          <p>{analysisRequest?.automatic ? `Analyzing your draft for ${analysisRequest.jobDescription}…` : "Analyzing your resume…"}</p>
        </div>
      )}

      {view === "inputs" && (
      <div className="resume-analyzer-layout resume-analyzer-layout--stacked" id="resume-analyzer-specifications">
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
            <label
              className={`resume-analyzer-upload${isDraggingResume ? " is-dragging" : ""}`}
              onDragEnter={handleResumeDragEnter}
              onDragLeave={handleResumeDragLeave}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleResumeDrop}
            >
              <UploadCloud size={25} aria-hidden="true" />
              <strong>{fileLoading ? "Reading resume…" : uploadedName || (isDraggingResume ? "Drop your resume here" : "Drop a resume here or choose a file")}</strong>
              <span>{uploadedName ? "Drop or choose another PDF or .txt file" : "PDF or .txt · maximum 5 MB"}</span>
              <input accept=".pdf,.txt,application/pdf,text/plain" aria-label="Upload resume" disabled={fileLoading} onChange={handleUpload} type="file" />
            </label>
          )}
          {source === "paste" && (
            <label className="resume-analyzer-field resume-analyzer-paste-field">
              <span>Resume text</span>
              <textarea
                maxLength={MAX_RESUME_TEXT_LENGTH}
                onChange={(event) => { setResumeText(event.target.value); setError(""); }}
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
              onChange={(event) => { setTargetInputEdited(true); setJobDescription(event.target.value); setError(""); }}
              placeholder="e.g. Software developer, or paste a job description…"
              rows={1}
              value={jobDescription}
            />
            <p className="resume-analyzer-job-hint">A job title compares common role skills. A full job description also checks its named qualifications, experience, credentials, and skills.</p>
          </div>
          <div className="resume-analyzer-actions">
            <button disabled={fileLoading} onClick={handleAnalyze} type="button"><FileSearch size={16} aria-hidden="true" /> Review</button>
          </div>
        </section>
      </div>
      )}

      {error && <div className="resume-analyzer-message" role="alert">{error}</div>}

      {view === "results" && results && (
        <section className="resume-analyzer-results" aria-label="Resume review results" aria-live="polite" ref={resultsRef}>
          <div className="resume-analyzer-results-heading">
            <div>
              <span className="resume-analyzer-eyebrow">{results.targetRole || (results.roleNames?.[0] || "Target role")}</span>
                  <h2>Your role review</h2>
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
              {resultSource === "builder" && onEditResume && (
                <button className="resume-analyzer-edit-button" onClick={() => requestClose(onEditResume)} type="button">
                  Edit resume
                </button>
              )}
            </div>
          </div>
          <section className="resume-analyzer-eligibility" aria-labelledby="resume-analyzer-eligibility-title">
            <div className="resume-analyzer-eligibility__header">
              <div className="resume-analyzer-eligibility__title">
                <span className="resume-analyzer-eligibility__icon"><ShieldCheck size={19} aria-hidden="true" /></span>
                <div>
                  {!isRoleProfileEligibility && <span className="resume-analyzer-eligibility__eyebrow">{isHybridEligibility ? "Role + job requirements" : "Job requirements"}</span>}
                  <h3 id="resume-analyzer-eligibility-title">Eligibility check</h3>
                </div>
              </div>
              <button
                aria-expanded={eligibilityHelpOpen}
                aria-controls="resume-analyzer-eligibility-help"
                className="resume-analyzer-help-toggle"
                onClick={() => setEligibilityHelpOpen((open) => !open)}
                type="button"
              >
                <CircleHelp size={16} aria-hidden="true" />
                <span>{eligibilityHelpOpen ? "Hide details" : "How this works"}</span>
              </button>
            </div>
            <div className="resume-analyzer-eligibility__summary">
              {eligibility.score !== null ? (
                <CometDial
                  accent={eligibilityDialColors.accent}
                  className="resume-analyzer-eligibility-dial"
                  figureSize="29px"
                  ink={eligibilityDialColors.ink}
                  label={isRoleProfileEligibility
                    ? `${eligibilityTargetRole} role match based on resume evidence`
                    : isHybridEligibility
                      ? `${eligibilityTargetRole} role and job requirements with resume evidence`
                      : "Job requirements with evidence in the resume"}
                  readOnly
                  size={146}
                  speed={48}
                  sublabel={eligibility.scoreLabel || "evidence found"}
                  thickness={5}
                  unit="%"
                  value={eligibility.score}
                />
              ) : (
                <div className="resume-analyzer-eligibility-unassessed">
                  <span><ShieldCheck size={23} aria-hidden="true" /></span>
                  <strong>{eligibility.criteria.length ? "Manual review" : "Not assessed"}</strong>
                  <small>{eligibility.criteria.length ? "No criteria can be scored automatically" : "Enter a recognized role or paste a job description"}</small>
                </div>
              )}
              <div className="resume-analyzer-eligibility__copy">
                {eligibility.score !== null ? isRoleProfileEligibility ? (
                  <>
                    <strong>{eligibility.evidenceCount} of {eligibility.roleSkillCount} common {eligibilityTargetRole} skill{eligibility.roleSkillCount === 1 ? " has" : "s have"} a concrete example</strong>
                    <p>{eligibility.mentionedCount > 0
                      ? `${eligibility.mentionedCount} skill${eligibility.mentionedCount === 1 ? " is" : "s are"} mentioned but need a clearer project or experience example. Review the details below.`
                      : "The score uses concrete project and experience evidence from the resume."}</p>
                  </>
                ) : (
                  <>
                    <strong>{eligibility.evidenceCount} of {eligibility.checkableCount} {isHybridEligibility ? "role and job criteria" : "requirement"}{isHybridEligibility ? " have" : eligibility.checkableCount === 1 ? " has" : "s have"} resume evidence</strong>
                    <p>{eligibility.reviewCount > 0
                      ? `${eligibility.reviewCount} item${eligibility.reviewCount === 1 ? " needs" : "s need"} a manual check. Review the details below before applying.`
                      : isHybridEligibility
                        ? "The score combines the role profile with the requirements named in the posting."
                        : "Review the requirement details below to confirm each item."}</p>
                  </>
                ) : (
                  <>
                    <strong>{eligibility.criteria.length ? "Some requirements need your review" : "Add a clearer role or job description"}</strong>
                    <p>{eligibility.criteria.length
                      ? `${eligibility.reviewCount} requirement${eligibility.reviewCount === 1 ? " needs" : "s need"} a manual check. This tool does not decide eligibility.`
                      : "A recognized role title compares common role skills. A full job description gives a more precise requirement check."}</p>
                  </>
                )}
                <p className="resume-analyzer-eligibility__note">“Not shown” means the resume does not mention it; it does not mean you are ineligible.</p>
              </div>
            </div>
            <div className="resume-analyzer-eligibility-help" hidden={!eligibilityHelpOpen} id="resume-analyzer-eligibility-help">
              {isRoleProfileEligibility
                ? `For a role title, the dial compares your resume with common ${eligibilityTargetRole} skills. Concrete project or experience examples carry the most weight; a skill listed without an example receives partial credit.`
                : isHybridEligibility
                  ? `The dial combines common ${eligibilityTargetRole} skills with the explicit requirements in the job description. A skill named in the posting is counted once. Location and work authorization still need your confirmation.`
                  : "For a job description, the dial compares named skills and explicit, checkable requirements with resume evidence. Location and work authorization require your own confirmation. Missing information is flagged for review, never treated as an automatic rejection."}
            </div>
            {eligibility.criteria.length > 0 ? (
              <div className="resume-analyzer-eligibility-list" aria-label="Eligibility requirement details">
                {eligibility.criteria.map((criterion) => {
                  const isOpen = openEligibilityIds.has(criterion.id);
                  const detailId = `resume-analyzer-eligibility-detail-${criterion.id}`;

                  return (
                    <article className={`resume-analyzer-eligibility-item is-${criterion.status}${isOpen ? " is-open" : ""}`} key={criterion.id}>
                      <button
                        aria-controls={detailId}
                        aria-expanded={isOpen}
                        className="resume-analyzer-eligibility-item__trigger"
                        onClick={() => toggleEligibilityCriterion(criterion.id)}
                        type="button"
                      >
                        <span className={`resume-analyzer-eligibility-status is-${criterion.status}`}>{ELIGIBILITY_STATUS_LABELS[criterion.status]}</span>
                        <span className="resume-analyzer-eligibility-item__title">{criterion.title}</span>
                        <ChevronDown className="resume-analyzer-eligibility-chevron" size={17} aria-hidden="true" />
                      </button>
                      <div className="resume-analyzer-eligibility-item__detail-wrap" id={detailId}>
                        <div className="resume-analyzer-eligibility-item__detail">
                          <p><strong>{criterion.source === "role-profile" ? "Role profile looks for:" : criterion.type === "skill" ? "Job mentions:" : "Job asks:"}</strong> {criterion.requirement}</p>
                          {criterion.evidence && <p><strong>Resume evidence:</strong> {criterion.evidence}</p>}
                          <p>{criterion.note}</p>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="resume-analyzer-eligibility-empty">No role profile or explicit job requirements could be identified. Enter a clearer role title or paste the full job description.</p>
            )}
          </section>
          {findings.length ? (
            <>
              <div className="resume-analyzer-findings-heading">
                <div>
                  <span className="resume-analyzer-eligibility__eyebrow">Resume feedback</span>
                  <h3>Where your resume can improve</h3>
                </div>
                <span>{findings.length} item{findings.length === 1 ? "" : "s"}</span>
              </div>
              <ol className="resume-analyzer-findings">
              {(showAllFindings ? findings : findings.slice(0, 3)).map((finding) => (
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
              {findings.length > 3 && (
                <button className="resume-analyzer-show-findings" onClick={() => setShowAllFindings((show) => !show)} type="button">
                  {showAllFindings ? "Show top 3" : `Show all ${findings.length} suggestions`}
                </button>
              )}
            </>
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
