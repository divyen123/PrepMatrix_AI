import { normalizeAcademicProfile } from "./academicProfile.js";
import { PLACEMENT_WORKSPACE_ARTIFACT_KIND } from "./learningNotebook.js";

export const CODE_MATRIX_PATH = "/learn/code-matrix";

const COMPUTING_TERMS = /\b(?:computer (?:science|engineering|applications?|programming|networks?)|information (?:technology|systems?)|artificial intelligence|machine learning|deep learning|data (?:science|analytics|structures)|cyber\s*security|software (?:engineering|development)|informatics(?: practices)?|computing|databases?|database management(?: systems?)?|relational databases?|structured query language|web (?:development|design|programming|technologies)|front\s*end development|back\s*end development|full\s*stack development|object oriented programming|operating systems?|bca|mca|b c a|m c a|dbms|rdbms)\b/u;
const PROGRAMMING_TITLES = /^(?:(?:introduction|intro|fundamentals|principles|basics) (?:of|to) |(?:basic|advanced|applied|practical) )?(?:programming|coding|algorithms)(?: (?:fundamentals|principles|basics|languages|lab|laboratory|course|techniques|methodology|i|ii|\d+))*$/u;
const PROGRAMMING_CONTEXT = /\b(?:(?:computer|systems?|functional|procedural|object oriented) programming|programming (?:in|with|using|languages?|fundamentals|basics)|(?:data analysis|scientific computing|scripting|coding) (?:in|with|using))\b/u;
const COMPUTING_ACRONYM_TITLE = /^(?:cs|cse|it|ict|ai|ml)(?: (?:cs|cse|it|ict|ai|ml|and|fundamentals|basics|applications|engineering|lab|\d+))*$/u;
const COMPUTING_QUALIFICATION = /\b(?:b tech|btech|b e|b sc|bsc|m tech|mtech|m e|m sc|msc|ph d|phd|bachelor\w*|master\w*|diploma|degree|certificate|certification)\b/u;
const LANGUAGE_TOKENS = /(?<![a-z0-9_])(?:c\+\+|c plus plus|cpp|python|javascript|java|sql|html|css|c)(?![a-z0-9_+#])/gu;
const LANGUAGE_TITLE_PREFIX = /^(?:(?:introduction|intro|fundamentals|basics) (?:of|to) |(?:basic|advanced|applied|practical|beginner|intermediate) )?$/u;
const LANGUAGE_TITLE_SUFFIX = /^(?: (?:programming|language|basic|advanced|beginner|intermediate|basics|fundamentals|essentials|course|lab|laboratory|i|ii|\d+))*$/u;
const LANGUAGE_LIST_TITLE = /^(?:(?:introduction|intro|fundamentals|basics) (?:of|to) |(?:basic|advanced|applied|practical|beginner|intermediate) )?language(?: (?:and |or )?language)+(?: (?:programming|languages|basics|fundamentals|course|lab))*$/u;

function text(value) {
  return typeof value === "string" ? value.normalize("NFKC").replace(/\s+/gu, " ").trim() : "";
}

function words(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/gu, " ").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

// These are the string/object names accepted by subjectPlanning.js as well.
function label(value) {
  if (typeof value === "string") return text(value);
  return text(value?.name ?? value?.subjectName ?? value?.title ?? value?.label);
}

function subjectLabels(subjects) {
  return list(subjects).flatMap((subject) => [
    label(subject),
    ...list(subject?.topics).map(label),
    ...list(subject?.chapterNames).map(label),
  ]).filter(Boolean);
}

function hasComputingTerms(value) {
  const key = words(value);
  return COMPUTING_TERMS.test(key)
    || PROGRAMMING_TITLES.test(key)
    || PROGRAMMING_CONTEXT.test(key)
    || COMPUTING_ACRONYM_TITLE.test(key)
    || (COMPUTING_QUALIFICATION.test(key) && /\b(?:cs|cse|it|ict|ai|ml)\b/u.test(key));
}

function explicitLanguages(value) {
  const source = text(value).toLowerCase();
  const languageList = LANGUAGE_LIST_TITLE.test(words(source.replace(LANGUAGE_TOKENS, " language ")));
  const languages = [];
  for (const match of source.matchAll(LANGUAGE_TOKENS)) {
    const language = ["c++", "c plus plus", "cpp"].includes(match[0]) ? "cpp" : match[0];
    const prefix = words(source.slice(0, match.index));
    const suffix = words(source.slice(match.index + match[0].length));
    // C, Java and Python also have non-computing meanings. A standalone course
    // title or a programming context is needed; e.g. Java history is insufficient.
    const courseTitle = LANGUAGE_TITLE_PREFIX.test(prefix ? `${prefix} ` : "")
      && (LANGUAGE_TITLE_SUFFIX.test(suffix ? ` ${suffix}` : "") || /^for\s+\S/u.test(suffix));
    if (!["c", "java", "python"].includes(language) || courseTitle || languageList || hasComputingTerms(value)) {
      languages.push(language);
    }
  }
  return languages;
}

function isComputingLabel(value) {
  return hasComputingTerms(value) || explicitLanguages(value).length > 0;
}

function recommendedLanguage(academic, profile, courseLabels, academicLabels) {
  // Explicit course/subject languages win over general specialization and board
  // suggestions. Multiple explicit languages retain the caller's label order.
  for (const value of [...courseLabels, ...academicLabels]) {
    const [language] = explicitLanguages(value);
    if (language) return language;
  }
  if (courseLabels.some((value) => /\b(?:databases?|dbms|rdbms|structured query language)\b/u.test(words(value)))) {
    return "sql";
  }
  const board = [academic.academicTrack, text(profile.board)].map(words).join(" ");
  if (academic.schoolType === "school" && /\b(?:icse|isc)\b/u.test(board)) return "java";
  // No syllabus edition or historical board/year language is inferred.
  return "python";
}

/**
 * Pure eligibility guidance, independent of routing or compiler availability.
 * @returns {{eligible: boolean, reason: string, defaultLanguage: 'python'|'c'|'cpp'|'java'|'javascript'|'sql'|'html'|'css'}}
 * A recommendation is a starting language, not a curriculum-coverage claim.
 */
export function getCodeMatrixEligibility(profile = {}, subjects = []) {
  const source = profile && typeof profile === "object" ? profile : {};
  const academic = normalizeAcademicProfile(source);
  if (["early", "primary"].includes(academic.band)) {
    return {
      eligible: false,
      reason: "CodeMatrix is intended for middle school and later computing study.",
      defaultLanguage: "python",
    };
  }

  const courseLabels = [
    label(source.course),
    text(source.courseName),
    ...subjectLabels(source.courses),
    ...subjectLabels(subjects),
  ].filter(Boolean);
  const academicLabels = [academic.academicTrack];
  if (academic.schoolType === "school") {
    // Normalization intentionally clears streams without a Class 11/12 number;
    // an explicitly senior profile can still supply a meaningful stream.
    if (academic.band === "senior") {
      academicLabels.push(text(source.schoolStream ?? source.subjectGroup ?? source.stream));
    }
  } else {
    academicLabels.push(academic.degree, academic.department, text(source.academicLevel));
  }

  const relevantCourse = courseLabels.some(isComputingLabel);
  const relevantProfile = academicLabels.some(isComputingLabel);
  return {
    eligible: relevantCourse || relevantProfile,
    reason: relevantCourse
      ? "A computing subject or course is present."
      : relevantProfile
        ? "The academic profile includes a computing discipline or stream."
        : "A computing subject, course, or specialization is needed to establish eligibility.",
    defaultLanguage: recommendedLanguage(academic, source, courseLabels, academicLabels),
  };
}

function hasContent(value) {
  if (typeof value === "string") return Boolean(text(value));
  if (!value || typeof value !== "object") return false;
  return ["content", "body", "text", "summary", "overview", "explanation", "note", "question", "answer"]
    .some((key) => Boolean(text(value[key])))
    || ["keyPoints", "bullets"].some((key) => list(value[key]).some((item) => Boolean(text(item))));
}

function hasTopicContent(topic) {
  return Boolean(topic && typeof topic === "object" && (
    hasContent(topic)
      || list(topic.subtopics).some((subtopic) => typeof subtopic === "object" && hasContent(subtopic))
  ));
}

function hasNotebook(notebook) {
  if (!notebook || typeof notebook !== "object"
    || notebook.placeholder === true || notebook.isPlaceholder === true
    || text(notebook.artifactKind) === PLACEMENT_WORKSPACE_ARTIFACT_KIND) return false;

  const notes = notebook.revisedNotes ?? notebook.notes;
  const studyContent = list(notes?.sections ?? notes).some(hasContent)
    || list(notebook.importantQuestions).some(hasContent)
    || list(notebook.topics).some(hasTopicContent)
    || list(notebook.chapters).some((chapter) => (
      chapter && typeof chapter === "object"
        && (hasContent(chapter) || list(chapter.topics).some(hasTopicContent))
    ));
  // A placement-only legacy record can have an overview without study content.
  const career = notebook.careerPreparation;
  const placementContent = [career?.history, career?.topicAnalysis?.topics, career?.codingTopics, career?.interviewQuestions]
    .some((items) => list(items).length > 0);
  return studyContent || (!placementContent && hasContent(notebook));
}

/**
 * Returns subjects, notebook, plan in that order. `complete` combines observed
 * work with remembered IDs in completedSteps (string[]). `recommended` is true
 * only for the first incomplete step; all are false when setup is complete.
 * These are suggestions, not prerequisites for opening CODE_MATRIX_PATH.
 * Callers own transitions: notebook -> /learn#notebook-preparation;
 * plan -> /planner/schedule.
 * @returns {Array<{id: 'subjects'|'notebook'|'plan', complete: boolean, recommended: boolean}>}
 */
export function getCodeMatrixSetupSteps({ subjects = [], notebooks = [], schedule = [], completedSteps = [] } = {}) {
  const remembered = new Set(list(completedSteps));
  const completion = [
    ["subjects", list(subjects).some((subject) => Boolean(label(subject)))],
    ["notebook", list(notebooks).some(hasNotebook)],
    ["plan", list(schedule).some((day) => list(day?.tasks).some((task) => (
      Boolean(text(typeof task === "string" ? task : task?.task))
    )))],
  ];
  const steps = completion.map(([id, complete]) => ({ id, complete: complete || remembered.has(id), recommended: false }));
  const next = steps.find((step) => !step.complete);
  if (next) next.recommended = true;
  return steps;
}
