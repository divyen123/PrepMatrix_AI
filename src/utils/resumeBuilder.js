import { normalizeAcademicProfile } from "./academicProfile.js";

export const RESUME_WEEKLY_LIMIT = 5;
export const RESUME_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export const RESUME_ELIGIBLE_TRACKS = Object.freeze([
  "Undergraduate / Degree",
  "Diploma / Vocational",
  "Engineering & Technology",
  "Computer Science & IT",
  "Medical & Health Sciences",
  "Law & Legal Studies",
  "Business & Management",
  "Commerce & Finance",
  "Arts & Humanities",
  "Social Sciences",
  "Natural Sciences",
  "Education & Teaching",
  "Agriculture & Environmental Studies",
  "Architecture & Design",
  "Professional Certification",
]);

const RESUME_ELIGIBLE_LEVELS = new Map([
  ["Diploma / Vocational", "Diploma / Vocational"],
  ["Undergraduate / Bachelor's", "Undergraduate / Degree"],
  ["Postgraduate / Master's", "Undergraduate / Degree"],
  ["Doctoral / Research", "Undergraduate / Degree"],
  ["Medical / Health Sciences", "Medical & Health Sciences"],
  ["Law / Legal Studies", "Law & Legal Studies"],
  ["Professional / Certification", "Professional Certification"],
]);

export const RESUME_SECTIONS = Object.freeze([
  "summary",
  "skills",
  "experience",
  "projects",
  "education",
  "certifications",
  "achievements",
  "languages",
]);

export const RESUME_TEMPLATES = Object.freeze([
  { id: "modern", label: "Modern", description: "Confident accent header and balanced spacing." },
  { id: "classic", label: "Classic", description: "Traditional hierarchy for formal applications." },
  { id: "compact", label: "Compact", description: "Dense layout for experience-rich profiles." },
]);

export const RESUME_ACCENTS = Object.freeze([
  { value: "#0f9f8f", label: "Teal" },
  { value: "#5b7cfa", label: "Indigo" },
  { value: "#a56ef5", label: "Violet" },
  { value: "#d97757", label: "Terracotta" },
  { value: "#334155", label: "Slate" },
]);

const cleanText = (value, max = 500) => String(value ?? "").replace(/\r\n/g, "\n").slice(0, max);
const cleanLine = (value, max = 160) => cleanText(value, max).replace(/\s*\n+\s*/g, " ").trim();
const cleanEditingLine = (value, max = 160) => cleanText(value, max).replace(/\s*\n+\s*/g, " ");
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const isEditingMode = (options) => options?.mode === "editing";
const lineCleaner = (options) => (isEditingMode(options) ? cleanEditingLine : cleanLine);

function cleanUrl(value) {
  const raw = cleanLine(value, 240);
  if (!raw) return "";
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function firstText(...values) {
  return values.map((value) => cleanLine(value)).find(Boolean) || "";
}

export function createResumeItemId(prefix = "item") {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeHighlights(value, options) {
  const source = Array.isArray(value)
    ? value
    : value == null || value === ""
      ? []
      : cleanText(value, 1800).split("\n");
  const normalized = source.map((item) => lineCleaner(options)(item, 240));
  return (isEditingMode(options) ? normalized : normalized.filter(Boolean)).slice(0, 8);
}

function normalizeEducation(item = {}, fallbackId, options) {
  const clean = lineCleaner(options);
  return {
    id: cleanLine(item.id, 100) || fallbackId || createResumeItemId("education"),
    institution: clean(item.institution, 140),
    degree: clean(item.degree, 140),
    field: clean(item.field, 140),
    location: clean(item.location, 100),
    startDate: clean(item.startDate, 40),
    endDate: clean(item.endDate, 40),
    score: clean(item.score, 80),
    highlights: normalizeHighlights(item.highlights, options),
  };
}

function normalizeExperience(item = {}, fallbackId, options) {
  const clean = lineCleaner(options);
  return {
    id: cleanLine(item.id, 100) || fallbackId || createResumeItemId("experience"),
    role: clean(item.role, 140),
    organization: clean(item.organization, 140),
    location: clean(item.location, 100),
    startDate: clean(item.startDate, 40),
    endDate: clean(item.endDate, 40),
    current: Boolean(item.current),
    highlights: normalizeHighlights(item.highlights, options),
  };
}

function normalizeProject(item = {}, fallbackId, options) {
  const clean = lineCleaner(options);
  return {
    id: cleanLine(item.id, 100) || fallbackId || createResumeItemId("project"),
    name: clean(item.name, 140),
    role: clean(item.role, 120),
    link: clean(item.link, 240),
    technologies: clean(item.technologies, 240),
    startDate: clean(item.startDate, 40),
    endDate: clean(item.endDate, 40),
    highlights: normalizeHighlights(item.highlights, options),
  };
}

function normalizeCertification(item = {}, fallbackId, options) {
  const clean = lineCleaner(options);
  return {
    id: cleanLine(item.id, 100) || fallbackId || createResumeItemId("certification"),
    name: clean(item.name, 160),
    issuer: clean(item.issuer, 140),
    date: clean(item.date, 40),
    credentialUrl: clean(item.credentialUrl, 240),
  };
}

function normalizeAchievement(item = {}, fallbackId, options) {
  return {
    id: cleanLine(item.id, 100) || fallbackId || createResumeItemId("achievement"),
    title: lineCleaner(options)(item.title, 160),
    description: isEditingMode(options)
      ? cleanText(item.description, 500)
      : cleanText(item.description, 500).trim(),
  };
}

function normalizeLanguage(item = {}, fallbackId, options) {
  const clean = lineCleaner(options);
  return {
    id: cleanLine(item.id, 100) || fallbackId || createResumeItemId("language"),
    name: clean(item.name, 80),
    proficiency: clean(item.proficiency, 80),
  };
}

function normalizeItems(items, normalizer, prefix, limit, options) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, limit).map((item, index) => normalizer(item, `${prefix}-${index + 1}`, options));
}

