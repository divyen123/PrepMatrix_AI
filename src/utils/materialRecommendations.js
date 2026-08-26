import { buildLearnerAcademicContext } from "./academicProfile.js";
import { resolveAcademicProfileExampleDomain } from "./academicProfileExamples.js";

const SUBJECT_PROFILES = [
  {
    matchers: ["math", "daa", "ds", "algorithm", "calculus", "statistics"],
    trackLabel: "Problem-solving track",
    focus: "concept clarity, formulas, and repeated worked examples",
    conceptQuery: "concept tutorial",
    notesQuery: "formula sheet notes pdf",
    practiceQuery: "practice problems worksheet",
    recapQuery: "revision questions short notes",
  },
  {
    matchers: ["software testing", "testing", "qa"],
    trackLabel: "Testing systems track",
    focus: "definitions, test design patterns, and scenario practice",
    conceptQuery: "full concepts tutorial",
    notesQuery: "notes pdf syllabus",
    practiceQuery: "important questions practice",
    recapQuery: "revision checklist viva questions",
  },
  {
    matchers: ["cloud", "aws", "azure", "devops"],
    trackLabel: "Platform understanding track",
    focus: "architecture basics, service mapping, and scenario-based design",
    conceptQuery: "beginner tutorial architecture",
    notesQuery: "notes pdf services summary",
    practiceQuery: "mcq practice questions",
    recapQuery: "revision sheet interview questions",
  },
  {
    matchers: ["front", "frontend", "ui", "react", "web"],
    trackLabel: "Build-and-ship track",
    focus: "core concepts, implementation patterns, and mini builds",
    conceptQuery: "project-based tutorial",
    notesQuery: "handwritten notes pdf concepts",
    practiceQuery: "coding exercises mini project",
    recapQuery: "interview questions revision",
  },
  {
    matchers: ["dl", "deep learning", "machine learning", "ai"],
    trackLabel: "Model intuition track",
    focus: "theory, diagrams, and applied question practice",
    conceptQuery: "full course beginner",
    notesQuery: "notes pdf important topics",
    practiceQuery: "numerical problems mcq",
    recapQuery: "revision summary interview questions",
  },
];
const DEFAULT_SUBJECT_PROFILE = Object.freeze({
  trackLabel: "Structured learning track",
  focus: "concept study, notes consolidation, and chapter-wise practice",
  conceptQuery: "concept tutorial",
  notesQuery: "notes pdf",
  practiceQuery: "practice questions",
  recapQuery: "revision summary",
});
const DOMAIN_PROFILE_GROUPS = Object.freeze({
  health: {
    focus: "core mechanisms, clinical or practical correlations, diagrams, and evidence-based review",
    conceptQuery: "lecture clinical correlation diagrams",
    notesQuery: "medical notes diagrams pdf",
    practiceQuery: "exam questions clinical cases",
    recapQuery: "rapid review high yield summary",
  },
  law: {
    focus: "legal principles, authorities, case analysis, and structured application",
    conceptQuery: "law lecture case analysis",
    notesQuery: "case notes bare act summary pdf",
    practiceQuery: "problem questions case analysis",
    recapQuery: "legal principles revision summary",
  },
  business: {
    focus: "frameworks, calculations, worked cases, and decision-making practice",
    conceptQuery: "lecture worked examples case study",
    notesQuery: "business notes formulas frameworks pdf",
    practiceQuery: "case study problems questions",
    recapQuery: "revision summary key formulas",
  },
  science: {
    focus: "foundational theory, diagrams, experiments, data interpretation, and worked problems",
    conceptQuery: "university lecture diagrams",
    notesQuery: "scientific notes diagrams pdf",
    practiceQuery: "problems questions with answers",
    recapQuery: "revision summary concept map",
  },
  humanities: {
    focus: "primary concepts, evidence, interpretations, critical reading, and structured writing",
    conceptQuery: "lecture concepts evidence",
    notesQuery: "study notes readings pdf",
    practiceQuery: "essay questions source analysis",
    recapQuery: "revision themes summary",
  },
  education: {
    focus: "learning theory, classroom application, inclusive practice, and reflective analysis",
    conceptQuery: "education lecture classroom examples",
    notesQuery: "pedagogy notes pdf",
    practiceQuery: "case questions lesson planning",
    recapQuery: "teaching theory revision summary",
  },
  applied: {
    focus: "core principles, safe procedures, applied examples, and project-based practice",
    conceptQuery: "applied lecture worked demonstration",
    notesQuery: "technical notes standards pdf",
    practiceQuery: "applied exercises project questions",
    recapQuery: "practical revision checklist",
  },
  school: {
    focus: "syllabus concepts, familiar examples, diagrams, and class-appropriate practice",
    conceptQuery: "school chapter explanation",
    notesQuery: "school chapter notes worksheet pdf",
    practiceQuery: "class practice questions answers",
    recapQuery: "school revision summary",
  },
});
const HEALTH_DOMAINS = new Set(["dentistry", "medicine", "nursing", "pharmacy", "physiotherapy", "publicHealth"]);
const SHORT_SUBJECT_MATCHERS = new Set(["ai", "dl", "ds", "qa", "ui"]);
const COMPACT_SUBJECT_ALIASES = Object.freeze({
  ai: ["aiml"],
  ds: ["dsa"],
  qa: ["qaqc"],
  ui: ["uiux"],
});
const DOMAIN_TRACK_LABELS = Object.freeze({
  dentistry: "Dental sciences track",
  medicine: "Medical sciences track",
  nursing: "Nursing sciences track",
  pharmacy: "Pharmaceutical sciences track",
  physiotherapy: "Physiotherapy track",
  publicHealth: "Public health track",
});

