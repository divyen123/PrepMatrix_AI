import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  Award,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Download,
  Eye,
  EyeOff,
  FileText,
  FolderKanban,
  GraduationCap,
  Languages,
  LayoutTemplate,
  Mail,
  MapPin,
  Maximize2,
  Palette,
  PenLine,
  Phone,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Trophy,
  Type,
  UserRound,
  X,
} from "lucide-react";
import ResumeHistorySection from "../components/ResumeHistorySection";
import ResumeBuilderIntro from "../components/ResumeBuilderIntro";
import api from "../utils/apiClient";
import {
  RESUME_ACCENTS,
  RESUME_FONTS,
  RESUME_SECTIONS,
  RESUME_TEMPLATES,
  RESUME_WEEKLY_LIMIT,
  createFreshResumeBuilderState,
  createResumeItemId,
  getResumeQuota,
  normalizeResumeBuilderState,
  normalizeResumeDraft,
  validateResumeDraft,
} from "../utils/resumeBuilder";
import { getAcademicProfileExamples } from "../utils/academicProfileExamples";
import {
  createResumeHistorySnapshot,
  loadResumeHistoryEntry,
  normalizeResumeHistory,
  normalizeResumeHistoryEntry,
} from "../utils/resumeHistory";
import { createResumePdfFromElement, getResumePdfFilename } from "../utils/resumePdf";
import {
  createResumeBuilderIntroState,
  getResumeBuilderIntroDurations,
  resumeBuilderIntroReducer,
} from "../utils/resumeBuilderIntro";
import "./ResumeBuilderPage.css";

const EDITOR_SECTIONS = [
  { id: "profile", label: "Profile", icon: UserRound },
  { id: "experience", label: "Experience", icon: BriefcaseBusiness },
  { id: "projects", label: "Projects", icon: FolderKanban },
  { id: "education", label: "Education", icon: GraduationCap },
  { id: "skills", label: "Skills", icon: Sparkles },
  { id: "layout", label: "Layout", icon: LayoutTemplate },
];

const EDITING_NORMALIZE_OPTIONS = Object.freeze({ mode: "editing" });
const parseSkillsInput = (value) =>
  String(value ?? "").split(/[,\n]/).map((item) => item.trim()).filter(Boolean).slice(0, 40);

const SECTION_LABELS = {
  summary: "Professional summary",
  skills: "Skills",
  tools: "Tools",
  experience: "Experience",
  projects: "Projects",
  education: "Education",
  certifications: "Certifications",
  achievements: "Achievements",
  languages: "Languages",
};

const TYPOGRAPHY_OPTIONS = [
  { value: "compact", label: "Compact", description: "Fits more content" },
  { value: "balanced", label: "Balanced", description: "Standard reading size" },
  { value: "large", label: "Large", description: "Larger, easier reading" },
];

const SPACING_OPTIONS = [
  { value: "compact", label: "Compact", description: "Tighter section spacing" },
  { value: "balanced", label: "Balanced", description: "Comfortable spacing" },
  { value: "airy", label: "Airy", description: "More breathing room" },
];

const hexToRgb = (value) => {
  const hex = String(value || "").replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return [15, 159, 143];
  return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
};

const mixResumeColor = (foreground, background, foregroundRatio) => {
  const front = hexToRgb(foreground);
  const back = hexToRgb(background);
  const ratio = Math.min(1, Math.max(0, Number(foregroundRatio) || 0));
  const channels = front.map((channel, index) => Math.round(channel * ratio + back[index] * (1 - ratio)));
  return `rgb(${channels.join(", ")})`;
};

const resumeWebLink = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
};

const EMPTY_ITEMS = {
  experience: () => ({
    id: createResumeItemId("experience"),
    role: "",
    organization: "",
    location: "",
    startDate: "",
    endDate: "",
    current: false,
    highlights: [],
  }),
  projects: () => ({
    id: createResumeItemId("project"),
    name: "",
    role: "",
    link: "",
    technologies: "",
    startDate: "",
    endDate: "",
    highlights: [],
  }),
  education: () => ({
    id: createResumeItemId("education"),
    institution: "",
    degree: "",
    field: "",
    location: "",
    startDate: "",
    endDate: "",
    score: "",
    highlights: [],
  }),
  certifications: () => ({
    id: createResumeItemId("certification"),
    name: "",
    issuer: "",
    date: "",
    credentialUrl: "",
  }),
  achievements: () => ({
    id: createResumeItemId("achievement"),
    title: "",
    description: "",
  }),
  languages: () => ({
    id: createResumeItemId("language"),
    name: "",
    proficiency: "",
  }),
};

function dateLabel(item) {
  const end = item.current ? "Present" : item.endDate;
  return [item.startDate, end].filter(Boolean).join(" - ");
}

function hasEntryContent(item) {
  return Object.entries(item || {}).some(
    ([key, value]) =>
      key !== "id" &&
      key !== "current" &&
      (Array.isArray(value) ? value.some(Boolean) : String(value || "").trim())
  );
}