function buildProfileEducation(profile = {}) {
  const hasAcademicInput = [
    profile.academicLevel,
    profile.academicTrack,
    profile.degreeQualification,
    profile.degreeProgram,
    profile.degree,
    profile.qualification,
    profile.departmentSpecialization,
    profile.specialization,
    profile.fieldOfStudy,
    profile.department,
    profile.curriculum,
    profile.institutionName,
    profile.institution,
    profile.college,
    profile.school,
  ].some((value) => cleanLine(value));
  if (!hasAcademicInput) return [];
  const academic = normalizeAcademicProfile(profile);
  const degree = firstText(
    profile.degreeQualification,
    profile.degreeProgram,
    profile.degree,
    profile.qualification,
    academic.academicLevel
  );
  const field = firstText(
    profile.departmentSpecialization,
    profile.specialization,
    profile.fieldOfStudy,
    profile.department,
    profile.curriculum,
    academic.academicTrack !== "General" ? academic.academicTrack : ""
  );
  const institution = firstText(
    profile.institutionName,
    profile.institution,
    profile.college,
    profile.school,
    profile.organization
  );
  if (!degree && !field && !institution) return [];
  return [
    normalizeEducation(
      {
        degree,
        field,
        institution,
      },
      "education-profile"
    ),
  ];
}

export function createResumeDraft(profile = {}) {
  return {
    personal: {
      fullName: firstText(profile.fullName, profile.username, profile.name),
      headline: firstText(profile.professionalTitle, profile.headline),
      email: firstText(profile.email),
      phone: firstText(profile.phone, profile.phoneNumber),
      location: firstText(profile.location, profile.city),
      linkedin: firstText(profile.linkedin, profile.linkedinUrl),
      github: firstText(profile.github, profile.githubUrl),
      portfolio: firstText(profile.portfolio, profile.website),
    },
    summary: "",
    skills: [],
    experience: [],
    projects: [],
    education: buildProfileEducation(profile),
    certifications: [],
    achievements: [],
    languages: [],
  };
}

export function normalizeResumeDraft(value, profile = {}, options = {}) {
  const source = value && typeof value === "object" ? value : {};
  const profileDraft = createResumeDraft(profile);
  const personal = source.personal && typeof source.personal === "object" ? source.personal : {};
  const clean = lineCleaner(options);
  const skillsSource = Array.isArray(source.skills)
    ? source.skills
    : source.skills == null || source.skills === ""
      ? []
      : cleanText(source.skills, 1500).split(/[\n,]/);
  const normalizedSkills = skillsSource.map((item) => clean(item, 80));

  return {
    personal: {
      fullName: clean(hasOwn(personal, "fullName") ? personal.fullName : profileDraft.personal.fullName, 120),
      headline: clean(hasOwn(personal, "headline") ? personal.headline : profileDraft.personal.headline, 140),
      email: clean(hasOwn(personal, "email") ? personal.email : profileDraft.personal.email, 160),
      phone: clean(personal.phone, 60),
      location: clean(personal.location, 100),
      linkedin: isEditingMode(options) ? clean(personal.linkedin, 240) : cleanUrl(personal.linkedin),
      github: isEditingMode(options) ? clean(personal.github, 240) : cleanUrl(personal.github),
      portfolio: isEditingMode(options) ? clean(personal.portfolio, 240) : cleanUrl(personal.portfolio),
    },
    summary: isEditingMode(options) ? cleanText(source.summary, 1200) : cleanText(source.summary, 1200).trim(),
    skills: (isEditingMode(options) ? normalizedSkills : normalizedSkills.filter(Boolean)).slice(0, 40),
    experience: normalizeItems(source.experience, normalizeExperience, "experience", 12, options),
    projects: normalizeItems(source.projects, normalizeProject, "project", 12, options),
    education: Array.isArray(source.education)
      ? normalizeItems(source.education, normalizeEducation, "education", 8, options)
      : profileDraft.education,
    certifications: normalizeItems(source.certifications, normalizeCertification, "certification", 12, options),
    achievements: normalizeItems(source.achievements, normalizeAchievement, "achievement", 12, options),
    languages: normalizeItems(source.languages, normalizeLanguage, "language", 12, options),
  };
}