function subjectMatcherMatches(subjectName, matcher) {
  if (!SHORT_SUBJECT_MATCHERS.has(matcher)) return subjectName.includes(matcher);
  return [matcher, ...(COMPACT_SUBJECT_ALIASES[matcher] || [])].some((term) =>
    new RegExp(`(?:^|[^a-z0-9])${term}(?:$|[^a-z0-9])`, "u").test(subjectName)
  );
}

function getDomainSubjectProfile(academicProfile = {}) {
  const domain = resolveAcademicProfileExampleDomain(academicProfile);
  if (HEALTH_DOMAINS.has(domain)) return { ...DOMAIN_PROFILE_GROUPS.health, trackLabel: DOMAIN_TRACK_LABELS[domain] };
  if (domain === "law") return { ...DOMAIN_PROFILE_GROUPS.law, trackLabel: "Law and case-analysis track" };
  if (["commerce", "business", "seniorCommerce"].includes(domain)) return { ...DOMAIN_PROFILE_GROUPS.business, trackLabel: "Commerce and business track" };
  if (["naturalScience", "lifeScience", "seniorScience"].includes(domain)) return { ...DOMAIN_PROFILE_GROUPS.science, trackLabel: "Scientific study track" };
  if (["humanities", "socialScience", "seniorHumanities"].includes(domain)) return { ...DOMAIN_PROFILE_GROUPS.humanities, trackLabel: "Humanities and social-science track" };
  if (domain === "education") return { ...DOMAIN_PROFILE_GROUPS.education, trackLabel: "Education and pedagogy track" };
  if (["engineering", "electronics", "computing", "environment", "architecture", "hospitality", "vocational", "professional"].includes(domain)) return { ...DOMAIN_PROFILE_GROUPS.applied, trackLabel: "Applied learning track" };
  if (["early", "primary", "middle", "secondary", "senior"].includes(domain)) return { ...DOMAIN_PROFILE_GROUPS.school, trackLabel: "Foundation learning track" };
  if (domain === "competitive") return { ...DOMAIN_PROFILE_GROUPS.school, trackLabel: "Competitive-exam track" };
  return DEFAULT_SUBJECT_PROFILE;
}

