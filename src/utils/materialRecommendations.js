import { buildLearnerAcademicContext } from "./academicProfile.js";

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

const LEVEL_PROFILES = {
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

export function getLevelProfile(academicLevel = "College") {
  const learner = buildLearnerAcademicContext({ academicLevel });
  const schoolProfile = LEVEL_PROFILES[learner.band];

  if (!schoolProfile) {
    return {
      ...LEVEL_PROFILES.college,
      queryPrefix: learner.academicLevel.toLowerCase(),
      label: `${learner.academicLevel} depth`,
      guidance: `${learner.stageGuidance} Use precise references, applied examples, and practice appropriate to this qualification.`,
    };
  }

  return {
    ...schoolProfile,
    queryPrefix: learner.classNumber ? `class ${learner.classNumber}` : learner.academicLevel.toLowerCase(),
    label: learner.classNumber
      ? `Class ${learner.classNumber} ${schoolProfile.labelSuffix}`
      : `${learner.academicLevel} ${schoolProfile.labelSuffix}`,
  };
}

export function getSubjectProfile(subjectName = "") {
  const normalized = subjectName.toLowerCase();

  return (
    SUBJECT_PROFILES.find((profile) =>
      profile.matchers.some((matcher) => normalized.includes(matcher))
    ) || {
      trackLabel: "Structured learning track",
      focus: "concept study, notes consolidation, and chapter-wise practice",
      conceptQuery: "concept tutorial",
      notesQuery: "notes pdf",
      practiceQuery: "practice questions",
      recapQuery: "revision summary",
    }
  );
}

export function buildSubjectMaterials(
  subject,
  stats = { done: 0, pending: 0, total: 0 },
  academicLevel = "College",
  academicTrack = "General"
) {
  const profile = getSubjectProfile(subject.name);
  const levelProfile = getLevelProfile(academicLevel);
  const completedChapters = Math.min(stats.done || 0, subject.chapters);
  const nextChapter = Math.min(completedChapters + 1, subject.chapters || 1);
  const remaining = Math.max(subject.chapters - completedChapters, 0);
  const trackQuery = academicTrack === "General" ? "" : ` ${academicTrack}`;
  const baseQuery = `${levelProfile.queryPrefix}${trackQuery} ${subject.name} chapter ${nextChapter}`;

  return {
    subject: subject.name,
    trackLabel: `${levelProfile.label} ${academicTrack === "General" ? "" : `${academicTrack} `}${profile.trackLabel}`,
    spotlight: `Move into Chapter ${nextChapter} next. For ${academicLevel}${academicTrack === "General" ? "" : ` ${academicTrack}`}, focus on ${levelProfile.guidance} with ${profile.focus}.`,
    completionLabel: `${completedChapters}/${subject.chapters} chapters completed`,
    remaining,
    lanes: [
      {
        title: "Concept lesson",
        provider: "YouTube",
        href: toSearchUrl(`${baseQuery} ${levelProfile.conceptQuery} ${profile.conceptQuery}`, "youtube"),
        description: `Start with a ${academicLevel} level walkthrough before doing chapter tasks.`,
      },
      {
        title: "Notes and references",
        provider: "Web notes",
        href: toSearchUrl(`${baseQuery} ${levelProfile.notesQuery} ${profile.notesQuery}`),
        description: "Keep one concise note source open while revising definitions and formulas.",
      },
      {
        title: "Practice set",
        provider: "Search",
        href: toSearchUrl(`${baseQuery} ${levelProfile.practiceQuery} ${profile.practiceQuery}`),
        description: "Follow up with level-matched practice immediately after the concept block.",
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

      if (chapterNumber < nextChapter) {
        status = "Completed";
      } else if (chapterNumber === nextChapter && remaining > 0) {
        status = "Start now";
      }

      return {
        chapterNumber,
        status,
        focus:
          chapterNumber === nextChapter && remaining > 0
            ? `Best next ${academicLevel} chapter based on your current planner progress.`
            : "Keep this chapter in your study lane after the current target.",
      };
    }),
  };
}