export function normalizeResumeLayout(value = {}) {
  const template = RESUME_TEMPLATES.some((item) => item.id === value?.template) ? value.template : "modern";
  const accent = RESUME_ACCENTS.some((item) => item.value === value?.accent) ? value.accent : "#0f9f8f";
  const typography = ["compact", "balanced", "large"].includes(value?.typography) ? value.typography : "balanced";
  const density = ["compact", "balanced", "airy"].includes(value?.density) ? value.density : "balanced";
  const suppliedOrder = Array.isArray(value?.sectionOrder) ? value.sectionOrder : [];
  const sectionOrder = [
    ...suppliedOrder.filter((item, index) => RESUME_SECTIONS.includes(item) && suppliedOrder.indexOf(item) === index),
    ...RESUME_SECTIONS.filter((item) => !suppliedOrder.includes(item)),
  ];
  const hiddenSections = Array.isArray(value?.hiddenSections)
    ? value.hiddenSections.filter((item, index) => RESUME_SECTIONS.includes(item) && value.hiddenSections.indexOf(item) === index)
    : [];

  return { template, accent, typography, density, sectionOrder, hiddenSections };
}

export function activeResumeGenerations(value, now = Date.now()) {
  const threshold = Number(now) - RESUME_WINDOW_MS;
  const source = Array.isArray(value) ? value : [];
  return source
    .map((item) => new Date(item))
    .filter((date) => Number.isFinite(date.getTime()) && date.getTime() > threshold && date.getTime() <= Number(now) + 60_000)
    .sort((a, b) => a - b)
    .map((date) => date.toISOString())
    .slice(-RESUME_WEEKLY_LIMIT);
}

export function getResumeQuota(value, now = Date.now()) {
  const timestamps = activeResumeGenerations(value, now);
  const used = timestamps.length;
  const oldest = timestamps[0] ? new Date(timestamps[0]).getTime() : null;
  return {
    used,
    remaining: Math.max(0, RESUME_WEEKLY_LIMIT - used),
    canGenerate: used < RESUME_WEEKLY_LIMIT,
    resetAt: oldest ? new Date(oldest + RESUME_WINDOW_MS).toISOString() : null,
    timestamps,
  };
}

export function recordResumeGeneration(state, now = Date.now()) {
  const normalized = normalizeResumeBuilderState(state);
  const quota = getResumeQuota(normalized.generationTimestamps, now);
  if (!quota.canGenerate) return normalized;
  return {
    ...normalized,
    generationTimestamps: [...quota.timestamps, new Date(now).toISOString()],
    lastGeneratedAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
  };
}

export function normalizeResumeBuilderState(value, profile = {}, options = {}) {
  const source = value && typeof value === "object" ? value : {};
  return {
    draft: normalizeResumeDraft(source.draft, profile, options),
    layout: normalizeResumeLayout(source.layout),
    generationTimestamps: activeResumeGenerations(source.generationTimestamps),
    lastGeneratedAt: cleanLine(source.lastGeneratedAt, 40) || null,
    updatedAt: cleanLine(source.updatedAt, 40) || null,
  };
}

export function getResumeEligibility(profile = {}) {
  const normalized = normalizeAcademicProfile(profile);
  const trackMatch = RESUME_ELIGIBLE_TRACKS.find(
    (track) => track.toLowerCase() === String(normalized.academicTrack || "").trim().toLowerCase()
  );
  const levelMatch = RESUME_ELIGIBLE_LEVELS.get(normalized.academicLevel);
  const category = trackMatch || levelMatch || null;
  const optional = category === "Professional Certification";
  return {
    enabled: Boolean(category),
    eligible: Boolean(category),
    optional,
    category,
    academicProfile: normalized,
  };
}

export function validateResumeDraft(draft) {
  const normalized = normalizeResumeDraft(draft);
  const errors = {};
  if (!normalized.personal.fullName) errors.fullName = "Add your full name.";
  if (!normalized.personal.headline) errors.headline = "Add a professional headline.";
  if (!normalized.personal.email) {
    errors.email = "Add an email address.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.personal.email)) {
    errors.email = "Enter a valid email address.";
  }
  if (!normalized.summary) errors.summary = "Add a short professional summary.";
  if (!normalized.education.some((item) => item.institution || item.degree || item.field)) {
    errors.education = "Add at least one education entry.";
  }
  if (!normalized.skills.length) errors.skills = "Add at least one skill.";
  return { valid: Object.keys(errors).length === 0, errors, draft: normalized };
}