const LEVEL_PROFILES = {
  early: {
    labelSuffix: "play & learn",
    guidance: "short audio-led or picture-led examples, playful demonstrations, and one-step activities",
    conceptQuery: "kindergarten kids learning visual song story",
    notesQuery: "kindergarten printable picture worksheet",
    practiceQuery: "kindergarten matching counting learning game",
    recapQuery: "kindergarten quick revision activity game",
  },
  primary: {
    labelSuffix: "friendly",
    guidance: "simple examples, visual explanations, vocabulary support, and short practice",
    conceptQuery: "kids learning easy explanation animated",
    notesQuery: "worksheet notes pdf",
    practiceQuery: "practice worksheet with answers",
    recapQuery: "quick revision worksheet",
  },
  middle: {
    labelSuffix: "foundation",
    guidance: "clear definitions, examples, diagrams, and guided worksheets",
    conceptQuery: "school level easy chapter explanation",
    notesQuery: "school notes worksheet pdf",
    practiceQuery: "practice questions worksheet answers",
    recapQuery: "revision notes worksheet summary",
  },
  secondary: {
    labelSuffix: "exam prep",
    guidance: "syllabus concepts, textbook notes, examples, and exam-style practice",
    conceptQuery: "full chapter explanation school syllabus",
    notesQuery: "notes pdf textbook syllabus",
    practiceQuery: "important questions practice answers",
    recapQuery: "revision notes mind map summary",
  },
  senior: {
    labelSuffix: "board track",
    guidance: "board-focused concepts, solved examples, formulas, and previous-year practice",
    conceptQuery: "full chapter explanation board exam",
    notesQuery: "notes pdf ncert board exam",
    practiceQuery: "previous year questions important questions",
    recapQuery: "revision notes formula sheet mind map",
  },
  college: {
    queryPrefix: "college university",
    label: "College depth",
    guidance: "deeper references, applied examples, and self-study practice",
    conceptQuery: "university lecture tutorial",
    notesQuery: "university notes pdf",
    practiceQuery: "solved problems assignment questions",
    recapQuery: "exam revision summary interview questions",
  },
};

function toSearchUrl(query, provider = "google") {
  const encoded = encodeURIComponent(query);

  if (provider === "youtube") {
    return `https://www.youtube.com/results?search_query=${encoded}`;
  }

  return `https://www.google.com/search?q=${encoded}`;
}

export function getLevelProfile(academicProfile = "College") {
  const learner = buildLearnerAcademicContext(
    academicProfile && typeof academicProfile === "object" ? academicProfile : { academicLevel: academicProfile }
  );
  const schoolProfile = LEVEL_PROFILES[learner.band];

  if (!schoolProfile) {
    return {
      ...LEVEL_PROFILES.college,
      queryPrefix: learner.academicLevel.toLowerCase(),
      label: `${learner.academicLevel} depth`,
      guidance: `${learner.stageGuidance} Use precise references, applied examples, and practice appropriate to this qualification.`,
    };
  }

  const exactSchoolLevel = learner.classNumber ? `Class ${learner.classNumber}` : learner.grade;
  return {
    ...schoolProfile,
    queryPrefix: exactSchoolLevel ? exactSchoolLevel.toLowerCase() : learner.academicLevel.toLowerCase(),
    label: exactSchoolLevel
      ? `${exactSchoolLevel} ${schoolProfile.labelSuffix}`
      : `${learner.academicLevel} ${schoolProfile.labelSuffix}`,
  };
}

export function getSubjectProfile(subjectName = "", academicProfile = {}) {
  const normalized = subjectName.toLowerCase();

  return (
    SUBJECT_PROFILES.find((profile) =>
      profile.matchers.some((matcher) => subjectMatcherMatches(normalized, matcher))
    ) || getDomainSubjectProfile(academicProfile)
  );
}