function formatResetTime(value) {
  if (!value) return "after your oldest generation expires";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "in the next quota window";
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function InputField({
  label,
  optional = false,
  error,
  className = "",
  textarea = false,
  hint = "",
  ...props
}) {
  const Component = textarea ? "textarea" : "input";
  return (
    <label className={`resume-field ${className}`}>
      <span className="resume-field__label">
        {label}
        {optional && <small>Optional</small>}
      </span>
      <Component
        className={error ? "resume-field__control resume-field__control--error" : "resume-field__control"}
        {...props}
      />
      {(error || hint) && (
        <span className={error ? "resume-field__message resume-field__message--error" : "resume-field__message"}>
          {error || hint}
        </span>
      )}
    </label>
  );
}

function EditorHeading({ eyebrow, title, description }) {
  return (
    <header className="resume-editor-heading">
      <span>{eyebrow}</span>
      <h2>{title}</h2>
      <p>{description}</p>
    </header>
  );
}

function RepeatableCard({ index, title, subtitle, onRemove, children }) {
  return (
    <article className="resume-repeat-card">
      <header className="resume-repeat-card__header">
        <div>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <div>
            <strong>{title}</strong>
            <small>{subtitle}</small>
          </div>
        </div>
        <button type="button" className="resume-icon-button resume-icon-button--danger resume-repeat-card__remove" onClick={onRemove} aria-label={`Remove ${title}`}>
          <Trash2 size={17} />
        </button>
      </header>
      <div className="resume-repeat-card__body">{children}</div>
    </article>
  );
}

function AddItemButton({ label, onClick }) {
  return (
    <button type="button" className="resume-add-item" onClick={onClick}>
      <Plus size={17} />
      {label}
    </button>
  );
}

export function ResumePreview({ draft, layout, onPaperReady = null }) {
  const paperRef = useRef(null);
  const contentRef = useRef(null);
  const font = RESUME_FONTS.find((item) => item.id === layout.fontFamily) || RESUME_FONTS[0];
  const visibleSections = layout.sectionOrder.filter((section) => !layout.hiddenSections.includes(section));
  const skillsIndex = visibleSections.indexOf("skills");
  const toolsIndex = visibleSections.indexOf("tools");
  const showSkillsToolsRow = Boolean(
    draft.skills.length
      && draft.tools.length
      && skillsIndex >= 0
      && toolsIndex === skillsIndex + 1,
  );
  const contact = [
    draft.personal.location && { icon: MapPin, value: draft.personal.location },
    draft.personal.email && { icon: Mail, value: draft.personal.email, href: `mailto:${draft.personal.email}` },
    draft.personal.phone && { icon: Phone, value: draft.personal.phone, href: `tel:${draft.personal.phone.replace(/\s+/g, "")}` },
    draft.personal.linkedin && { icon: UserRound, value: draft.personal.linkedin.replace(/^https?:\/\//, ""), href: resumeWebLink(draft.personal.linkedin) },
    draft.personal.github && { icon: FileText, value: draft.personal.github.replace(/^https?:\/\//, ""), href: resumeWebLink(draft.personal.github) },
    draft.personal.portfolio && { icon: FileText, value: draft.personal.portfolio.replace(/^https?:\/\//, ""), href: resumeWebLink(draft.personal.portfolio) },
  ].filter(Boolean);

  const setPaperRef = useCallback((node) => {
    paperRef.current = node;
    onPaperReady?.(node);
  }, [onPaperReady]);

  useLayoutEffect(() => {
    const paper = paperRef.current;
    const content = contentRef.current;
    if (!paper || !content) return undefined;

    let frame = 0;
    let cancelled = false;
    const setScale = (scale) => {
      paper.style.setProperty("--resume-fit-scale", String(scale));
      paper.style.setProperty("--resume-fit-width", `${100 / scale}%`);
    };
    const renderedHeightAt = (scale) => {
      setScale(scale);
      return content.scrollHeight * scale;
    };
    const fitToA4 = () => {
      frame = 0;
      const availableHeight = paper.clientHeight;
      if (!availableHeight) return;

      if (renderedHeightAt(1) <= availableHeight + 0.5) {
        paper.dataset.fitted = "false";
        return;
      }

      let low = 0.55;
      let high = 1;
      for (let index = 0; index < 10; index += 1) {
        const candidate = (low + high) / 2;
        if (renderedHeightAt(candidate) <= availableHeight) low = candidate;
        else high = candidate;
      }
      setScale(low);
      paper.dataset.fitted = "true";
    };
    const scheduleFit = () => {
      if (cancelled) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fitToA4);
    };

    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleFit);
    const fonts = typeof document === "undefined" ? null : document.fonts;
    observer?.observe(paper);
    scheduleFit();
    fonts?.ready?.then(scheduleFit).catch(() => {});
    fonts?.addEventListener?.("loadingdone", scheduleFit);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      fonts?.removeEventListener?.("loadingdone", scheduleFit);
    };
  }, [draft, layout]);

  const renderSection = (section) => {
    if (section === "summary" && draft.summary) {
      return (
        <PreviewSection key={section} title="Professional summary">
          <p>{draft.summary}</p>
        </PreviewSection>
      );
    }
    if (section === "skills" && draft.skills.length) {
      if (showSkillsToolsRow) {
        return (
          <div className="resume-paper__skills-tools-row" key="skills-tools">
            <PreviewSection title="Skills">
              <div className="resume-paper__skills">
                {draft.skills.map((skill) => (
                  <span key={skill}>{skill}</span>
                ))}
              </div>
            </PreviewSection>
            <PreviewSection title="Tools">
              <div className="resume-paper__skills resume-paper__tools">
                {draft.tools.map((tool, index) => (
                  <span key={`${tool}-${index}`}>{tool}</span>
                ))}
              </div>
            </PreviewSection>
          </div>
        );
      }
      return (
        <PreviewSection key={section} title="Skills">
          <div className="resume-paper__skills">
            {draft.skills.map((skill) => (
              <span key={skill}>{skill}</span>
            ))}
          </div>
        </PreviewSection>
      );
    }
    if (section === "tools" && draft.tools.length) {
      if (showSkillsToolsRow) return null;
      return (
        <PreviewSection key={section} title="Tools">
          <div className="resume-paper__skills resume-paper__tools">
            {draft.tools.map((tool, index) => (
              <span key={`${tool}-${index}`}>{tool}</span>
            ))}
          </div>
        </PreviewSection>
      );
    }
    if (section === "experience") {
      const entries = draft.experience.filter(hasEntryContent);
      if (!entries.length) return null;
      return (
        <PreviewSection key={section} title="Experience">
          {entries.map((item) => (
            <PreviewEntry
              key={item.id}
              title={item.role || item.organization || "Role"}
              date={dateLabel(item)}
              meta={[item.role ? item.organization : "", item.location].filter(Boolean).join(" · ")}
              highlights={item.highlights}
            />
          ))}
        </PreviewSection>
      );
    }
    if (section === "projects") {
      const entries = draft.projects.filter(hasEntryContent);
      if (!entries.length) return null;
      return (
        <PreviewSection key={section} title="Projects">
          {entries.map((item) => (
            <PreviewEntry
              key={item.id}
              title={item.name || "Project"}
              date={dateLabel(item)}
              meta={[item.role, item.technologies].filter(Boolean).join(" · ")}
              secondary={item.link}
              highlights={item.highlights}
            />
          ))}
        </PreviewSection>
      );
    }
    if (section === "education") {
      const entries = draft.education.filter(hasEntryContent);
      if (!entries.length) return null;
      return (
        <PreviewSection key={section} title="Education">
          {entries.map((item) => (
            <PreviewEntry
              key={item.id}
              title={[item.degree, item.field].filter(Boolean).join(" in ") || item.institution || "Education"}
              date={dateLabel(item)}
              meta={[item.institution, item.location, item.score].filter(Boolean).join(" · ")}
              highlights={item.highlights}
            />
          ))}
        </PreviewSection>
      );
    }
    if (section === "certifications") {
      const entries = draft.certifications.filter(hasEntryContent);
      if (!entries.length) return null;
      return (
        <PreviewSection key={section} title="Certifications">
          {entries.map((item) => (
            <PreviewEntry
              key={item.id}
              title={item.name || item.issuer || "Certification"}
              date={item.date}
              meta={item.issuer}
              secondary={item.credentialUrl}
            />
          ))}
        </PreviewSection>
      );
    }
    if (section === "achievements") {
      const entries = draft.achievements.filter(hasEntryContent);
      if (!entries.length) return null;
      return (
        <PreviewSection key={section} title="Achievements">
          {entries.map((item) => (
            <PreviewEntry key={item.id} title={item.title || "Achievement"} highlights={[item.description]} />
          ))}
        </PreviewSection>
      );
    }
    if (section === "languages") {
      const entries = draft.languages.filter(hasEntryContent);
      if (!entries.length) return null;
      return (
        <PreviewSection key={section} title="Languages">
          <p>{entries.map((item) => [item.name, item.proficiency].filter(Boolean).join(" - ")).join("  ·  ")}</p>
        </PreviewSection>
      );
    }
    return null;
  };

  return (
    <article
      ref={setPaperRef}
      className={`resume-paper resume-paper--${layout.template} resume-paper--font-${layout.fontFamily} resume-paper--type-${layout.typography} resume-paper--density-${layout.density}`}
      style={{
        "--resume-accent": layout.accent,
        "--resume-font-family": font.cssFamily,
        "--resume-accent-soft-9": mixResumeColor(layout.accent, "#ffffff", 0.09),
        "--resume-accent-horizon-62": mixResumeColor(layout.accent, "#172033", 0.62),
        "--resume-accent-line-44": mixResumeColor(layout.accent, "#d8dee8", 0.44),
        "--resume-accent-editorial-10": mixResumeColor(layout.accent, "#f8fafc", 0.1),
        "--resume-accent-line-48": mixResumeColor(layout.accent, "#d8dee8", 0.48),
        "--resume-accent-line-30": mixResumeColor(layout.accent, "#d8dee8", 0.3),
        "--resume-accent-skill-10": mixResumeColor(layout.accent, "#f1f5f9", 0.1),
        "--resume-accent-skill-8": mixResumeColor(layout.accent, "#f1f5f9", 0.08),
        "--resume-accent-line-35": mixResumeColor(layout.accent, "#d8dee8", 0.35),
      }}
      aria-label="Live resume preview"
    >
      <div ref={contentRef} className="resume-paper__fit">
        <header className="resume-paper__header">
          <h1>{draft.personal.fullName || "Your name"}</h1>
          <p>{draft.personal.headline || "Professional headline"}</p>
          <div className="resume-paper__contact">
            {contact.length ? (
              contact.map(({ icon: Icon, value, href }) => {
                const content = <><Icon size={10} />{value}</>;
                return href ? (
                  <a
                    href={href}
                    key={`${Icon.displayName || Icon.name}-${value}`}
                    rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
                    target={href.startsWith("http") ? "_blank" : undefined}
                  >
                    {content}
                  </a>
                ) : (
                  <span key={`${Icon.displayName || Icon.name}-${value}`}>{content}</span>
                );
              })
            ) : (
              <span>Add contact details to complete your header.</span>
            )}
          </div>
        </header>
        <div className="resume-paper__body">
          {visibleSections.map(renderSection)}
          {!visibleSections.some((section) => {
            if (section === "summary") return draft.summary;
            if (section === "skills") return draft.skills.length;
            if (section === "tools") return draft.tools.length;
            return Array.isArray(draft[section]) && draft[section].some(hasEntryContent);
          }) && (
            <div className="resume-paper__empty">
              <FileText size={26} />
              <strong>Your story starts here</strong>
              <span>Add details in the edit console to build the preview.</span>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function PreviewSection({ title, children }) {
  return (
    <section className="resume-paper__section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function PreviewEntry({ title, date, meta, secondary, highlights = [] }) {
  const secondaryHref = resumeWebLink(secondary);
  return (
    <div className="resume-paper__entry">
      <div className="resume-paper__entry-title">
        <strong>{title}</strong>
        {date && <span>{date}</span>}
      </div>
      {meta && <em>{meta}</em>}
      {secondary && (
        <small>
          {secondaryHref ? (
            <a href={secondaryHref} rel="noopener noreferrer" target="_blank">{secondary}</a>
          ) : secondary}
        </small>
      )}
      {highlights.filter(Boolean).length > 0 && (
        <ul>
          {highlights.filter(Boolean).map((highlight, index) => (
            <li key={`${highlight}-${index}`}>{highlight}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ResumeBuilderPage({
  academicProfileDataId = "",
  userProfile = {},
  academicProfile = {},
  resumeBuilder,
  onResumeBuilderChange,
}) {
  const [activeSection, setActiveSection] = useState("profile");
  const [mobileView, setMobileView] = useState("edit");
  const [quota, setQuota] = useState(() => getResumeQuota(resumeBuilder?.generationTimestamps));
  const [quotaLoading, setQuotaLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState(null);
  const [resumeHistory, setResumeHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [selectedHistoryId, setSelectedHistoryId] = useState("");
  const [previewFullscreenOpen, setPreviewFullscreenOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const [prefersReducedMotion] = useState(() => (
    typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ));
  const [introState, dispatchIntro] = useReducer(
    resumeBuilderIntroReducer,
    undefined,
    createResumeBuilderIntroState,
  );
  const introDurations = getResumeBuilderIntroDurations(prefersReducedMotion);
  const noticeTimer = useRef(null);
  const generationRequestRef = useRef(null);
  const historyLoadSequenceRef = useRef(0);
  const historyOpenSequenceRef = useRef(0);
  const resetDialogRef = useRef(null);
  const resetCancelRef = useRef(null);
  const resetTriggerRef = useRef(null);
  const previewFullscreenDialogRef = useRef(null);
  const previewFullscreenCloseRef = useRef(null);
  const previewFullscreenTriggerRef = useRef(null);
  const previewPaperRef = useRef(null);
  const setPreviewPaper = useCallback((node) => {
    previewPaperRef.current = node;
  }, []);
  const resumeAcademicProfile = useMemo(
    () => ({ ...userProfile, ...academicProfile }),
    [academicProfile, userProfile]
  );
  const curriculumExamples = useMemo(
    () => getAcademicProfileExamples(resumeAcademicProfile),
    [resumeAcademicProfile]
  );
  const builder = useMemo(
    () => normalizeResumeBuilderState(resumeBuilder, resumeAcademicProfile, EDITING_NORMALIZE_OPTIONS),
    [resumeAcademicProfile, resumeBuilder]
  );
  const { draft, layout } = builder;
  const previewDraft = useMemo(() => normalizeResumeDraft(draft), [draft]);
  const skillsCanonical = draft.skills.map((item) => item.trim()).filter(Boolean).join(", ");
  const [skillsInput, setSkillsInput] = useState(skillsCanonical);
  const skillsInputRef = useRef(skillsCanonical);
  const toolsCanonical = draft.tools.map((item) => item.trim()).filter(Boolean).join(", ");
  const [toolsInput, setToolsInput] = useState(toolsCanonical);
  const toolsInputRef = useRef(toolsCanonical);

  const announce = (type, message) => {
    setNotice({ type, message });
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 5200);
  };

  const closeResetConfirm = useCallback(() => {
    setResetConfirmOpen(false);
    window.requestAnimationFrame(() => resetTriggerRef.current?.focus());
  }, []);

  const closePreviewFullscreen = useCallback(() => {
    setPreviewFullscreenOpen(false);
    window.requestAnimationFrame(() => previewFullscreenTriggerRef.current?.focus({ preventScroll: true }));
  }, []);

  const loadResumeHistory = useCallback(async () => {
    const sequence = ++historyLoadSequenceRef.current;
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const payload = await api.getResumeHistory({ academicProfileId: academicProfileDataId });
      if (historyLoadSequenceRef.current !== sequence) return;
      setResumeHistory(normalizeResumeHistory(payload?.history));
    } catch (error) {
      if (historyLoadSequenceRef.current !== sequence) return;
      setHistoryError(error instanceof Error ? error.message : "Resume history could not be loaded.");
    } finally {
      if (historyLoadSequenceRef.current === sequence) setHistoryLoading(false);
    }
  }, [academicProfileDataId]);

  useEffect(() => {
    let active = true;
    void loadResumeHistory().finally(() => {
      if (active) dispatchIntro({ type: "history_settled" });
    });
    return () => {
      active = false;
      historyLoadSequenceRef.current += 1;
      historyOpenSequenceRef.current += 1;
    };
  }, [loadResumeHistory]);

  useEffect(() => {
    const timer = window.setTimeout(
      () => dispatchIntro({ type: "minimum_elapsed" }),
      introDurations.minimumMs,
    );
    return () => window.clearTimeout(timer);
  }, [introDurations.minimumMs]);

  useEffect(() => {
    if (introState.phase !== "exiting") return undefined;
    const timer = window.setTimeout(
      () => dispatchIntro({ type: "exit_finished" }),
      introDurations.exitMs,
    );
    return () => window.clearTimeout(timer);
  }, [introDurations.exitMs, introState.phase]);

  useEffect(() => {
    if (introState.phase !== "done" || typeof window === "undefined") return undefined;
    const rawTarget = window.location.hash.slice(1);
    if (!rawTarget) return undefined;
    let targetId = rawTarget;
    try {
      targetId = decodeURIComponent(rawTarget);
    } catch {
      // Keep the literal hash for malformed escape sequences.
    }
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: "auto", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [introState.phase]);

  useEffect(
    () => () => {
      window.clearTimeout(noticeTimer.current);
    },
    []
  );

  useEffect(() => {
    if (!previewFullscreenOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    const modalClassAlreadyPresent = document.body.classList.contains("modal-open");
    const focusFrame = window.requestAnimationFrame(() => {
      previewFullscreenCloseRef.current?.focus({ preventScroll: true });
    });

    document.body.classList.add("modal-open");
    document.body.style.overflow = "hidden";

    const handlePreviewKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePreviewFullscreen();
        return;
      }

      if (event.key !== "Tab") return;

      const focusableElements = Array.from(
        previewFullscreenDialogRef.current?.querySelectorAll("button:not(:disabled)") || []
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements.at(-1);

      if (!firstElement || !lastElement) return;
      if (!previewFullscreenDialogRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        firstElement.focus();
        return;
      }

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handlePreviewKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handlePreviewKeyDown);
      document.body.style.overflow = previousOverflow;
      if (!modalClassAlreadyPresent) document.body.classList.remove("modal-open");
    };
  }, [closePreviewFullscreen, previewFullscreenOpen]);

  useEffect(() => {
    if (!resetConfirmOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    const modalClassAlreadyPresent = document.body.classList.contains("modal-open");

    document.body.classList.add("modal-open");
    document.body.style.overflow = "hidden";
    resetCancelRef.current?.focus();

    const handleDialogKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeResetConfirm();
        return;
      }

      if (event.key !== "Tab") return;

      const focusableElements = Array.from(
        resetDialogRef.current?.querySelectorAll("button:not(:disabled)") || []
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements.at(-1);

      if (!firstElement || !lastElement) return;
      if (!resetDialogRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        firstElement.focus();
        return;
      }

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleDialogKeyDown);

    return () => {
      document.removeEventListener("keydown", handleDialogKeyDown);
      document.body.style.overflow = previousOverflow;
      if (!modalClassAlreadyPresent) document.body.classList.remove("modal-open");
    };
  }, [closeResetConfirm, resetConfirmOpen]);

  useEffect(() => {
    const localCanonical = parseSkillsInput(skillsInputRef.current).join(", ");
    if (skillsCanonical === localCanonical) return;
    skillsInputRef.current = skillsCanonical;
    setSkillsInput(skillsCanonical);
  }, [skillsCanonical]);

  useEffect(() => {
    const localCanonical = parseSkillsInput(toolsInputRef.current).join(", ");
    if (toolsCanonical === localCanonical) return;
    toolsInputRef.current = toolsCanonical;
    setToolsInput(toolsCanonical);
  }, [toolsCanonical]);

  useEffect(() => {
    let active = true;
    setQuotaLoading(true);
    api
      .getResumeBuilderStatus({ academicProfileId: academicProfileDataId })
      .then((result) => {
        if (!active) return;
        setQuota(result?.quota || result);
      })
      .catch(() => null)
      .finally(() => {
        if (active) {
          setQuotaLoading(false);
          dispatchIntro({ type: "quota_settled" });
        }
      });
    return () => {
      active = false;
    };
  }, [academicProfileDataId]);

  const updateBuilder = (producer) => {
    onResumeBuilderChange?.((current) => {
      const normalized = normalizeResumeBuilderState(current, { ...userProfile, ...academicProfile }, EDITING_NORMALIZE_OPTIONS);
      return {
        ...producer(normalized),
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const updateDraft = (producer) => {
    updateBuilder((current) => ({ ...current, draft: producer(current.draft) }));
  };

  const updatePersonal = (field, value) => {
    updateDraft((current) => ({
      ...current,
      personal: { ...current.personal, [field]: value },
    }));
    if (validationErrors[field]) {
      setValidationErrors((current) => ({ ...current, [field]: undefined }));
    }
  };

  const updateArrayItem = (section, id, patch) => {
    updateDraft((current) => ({
      ...current,
      [section]: current[section].map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));
  };

  const addArrayItem = (section) => {
    updateDraft((current) => ({
      ...current,
      [section]: [...current[section], EMPTY_ITEMS[section]()],
    }));
  };

  const removeArrayItem = (section, id) => {
    updateDraft((current) => ({
      ...current,
      [section]: current[section].filter((item) => item.id !== id),
    }));
  };

  const updateLayout = (patch) => {
    updateBuilder((current) => ({
      ...current,
      layout: { ...current.layout, ...patch },
    }));
  };

  const moveSection = (section, direction) => {
    const currentIndex = layout.sectionOrder.indexOf(section);
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= layout.sectionOrder.length) return;
    const nextOrder = [...layout.sectionOrder];
    [nextOrder[currentIndex], nextOrder[nextIndex]] = [nextOrder[nextIndex], nextOrder[currentIndex]];
    updateLayout({ sectionOrder: nextOrder });
  };

  const toggleSection = (section) => {
    const hidden = layout.hiddenSections.includes(section);
    updateLayout({
      hiddenSections: hidden
        ? layout.hiddenSections.filter((item) => item !== section)
        : [...layout.hiddenSections, section],
    });
  };

  const openResumeHistoryEntry = async (entry) => {
    const sequence = ++historyOpenSequenceRef.current;
    try {
      const payload = await api.getResumeHistoryItem(entry.id, { academicProfileId: academicProfileDataId });
      if (historyOpenSequenceRef.current !== sequence) return;
      const savedResume = normalizeResumeHistoryEntry(payload?.resume);
      onResumeBuilderChange?.((current) => loadResumeHistoryEntry(savedResume, current, {
        now: new Date().toISOString(),
        profile: { ...userProfile, ...academicProfile },
      }));
      setSelectedHistoryId(savedResume.id);
      setValidationErrors({});
      setActiveSection("profile");
      setMobileView("edit");
      announce("success", `${savedResume.name} loaded. Edit it and choose Re-generate PDF when ready.`);
      window.requestAnimationFrame(() => {
        const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
        document.querySelector(".resume-builder-workspace")?.scrollIntoView({
          behavior: reduceMotion ? "auto" : "smooth",
          block: "start",
        });
      });
    } catch (error) {
      if (historyOpenSequenceRef.current !== sequence) return;
      announce("error", error instanceof Error ? error.message : "This resume could not be opened.");
      throw error;
    }
  };

  const deleteResumeHistoryEntry = async (id) => {
    try {
      await api.deleteResumeHistory(id, { academicProfileId: academicProfileDataId });
      setResumeHistory((current) => current.filter((entry) => entry.id !== id));
      if (selectedHistoryId === id) setSelectedHistoryId("");
      announce("success", "Resume removed from history.");
    } catch (error) {
      announce("error", error instanceof Error ? error.message : "The resume could not be deleted.");
      throw error;
    }
  };

  const clearResumeHistory = async () => {
    try {
      const payload = await api.clearResumeHistory({ academicProfileId: academicProfileDataId });
      setResumeHistory([]);
      setSelectedHistoryId("");
      const deletedCount = Number(payload?.deletedCount || 0);
      announce(
        "success",
        deletedCount === 1 ? "1 resume removed from history." : `${deletedCount} resumes removed from history.`,
      );
    } catch (error) {
      announce("error", error instanceof Error ? error.message : "Resume history could not be cleared.");
      throw error;
    }
  };

  const handleReset = () => {
    setResetConfirmOpen(true);
  };

  const startFreshResume = (message) => {
    historyOpenSequenceRef.current += 1;
    generationRequestRef.current = null;
    onResumeBuilderChange?.((current) => createFreshResumeBuilderState(
      current,
      { ...userProfile, ...academicProfile },
      { ...EDITING_NORMALIZE_OPTIONS, now: Date.now() },
    ));
    skillsInputRef.current = "";
    setSkillsInput("");
    toolsInputRef.current = "";
    setToolsInput("");
    setValidationErrors({});
    setSelectedHistoryId("");
    setActiveSection("profile");
    setMobileView("edit");
    announce("success", message);
  };

  const handleNewResume = () => {
    startFreshResume("New resume ready. Saved versions and weekly allowance are unchanged.");
  };

  const confirmReset = () => {
    closeResetConfirm();
    startFreshResume("Resume draft reset.");
  };

  const handleGenerate = async () => {
    const validation = validateResumeDraft(draft);
    if (!validation.valid) {
      setValidationErrors(validation.errors);
      const target =
        validation.errors.fullName || validation.errors.headline || validation.errors.email || validation.errors.summary
          ? "profile"
          : validation.errors.education
            ? "education"
            : "skills";
      setActiveSection(target);
      setMobileView("edit");
      announce("error", "Complete the highlighted details before generating your resume.");
      return;
    }
    if (quota?.remaining <= 0 || quota?.canGenerate === false) {
      announce("error", `Weekly limit reached. Your next slot opens ${formatResetTime(quota?.resetAt)}.`);
      return;
    }

    setGenerating(true);
    try {
      const pdf = await createResumePdfFromElement(previewPaperRef.current, validation.draft, layout);
      generationRequestRef.current ||= createResumeItemId("generation");
      const requestId = generationRequestRef.current;
      const wasRegeneration = Boolean(selectedHistoryId);
      const result = await api.generateResume({
        requestId,
      }, { academicProfileId: academicProfileDataId });
      const nextQuota = result?.quota || result;
      setQuota(nextQuota);
      const generatedAt = result?.generation?.generatedAt || new Date().toISOString();
      updateBuilder((current) => ({
        ...current,
        draft: validation.draft,
        lastGeneratedAt: generatedAt,
        generationTimestamps: Array.isArray(nextQuota?.timestamps)
          ? nextQuota.timestamps
          : current.generationTimestamps,
      }));

      let historySaveError = null;
      try {
        const snapshot = createResumeHistorySnapshot({
          draft: validation.draft,
          generatedAt,
          layout,
          requestId,
          sourceGenerationId: result?.generation?.id,
        });
        const historyPayload = await api.createResumeHistory(
          snapshot,
          { academicProfileId: academicProfileDataId },
        );
        const savedResume = normalizeResumeHistoryEntry(historyPayload?.resume);
        setResumeHistory((current) => normalizeResumeHistory([savedResume, ...current]));
        setSelectedHistoryId(savedResume.id);
      } catch (error) {
        historySaveError = error;
      }

      pdf.save(getResumePdfFilename(validation.draft));
      if (!historySaveError) generationRequestRef.current = null;
      if (historySaveError) {
        announce(
          "error",
          "PDF generated, but its history card could not be saved. Choose Generate again to retry without using another weekly slot.",
        );
      } else {
        const action = wasRegeneration ? "re-generated" : "generated";
        announce(
          "success",
          `Resume ${action} and saved to history. ${nextQuota?.remaining ?? Math.max(0, (quota?.remaining || 1) - 1)} weekly slots remaining.`,
        );
      }
    } catch (error) {
      const nextQuota = error?.details?.quota || error?.data?.quota || error?.quota;
      if (nextQuota) setQuota(nextQuota);
      announce("error", error?.message || "The resume could not be generated. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  const quotaUsed = Number.isFinite(Number(quota?.used)) ? Number(quota.used) : 0;
  const quotaRemaining = Number.isFinite(Number(quota?.remaining))
    ? Number(quota.remaining)
    : Math.max(0, RESUME_WEEKLY_LIMIT - quotaUsed);

  const introActive = introState.phase !== "done";

  return (
    <>
      {introActive && <ResumeBuilderIntro phase={introState.phase} />}
      <section
        aria-hidden={introActive ? "true" : undefined}
        className={`resume-builder-page ${introActive ? "is-entry-loading" : "resume-builder-page-entry"}`}
        inert={introActive || undefined}
      >
      <header className="resume-builder-hero">
        <div className="resume-builder-hero__icon">
          <FileText size={30} />
          <span><Sparkles size={12} /></span>
        </div>
        <div className="resume-builder-hero__copy">
          <span className="resume-builder-eyebrow">Career workspace</span>
          <h1>Resume Builder</h1>
          <div className="resume-builder-hero__meta">
            <span><ShieldCheck size={14} /> Enabled for {academicProfile.academicTrack || academicProfile.academicLevel || "your profile"}</span>
            <span><CheckCircle2 size={14} /> Draft saved automatically</span>
          </div>
        </div>
        <div className="resume-quota-card" aria-live="polite">
          <div className="resume-quota-card__top">
            <span><Clock3 size={16} /> Weekly allowance</span>
            <strong>{quotaLoading ? "—" : `${quotaRemaining} left`}</strong>
          </div>
          <div className="resume-quota-segments" aria-label={`${quotaUsed} of ${RESUME_WEEKLY_LIMIT} resume generations used`}>
            {Array.from({ length: RESUME_WEEKLY_LIMIT }, (_, index) => (
              <span key={index} className={index < quotaUsed ? "is-used" : ""} />
            ))}
          </div>
          <p>
            {quotaLoading
              ? "Checking your generation allowance…"
              : quotaRemaining > 0
                ? `${quotaUsed} of ${RESUME_WEEKLY_LIMIT} generated in the current 7-day window.`
                : `Next slot opens ${formatResetTime(quota?.resetAt)}.`}
          </p>
        </div>
      </header>

      <div className="resume-builder-mobile-switch" aria-label="Resume workspace view">
        <button type="button" className={mobileView === "edit" ? "is-active" : ""} onClick={() => setMobileView("edit")}>
          <PenLine size={16} /> Edit console
        </button>
        <button type="button" className={mobileView === "preview" ? "is-active" : ""} onClick={() => setMobileView("preview")}>
          <Eye size={16} /> Preview
        </button>
      </div>

      <div className={`resume-builder-workspace resume-builder-workspace--${mobileView}`}>
        <nav className="resume-builder-nav" aria-label="Resume editor sections">
          <div className="resume-builder-nav__intro">
            <span>Edit console</span>
            <strong>Build your resume</strong>
          </div>
          <div className="resume-builder-nav__items">
            {EDITOR_SECTIONS.map((item) => {
              const SectionIcon = item.icon;
              return (
                <button
                  type="button"
                  key={item.id}
                  className={activeSection === item.id ? "is-active" : ""}
                  aria-label={item.label}
                  aria-current={activeSection === item.id ? "step" : undefined}
                  title={item.label}
                  onClick={() => {
                    setActiveSection(item.id);
                    setMobileView("edit");
                  }}
                >
                  <SectionIcon aria-hidden="true" className="resume-builder-nav__icon" size={18} />
                  <span className="resume-builder-nav__label">{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        <main className="resume-editor-panel">
          {activeSection === "profile" && (
            <>
              <EditorHeading
                eyebrow="01 · Profile"
                title="Make a strong first impression"
              />
              <div className="resume-form-grid">
                <InputField
                  label="Full name"
                  value={draft.personal.fullName}
                  onChange={(event) => updatePersonal("fullName", event.target.value)}
                  placeholder="e.g. Divyen R M"
                  error={validationErrors.fullName}
                />
                <InputField
                  label="Professional headline"
                  value={draft.personal.headline}
                  onChange={(event) => updatePersonal("headline", event.target.value)}
                  placeholder={`e.g. ${curriculumExamples.resumeHeadlinePlaceholder}`}
                  error={validationErrors.headline}
                />
                <InputField
                  label="Email"
                  type="email"
                  value={draft.personal.email}
                  onChange={(event) => updatePersonal("email", event.target.value)}
                  placeholder="name@example.com"
                  error={validationErrors.email}
                />
                <InputField
                  label="Location"
                  optional
                  value={draft.personal.location}
                  onChange={(event) => updatePersonal("location", event.target.value)}
                  placeholder="City, State"
                />
                <InputField
                  label="Phone number"
                  optional
                  type="tel"
                  value={draft.personal.phone}
                  onChange={(event) => updatePersonal("phone", event.target.value)}
                  placeholder="+91 98765 43210"
                />
                <InputField
                  label="LinkedIn"
                  optional
                  type="url"
                  value={draft.personal.linkedin}
                  onChange={(event) => updatePersonal("linkedin", event.target.value)}
                  placeholder="linkedin.com/in/yourname"
                />
                <InputField
                  label="GitHub"
                  optional
                  type="url"
                  value={draft.personal.github}
                  onChange={(event) => updatePersonal("github", event.target.value)}
                  placeholder="github.com/yourname"
                />
                <InputField
                  label="Portfolio"
                  optional
                  type="url"
                  value={draft.personal.portfolio}
                  onChange={(event) => updatePersonal("portfolio", event.target.value)}
                  placeholder="yourportfolio.com"
                />
                <InputField
                  label="Professional summary"
                  className="resume-field--full"
                  textarea
                  rows={5}
                  maxLength={1200}
                  value={draft.summary}
                  onChange={(event) => {
                    updateDraft((current) => ({ ...current, summary: event.target.value }));
                    if (validationErrors.summary) {
                      setValidationErrors((current) => ({ ...current, summary: undefined }));
                    }
                  }}
                  placeholder="Write 2–4 focused sentences about your strengths, experience, and the value you bring."
                  error={validationErrors.summary}
                  hint={`${draft.summary.length}/1200 characters`}
                />
              </div>
            </>
          )}

          {activeSection === "experience" && (
            <>
              <EditorHeading
                eyebrow="02 · Experience"
                title="Show the impact of your work"
              />
              <div className="resume-repeat-list">
                {draft.experience.map((item, index) => (
                  <RepeatableCard
                    key={item.id}
                    index={index}
                    title={item.role || `Experience ${index + 1}`}
                    subtitle={item.organization || "Role and organization"}
                    onRemove={() => removeArrayItem("experience", item.id)}
                  >
                    <div className="resume-form-grid">
                      <InputField label="Role" value={item.role} onChange={(event) => updateArrayItem("experience", item.id, { role: event.target.value })} placeholder={curriculumExamples.resumeExperienceRolePlaceholder} />
                      <InputField label="Organization" value={item.organization} onChange={(event) => updateArrayItem("experience", item.id, { organization: event.target.value })} placeholder="Company or organization" />
                      <InputField label="Location" optional value={item.location} onChange={(event) => updateArrayItem("experience", item.id, { location: event.target.value })} placeholder="City or remote" />
                      <div className="resume-date-pair">
                        <InputField label="Start" value={item.startDate} onChange={(event) => updateArrayItem("experience", item.id, { startDate: event.target.value })} placeholder="Jun 2025" />
                        <InputField label="End" value={item.endDate} disabled={item.current} onChange={(event) => updateArrayItem("experience", item.id, { endDate: event.target.value })} placeholder="Aug 2025" />
                      </div>
                      <label className="resume-check-field resume-field--full">
                        <input type="checkbox" checked={item.current} onChange={(event) => updateArrayItem("experience", item.id, { current: event.target.checked, endDate: event.target.checked ? "" : item.endDate })} />
                        <span><Check size={14} /></span>
                        I currently work here
                      </label>
                      <InputField
                        label="Impact highlights"
                        className="resume-field--full"
                        textarea
                        rows={5}
                        value={item.highlights.join("\n")}
                        onChange={(event) => updateArrayItem("experience", item.id, { highlights: event.target.value.split("\n") })}
                        placeholder={curriculumExamples.resumeExperienceHighlightsPlaceholder}
                        hint="One achievement per line. Add outcomes or numbers where possible."
                      />
                    </div>
                  </RepeatableCard>
                ))}
                <AddItemButton label="Add experience" onClick={() => addArrayItem("experience")} />
              </div>
            </>
          )}

          {activeSection === "projects" && (
            <>
              <EditorHeading
                eyebrow="03 · Projects"
                title="Turn your projects into proof"
              />
              <div className="resume-repeat-list">
                {draft.projects.map((item, index) => (
                  <RepeatableCard
                    key={item.id}
                    index={index}
                    title={item.name || `Project ${index + 1}`}
                    subtitle={item.technologies || "Project details"}
                    onRemove={() => removeArrayItem("projects", item.id)}
                  >
                    <div className="resume-form-grid">
                      <InputField label="Project name" value={item.name} onChange={(event) => updateArrayItem("projects", item.id, { name: event.target.value })} placeholder={curriculumExamples.resumeProjectNamePlaceholder} />
                      <InputField label="Your role" optional value={item.role} onChange={(event) => updateArrayItem("projects", item.id, { role: event.target.value })} placeholder={curriculumExamples.resumeProjectRolePlaceholder} />
                      <InputField label="Methods / tools" optional value={item.technologies} onChange={(event) => updateArrayItem("projects", item.id, { technologies: event.target.value })} placeholder={curriculumExamples.resumeToolsPlaceholder} />
                      <InputField label="Project link" optional type="url" value={item.link} onChange={(event) => updateArrayItem("projects", item.id, { link: event.target.value })} placeholder="Portfolio or project URL" />
                      <div className="resume-date-pair resume-field--full">
                        <InputField label="Start" value={item.startDate} onChange={(event) => updateArrayItem("projects", item.id, { startDate: event.target.value })} placeholder="Jan 2026" />
                        <InputField label="End" optional value={item.endDate} onChange={(event) => updateArrayItem("projects", item.id, { endDate: event.target.value })} placeholder="Mar 2026" />
                      </div>
                      <InputField
                        label="Project highlights"
                        className="resume-field--full"
                        textarea
                        rows={5}
                        value={item.highlights.join("\n")}
                        onChange={(event) => updateArrayItem("projects", item.id, { highlights: event.target.value.split("\n") })}
                        placeholder={curriculumExamples.resumeProjectHighlightsPlaceholder}
                        hint="One outcome, contribution, or feature per line."
                      />
                    </div>
                  </RepeatableCard>
                ))}
                <AddItemButton label="Add project" onClick={() => addArrayItem("projects")} />
              </div>
            </>
          )}

          {activeSection === "education" && (
            <>
              <EditorHeading
                eyebrow="04 · Education"
                title="Add your academic foundation"
              />
              {validationErrors.education && (
                <div className="resume-inline-error"><AlertCircle size={16} /> {validationErrors.education}</div>
              )}
              <div className="resume-repeat-list">
                {draft.education.map((item, index) => (
                  <RepeatableCard
                    key={item.id}
                    index={index}
                    title={item.degree || item.institution || `Education ${index + 1}`}
                    subtitle={item.field || "Qualification details"}
                    onRemove={() => removeArrayItem("education", item.id)}
                  >
                    <div className="resume-form-grid">
                      <InputField label="Institution" value={item.institution} onChange={(event) => updateArrayItem("education", item.id, { institution: event.target.value })} placeholder="College or university" />
                      <InputField label="Degree / qualification" value={item.degree} onChange={(event) => updateArrayItem("education", item.id, { degree: event.target.value })} placeholder={curriculumExamples.resumeDegreePlaceholder} />
                      <InputField label="Field of study" value={item.field} onChange={(event) => updateArrayItem("education", item.id, { field: event.target.value })} placeholder={curriculumExamples.resumeFieldPlaceholder} />
                      <InputField label="Location" optional value={item.location} onChange={(event) => updateArrayItem("education", item.id, { location: event.target.value })} placeholder="City, State" />
                      <div className="resume-date-pair">
                        <InputField label="Start" value={item.startDate} onChange={(event) => updateArrayItem("education", item.id, { startDate: event.target.value })} placeholder="2022" />
                        <InputField label="End" value={item.endDate} onChange={(event) => updateArrayItem("education", item.id, { endDate: event.target.value })} placeholder="2026" />
                      </div>
                      <InputField label="Score / grade" optional value={item.score} onChange={(event) => updateArrayItem("education", item.id, { score: event.target.value })} placeholder="CGPA 8.7 / 10" />
                      <InputField
                        label="Academic highlights"
                        className="resume-field--full"
                        textarea
                        rows={4}
                        value={item.highlights.join("\n")}
                        onChange={(event) => updateArrayItem("education", item.id, { highlights: event.target.value.split("\n") })}
                        placeholder={`${curriculumExamples.resumeCourseworkPlaceholder}\nStudent coordinator or subject-club contributor`}
                        hint="Optional — one highlight per line."
                      />
                    </div>
                  </RepeatableCard>
                ))}
                <AddItemButton label="Add education" onClick={() => addArrayItem("education")} />
              </div>
            </>
          )}

          {activeSection === "skills" && (
            <>
              <EditorHeading
                eyebrow="05 · Skills & more"
                title="Complete your professional profile"
              />
              <div className="resume-form-grid">
                <InputField
                  label="Skills"
                  className="resume-field--full"
                  textarea
                  rows={4}
                  value={skillsInput}
                  maxLength={1500}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    skillsInputRef.current = nextValue;
                    setSkillsInput(nextValue);
                    updateDraft((current) => ({
                      ...current,
                      skills: parseSkillsInput(nextValue),
                    }));
                    if (validationErrors.skills) {
                      setValidationErrors((current) => ({ ...current, skills: undefined }));
                    }
                  }}
                  placeholder={curriculumExamples.resumeSkillsPlaceholder}
                  error={validationErrors.skills}
                  hint="Separate skills with commas."
                />
                <InputField
                  label="Tools"
                  optional
                  className="resume-field--full"
                  textarea
                  rows={3}
                  value={toolsInput}
                  maxLength={1500}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    toolsInputRef.current = nextValue;
                    setToolsInput(nextValue);
                    updateDraft((current) => ({
                      ...current,
                      tools: parseSkillsInput(nextValue),
                    }));
                  }}
                  placeholder={curriculumExamples.resumeToolsPlaceholder}
                  hint="Separate tools with commas, such as VS Code, Git, GitHub, or Figma."
                />
              </div>

              <div className="resume-subsection">
                <div className="resume-subsection__title"><Award size={18} /><div><strong>Certifications</strong><span>Courses, licenses, and credentials</span></div></div>
                {draft.certifications.map((item, index) => (
                  <RepeatableCard key={item.id} index={index} title={item.name || `Certification ${index + 1}`} subtitle={item.issuer || "Credential details"} onRemove={() => removeArrayItem("certifications", item.id)}>
                    <div className="resume-form-grid">
                      <InputField label="Certification" value={item.name} onChange={(event) => updateArrayItem("certifications", item.id, { name: event.target.value })} placeholder="Certification name" />
                      <InputField label="Issuer" value={item.issuer} onChange={(event) => updateArrayItem("certifications", item.id, { issuer: event.target.value })} placeholder="Issuing organization" />
                      <InputField label="Date" optional value={item.date} onChange={(event) => updateArrayItem("certifications", item.id, { date: event.target.value })} placeholder="Mar 2026" />
                      <InputField label="Credential link" optional type="url" value={item.credentialUrl} onChange={(event) => updateArrayItem("certifications", item.id, { credentialUrl: event.target.value })} placeholder="credential.example.com" />
                    </div>
                  </RepeatableCard>
                ))}
                <AddItemButton label="Add certification" onClick={() => addArrayItem("certifications")} />
              </div>

              <div className="resume-subsection">
                <div className="resume-subsection__title"><Trophy size={18} /><div><strong>Achievements</strong><span>Awards, wins, and notable outcomes</span></div></div>
                {draft.achievements.map((item, index) => (
                  <RepeatableCard key={item.id} index={index} title={item.title || `Achievement ${index + 1}`} subtitle="Achievement details" onRemove={() => removeArrayItem("achievements", item.id)}>
                    <div className="resume-form-grid">
                      <InputField label="Title" value={item.title} onChange={(event) => updateArrayItem("achievements", item.id, { title: event.target.value })} placeholder={curriculumExamples.resumeAchievementPlaceholder} />
                      <InputField label="Description" textarea rows={3} value={item.description} onChange={(event) => updateArrayItem("achievements", item.id, { description: event.target.value })} placeholder="Explain the achievement and why it matters." />
                    </div>
                  </RepeatableCard>
                ))}
                <AddItemButton label="Add achievement" onClick={() => addArrayItem("achievements")} />
              </div>

              <div className="resume-subsection">
                <div className="resume-subsection__title"><Languages size={18} /><div><strong>Languages</strong><span>Language and proficiency</span></div></div>
                {draft.languages.map((item, index) => (
                  <RepeatableCard key={item.id} index={index} title={item.name || `Language ${index + 1}`} subtitle={item.proficiency || "Language details"} onRemove={() => removeArrayItem("languages", item.id)}>
                    <div className="resume-form-grid">
                      <InputField label="Language" value={item.name} onChange={(event) => updateArrayItem("languages", item.id, { name: event.target.value })} placeholder="English" />
                      <InputField label="Proficiency" value={item.proficiency} onChange={(event) => updateArrayItem("languages", item.id, { proficiency: event.target.value })} placeholder="Professional working proficiency" />
                    </div>
                  </RepeatableCard>
                ))}
                <AddItemButton label="Add language" onClick={() => addArrayItem("languages")} />
              </div>
            </>
          )}

          {activeSection === "layout" && (
            <>
              <EditorHeading
                eyebrow="06 · Layout"
                title="Polish the presentation"
              />
              <div className="resume-layout-group">
                <div className="resume-layout-group__heading"><LayoutTemplate size={18} /><div><strong>Template</strong><span>Choose the overall character</span></div></div>
                <div className="resume-template-grid" role="group" aria-label="Resume templates">
                  {RESUME_TEMPLATES.map((template) => (
                    <button
                      type="button"
                      key={template.id}
                      className={layout.template === template.id ? "is-selected" : ""}
                      aria-pressed={layout.template === template.id}
                      onClick={() => updateLayout({ template: template.id })}
                    >
                      <strong>{template.label}</strong>
                      {layout.template === template.id && <CheckCircle2 size={17} />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="resume-layout-group">
                <div className="resume-layout-group__heading"><Palette size={18} /><div><strong>Accent color</strong><span>Used for headings and key details</span></div></div>
                <div className="resume-color-grid">
                  {RESUME_ACCENTS.map((color) => (
                    <button type="button" key={color.value} className={layout.accent === color.value ? "is-selected" : ""} onClick={() => updateLayout({ accent: color.value })}>
                      <span style={{ background: color.value }}>{layout.accent === color.value && <Check size={15} />}</span>
                      {color.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="resume-layout-group">
                <div className="resume-layout-group__heading"><Type size={18} /><div><strong>Font style</strong><span>Applied to preview and PDF</span></div></div>
                <div className="resume-font-grid" role="radiogroup" aria-label="Resume font style">
                  {RESUME_FONTS.map((fontOption) => (
                    <label
                      className={layout.fontFamily === fontOption.id ? "is-selected" : ""}
                      key={fontOption.id}
                      style={{ "--resume-font-option": fontOption.cssFamily }}
                    >
                      <input
                        checked={layout.fontFamily === fontOption.id}
                        name="resume-font-family"
                        onChange={() => updateLayout({ fontFamily: fontOption.id })}
                        type="radio"
                        value={fontOption.id}
                      />
                      <span aria-hidden="true" className="resume-font-grid__sample">Aa</span>
                      <strong>{fontOption.label}</strong>
                      {layout.fontFamily === fontOption.id ? <Check size={15} aria-hidden="true" /> : null}
                    </label>
                  ))}
                </div>
              </div>

              <div className="resume-layout-split">
                <div className="resume-layout-group">
                  <div className="resume-layout-group__heading"><Type size={18} /><div><strong>Typography</strong><span>Text scale</span></div></div>
                  <ul className="resume-choice-list" role="radiogroup" aria-label="Typography">
                    {TYPOGRAPHY_OPTIONS.map((option) => (
                      <li key={option.value}>
                        <label className={layout.typography === option.value ? "is-selected" : ""}>
                          <input
                            type="radio"
                            name="resume-typography"
                            value={option.value}
                            checked={layout.typography === option.value}
                            onChange={() => updateLayout({ typography: option.value })}
                          />
                          <span className="resume-choice-list__marker" aria-hidden="true" />
                          <span className="resume-choice-list__copy">
                            <strong>{option.label}</strong>
                            <small>{option.description}</small>
                          </span>
                          {layout.typography === option.value ? <Check size={15} aria-hidden="true" /> : null}
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="resume-layout-group">
                  <div className="resume-layout-group__heading"><Sparkles size={18} /><div><strong>Spacing</strong><span>Content density</span></div></div>
                  <ul className="resume-choice-list" role="radiogroup" aria-label="Spacing">
                    {SPACING_OPTIONS.map((option) => (
                      <li key={option.value}>
                        <label className={layout.density === option.value ? "is-selected" : ""}>
                          <input
                            type="radio"
                            name="resume-spacing"
                            value={option.value}
                            checked={layout.density === option.value}
                            onChange={() => updateLayout({ density: option.value })}
                          />
                          <span className="resume-choice-list__marker" aria-hidden="true" />
                          <span className="resume-choice-list__copy">
                            <strong>{option.label}</strong>
                            <small>{option.description}</small>
                          </span>
                          {layout.density === option.value ? <Check size={15} aria-hidden="true" /> : null}
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="resume-layout-group">
                <div className="resume-layout-group__heading"><FileText size={18} /><div><strong>Section order</strong><span>Reorder or hide optional sections</span></div></div>
                <ol className="resume-order-list">
                  {layout.sectionOrder.map((section, index) => {
                    const visible = !layout.hiddenSections.includes(section);
                    return (
                      <li key={section} className={visible ? "resume-order-row" : "resume-order-row is-hidden"}>
                        <button type="button" className={visible ? "resume-order-visibility is-visible" : "resume-order-visibility is-hidden"} onClick={() => toggleSection(section)} aria-label={`${SECTION_LABELS[section]} visibility`} aria-pressed={visible} title={`${visible ? "Hide" : "Show"} ${SECTION_LABELS[section]}`}>
                          {visible ? <Eye size={17} aria-hidden="true" /> : <EyeOff size={17} aria-hidden="true" />}
                        </button>
                        <span className="resume-order-copy"><strong>{SECTION_LABELS[section]}</strong><small aria-live="polite">{visible ? "Shown in resume" : "Hidden from resume"}</small></span>
                        <span className="resume-order-actions">
                          <button type="button" className="resume-order-move-button" onClick={() => moveSection(section, -1)} disabled={index === 0} aria-label={`Move ${SECTION_LABELS[section]} up`}><ChevronUp size={17} aria-hidden="true" /></button>
                          <button type="button" className="resume-order-move-button" onClick={() => moveSection(section, 1)} disabled={index === layout.sectionOrder.length - 1} aria-label={`Move ${SECTION_LABELS[section]} down`}><ChevronDown size={17} aria-hidden="true" /></button>
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            </>
          )}
        </main>

        <aside className="resume-preview-panel">
          <header className="resume-preview-panel__header">
            <div><span>Live preview</span><strong>A4 · {RESUME_TEMPLATES.find((item) => item.id === layout.template)?.label}</strong></div>
            <div className="resume-preview-panel__tools">
              <button
                aria-label="Start a new resume"
                className="resume-icon-button resume-preview-new-button"
                disabled={generating}
                onClick={handleNewResume}
                title="Start a new resume; saved versions are kept"
                type="button"
              >
                <Plus aria-hidden="true" size={15} />
                <span>New</span>
              </button>
              <button
                aria-controls="resume-preview-fullscreen-dialog"
                aria-expanded={previewFullscreenOpen}
                aria-haspopup="dialog"
                aria-label="Open full screen resume preview"
                className="resume-icon-button resume-preview-expand-button"
                onClick={() => setPreviewFullscreenOpen(true)}
                ref={previewFullscreenTriggerRef}
                title="Open full screen preview"
                type="button"
              >
                <Maximize2 aria-hidden="true" size={16} />
              </button>
            </div>
          </header>
          <div className="resume-preview-stage">
            <ResumePreview draft={previewDraft} layout={layout} />
          </div>
          <div className="resume-preview-actions">
            <div>
              <span><CheckCircle2 size={15} /> Autosaved</span>
              <small>Each PDF generation uses one weekly slot.</small>
            </div>
            <button
              aria-controls={resetConfirmOpen ? "resume-reset-confirm-dialog" : undefined}
              aria-expanded={resetConfirmOpen}
              aria-haspopup="dialog"
              className="resume-reset-button"
              disabled={generating}
              onClick={handleReset}
              ref={resetTriggerRef}
              type="button"
            >
              <RefreshCcw size={16} /> Reset
            </button>
            <button type="button" className="resume-generate-button" onClick={handleGenerate} disabled={generating || quotaLoading || quotaRemaining <= 0}>
              {generating ? <span className="resume-button-spinner" /> : <Download size={18} />}
              {generating
                ? selectedHistoryId ? "Re-generating…" : "Generating…"
                : quotaRemaining > 0
                  ? selectedHistoryId ? "Re-generate PDF" : "Generate PDF"
                  : "Weekly limit reached"}
            </button>
          </div>
        </aside>
      </div>

      <div aria-hidden="true" className="resume-pdf-export-surface">
        <ResumePreview draft={previewDraft} layout={layout} onPaperReady={setPreviewPaper} />
      </div>

      <div className="resume-builder-privacy-note">
        <ShieldCheck aria-hidden="true" size={15} />
        <p><strong>Your draft stays private.</strong> Previewing and editing do not use your weekly limit.</p>
      </div>

      <ResumeHistorySection
        entries={resumeHistory}
        error={historyError}
        loading={historyLoading}
        onDelete={deleteResumeHistoryEntry}
        onDeleteAll={clearResumeHistory}
        onRetry={loadResumeHistory}
        onSelect={openResumeHistoryEntry}
        selectedId={selectedHistoryId}
      />

      {notice && (
        <div className={`resume-builder-notice resume-builder-notice--${notice.type}`} role="status" aria-live="polite">
          {notice.type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{notice.message}</span>
        </div>
      )}

      {previewFullscreenOpen && typeof document !== "undefined" && createPortal(
        <div
          className="resume-preview-fullscreen-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) closePreviewFullscreen();
          }}
          role="presentation"
        >
          <section
            aria-labelledby="resume-preview-fullscreen-title"
            aria-modal="true"
            className="resume-preview-fullscreen-dialog"
            id="resume-preview-fullscreen-dialog"
            ref={previewFullscreenDialogRef}
            role="dialog"
          >
            <header className="resume-preview-fullscreen-header">
              <div>
                <span>Live preview</span>
                <strong id="resume-preview-fullscreen-title">
                  {previewDraft.personal.fullName || "Resume"} - A4
                </strong>
              </div>
              <button
                aria-label="Close full screen resume preview"
                className="resume-preview-fullscreen-close"
                onClick={closePreviewFullscreen}
                ref={previewFullscreenCloseRef}
                title="Close preview"
                type="button"
              >
                <X aria-hidden="true" size={15} strokeWidth={2.8} />
              </button>
            </header>
            <div className="resume-preview-fullscreen-stage">
              <ResumePreview draft={previewDraft} layout={layout} />
            </div>
          </section>
        </div>,
        document.body
      )}

      {resetConfirmOpen && typeof document !== "undefined" && createPortal(
        <div
          className="confirm-modal-backdrop resume-reset-dialog-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeResetConfirm();
          }}
          role="presentation"
        >
          <section
            aria-describedby="resume-reset-confirm-description"
            aria-labelledby="resume-reset-confirm-title"
            aria-modal="true"
            className="confirm-modal resume-reset-dialog"
            id="resume-reset-confirm-dialog"
            ref={resetDialogRef}
            role="alertdialog"
          >
            <div className="confirm-modal-icon warning" aria-hidden="true">
              <RefreshCcw size={22} strokeWidth={2.5} />
            </div>
            <div className="confirm-modal-copy">
              <span className="section-tag">Confirm</span>
              <h2 id="resume-reset-confirm-title">Reset resume?</h2>
              <p id="resume-reset-confirm-description">
                This clears your resume draft and layout. Your weekly PDF generation usage will stay unchanged.
              </p>
            </div>
            <div className="confirm-modal-actions">
              <button
                className="secondary-btn resume-reset-dialog__cancel"
                onClick={closeResetConfirm}
                ref={resetCancelRef}
                type="button"
              >
                Cancel
              </button>
              <button
                aria-label="OK, reset resume"
                className="confirm-danger-btn resume-reset-dialog__confirm"
                onClick={confirmReset}
                type="button"
              >
                OK
              </button>
            </div>
          </section>
        </div>,
        document.body
      )}
      </section>
    </>
  );
}
