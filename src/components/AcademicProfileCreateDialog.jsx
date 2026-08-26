import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  LoaderCircle,
  Sparkles,
  UserRoundPlus,
  X,
} from "lucide-react";
import { toast } from "react-toastify";
import {
  ACADEMIC_LEVEL_OPTIONS,
  DEPARTMENT_OPTIONS,
  SCHOOL_CLASS_OPTIONS,
  TRACK_OPTIONS,
  isSchoolAcademicLevel,
} from "../utils/academicProfile";
import {
  buildAcademicProfileCreationPayload,
  validateAcademicProfileCreationDraft,
} from "../utils/academicProfileCreation";
import "./AcademicProfileCreateDialog.css";

const ACADEMIC_PROFILE_CREATE_EXIT_MS = 460;

const EMPTY_ACADEMIC_PROFILE = Object.freeze({
  academicLevel: "Undergraduate / Bachelor's",
  academicTrack: "General",
  degree: "",
  department: "Computer Science",
  grade: "",
  institutionName: "",
});

function createDraft(institutionName = "") {
  return {
    ...EMPTY_ACADEMIC_PROFILE,
    institutionName: String(institutionName || "").trim(),
  };
}

function focusableElements(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )).filter((element) => !element.hasAttribute("hidden"));
}

export default function AcademicProfileCreateDialog({
  activeProfile = {},
  institutionName = "",
  onClose,
  onCreateAcademicProfile,
  open = false,
  returnFocusRef,
}) {
  const currentProfileName = activeProfile?.displayName || activeProfile?.label || "Profile A";
  const [draft, setDraft] = useState(() => createDraft(institutionName));
  const [entered, setEntered] = useState(false);
  const [error, setError] = useState("");
  const [rendered, setRendered] = useState(open);
  const [submitting, setSubmitting] = useState(false);
  const closeTimerRef = useRef(null);
  const dialogRef = useRef(null);
  const focusReturnRef = useRef(null);
  const institutionInputRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const openFrameRef = useRef(null);
  const wasOpenRef = useRef(false);

  const schoolProfile = useMemo(
    () => isSchoolAcademicLevel(draft.academicLevel),
    [draft.academicLevel],
  );

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (open) {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
      if (!wasOpenRef.current) {
        focusReturnRef.current = returnFocusRef?.current
          || (typeof document !== "undefined" ? document.activeElement : null);
        setDraft(createDraft(institutionName));
        setError("");
        setSubmitting(false);
      }
      wasOpenRef.current = true;
      setRendered(true);
      return undefined;
    }

    wasOpenRef.current = false;
    setEntered(false);
    if (rendered) {
      closeTimerRef.current = window.setTimeout(
        () => setRendered(false),
        ACADEMIC_PROFILE_CREATE_EXIT_MS,
      );
    }
    return () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    };
  }, [institutionName, open, rendered, returnFocusRef]);

  useEffect(() => {
    if (!open || !rendered) return undefined;
    openFrameRef.current = window.requestAnimationFrame(() => {
      setEntered(true);
      institutionInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(openFrameRef.current);
  }, [open, rendered]);

  useEffect(() => {
    if (!rendered || typeof document === "undefined") return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      const focusTarget = focusReturnRef.current;
      if (typeof focusTarget?.focus === "function") focusTarget.focus();
    };
  }, [rendered]);

  useEffect(() => {
    if (!open || !rendered || typeof document === "undefined") return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!submitting) onCloseRef.current?.("escape");
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = focusableElements(dialogRef.current);
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, rendered, submitting]);

  const updateField = (field, value) => {
    setError("");
    setDraft((current) => {
      if (field !== "academicLevel") return { ...current, [field]: value };

      const currentIsSchool = isSchoolAcademicLevel(current.academicLevel);
      const nextIsSchool = isSchoolAcademicLevel(value);
      return {
        ...current,
        academicLevel: value,
        department: nextIsSchool
          ? ""
          : currentIsSchool ? "Computer Science" : current.department,
        degree: nextIsSchool || currentIsSchool ? "" : current.degree,
        grade: nextIsSchool && currentIsSchool ? current.grade : "",
        academicTrack: currentIsSchool !== nextIsSchool ? "General" : current.academicTrack,
      };
    });
  };

  const requestClose = (reason) => {
    if (!submitting) onCloseRef.current?.(reason);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    const validationError = validateAcademicProfileCreationDraft(draft, activeProfile);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!onCreateAcademicProfile) {
      setError("Profile creation is unavailable right now. Please try again shortly.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      await onCreateAcademicProfile(buildAcademicProfileCreationPayload(draft));
      toast.success("Profile B is ready. Your new workspace is now active.");
      onCloseRef.current?.("created");
    } catch (creationError) {
      setError(creationError?.message || "Could not create Profile B. Please try again.");
      setSubmitting(false);
    }
  };

  if (!rendered || typeof document === "undefined") return null;

  return createPortal(
    <div
      aria-hidden={!open}
      className={`academic-profile-create-layer${entered ? " is-visible" : " is-closing"}`}
      inert={!open ? true : undefined}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose("backdrop");
      }}
      role="presentation"
    >
      <section
        aria-busy={submitting}
        aria-labelledby="academic-profile-create-title"
        aria-modal="true"
        className="academic-profile-create-dialog"
        id="academic-profile-create-dialog"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="academic-profile-create-header">
          <div className="academic-profile-create-mark">
            <UserRoundPlus aria-hidden="true" size={23} />
          </div>
          <div>
            <span><Sparkles aria-hidden="true" size={13} /> Second learning workspace</span>
            <h2 id="academic-profile-create-title">Create Profile B</h2>
          </div>
          <button
            aria-label="Close Profile B setup"
            className="academic-profile-create-close"
            disabled={submitting}
            onClick={() => requestClose("close")}
            title="Close"
            type="button"
          >
            <X aria-hidden="true" size={19} />
          </button>
        </header>

        <div className="academic-profile-create-context" aria-label="Profile relationship">
          <span><b>A</b><small>Current</small> {currentProfileName}</span>
          <ArrowRight aria-hidden="true" size={18} />
          <span className="is-next"><b>B</b><small>New</small> Profile B</span>
        </div>

        <form className="academic-profile-create-form" onSubmit={handleSubmit}>
          <div className="academic-profile-create-fields">
            <label className="is-full" htmlFor="profile-b-institution">
              <span>Institution name</span>
              <input
                autoComplete="organization"
                id="profile-b-institution"
                onChange={(event) => updateField("institutionName", event.target.value)}
                placeholder="School or college name"
                ref={institutionInputRef}
                value={draft.institutionName}
              />
            </label>

            <label htmlFor="profile-b-academic-level">
              <span>Academic stage</span>
              <select
                id="profile-b-academic-level"
                onChange={(event) => updateField("academicLevel", event.target.value)}
                value={draft.academicLevel}
              >
                {ACADEMIC_LEVEL_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>

            <label htmlFor="profile-b-academic-track">
              <span>Board / curriculum / field</span>
              <select
                id="profile-b-academic-track"
                onChange={(event) => updateField("academicTrack", event.target.value)}
                value={draft.academicTrack}
              >
                {TRACK_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>

            {schoolProfile ? (
              <label className="is-full" htmlFor="profile-b-grade">
                <span>Exact class</span>
                <select
                  id="profile-b-grade"
                  onChange={(event) => updateField("grade", event.target.value)}
                  required
                  value={draft.grade}
                >
                  <option value="">Choose class</option>
                  {SCHOOL_CLASS_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <label htmlFor="profile-b-degree">
                  <span>Degree / qualification</span>
                  <input
                    id="profile-b-degree"
                    onChange={(event) => updateField("degree", event.target.value)}
                    placeholder="e.g. B.Tech IT, MBBS, LLB, M.Sc"
                    value={draft.degree}
                  />
                </label>
                <label htmlFor="profile-b-department">
                  <span>Department / specialization</span>
                  <select
                    id="profile-b-department"
                    onChange={(event) => updateField("department", event.target.value)}
                    value={draft.department}
                  >
                    {DEPARTMENT_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </div>

          <p aria-live="polite" className={`academic-profile-create-error${error ? " is-visible" : ""}`} role={error ? "alert" : undefined}>
            {error || "Profile B must use academic details that differ from Profile A."}
          </p>

          <footer className="academic-profile-create-actions">
            <button disabled={submitting} onClick={() => requestClose("cancel")} type="button">Cancel</button>
            <button className="is-primary" disabled={submitting} type="submit">
              {submitting
                ? <><LoaderCircle aria-hidden="true" className="is-spinning" size={17} /> Creating Profile B...</>
                : <><UserRoundPlus aria-hidden="true" size={17} /> Create and open Profile B</>}
            </button>
          </footer>
        </form>
      </section>
    </div>,
    document.body,
  );
}