export function buildSubjectMaterials(
  subject,
  stats = { done: 0, pending: 0, total: 0 },
  academicLevel = "College",
  academicTrack = "General",
  academicProfile = {}
) {
  const learner = buildLearnerAcademicContext({
    ...academicProfile,
    academicLevel: academicProfile?.academicLevel || academicLevel,
    academicTrack: academicProfile?.academicTrack || academicTrack,
  });
  const profile = getSubjectProfile(subject.name, learner);
  const levelProfile = getLevelProfile(learner);
  const completedChapters = Math.min(stats.done || 0, subject.chapters);
  const remaining = Math.max(subject.chapters - completedChapters, 0);
  const nextChapter = remaining > 0
    ? Math.min(completedChapters + 1, subject.chapters || 1)
    : subject.chapters || 1;
  const pathwayParts = [
    learner.grade || learner.degree,
    learner.academicTrack !== "General" ? learner.academicTrack : "",
    learner.department !== "General / Undeclared" ? learner.department : "",
  ].filter(Boolean).filter((value, index, values) => (
    values.findIndex((candidate) => candidate.toLocaleLowerCase() === value.toLocaleLowerCase()) === index
  ));
  const audienceParts = [learner.academicLevel, ...pathwayParts]
    .filter((value, index, values) => values.indexOf(value) === index);
  const audienceLabel = audienceParts.join(" · ");
  const pathwayLabel = pathwayParts.join(" · ");
  const queryContext = pathwayParts.join(" ");
  const baseQuery = `${levelProfile.queryPrefix}${queryContext ? ` ${queryContext}` : ""} ${subject.name} chapter ${nextChapter}`;

  return {
    subject: subject.name,
    trackLabel: `${levelProfile.label}${pathwayLabel ? ` · ${pathwayLabel}` : ""} · ${profile.trackLabel}`,
    spotlight: remaining > 0
      ? `Move into Chapter ${nextChapter} next. For ${audienceLabel}, focus on ${levelProfile.guidance} with ${profile.focus}.`
      : `All ${subject.chapters} chapters are complete. For ${audienceLabel}, consolidate ${profile.focus} through active recall and spaced revision.`,
    completionLabel: `${completedChapters}/${subject.chapters} Completed`,
    remaining,
    lanes: [
      {
        title: "Concept lesson",
        provider: "YouTube",
        href: toSearchUrl(`${baseQuery} ${levelProfile.conceptQuery} ${profile.conceptQuery}`, "youtube"),
        description: `Start with a ${audienceLabel} walkthrough before doing chapter tasks.`,
      },
      {
        title: "Notes and references",
        provider: "Web notes",
        href: toSearchUrl(`${baseQuery} ${levelProfile.notesQuery} ${profile.notesQuery}`),
        description: "Keep one concise source open while revising key terms, diagrams, evidence, or worked methods.",
      },
      {
        title: "Practice set",
        provider: "Search",
        href: toSearchUrl(`${baseQuery} ${levelProfile.practiceQuery} ${profile.practiceQuery}`),
        description: "Follow up with profile-matched questions or applied practice immediately after the concept block.",
      },
      {
        title: "Revision recap",
        provider: "Search",
        href: toSearchUrl(`${baseQuery} ${levelProfile.recapQuery} ${profile.recapQuery}`),
        description: "Use a compact recap before your next spaced revision session.",
      },
    ],
    chapterPath: Array.from({ length: Math.min(subject.chapters, 5) }, (_, index) => {
      const chapterNumber = index + 1;
      let status = "Upcoming";

      if (chapterNumber <= completedChapters) {
        status = "Completed";
      } else if (chapterNumber === nextChapter && remaining > 0) {
        status = "Start now";
      }

      return {
        chapterNumber,
        status,
        focus:
          chapterNumber === nextChapter && remaining > 0
            ? `Best next ${audienceLabel} chapter based on your current planner progress.`
            : "Keep this chapter in your study lane after the current target.",
      };
    }),
  };
}



