import {
  ArrowLeft,
  BookOpenCheck,
  BrainCircuit,
  BriefcaseBusiness,
  CalendarPlus,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Code2,
  Download,
  FileText,
  Image as ImageIcon,
  Layers3,
  LoaderCircle,

  MessageSquareText,
  Plus,
  Save,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Target,
  Trash2,
  UploadCloud,
  X,


} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { jsPDF } from "jspdf";
import { useLocation, useNavigate } from "react-router-dom";
import LearningMasteryMap from "../components/LearningMasteryMap";
import PlacementPrepDisclosure from "../components/PlacementPrepDisclosure";
import LearningSubjectMasteryDialog from "../components/LearningSubjectMasteryDialog";
import LearningStudyStudio from "../components/LearningStudyStudio";
import MedicalTrainingLab from "../components/MedicalTrainingLab";
import MedicalTrainingLabIntake from "../components/MedicalTrainingLabIntake";
import api from "../utils/apiClient";
import {
  AI_FEATURES,
  createAiIdempotencyKey,
  getAiRequestErrorMessage,
  useAiQuota,
} from "../utils/aiQuota";
import { AiCreditCost } from "../components/AiQuotaProvider";
import {
  LEARNING_ATTACHMENT_ACCEPT,
  MAX_CHAT_ATTACHMENTS,
  formatChatFileSize,
  prepareChatAttachment,
  validateChatAttachmentSelection,
} from "../utils/chatAttachments";
import {
  getLearningPlannerCompletionState,
  getLearningScheduleDateOptions,
  setLearningPlannerNodeCompletion,
  upsertLearningPlannerTask,
} from "../utils/learningPlanner";
import {
  completeLearningSession,
  getLearningNodeStatus,
  getLearningReviewQueue,
  markLearningNodeLearned,
  normalizeLearningState,
  recordLearningAttempt,
  setLearningNodeStatus,
  startLearningSession,
  updateLearningSession,
} from "../utils/learningMastery";
import { buildLearningTopicNote } from "../utils/learningNoteIntegration";
import { buildMaterialGuidePath } from "../utils/materialGuideNavigation";
import {
  buildPlacementActionTarget,
  buildPlacementChatPrompt,
  createPlacementDraft,
  mergePlacementDraft,
} from "../utils/placementPreparation";
import {
  MEDICAL_TRAINING_STARTERS,
  buildMedicalTrainingActionTarget,
  buildMedicalTrainingChatPrompt,
  createMedicalTrainingDraft,
  getMedicalTrainingInputValues,
  getSavedMedicalTrainingAnalysis,
  getSavedMedicalTrainingNotes,
  mergeMedicalTrainingDraft,
} from "../utils/medicalTrainingClient.js";
import {
  getSavedPlacementNotes,
  getStartLearningArtifactKind,
  isMedicalTrainingHash,
  isPlacementPrepHash,
} from "../utils/startLearningWorkspace";
import { getPlannerMetrics } from "../utils/plannerMetrics";
import {
  getLearningCareerEligibility,
  getLearningMedicalTrainingEligibility,
  getLearningPreparationMode,
} from "../utils/learningNotebook";
import { LEARNING_NOTEBOOK_REQUEST_TIMEOUT_MS } from "../utils/learningNotebookRequest";
import {
  LEARNING_PRIVACY_CONSENT_VERSION,
  MEDICAL_TRAINING_PRIVACY_CONSENT_KIND,
  MEDICAL_TRAINING_PRIVACY_CONSENT_VERSION,
  acceptLearningPrivacyConsent,
  hasLearningPrivacyConsent,
} from "../utils/learningPrivacyConsent";
import {
  normalizeSubjectChapterNames,
  normalizeSubjectNames,
  normalizeSubjectTopics,
} from "../utils/subjectPlanning";
import "./StartLearningPage.css";

const TEXT_SOURCE_ACCEPT = ".txt,.md,text/plain,text/markdown";
const LEARNING_SOURCE_ACCEPT = `${LEARNING_ATTACHMENT_ACCEPT},${TEXT_SOURCE_ACCEPT}`;
const MAX_TEXT_SOURCE_BYTES = 30_000;
const MAX_TEXT_TOTAL_CHARS = 60_000;
const MAX_LEARNING_PROMPT_CHARS = 3_000;
const ANALYSIS_STEPS = [
  "Reading your sources",
  "Structuring chapters and concepts",
  "Prioritizing important questions",
  "Building your revision notebook",
];
const DEFAULT_CAREER_FOUNDATIONS = [
  { title: "Role fundamentals", summary: "Explain the core concepts, tools, and trade-offs expected for your target role." },
  { title: "Project walkthroughs", summary: "Prepare concise stories about decisions, constraints, outcomes, and what you would improve." },
  { title: "Problem solving", summary: "Practice clarifying requirements, comparing approaches, and communicating your reasoning." },
  { title: "Behavioral readiness", summary: "Build evidence-based examples for teamwork, ownership, conflict, and learning quickly." },
];
const DEFAULT_CODING_TOPICS = [
  { title: "Arrays & strings", summary: "Traversal, two pointers, sliding windows, prefix sums, and common edge cases." },
  { title: "Hashing & complexity", summary: "Fast lookup patterns, frequency maps, sets, and time-space trade-offs." },
  { title: "Linked structures", summary: "Linked lists, stacks, queues, pointer movement, and implementation choices." },
  { title: "Trees & graphs", summary: "DFS, BFS, recursion, traversal state, shortest paths, and connectivity." },
  { title: "Dynamic programming", summary: "Recognize overlapping subproblems and build clear state transitions." },
  { title: "SQL & data handling", summary: "Joins, grouping, filtering, schema reasoning, and practical query analysis." },
];

function makeId(prefix = "learning") {
  return globalThis.crypto?.randomUUID?.()
    ? `${prefix}-${globalThis.crypto.randomUUID()}`
    : `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function cleanText(value, maxLength = 4000) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim().slice(0, maxLength);
}

function listFrom(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

function exampleText(value) {
  if (!value || typeof value !== "object") return cleanText(value, 2200);
  return cleanText([
    value.title,
    value.problem || value.scenario || value.question,
    listFrom(value.steps).length
      ? `Steps: ${listFrom(value.steps).map((step, index) => `${index + 1}. ${cleanText(
          step?.text || step?.description || step?.instruction || step,
          500,
        )}`).join(" ")}`
      : "",
    value.solution || value.answer || value.result,
    value.takeaway ? `Takeaway: ${value.takeaway}` : "",
  ].filter(Boolean).join("\n"), 2200);
}

function exampleList(value) {
  return listFrom(value)
    .map(exampleText)
    .filter(Boolean);
}

function textList(value, maxLength = 900) {
  return listFrom(value).map((item) => cleanText(item?.text || item?.title || item, maxLength)).filter(Boolean);
}

function normalizeSubtopic(value, index, topicId) {
  const source = value && typeof value === "object" ? value : { title: value };
  return {
    ...source,
    id: cleanText(source.id || source._id, 120) || `${topicId}-subtopic-${index + 1}`,
    title: cleanText(source.title || source.name || source.label, 180) || `Subtopic ${index + 1}`,
    summary: cleanText(source.summary || source.description || source.explanation || source.note, 2400),
    explanation: cleanText(
      source.explanation || source.details || source.body || source.summary || source.note,
      4800,
    ),
    keyPoints: textList(source.keyPoints || source.points),
    examples: exampleList(source.examples || source.workedExamples || source.example),
  };
}

function normalizeTopic(value, index, chapterId) {
  const source = value && typeof value === "object" ? value : { title: value };
  const id = cleanText(source.id || source._id, 120) || `${chapterId}-topic-${index + 1}`;
  return {
    ...source,
    id,
    title: cleanText(source.title || source.name || source.label, 180) || `Topic ${index + 1}`,
    summary: cleanText(source.summary || source.description || source.explanation || source.note, 3200),
    explanation: cleanText(
      source.explanation || source.details || source.body || source.summary || source.note,
      7200,
    ),
    importance: cleanText(source.importance, 40) || "medium",
    learningObjectives: textList(source.learningObjectives || source.objectives),
    keyPoints: textList(source.keyPoints || source.points),
    examples: exampleList(source.examples || source.workedExamples || source.example),
    applications: textList(source.applications || source.uses || source.useCases, 1200),
    commonMistakes: textList(source.commonMistakes || source.mistakes || source.misconceptions, 1200),
    revisionTips: textList(source.revisionTips || source.tips),
    subtopics: listFrom(source.subtopics || source.children).map((item, itemIndex) =>
      normalizeSubtopic(item, itemIndex, id),
    ),
  };
}

function normalizeChapter(value, index, notebookId) {
  const source = value && typeof value === "object" ? value : { title: value };
  const id = cleanText(source.id || source._id, 120) || `${notebookId}-chapter-${index + 1}`;
  return {
    ...source,
    id,
    title: cleanText(source.title || source.name || source.label, 180) || `Chapter ${index + 1}`,
    summary: cleanText(source.summary || source.description || source.overview, 1800),
    topics: listFrom(source.topics || source.children).map((item, itemIndex) =>
      normalizeTopic(item, itemIndex, id),
    ),
  };
}

function normalizeQuestion(value, index, notebookId) {
  const source = value && typeof value === "object" ? value : { question: value };
  return {
    ...source,
    id: cleanText(source.id || source._id, 120) || `${notebookId}-question-${index + 1}`,
    question:
      cleanText(source.question || source.title || source.prompt || source.text, 1200) ||
      `Important question ${index + 1}`,
    answer: cleanText(source.answer || source.explanation || source.hint, 3000),
    whyItMatters: cleanText(source.whyItMatters || source.reason || source.importance, 1200),
    priority: cleanText(source.priority || source.importance || source.difficulty, 40)
      || (index < 3 ? "High" : "Review"),
  };
}

function normalizeNoteSection(value, index, notebookId) {
  const source = value && typeof value === "object" ? value : { content: value };
  const keyPoints = listFrom(source.bullets || source.keyPoints || source.points)
    .map((item) => cleanText(item?.text || item?.title || item, 1000))
    .filter(Boolean);
  const revisionTips = listFrom(source.revisionTips || source.tips)
    .map((item) => cleanText(item?.text || item?.title || item, 900))
    .filter(Boolean);
  return {
    ...source,
    id: cleanText(source.id || source._id, 120) || `${notebookId}-note-${index + 1}`,
    title: cleanText(source.title || source.heading || source.name, 180) || `Revision note ${index + 1}`,
    content: cleanText(source.content || source.body || source.summary || source.text, 6000),
    keyPoints,
    revisionTips,
    bullets: [...keyPoints, ...revisionTips.map((item) => `Revision tip: ${item}`)],
  };
}

function chaptersFromNotebookSource(source, notebookId) {
  const explicitChapters = source.chapters
    || source.outline?.chapters
    || source.structure?.chapters
    || source.studyGuide?.chapters;
  if (Array.isArray(explicitChapters) && explicitChapters.length) {
    return explicitChapters.map((item, index) => normalizeChapter(item, index, notebookId));
  }

  const chapterNames = listFrom(source.chapterNames)
    .map((item) => cleanText(item?.title || item?.name || item, 180))
    .filter(Boolean);
  const sourceTopics = listFrom(source.topics);
  if (!chapterNames.length && !sourceTopics.length) return [];

  if (!chapterNames.length) {
    return [normalizeChapter({
      id: `${notebookId}-chapter-1`,
      title: cleanText(source.subjectName || source.title, 180) || "Analyzed topics",
      summary: cleanText(source.overview || source.summary, 1800),
      topics: sourceTopics,
    }, 0, notebookId)];
  }

  const buckets = chapterNames.map(() => []);
  sourceTopics.forEach((topic, topicIndex) => {
    const cleanTopicTitle = cleanText(topic?.title || topic?.name || topic, 180).toLowerCase();
    const matchingIndex = chapterNames.findIndex((chapterName) => {
      const cleanChapterName = chapterName.toLowerCase();
      return cleanTopicTitle === cleanChapterName
        || cleanTopicTitle.includes(cleanChapterName)
        || cleanChapterName.includes(cleanTopicTitle);
    });
    const targetIndex = matchingIndex >= 0 ? matchingIndex : topicIndex % chapterNames.length;
    buckets[targetIndex].push(topic);
  });

  return chapterNames.map((chapterName, index) => normalizeChapter(
    {
      id: `${notebookId}-chapter-${index + 1}`,
      title: chapterName,
      topics: buckets[index],
    },
    index,
    notebookId,
  ));
}
function normalizeNotebook(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const id = cleanText(source.id || source._id, 120) || makeId("notebook");
  const rawNotes = source.revisedNotes?.sections
    || source.revisedNotes
    || source.notes?.sections
    || source.notes
    || source.studyNotes;

  return {
    ...source,
    id,
    title: cleanText(source.title || source.name || source.subjectName, 180) || "Untitled learning notebook",
    subjectName: cleanText(source.subjectName || source.subject || source.title, 160) || "Learning source",
    summary: cleanText(source.summary || source.overview || source.abstract, 4000),
    sources: listFrom(source.sources || source.attachments || source.textSources).map((item, index) => ({
      ...(item && typeof item === "object" ? item : {}),
      id: cleanText(item?.id, 120) || `${id}-source-${index + 1}`,
      name: cleanText(item?.name || item?.fileName || item, 180) || `Source ${index + 1}`,
      type: cleanText(item?.type, 100),
      size: Number(item?.size || 0),
    })),
    coverageWarnings: [...new Set([
      ...listFrom(source.coverageWarnings).map((warning) => cleanText(warning, 600)),
      ...(listFrom(source.coverageWarnings).length
        ? []
        : listFrom(source.sources)
          .filter((item) => item?.truncated || (item?.totalPages && item?.pagesRead < item?.totalPages))
          .map((item) => item?.totalPages
            ? `${cleanText(item.name, 120) || "Source"}: analyzed ${item.pagesRead || 0} of ${item.totalPages} pages.`
            : `${cleanText(item.name, 120) || "Source"}: analysis was bounded to the readable content.`)),
    ].filter(Boolean))],
    importantQuestions: listFrom(
      source.importantQuestions || source.questions || source.revisionQuestions,
    ).map((item, index) => normalizeQuestion(item, index, id)),
    revisedNotes: listFrom(rawNotes).map((item, index) => normalizeNoteSection(item, index, id)),
    chapters: chaptersFromNotebookSource(source, id),
    careerPreparation:
      source.careerPreparation && typeof source.careerPreparation === "object"
        ? source.careerPreparation
        : null,
    medicalTraining:
      source.medicalTraining && typeof source.medicalTraining === "object"
        ? source.medicalTraining
        : null,
    updatedAt: source.updatedAt || source.createdAt || new Date().toISOString(),
  };
}

function parseChapterNames(value) {
  const seen = new Set();
  return String(value || "")
    .split(/[\n,]+/)
    .map((chapter) => cleanText(chapter, 180))
    .filter((chapter) => {
      const key = chapter.toLocaleLowerCase();
      if (!chapter || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 30);
}

function parseCareerTopics(value) {
  const seen = new Set();
  return listFrom(value).flatMap((item) => String(item || "").split(/[\n,]+/))
    .map((topic) => cleanText(topic, 140))
    .filter((topic) => {
      const key = topic.toLocaleLowerCase();
      if (!topic || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12);
}

function isTextSource(file) {
  const type = String(file?.type || "").toLowerCase();
  const name = String(file?.name || "").toLowerCase();
  return type === "text/plain"
    || type === "text/markdown"
    || name.endsWith(".txt")
    || name.endsWith(".md");
}

async function prepareTextSource(file) {
  if (!file.size) throw new Error(`${file.name || "This text file"} is empty.`);
  if (file.size > MAX_TEXT_SOURCE_BYTES) {
    throw new Error(
      `${file.name || "This text file"} is larger than ${formatChatFileSize(MAX_TEXT_SOURCE_BYTES)}.`,
    );
  }

  const text = cleanText(await file.text(), MAX_TEXT_SOURCE_BYTES);
  if (!text) throw new Error(`${file.name || "This text file"} does not contain readable text.`);
  return {
    id: makeId("text-source"),
    kind: "text",
    name: cleanText(file.name, 140) || "notes.txt",
    type: file.type || (file.name.toLowerCase().endsWith(".md") ? "text/markdown" : "text/plain"),
    size: file.size,
    text,
  };
}

function learningNodes(notebook) {
  if (!notebook) return [];
  const nodes = [{
    id: "root",
    title: notebook.subjectName,
    type: "notebook",
    chapterName: "All chapters",
    subjectName: notebook.subjectName,
    summary: notebook.summary,
    explanation: notebook.summary,
    keyPoints: notebook.chapters.map((chapter) => chapter.title),
    examples: [],
  }];
  (notebook?.chapters || []).forEach((chapter, chapterIndex) => {
    const chapterTopics = listFrom(chapter.topics);
    const chapterKeyPoints = chapterTopics.flatMap((topic) => {
      const points = listFrom(topic?.keyPoints).map((point) => cleanText(point, 260)).filter(Boolean);
      return points.length ? points : [cleanText(topic?.title, 180)].filter(Boolean);
    }).slice(0, 8);
    const chapterExamples = chapterTopics
      .flatMap((topic) => listFrom(topic?.examples))
      .map((example) => cleanText(example, 420))
      .filter(Boolean)
      .slice(0, 5);
    const chapterApplications = chapterTopics
      .flatMap((topic) => listFrom(topic?.applications))
      .map((application) => cleanText(application, 320))
      .filter(Boolean)
      .slice(0, 5);
    const topicOverview = chapterTopics.map((topic) => cleanText(
      `${topic?.title || "Topic"}: ${topic?.summary || topic?.explanation || ""}`,
      520,
    )).filter(Boolean).slice(0, 6);
    nodes.push({
      id: chapter.id,
      title: chapter.title,
      type: "chapter",
      chapterName: chapter.title,
      subjectName: notebook.subjectName,
      unitKey: `chapter:${chapterIndex + 1}`,
      summary: chapter.summary,
      explanation: [chapter.summary, ...topicOverview].filter(Boolean).join("\n\n"),
      keyPoints: chapterKeyPoints,
      examples: chapterExamples,
      applications: chapterApplications,
    });
    chapter.topics.forEach((topic) => {
      nodes.push({
        id: topic.id,
        title: topic.title,
        type: "topic",
        chapterName: chapter.title,
        subjectName: notebook.subjectName,
        unitKey: `topic:${cleanText(topic.title, 180).toLocaleLowerCase()}`,
        summary: topic.summary,
        explanation: topic.explanation,
        keyPoints: topic.keyPoints,
        examples: topic.examples,
        applications: topic.applications,
        commonMistakes: topic.commonMistakes,
        revisionTips: topic.revisionTips,
      });
      topic.subtopics.forEach((subtopic) => {
        nodes.push({
          id: subtopic.id,
          title: subtopic.title,
          type: "subtopic",
          chapterName: chapter.title,
          subjectName: notebook.subjectName,
          summary: subtopic.summary,
          explanation: subtopic.explanation,
          keyPoints: subtopic.keyPoints,
          examples: subtopic.examples,
          applications: subtopic.applications || topic.applications,
        });
      });
    });
  });
  return nodes;
}

function careerProfileAllows(careerPreparation) {
  return Boolean(careerPreparation?.enabled);
}

function careerTopicCards(value, fallback) {
  const cards = listFrom(value).map((item, index) => {
    const source = item && typeof item === "object" ? item : { title: item };
    const title = cleanText(source.title || source.name || source.text || item, 180);
    if (!title) return null;
    return {
      id: cleanText(source.id, 120)
        || `career-topic-${index + 1}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      title,
      summary: cleanText(
        source.summary || source.whyItMatters || source.guidance || source.description,
        700,
      ),
    };
  }).filter(Boolean);
  return cards.length ? cards : fallback;
}

function placementInputValues(notebook, draft, userProfile = {}) {
  const matchingDraft = draft?.notebookId === notebook?.id ? draft : null;
  const analysis = matchingDraft?.analysis || notebook?.careerPreparation?.topicAnalysis || null;
  const topics = listFrom(analysis?.topics)
    .map((topic) => cleanText(topic?.title || topic, 140))
    .filter(Boolean)
    .slice(0, 12);
  return {
    role: cleanText(
      analysis?.targetRole || userProfile?.primaryGoal || userProfile?.careerGoal,
      160,
    ),
    topics: topics.join("\n"),
  };
}

function formatNotebookDate(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "Recently updated";
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(date);
}

function pdfFileName(notebook) {
  const name = cleanText(notebook?.title || notebook?.subjectName || "Learning notebook", 80)
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return `${name || "learning-notebook"}.pdf`;
}

function StartLearningPage({
  academicProfileDataId = "",
  academicLevel = "College",
  academicTrack = "General",
  userProfile = {},
  subjects = [],
  completed = [],
  schedule = [],
  setSchedule,
  setCompleted,
  scheduleStartDate,
  setSubjects,
  setNotification,
}) {
  const { hasInsufficientCredits } = useAiQuota();
  const location = useLocation();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const subjectInputRef = useRef(null);
  const subjectOptionsRef = useRef(null);
  const analysisTimerRef = useRef(null);
  const mountedRef = useRef(true);
  const pendingAnalysisRef = useRef(null);
  const privacyConsentCancelRef = useRef(null);
  const privacyConsentDialogRef = useRef(null);
  const masteryAutosaveTimerRef = useRef(null);
  const masterySaveSequenceRef = useRef(0);
  const notebookSaveChainRef = useRef(Promise.resolve());
  const activeNotebookRef = useRef(null);
  const careerAnalysisRequestRef = useRef({ notebookId: "", pending: false, sequence: 0 });
  const medicalAnalysisRequestRef = useRef({ notebookId: "", pending: false, sequence: 0 });
  const [notebooks, setNotebooks] = useState([]);
  const [notebooksLoading, setNotebooksLoading] = useState(true);
  const [notebooksError, setNotebooksError] = useState("");
  const [activeNotebook, setActiveNotebook] = useState(null);
  const [workspaceView, setWorkspaceView] = useState("intake");
  const [intakeMode, setIntakeMode] = useState(null);
  const [careerRole, setCareerRole] = useState("");
  const [careerTopics, setCareerTopics] = useState("");
  const [careerAnalyzing, setCareerAnalyzing] = useState(false);
  const [careerError, setCareerError] = useState("");
  const [careerDraft, setCareerDraft] = useState(null);
  const [medicalFocus, setMedicalFocus] = useState("");
  const [medicalTopics, setMedicalTopics] = useState("");
  const [medicalAnalyzing, setMedicalAnalyzing] = useState(false);
  const [medicalError, setMedicalError] = useState("");
  const [medicalDraft, setMedicalDraft] = useState(null);
  const [sources, setSources] = useState([]);
  const [sourceError, setSourceError] = useState("");
  const [preparingSources, setPreparingSources] = useState(false);
  const [subjectName, setSubjectName] = useState("");
  const [subjectPickerOpen, setSubjectPickerOpen] = useState(false);
  const [subjectOptionIndex, setSubjectOptionIndex] = useState(0);
  const [manualChapters, setManualChapters] = useState("");
  const [scopeChapter, setScopeChapter] = useState("");
  const [scopeTopic, setScopeTopic] = useState("");
  const [learningPrompt, setLearningPrompt] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState(0);
  const [analysisError, setAnalysisError] = useState("");
  const [activeTab, setActiveTab] = useState("studio");
  const [expandedQuestions, setExpandedQuestions] = useState(() => new Set());
  const [expandedChapters, setExpandedChapters] = useState(() => new Set());
  const [selectedNodeId, setSelectedNodeId] = useState("");

  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleteCandidateId, setDeleteCandidateId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [chapterComposerOpen, setChapterComposerOpen] = useState(false);
  const [chapterDraft, setChapterDraft] = useState("");
  const [topicComposer, setTopicComposer] = useState({ chapterId: "", value: "" });
  const [subtopicComposer, setSubtopicComposer] = useState({ chapterId: "", topicId: "", value: "" });
  const [plannerDialogOpen, setPlannerDialogOpen] = useState(false);
  const [plannerNodeId, setPlannerNodeId] = useState("");
  const [plannerCustomNode, setPlannerCustomNode] = useState(null);
  const [plannerDateKey, setPlannerDateKey] = useState("");
  const [plannerError, setPlannerError] = useState("");
  const [privacyConsentOpen, setPrivacyConsentOpen] = useState(false);
  const [masterySaving, setMasterySaving] = useState(false);
  const [masteryDialogOpen, setMasteryDialogOpen] = useState(false);
  const [coachState, setCoachState] = useState({ loading: false, error: "", response: "", label: "" });
  const [latestReceipt, setLatestReceipt] = useState(null);
  const [noteSavingKeys, setNoteSavingKeys] = useState(() => new Set());
  const noteSavingKeysRef = useRef(new Set());
  const [masteryClock, setMasteryClock] = useState(() => Date.now());

  const preparationProfile = useMemo(
    () => ({
      ...userProfile,
      academicLevel,
      academicTrack,
    }),
    [academicLevel, academicTrack, userProfile],
  );
  const careerEligibility = useMemo(
    () => getLearningCareerEligibility(preparationProfile),
    [preparationProfile],
  );
  const medicalEligibility = useMemo(
    () => getLearningMedicalTrainingEligibility(preparationProfile),
    [preparationProfile],
  );
  const preparationMode = useMemo(
    () => getLearningPreparationMode(preparationProfile),
    [preparationProfile],
  );
  const placementEligible = preparationMode === "placement" && careerEligibility.enabled;
  const medicalEligible = preparationMode === "medical" && medicalEligibility.enabled;
  const savedPlacementNotes = useMemo(
    () => getSavedPlacementNotes(notebooks),
    [notebooks],
  );
  const savedMedicalTrainingNotes = useMemo(
    () => getSavedMedicalTrainingNotes(notebooks),
    [notebooks],
  );
  const activeArtifactKind = getStartLearningArtifactKind({ intakeMode, workspaceView });

  useEffect(() => {
    const hash = String(location.hash || "").toLowerCase();
    if (hash === "#subject-mastery") {
      setMasteryDialogOpen(true);
      return;
    }
    if (isMedicalTrainingHash(location.hash) && medicalEligible) {
      setMedicalError("");
      setIntakeMode("medical");
      setWorkspaceView("intake");
      const frame = window.requestAnimationFrame(() => {
        document.getElementById("medical-training")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
      return () => window.cancelAnimationFrame(frame);
    }
    if (!isPlacementPrepHash(location.hash) || !placementEligible) return;

    setCareerError("");
    setIntakeMode("placement");
    setWorkspaceView("intake");
    const frame = window.requestAnimationFrame(() => {
      document.getElementById("placement-prep")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location.hash, medicalEligible, placementEligible]);

  const savedSubjectNames = useMemo(
    () => normalizeSubjectNames(subjects),
    [subjects],
  );
  const selectedSavedSubject = useMemo(() => {
    const selectedName = cleanText(subjectName, 160).toLocaleLowerCase();
    if (!selectedName) return null;
    return subjects.find((subject) => {
      const name = typeof subject === "string"
        ? subject
        : subject?.name || subject?.subjectName || subject?.title || subject?.label;
      return cleanText(name, 160).toLocaleLowerCase() === selectedName;
    }) || null;
  }, [subjectName, subjects]);
  const savedChapterOptions = useMemo(() => {
    if (!selectedSavedSubject || typeof selectedSavedSubject !== "object") return [];
    const sourceNames = Array.isArray(selectedSavedSubject.chapterNames)
      ? selectedSavedSubject.chapterNames
      : [];
    const chapterCount = Math.max(
      Number.parseInt(selectedSavedSubject.chapters, 10) || 0,
      sourceNames.length,
    );
    const names = normalizeSubjectChapterNames(sourceNames, chapterCount);
    return Array.from(
      { length: chapterCount },
      (_, index) => names[index] || `Chapter ${index + 1}`,
    );
  }, [selectedSavedSubject]);
  const savedTopicOptions = useMemo(
    () => normalizeSubjectTopics(
      selectedSavedSubject && typeof selectedSavedSubject === "object"
        ? selectedSavedSubject.topics
        : [],
    ),
    [selectedSavedSubject],
  );
  const visibleSavedSubjectNames = useMemo(() => {
    const query = subjectName.trim().toLocaleLowerCase();
    if (!query) return savedSubjectNames;
    const exactMatch = savedSubjectNames.some((name) => name.toLocaleLowerCase() === query);
    if (exactMatch) return savedSubjectNames;
    return savedSubjectNames.filter((name) => name.toLocaleLowerCase().includes(query));
  }, [savedSubjectNames, subjectName]);
  const activeSubjectOptionIndex = Math.min(
    subjectOptionIndex,
    Math.max(visibleSavedSubjectNames.length - 1, 0),
  );
  useEffect(() => {
    if (!subjectPickerOpen || !visibleSavedSubjectNames.length) return;
    const activeOption = subjectOptionsRef.current?.querySelector(
      "#learning-subject-option-" + activeSubjectOptionIndex,
    );
    activeOption?.scrollIntoView({ block: "nearest" });
  }, [activeSubjectOptionIndex, subjectPickerOpen, visibleSavedSubjectNames.length]);

  useEffect(() => {
    activeNotebookRef.current = activeNotebook;
  }, [activeNotebook]);

  useEffect(() => {
    if (placementEligible) return;
    careerAnalysisRequestRef.current = {
      notebookId: "",
      pending: false,
      sequence: careerAnalysisRequestRef.current.sequence + 1,
    };
    setCareerAnalyzing(false);
    setIntakeMode((current) => (current === "placement" ? null : current));
    setWorkspaceView((current) => {
      if (current !== "career") return current;
      return "intake";
    });
    if (isPlacementPrepHash(location.hash)) {
      navigate("/learn", { replace: true });
    }
  }, [location.hash, navigate, placementEligible]);

  useEffect(() => {
    if (medicalEligible) return;
    medicalAnalysisRequestRef.current = {
      notebookId: "",
      pending: false,
      sequence: medicalAnalysisRequestRef.current.sequence + 1,
    };
    setMedicalAnalyzing(false);
    setIntakeMode((current) => (current === "medical" ? null : current));
    setWorkspaceView((current) => (current === "medical" ? "intake" : current));
    if (isMedicalTrainingHash(location.hash)) {
      navigate("/learn", { replace: true });
    }
  }, [location.hash, medicalEligible, navigate]);

  useEffect(() => {
    const timer = window.setInterval(() => setMasteryClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const nodes = useMemo(() => learningNodes(activeNotebook), [activeNotebook]);
  const masteryNotebooks = useMemo(() => {
    if (!activeNotebook) return notebooks;
    return [
      activeNotebook,
      ...notebooks.filter((notebook) => notebook.id !== activeNotebook.id),
    ];
  }, [activeNotebook, notebooks]);
  const activeLearningProject = useMemo(() => ({
    id: activeNotebook?.id || "",
    subjectName: activeNotebook?.subjectName || "",
    title: activeNotebook?.title || "",
  }), [activeNotebook?.id, activeNotebook?.subjectName, activeNotebook?.title]);
  const completionStateByNodeId = useMemo(() => new Map(
    nodes
      .filter((node) => node.type !== "notebook")
      .map((node) => [
        node.id,
        getLearningPlannerCompletionState(
          schedule,
          completed,
          activeLearningProject,
          node,
        ),
      ]),
  ), [
    activeLearningProject,
    completed,
    nodes,
    schedule,
  ]);
  const plannerMetrics = useMemo(
    () => getPlannerMetrics(schedule, completed),
    [completed, schedule],
  );
  const normalizedMasteryState = useMemo(
    () => normalizeLearningState(activeNotebook?.learningState, {
      notebook: activeNotebook || {},
      now: new Date(masteryClock).toISOString(),
    }),
    [activeNotebook, masteryClock],
  );
  const progressByNodeId = useMemo(() => {
    const now = new Date(masteryClock).toISOString();
    const next = Object.fromEntries(Object.entries(normalizedMasteryState.nodes || {}).map(([nodeId, node]) => [
      nodeId,
      { ...node, status: getLearningNodeStatus(node, { now }) },
    ]));

    (activeNotebook?.chapters || []).forEach((chapter) => {
      const childStates = (chapter.topics || []).map((topic) => next[topic.id]).filter(Boolean);
      if (!childStates.length || !next[chapter.id]) return;
      const statuses = childStates.map((item) => item.status);
      const masteryScore = Math.round(
        childStates.reduce((sum, item) => sum + Number(item.masteryScore || 0), 0) / childStates.length,
      );
      const status = statuses.every((item) => item === "mastered")
        ? "mastered"
        : statuses.some((item) => item === "review_due")
          ? "review_due"
          : statuses.some((item) => item === "learning")
            ? "learning"
            : statuses.some((item) => item === "learned" || item === "mastered")
              ? "learned"
              : next[chapter.id].status;
      next[chapter.id] = { ...next[chapter.id], status, masteryScore };
    });
    return next;
  }, [activeNotebook, masteryClock, normalizedMasteryState.nodes]);
  const reviewQueue = useMemo(
    () => getLearningReviewQueue(activeNotebook ? [activeNotebook] : [], {
      limit: 24,
      now: new Date(masteryClock).toISOString(),
    }).map((item) => ({
      ...nodes.find((node) => node.id === item.id),
      ...item,
      reviewLabel: item.dueAt ? `Due ${formatNotebookDate(item.dueAt)}` : "Due for recall",
    })),
    [activeNotebook, masteryClock, nodes],
  );
  const activeLearningSession = useMemo(() => {
    const session = normalizedMasteryState.sessions.find(
      (item) => item.id === normalizedMasteryState.activeSessionId && item.status === "in_progress",
    );
    return session ? { ...session, nodeId: session.nodeIds[0] || "" } : null;
  }, [normalizedMasteryState]);
  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) || nodes[0] || null,
    [nodes, selectedNodeId],
  );
  const dateOptions = useMemo(
    () => getLearningScheduleDateOptions(schedule, scheduleStartDate),
    [schedule, scheduleStartDate],
  );
  const careerVisible = useMemo(
    () => placementEligible && (
      careerProfileAllows(activeNotebook?.careerPreparation)
      || getSavedPlacementNotes(activeNotebook ? [activeNotebook] : []).length > 0
      || careerDraft?.notebookId === activeNotebook?.id
    ),
    [activeNotebook, careerDraft?.notebookId, placementEligible],
  );
  const careerFoundationTopics = useMemo(
    () => careerTopicCards(activeNotebook?.careerPreparation?.skills, DEFAULT_CAREER_FOUNDATIONS),
    [activeNotebook?.careerPreparation?.skills],
  );
  const careerCodingTopics = useMemo(
    () => careerTopicCards(
      activeNotebook?.careerPreparation?.codingTopics
        || activeNotebook?.careerPreparation?.codingInterview
        || activeNotebook?.careerPreparation?.coding,
      DEFAULT_CODING_TOPICS,
    ),
    [activeNotebook?.careerPreparation],
  );
  const activeCareerDraft = careerDraft?.notebookId === activeNotebook?.id
    ? careerDraft
    : null;
  const careerAnalysis = activeCareerDraft?.analysis
    || activeNotebook?.careerPreparation?.topicAnalysis
    || null;
  const careerAnalysisReady = Boolean(
    careerAnalysis && listFrom(careerAnalysis.topics).some((topic) => cleanText(topic?.title || topic, 180)),
  );
  const careerAnalysisIsDraft = Boolean(activeCareerDraft && careerAnalysisReady);
  const activeMedicalDraft = medicalDraft?.notebookId === activeNotebook?.id
    ? medicalDraft
    : null;
  const medicalAnalysis = activeMedicalDraft?.analysis
    || getSavedMedicalTrainingAnalysis(activeNotebook)
    || null;
  const medicalAnalysisReady = Boolean(
    medicalAnalysis && listFrom(medicalAnalysis.modules).some((module) => cleanText(module?.title, 180)),
  );
  const medicalAnalysisIsDraft = Boolean(activeMedicalDraft && medicalAnalysisReady);
  const medicalVisible = Boolean(medicalEligible && medicalAnalysisReady);

  const selectNotebook = useCallback((value) => {
    if (careerAnalyzing || medicalAnalyzing || saving) return;
    const normalized = normalizeNotebook(value);
    setActiveNotebook(normalized);
    setWorkspaceView("notebook");
    setCareerError("");
    setDirty(false);
    setActiveTab("studio");
    setExpandedChapters(new Set(normalized.chapters.slice(0, 1).map((chapter) => chapter.id)));
    const firstTopic = normalized.chapters.find((chapter) => chapter.topics.length)?.topics[0];
    setSelectedNodeId(firstTopic?.id || "");

  }, [careerAnalyzing, medicalAnalyzing, saving]);

  const selectPlacementNotebook = (notebookId) => {
    if (careerAnalyzing || medicalAnalyzing || saving) return false;
    if (careerDraft && careerDraft.notebookId !== notebookId) {
      const message = "Save the current placement draft before choosing another notebook.";
      setCareerError(message);
      setNotification?.(message);
      return false;
    }
    const notebook = notebooks.find((item) => item.id === notebookId);
    if (!notebook) return false;
    const normalized = normalizeNotebook(notebook);
    const fields = placementInputValues(normalized, careerDraft, userProfile);
    activeNotebookRef.current = normalized;
    setActiveNotebook(normalized);
    setCareerError("");
    setCareerRole(fields.role);
    setCareerTopics(fields.topics);
    return true;
  };

  const selectMedicalNotebook = (notebookId) => {
    if (careerAnalyzing || medicalAnalyzing || saving) return false;
    if (medicalDraft && medicalDraft.notebookId !== notebookId) {
      const message = "Save the current medical training draft before choosing another notebook.";
      setMedicalError(message);
      setNotification?.(message);
      return false;
    }
    const notebook = notebooks.find((item) => item.id === notebookId);
    if (!notebook) return false;
    const normalized = normalizeNotebook(notebook);
    const fields = getMedicalTrainingInputValues(normalized, medicalDraft, userProfile);
    activeNotebookRef.current = normalized;
    setActiveNotebook(normalized);
    setMedicalError("");
    setMedicalFocus(fields.focus);
    setMedicalTopics(fields.topics);
    return true;
  };

  const openNotebookIntake = () => {
    if (analyzing || careerAnalyzing || medicalAnalyzing || saving) return;
    setAnalysisError("");
    setIntakeMode("notebook");
    setWorkspaceView("intake");
  };

  const openPlacementIntake = () => {
    if (!placementEligible || careerAnalyzing || medicalAnalyzing || saving) return;
    const draftNotebook = careerDraft
      ? notebooks.find((notebook) => notebook.id === careerDraft.notebookId)
      : null;
    const targetNotebook = draftNotebook || activeNotebook || notebooks[0] || null;
    if (targetNotebook) {
      selectPlacementNotebook(targetNotebook.id);
    } else {
      const fields = placementInputValues(null, null, userProfile);
      setCareerRole(fields.role);
      setCareerTopics(fields.topics);
    }
    setCareerError("");
    setIntakeMode("placement");
    setWorkspaceView("intake");
  };

  const openMedicalIntake = () => {
    if (!medicalEligible || careerAnalyzing || medicalAnalyzing || saving) return;
    const draftNotebook = medicalDraft
      ? notebooks.find((notebook) => notebook.id === medicalDraft.notebookId)
      : null;
    const targetNotebook = draftNotebook || activeNotebook || notebooks[0] || null;
    if (targetNotebook) {
      selectMedicalNotebook(targetNotebook.id);
    } else {
      const fields = getMedicalTrainingInputValues(null, null, userProfile);
      setMedicalFocus(fields.focus);
      setMedicalTopics(fields.topics);
    }
    setMedicalError("");
    setIntakeMode("medical");
    setWorkspaceView("intake");
  };

  const returnToPreparationChoice = () => {
    if (analyzing || careerAnalyzing || medicalAnalyzing || saving) return;
    setWorkspaceView("intake");
    setIntakeMode(null);
    if (isPlacementPrepHash(location.hash) || isMedicalTrainingHash(location.hash)) {
      navigate("/learn", { replace: true });
    }
  };

  const openSavedPlacementNote = (note) => {
    if (!note?.notebookId || !selectPlacementNotebook(note.notebookId)) return;
    setIntakeMode("placement");
    setWorkspaceView("career");
  };

  const openSavedMedicalTraining = (note) => {
    if (!note?.notebookId || !selectMedicalNotebook(note.notebookId)) return;
    setIntakeMode("medical");
    setWorkspaceView("medical");
  };

  const addCareerTopic = (title, { openIntake = false } = {}) => {
    if (careerAnalyzing || saving) return;
    const cleanTitle = cleanText(title, 140);
    if (!cleanTitle) return;
    if (openIntake) openPlacementIntake();
    setCareerTopics((current) => {
      const topics = parseCareerTopics(current);
      if (topics.some((topic) => topic.toLocaleLowerCase() === cleanTitle.toLocaleLowerCase())) {
        return topics.join("\n");
      }
      return [...topics, cleanTitle].slice(0, 12).join("\n");
    });
  };

  const addMedicalTopic = (title, { openIntake = false } = {}) => {
    if (medicalAnalyzing || saving) return;
    const cleanTitle = cleanText(title, 140);
    if (!cleanTitle) return;
    if (openIntake) openMedicalIntake();
    setMedicalTopics((current) => {
      const topics = parseCareerTopics(current);
      if (topics.some((topic) => topic.toLocaleLowerCase() === cleanTitle.toLocaleLowerCase())) {
        return topics.join("\n");
      }
      return [...topics, cleanTitle].slice(0, 12).join("\n");
    });
  };

  const loadNotebooks = useCallback(async () => {
    setNotebooksLoading(true);
    setNotebooksError("");
    try {
      const payload = await api.get("/api/learning-notebooks", {
        academicProfileId: academicProfileDataId,
        timeoutMs: 30000,
      });
      if (!mountedRef.current) return;
      const loaded = listFrom(payload?.notebooks).map(normalizeNotebook);
      setNotebooks(loaded);
    } catch (error) {
      if (!mountedRef.current) return;
      setNotebooksError(error instanceof Error ? error.message : "Saved notebooks could not be loaded.");
    } finally {
      if (mountedRef.current) setNotebooksLoading(false);
    }
  }, [academicProfileDataId]);

  useEffect(() => {
    mountedRef.current = true;
    loadNotebooks();
    return () => {
      mountedRef.current = false;
      if (analysisTimerRef.current) window.clearInterval(analysisTimerRef.current);
    };
  }, [loadNotebooks]);

  useEffect(() => {
    if (
      intakeMode !== "placement"
      || activeNotebook
      || careerAnalyzing
      || saving
      || !notebooks.length
    ) return;
    const notebook = careerDraft
      ? notebooks.find((item) => item.id === careerDraft.notebookId)
      : notebooks[0];
    if (!notebook) return;
    const normalized = normalizeNotebook(notebook);
    const fields = placementInputValues(normalized, careerDraft, userProfile);
    activeNotebookRef.current = normalized;
    setActiveNotebook(normalized);
    setCareerRole(fields.role);
    setCareerTopics(fields.topics);
    setCareerError("");
  }, [activeNotebook, careerAnalyzing, careerDraft, intakeMode, notebooks, saving, userProfile]);

  useEffect(() => {
    if (
      intakeMode !== "medical"
      || activeNotebook
      || medicalAnalyzing
      || saving
      || !notebooks.length
    ) return;
    const notebook = medicalDraft
      ? notebooks.find((item) => item.id === medicalDraft.notebookId)
      : notebooks[0];
    if (!notebook) return;
    const normalized = normalizeNotebook(notebook);
    const fields = getMedicalTrainingInputValues(normalized, medicalDraft, userProfile);
    activeNotebookRef.current = normalized;
    setActiveNotebook(normalized);
    setMedicalFocus(fields.focus);
    setMedicalTopics(fields.topics);
    setMedicalError("");
  }, [activeNotebook, intakeMode, medicalAnalyzing, medicalDraft, notebooks, saving, userProfile]);

  useEffect(() => {
    if (!plannerDialogOpen) return;
    setPlannerNodeId((current) => current || selectedNode?.id || nodes[0]?.id || "");
    setPlannerDateKey((current) => current || dateOptions[0]?.dateKey || "");
  }, [dateOptions, nodes, plannerDialogOpen, selectedNode?.id]);

  useEffect(() => {
    if (!privacyConsentOpen) return undefined;
    const previouslyFocused = document.activeElement;
    const root = document.getElementById("root");
    const htmlHadModalClass = document.documentElement.classList.contains("learning-privacy-modal-open");
    const bodyHadModalClass = document.body.classList.contains("learning-privacy-modal-open");
    const rootWasInert = root?.hasAttribute("inert") || false;
    const rootAriaHidden = root?.getAttribute("aria-hidden");

    document.documentElement.classList.add("learning-privacy-modal-open");
    document.body.classList.add("learning-privacy-modal-open");
    root?.setAttribute("inert", "");
    root?.setAttribute("aria-hidden", "true");

    const focusFrame = window.requestAnimationFrame(() => {
      privacyConsentCancelRef.current?.focus();
    });
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        pendingAnalysisRef.current = null;
        setPrivacyConsentOpen(false);
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        privacyConsentDialogRef.current?.querySelectorAll("button:not([disabled])") || [],
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", handleKeyDown);
      if (!htmlHadModalClass) document.documentElement.classList.remove("learning-privacy-modal-open");
      if (!bodyHadModalClass) document.body.classList.remove("learning-privacy-modal-open");
      if (!rootWasInert) root?.removeAttribute("inert");
      if (rootAriaHidden === null || rootAriaHidden === undefined) {
        root?.removeAttribute("aria-hidden");
      } else {
        root?.setAttribute("aria-hidden", rootAriaHidden);
      }
      previouslyFocused?.focus?.();
    };
  }, [privacyConsentOpen]);

  const handleFiles = async (fileList) => {
    const selected = Array.from(fileList || []);
    if (!selected.length) return;
    if (sources.length + selected.length > MAX_CHAT_ATTACHMENTS) {
      setSourceError(`Add up to ${MAX_CHAT_ATTACHMENTS} sources to one notebook.`);
      return;
    }

    const binaryFiles = selected.filter((file) => !isTextSource(file));
    const existingBinary = sources.filter((source) => source.kind === "attachment");
    const binaryError = validateChatAttachmentSelection(
      binaryFiles,
      existingBinary,
      { allowPresentations: false },
    );
    if (binaryError) {
      setSourceError(binaryError);
      return;
    }

    setPreparingSources(true);
    setSourceError("");
    try {
      const prepared = await Promise.all(selected.map(async (file) => {
        if (isTextSource(file)) return prepareTextSource(file);
        return { ...(await prepareChatAttachment(file)), kind: "attachment" };
      }));
      const totalTextCharacters = [...sources, ...prepared]
        .filter((source) => source.kind === "text")
        .reduce((total, source) => total + String(source.text || "").length, 0);
      if (totalTextCharacters > MAX_TEXT_TOTAL_CHARS) {
        throw new Error("Text and Markdown sources can total up to 60,000 characters.");
      }
      if (!mountedRef.current) return;
      setSources((current) => [...current, ...prepared].slice(0, MAX_CHAT_ATTACHMENTS));
    } catch (error) {
      if (mountedRef.current) {
        setSourceError(error instanceof Error ? error.message : "A selected source could not be prepared.");
      }
    } finally {
      if (mountedRef.current) setPreparingSources(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeSource = (sourceId) => {
    setSources((current) => current.filter((source) => source.id !== sourceId));
    setSourceError("");
  };

  const chooseSavedSubject = (name) => {
    if (cleanText(name, 160).toLocaleLowerCase() !== subjectName.trim().toLocaleLowerCase()) {
      setScopeChapter("");
      setScopeTopic("");
    }
    setSubjectName(name);
    setSubjectPickerOpen(false);
    setSubjectOptionIndex(0);
    setAnalysisError("");
  };

  const handleSubjectPickerKeyDown = (event) => {
    if (!savedSubjectNames.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSubjectPickerOpen(true);
      if (visibleSavedSubjectNames.length) {
        setSubjectOptionIndex(subjectPickerOpen
          ? (activeSubjectOptionIndex + 1) % visibleSavedSubjectNames.length
          : 0);
      }
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSubjectPickerOpen(true);
      if (visibleSavedSubjectNames.length) {
        setSubjectOptionIndex(subjectPickerOpen
          ? (activeSubjectOptionIndex - 1 + visibleSavedSubjectNames.length) % visibleSavedSubjectNames.length
          : visibleSavedSubjectNames.length - 1,
        );
      }
      return;
    }
    if (event.key === "Enter" && subjectPickerOpen && visibleSavedSubjectNames.length) {
      event.preventDefault();
      chooseSavedSubject(visibleSavedSubjectNames[activeSubjectOptionIndex]);
      return;
    }
    if (event.key === "Escape" && subjectPickerOpen) {
      event.preventDefault();
      setSubjectPickerOpen(false);
    }
  };

  const beginAnalysisProgress = () => {
    setAnalysisStep(0);
    if (analysisTimerRef.current) window.clearInterval(analysisTimerRef.current);
    analysisTimerRef.current = window.setInterval(() => {
      setAnalysisStep((current) => Math.min(current + 1, ANALYSIS_STEPS.length - 2));
    }, 1050);
  };

  const getAnalysisRequest = () => {
    const selectedChapter = cleanText(scopeChapter, 180);
    const selectedTopic = cleanText(scopeTopic, 180);
    const chapterNames = parseChapterNames(
      [selectedChapter, manualChapters].filter(Boolean).join("\n"),
    );
    const cleanSubject = cleanText(subjectName, 160);
    const cleanPrompt = cleanText(learningPrompt, MAX_LEARNING_PROMPT_CHARS);
    const requestedPrompt = cleanPrompt;
    const requestedOutline = selectedChapter || selectedTopic
      ? [{
          chapterName: selectedChapter || chapterNames[0] || "",
          topics: selectedTopic ? [selectedTopic] : [],
        }]
      : [];
    const hasManualScope = Boolean(cleanSubject && chapterNames.length);
    const hasOutlineScope = requestedOutline.some((item) => (
      item.chapterName && item.topics.length
    ));
    if (
      !sources.length
      && !requestedPrompt
      && !hasOutlineScope
      && !hasManualScope
    ) {
      setAnalysisError(
        "Upload a source, choose a subject and chapter, or describe what you want to learn.",
      );
      return null;
    }
    return {
      chapterNames,
      cleanSubject,
      learningPrompt: requestedPrompt,
      requestedOutline,
    };
  };

  const runNotebookAnalysis = async ({
    chapterNames,
    cleanSubject,
    learningPrompt: requestedPrompt,
    requestedOutline,
  }) => {
    if (hasInsufficientCredits(AI_FEATURES.LEARNING_NOTEBOOK)) {
      setAnalysisError(getAiRequestErrorMessage({ code: "AI_USER_QUOTA_EXHAUSTED" }));
      return;
    }

    setAnalyzing(true);
    setAnalysisError("");
    beginAnalysisProgress();
    try {
      const attachments = sources
        .filter((source) => source.kind === "attachment")
        .map(({ name, type, size, dataUrl }) => ({ name, type, size, dataUrl }));
      const textSources = sources
        .filter((source) => source.kind === "text")
        .map(({ name, type, size, text }) => ({ name, type, size, text }));
      const payload = await api.post("/api/learning-notebooks/analyze", {
        subjectName: cleanSubject,
        chapterNames,
        learningPrompt: requestedPrompt,
        requestedOutline,
        attachments,
        textSources,
        academicLevel,
        academicTrack,
        learnerProfile: {
          academicLevel,
          academicTrack,
          degree: userProfile?.degree || "",
          department: userProfile?.department || userProfile?.fieldOfStudy || "",
          primaryGoal: userProfile?.primaryGoal || userProfile?.careerGoal || "",
        },
        privacyConsent: {
          accepted: true,
          version: LEARNING_PRIVACY_CONSENT_VERSION,
        },
      }, {
        academicProfileId: academicProfileDataId,
        timeoutMs: LEARNING_NOTEBOOK_REQUEST_TIMEOUT_MS,
        headers: { "Idempotency-Key": createAiIdempotencyKey() },
      });
      if (!mountedRef.current) return;
      if (analysisTimerRef.current) window.clearInterval(analysisTimerRef.current);
      setAnalysisStep(ANALYSIS_STEPS.length - 1);
      const normalized = normalizeNotebook(payload?.notebook);
      setNotebooks((current) => [
        normalized,
        ...current.filter((notebook) => notebook.id !== normalized.id),
      ]);
      selectNotebook(normalized);
      setSources([]);
      setSubjectName("");
      setManualChapters("");
      setScopeChapter("");
      setScopeTopic("");
      setLearningPrompt("");
      setNotification?.("Your learning notebook is ready.");
    } catch (error) {
      if (!mountedRef.current) return;
      setAnalysisError(getAiRequestErrorMessage(error, "The notebook could not be generated."));
    } finally {
      if (analysisTimerRef.current) window.clearInterval(analysisTimerRef.current);
      analysisTimerRef.current = null;
      if (mountedRef.current) setAnalyzing(false);
    }
  };

  const analyzeNotebook = () => {
    const analysisRequest = getAnalysisRequest();
    if (!analysisRequest) return;
    setAnalysisError("");

    if (!hasLearningPrivacyConsent(userProfile?.id)) {
      pendingAnalysisRef.current = { kind: "notebook", request: analysisRequest };
      setPrivacyConsentOpen(true);
      return;
    }

    runNotebookAnalysis(analysisRequest);
  };

  const runCareerAnalysis = async ({ notebookId, targetRole, topics }) => {
    if (hasInsufficientCredits(AI_FEATURES.CAREER_ANALYSIS)) {
      setCareerError(getAiRequestErrorMessage({ code: "AI_USER_QUOTA_EXHAUSTED" }));
      return;
    }

    const requestNotebookId = cleanText(notebookId, 120);
    if (!requestNotebookId || careerAnalysisRequestRef.current.pending) return;
    if (activeNotebookRef.current?.id !== requestNotebookId) {
      setCareerError("The preparation source changed. Review the selected source and try again.");
      return;
    }
    const sequence = careerAnalysisRequestRef.current.sequence + 1;
    careerAnalysisRequestRef.current = {
      notebookId: requestNotebookId,
      pending: true,
      sequence,
    };
    setCareerAnalyzing(true);
    setCareerError("");
    try {
      const payload = await api.post(
        `/api/learning-notebooks/${encodeURIComponent(requestNotebookId)}/career-analyze`,
        {
          targetRole,
          topics,
          privacyConsent: {
            accepted: true,
            version: LEARNING_PRIVACY_CONSENT_VERSION,
          },
        },
        {
          academicProfileId: academicProfileDataId,
          timeoutMs: 120000,
          headers: { "Idempotency-Key": createAiIdempotencyKey() },
        },
      );
      if (!mountedRef.current) return;
      const currentRequest = careerAnalysisRequestRef.current;
      if (
        currentRequest.sequence !== sequence
        || currentRequest.notebookId !== requestNotebookId
        || activeNotebookRef.current?.id !== requestNotebookId
      ) return;
      const draft = createPlacementDraft(payload, {
        notebookId: requestNotebookId,
        requestedTopics: topics,
        targetRole,
      });
      setCareerDraft(draft);
      setCareerRole(draft.analysis.targetRole || targetRole);
      setCareerTopics(topics.join("\n"));
      setWorkspaceView("career");
      setNotification?.("Your preparation draft is ready. Save it as a placement note.");
    } catch (error) {
      const currentRequest = careerAnalysisRequestRef.current;
      if (
        mountedRef.current
        && currentRequest.sequence === sequence
        && currentRequest.notebookId === requestNotebookId
        && activeNotebookRef.current?.id === requestNotebookId
      ) {
        setCareerError(getAiRequestErrorMessage(error, "Placement topics could not be analyzed."));
      }
    } finally {
      const currentRequest = careerAnalysisRequestRef.current;
      if (mountedRef.current && currentRequest.sequence === sequence) {
        careerAnalysisRequestRef.current = { ...currentRequest, pending: false };
        setCareerAnalyzing(false);
      }
    }
  };

  const analyzeCareerTopics = () => {
    if (!placementEligible) {
      setCareerError(careerEligibility.reason);
      return;
    }
    const notebookId = activeNotebook?.id || "";
    if (!notebookId) {
      setCareerError("Choose a saved notebook for this placement preparation.");
      return;
    }
    if (careerDraft && careerDraft.notebookId !== notebookId) {
      setCareerError("Save the current placement draft before analyzing a different notebook.");
      return;
    }
    const request = {
      notebookId,
      targetRole: cleanText(careerRole, 160),
      topics: parseCareerTopics(careerTopics),
    };
    if (!request.topics.length) {
      setCareerError("Add at least one role, interview, or coding topic to analyze.");
      return;
    }
    setCareerError("");
    if (!hasLearningPrivacyConsent(userProfile?.id)) {
      pendingAnalysisRef.current = { kind: "career", request };
      setPrivacyConsentOpen(true);
      return;
    }
    runCareerAnalysis(request);
  };

  const runMedicalAnalysis = async ({ notebookId, trainingFocus, topics }) => {
    if (hasInsufficientCredits(AI_FEATURES.CAREER_ANALYSIS)) {
      setMedicalError(getAiRequestErrorMessage({ code: "AI_USER_QUOTA_EXHAUSTED" }));
      return;
    }

    const requestNotebookId = cleanText(notebookId, 120);
    if (!requestNotebookId || medicalAnalysisRequestRef.current.pending) return;
    if (activeNotebookRef.current?.id !== requestNotebookId) {
      setMedicalError("The medical training source changed. Review the selected source and try again.");
      return;
    }
    const sequence = medicalAnalysisRequestRef.current.sequence + 1;
    medicalAnalysisRequestRef.current = {
      notebookId: requestNotebookId,
      pending: true,
      sequence,
    };
    setMedicalAnalyzing(true);
    setMedicalError("");
    try {
      const payload = await api.post(
        `/api/learning-notebooks/${encodeURIComponent(requestNotebookId)}/medical-training-analyze`,
        {
          trainingFocus,
          topics,
          privacyConsent: {
            accepted: true,
            kind: MEDICAL_TRAINING_PRIVACY_CONSENT_KIND,
            version: MEDICAL_TRAINING_PRIVACY_CONSENT_VERSION,
          },
        },
        {
          academicProfileId: academicProfileDataId,
          timeoutMs: 120000,
          headers: { "Idempotency-Key": createAiIdempotencyKey() },
        },
      );
      if (!mountedRef.current) return;
      const currentRequest = medicalAnalysisRequestRef.current;
      if (
        currentRequest.sequence !== sequence
        || currentRequest.notebookId !== requestNotebookId
        || activeNotebookRef.current?.id !== requestNotebookId
      ) return;
      const draft = createMedicalTrainingDraft(payload, {
        notebookId: requestNotebookId,
        requestedTopics: topics,
        trainingFocus,
      });
      setMedicalDraft(draft);
      setMedicalFocus(draft.analysis.trainingTitle || trainingFocus);
      setMedicalTopics(topics.join("\n"));
      setWorkspaceView("medical");
      setNotification?.("Your conceptual reasoning draft is ready. Save it as Medical training.");
    } catch (error) {
      const currentRequest = medicalAnalysisRequestRef.current;
      if (
        mountedRef.current
        && currentRequest.sequence === sequence
        && currentRequest.notebookId === requestNotebookId
        && activeNotebookRef.current?.id === requestNotebookId
      ) {
        setMedicalError(getAiRequestErrorMessage(error, "Medical training could not be generated."));
      }
    } finally {
      const currentRequest = medicalAnalysisRequestRef.current;
      if (mountedRef.current && currentRequest.sequence === sequence) {
        medicalAnalysisRequestRef.current = { ...currentRequest, pending: false };
        setMedicalAnalyzing(false);
      }
    }
  };

  const analyzeMedicalTopics = () => {
    if (!medicalEligible) {
      setMedicalError(medicalEligibility.reason);
      return;
    }
    const notebookId = activeNotebook?.id || "";
    if (!notebookId) {
      setMedicalError("Choose a saved health-science notebook for this Medical training.");
      return;
    }
    if (medicalDraft && medicalDraft.notebookId !== notebookId) {
      setMedicalError("Save the current Medical training draft before analyzing a different notebook.");
      return;
    }
    const request = {
      notebookId,
      trainingFocus: cleanText(medicalFocus, 160)
        || medicalEligibility.disciplineLabel
        || "Health-science conceptual reasoning",
      topics: parseCareerTopics(medicalTopics),
    };
    if (!request.topics.length) {
      setMedicalError("Add at least one medical or health-science concept to train.");
      return;
    }
    setMedicalError("");
    if (!hasLearningPrivacyConsent(userProfile?.id, {
      kind: MEDICAL_TRAINING_PRIVACY_CONSENT_KIND,
      version: MEDICAL_TRAINING_PRIVACY_CONSENT_VERSION,
    })) {
      pendingAnalysisRef.current = { kind: "medical", request };
      setPrivacyConsentOpen(true);
      return;
    }
    runMedicalAnalysis(request);
  };

  const declinePrivacyConsent = () => {
    pendingAnalysisRef.current = null;
    setPrivacyConsentOpen(false);
  };

  const agreeToPrivacyConsent = () => {
    const pending = pendingAnalysisRef.current;
    if (!pending) {
      setPrivacyConsentOpen(false);
      return;
    }

    acceptLearningPrivacyConsent(userProfile?.id, pending.kind === "medical"
      ? {
          kind: MEDICAL_TRAINING_PRIVACY_CONSENT_KIND,
          version: MEDICAL_TRAINING_PRIVACY_CONSENT_VERSION,
        }
      : undefined);
    pendingAnalysisRef.current = null;
    setPrivacyConsentOpen(false);
    if (pending.kind === "career") {
      runCareerAnalysis(pending.request);
    } else if (pending.kind === "medical") {
      runMedicalAnalysis(pending.request);
    } else {
      runNotebookAnalysis(pending.request || pending);
    }
  };

  const updateNotebook = (updater) => {
    setActiveNotebook((current) => {
      if (!current) return current;
      const next = typeof updater === "function" ? updater(current) : { ...current, ...updater };
      const stamped = { ...next, updatedAt: new Date().toISOString() };
      activeNotebookRef.current = stamped;
      return stamped;
    });
    setDirty(true);
  };

  const enqueueNotebookPatch = useCallback((snapshot) => {
    const request = notebookSaveChainRef.current
      .catch(() => undefined)
      .then(() => api.patch(
        `/api/learning-notebooks/${encodeURIComponent(snapshot.id)}`,
        { notebook: snapshot },
        { academicProfileId: academicProfileDataId, timeoutMs: 30000 },
      ));
    notebookSaveChainRef.current = request.catch(() => undefined);
    return request;
  }, [academicProfileDataId]);

  const queueMasteryAutosave = useCallback((snapshot) => {
    if (!snapshot?.id) return;
    const sequence = ++masterySaveSequenceRef.current;
    if (masteryAutosaveTimerRef.current) window.clearTimeout(masteryAutosaveTimerRef.current);
    setMasterySaving(true);
    masteryAutosaveTimerRef.current = window.setTimeout(async () => {
      const currentSnapshot = activeNotebookRef.current?.id === snapshot.id
        ? activeNotebookRef.current
        : snapshot;
      try {
        const payload = await enqueueNotebookPatch(currentSnapshot);
        if (!mountedRef.current || sequence !== masterySaveSequenceRef.current) return;
        const normalized = normalizeNotebook(payload?.notebook || currentSnapshot);
        const revisionMatches = activeNotebookRef.current?.id === currentSnapshot.id
          && activeNotebookRef.current?.updatedAt === currentSnapshot.updatedAt;
        setNotebooks((current) => current.map((notebook) => (
          notebook.id === normalized.id && notebook.updatedAt === currentSnapshot.updatedAt
            ? normalized
            : notebook
        )));
        if (revisionMatches) {
          activeNotebookRef.current = normalized;
          setActiveNotebook(normalized);
          setDirty(false);
        }
      } catch (error) {
        if (mountedRef.current && sequence === masterySaveSequenceRef.current) {
          setDirty(true);
          setNotification?.(error instanceof Error ? error.message : "Learning progress could not be saved.");
        }
      } finally {
        if (mountedRef.current && sequence === masterySaveSequenceRef.current) setMasterySaving(false);
      }
    }, 650);
  }, [enqueueNotebookPatch, setNotification]);

  const applyLearningState = (updater) => {
    const currentNotebook = activeNotebookRef.current?.id === activeNotebook?.id
      ? activeNotebookRef.current
      : activeNotebook;
    if (!currentNotebook?.id) return null;
    const now = new Date().toISOString();
    const currentState = normalizeLearningState(currentNotebook.learningState, {
      notebook: currentNotebook,
      now,
    });
    const nextState = typeof updater === "function" ? updater(currentState, now) : updater;
    const nextNotebook = {
      ...currentNotebook,
      learningState: normalizeLearningState(nextState, {
        notebook: currentNotebook,
        now,
      }),
      updatedAt: now,
    };
    activeNotebookRef.current = nextNotebook;
    setActiveNotebook(nextNotebook);
    setNotebooks((current) => current.map((notebook) => (
      notebook.id === nextNotebook.id ? nextNotebook : notebook
    )));
    setDirty(true);
    queueMasteryAutosave(nextNotebook);
    return nextNotebook.learningState;
  };

  const startStudySession = (nodeId) => {
    const node = nodes.find((item) => item.id === nodeId && item.type === "topic");
    if (!node || !activeNotebook) return;
    setSelectedNodeId(node.id);
    setActiveTab("studio");
    const nextState = applyLearningState((state, now) => {
      let working = state;
      const active = state.sessions.find((session) => session.id === state.activeSessionId);

      if (active?.nodeIds?.[0] === node.id) {
        working = updateLearningSession(working, {
          sessionId: active.id,
          pausedAt: "",
          nodeIds: [node.id],
        }, { notebook: activeNotebook, now });
      } else {
        if (active) {
          const previousNodeId = active.nodeIds?.[0];
          working = updateLearningSession(working, {
            sessionId: active.id,
            pausedAt: true,
          }, { notebook: activeNotebook, now });
          working = { ...working, activeSessionId: "", updatedAt: now };

          const previousProgress = working.nodes?.[previousNodeId];
          if (previousNodeId && previousProgress) {
            const restoredStatus = previousProgress.masteredAt
              ? "mastered"
              : previousProgress.learnedAt
                ? getLearningNodeStatus({ ...previousProgress, status: "learned" }, { now })
                : previousProgress.attempts?.length
                  ? getLearningNodeStatus({ ...previousProgress, status: "learning" }, { now })
                  : "ready";
            working = setLearningNodeStatus(working, previousNodeId, restoredStatus, {
              notebook: activeNotebook,
              now,
            });
          }
        }

        const resumable = [...working.sessions].reverse().find((session) => (
          session.status === "in_progress"
          && session.pausedAt
          && session.nodeIds?.[0] === node.id
        ));
        if (resumable) {
          working = updateLearningSession(working, {
            sessionId: resumable.id,
            pausedAt: "",
            nodeIds: [node.id],
          }, { notebook: activeNotebook, now });
          working = { ...working, activeSessionId: resumable.id, updatedAt: now };
        } else {
          working = startLearningSession(working, {
            notebookId: activeNotebook.id,
            subjectName: activeNotebook.subjectName,
            objective: `Understand and prove ${node.title}`,
            mode: "guided",
            nodeIds: [node.id],
            stageIndex: 0,
          }, { notebook: activeNotebook, now });
        }
      }

      return setLearningNodeStatus(working, node.id, "learning", {
        notebook: activeNotebook,
        now,
      });
    });
    if (nextState) setLatestReceipt(null);
  };

  const pauseStudySession = (session) => {
    if (!session?.id) return;
    applyLearningState((state, now) => updateLearningSession(state, {
      sessionId: session.id,
      pausedAt: true,
    }, { notebook: activeNotebook, now }));
    setNotification?.("Study session paused and saved. Continue whenever you are ready.");
  };

  const advanceStudySession = ({ sessionId, stageIndex }) => {
    applyLearningState((state, now) => updateLearningSession(state, {
      sessionId,
      stageIndex,
      pausedAt: "",
    }, { notebook: activeNotebook, now }));
  };

  const ratingScore = (rating, fallback) => {
    if (Number.isFinite(Number(fallback))) return Number(fallback);
    return { again: 25, hard: 55, good: 82, easy: 100 }[rating] ?? 60;
  };

  const recordStudyAttempt = (attempt) => {
    if (!attempt?.nodeId) return;
    applyLearningState((state, now) => {
      const score = ratingScore(attempt.rating, attempt.score);
      const attempted = recordLearningAttempt(state, {
        ...attempt,
        score,
        correct: score >= 70,
        responseSummary: attempt.response,
        sessionId: state.activeSessionId,
      }, { notebook: activeNotebook, now });
      return Number.isFinite(Number(attempt.nextStageIndex))
        ? updateLearningSession(attempted, {
            sessionId: attempted.activeSessionId,
            stageIndex: Number(attempt.nextStageIndex),
            pausedAt: "",
          }, { notebook: activeNotebook, now })
        : attempted;
    });
  };

  const syncLearnedNodeToPlanner = (node) => {
    if (!node || !activeNotebook) return false;
    let nextSchedule = schedule;
    let plannerState = getLearningPlannerCompletionState(
      nextSchedule,
      completed,
      activeLearningProject,
      node,
    );
    if (!plannerState.isScheduled && dateOptions[0]) {
      const scheduled = upsertLearningPlannerTask(
        nextSchedule,
        activeLearningProject,
        node,
        dateOptions[0].dateKey,
        scheduleStartDate,
      );
      if (scheduled?.schedule) {
        nextSchedule = scheduled.schedule;
        setSchedule?.(nextSchedule);
        plannerState = getLearningPlannerCompletionState(
          nextSchedule,
          completed,
          activeLearningProject,
          node,
        );
      }
    }
    if (!plannerState.isScheduled) return false;
    const completion = setLearningPlannerNodeCompletion(
      nextSchedule,
      completed,
      activeLearningProject,
      node,
      true,
    );
    if (!completion) return false;
    setCompleted?.(completion.completed);
    return true;
  };

  const finishStudySession = ({ nodeId, sessionId, rating, response }) => {
    const node = nodes.find((item) => item.id === nodeId);
    if (!node || !activeNotebook) return;
    const score = ratingScore(rating);
    const nextState = applyLearningState((state, now) => {
      const attempted = recordLearningAttempt(state, {
        nodeId,
        kind: "mastery_check",
        responseSummary: response,
        score,
        correct: score >= 70,
        confidence: rating === "easy" ? 5 : rating === "good" ? 4 : rating === "hard" ? 2 : 1,
        sessionId: sessionId || state.activeSessionId,
      }, { notebook: activeNotebook, now });
      return completeLearningSession(attempted, {
        sessionId: sessionId || attempted.activeSessionId,
        nodeIds: [nodeId],
        summary: score >= 70
          ? `${node.title} was learned and scheduled for spaced review.`
          : `${node.title} needs another recall pass and remains in the review queue.`,
      }, { notebook: activeNotebook, now });
    });
    const progress = nextState?.nodes?.[nodeId];
    const plannerSynced = score >= 70 ? syncLearnedNodeToPlanner(node) : false;
    setLatestReceipt({
      nodeId,
      title: node.title,
      masteryScore: progress?.masteryScore || score,
      summary: score >= 70
        ? `Learning evidence saved${plannerSynced ? ", planner checked" : ""}, and the next review was scheduled.`
        : "This attempt was saved and a shorter review interval was scheduled.",
    });
    setNotification?.(
      score >= 70
        ? `${node.title} learned${plannerSynced ? " and completed in the planner" : ""}.`
        : `${node.title} added to your review queue.`,
    );
  };

  const addLearningMisconception = (nodeId, label) => {
    applyLearningState((state, now) => recordLearningAttempt(state, {
      nodeId,
      kind: "reflection",
      responseSummary: label,
      misconceptions: [{ label }],
      sessionId: state.activeSessionId,
    }, { notebook: activeNotebook, now }));
  };

  const resolveLearningMisconception = (nodeId, misconceptionId) => {
    applyLearningState((state, now) => recordLearningAttempt(state, {
      nodeId,
      kind: "reflection",
      resolvedMisconceptionIds: [misconceptionId],
      sessionId: state.activeSessionId,
    }, { notebook: activeNotebook, now }));
  };

  const buildLearningNoteCandidate = (node, override = {}) => buildLearningTopicNote({
    subjectName: activeNotebook.subjectName,
    chapterTitle: node.chapterName || "Independent study",
    topicTitle: override.title || node.title,
    summary: node.summary,
    explanation: override.details || node.explanation,
    keyPoints: node.keyPoints,
    examples: node.examples,
    revisionTips: node.revisionTips,
    notebookId: activeNotebook.id,
    chapterId: activeNotebook.chapters.find((chapter) => chapter.title === node.chapterName)?.id,
    topicId: node.id,
  });

  const isLearningNoteSaving = (node, override = {}) => {
    if (!node || !activeNotebook) return false;
    try {
      return noteSavingKeys.has(buildLearningNoteCandidate(node, override).sourceKey);
    } catch {
      return false;
    }
  };

  const saveLearningTopicToNotes = async (node, override = {}) => {
    if (!node || !activeNotebook) return;
    let candidate;
    try {
      candidate = buildLearningNoteCandidate(node, override);
    } catch (error) {
      setNotification?.(error instanceof Error ? error.message : "This topic could not be prepared for Notes.");
      return;
    }
    if (noteSavingKeysRef.current.has(candidate.sourceKey)) return;
    noteSavingKeysRef.current.add(candidate.sourceKey);
    setNoteSavingKeys((current) => new Set(current).add(candidate.sourceKey));
    try {
      const payload = await api.createNote(candidate, { academicProfileId: academicProfileDataId });
      const guidance = Boolean(override.title || override.details);
      const createdMessage = guidance ? "AI guidance saved to Notes." : "Topic saved to Notes.";
      const existingMessage = guidance ? "This guidance is already in Notes." : "This topic is already in Notes.";
      setNotification?.(payload.created ? createdMessage : existingMessage);
    } catch (error) {
      setNotification?.(error instanceof Error ? error.message : "This topic could not be saved to Notes.");
    } finally {
      noteSavingKeysRef.current.delete(candidate.sourceKey);
      setNoteSavingKeys((current) => {
        const next = new Set(current);
        next.delete(candidate.sourceKey);
        return next;
      });
    }
  };

  const referLearningMaterial = (node) => {
    const subject = node?.subjectName || activeNotebook?.subjectName || subjectName;
    navigate(buildMaterialGuidePath(subject));
  };

  const runLearningCoachAction = async (action, node) => {
    if (!node || coachState.loading) return;
    if (hasInsufficientCredits(AI_FEATURES.CHAT)) {
      setCoachState({
        loading: false,
        error: getAiRequestErrorMessage({ code: "AI_USER_QUOTA_EXHAUSTED" }),
        response: "",
        label: "",
      });
      return;
    }
    const instruction = {
      simpler: "Explain this in simpler language and no more than five short steps.",
      analogy: "Give one memorable everyday analogy, then map each part back to the concept.",
      hint: "Give one Socratic hint only. Do not reveal the full answer.",
      example: "Give one fresh worked example appropriate to my academic level.",
      challenge: "Ask one challenging application question. Do not answer it yet.",
    }[action] || "Give focused guidance for this concept.";
    const label = {
      simpler: "Simpler explanation",
      analogy: "Concept analogy",
      hint: "Socratic hint",
      example: "Worked example",
      challenge: "Challenge question",
    }[action] || "Coach guidance";
    setCoachState({ loading: true, error: "", response: "", label });
    try {
      const payload = await api.post("/api/study-assistant/chat", {
        source: "learning_coach",
        message: [
          `You are the contextual coach inside the Start Learning mastery workspace.`,
          `Subject: ${activeNotebook.subjectName}.`,
          `Chapter: ${node.chapterName || "Independent study"}.`,
          `Concept: ${node.title}.`,
          node.explanation || node.summary ? `Notebook context: ${cleanText(node.explanation || node.summary, 3200)}` : "",
          instruction,
          "Be concise, accurate, and keep the learner doing the thinking.",
        ].filter(Boolean).join("\n"),
        plannerContext: {
          academicLevel,
          academicTrack,
          totalTasks: plannerMetrics.totalTasks,
          completedTasks: plannerMetrics.completedTasks,
          remainingTasks: plannerMetrics.remainingTasks,
          completionRate: plannerMetrics.completionRate,
          weakSubject: plannerMetrics.weakSubject,
          firstPendingTask: plannerMetrics.firstPendingTask,
          todayTasks: plannerMetrics.todayTasks,
          subjectBreakdown: Object.entries(plannerMetrics.subjectStats || {}).map(
            ([name, stats]) => `${name}: ${stats.completed}/${stats.total} complete`,
          ),
        },
      }, {
        academicProfileId: academicProfileDataId,
        timeoutMs: 30000,
        headers: { "Idempotency-Key": createAiIdempotencyKey() },
      });
      if (!mountedRef.current) return;
      setCoachState({ loading: false, error: "", response: payload.reply || "No guidance was returned.", label });
    } catch (error) {
      if (!mountedRef.current) return;
      setCoachState({
        loading: false,
        error: getAiRequestErrorMessage(error, "The AI Coach could not respond."),
        response: "",
        label,
      });
    }
  };
  const updateChapter = (chapterId, updater) => {
    updateNotebook((current) => ({
      ...current,
      chapters: current.chapters.map((chapter) =>
        chapter.id === chapterId
          ? (typeof updater === "function" ? updater(chapter) : { ...chapter, ...updater })
          : chapter,
      ),
    }));
  };

  const updateTopic = (chapterId, topicId, updater) => {
    updateChapter(chapterId, (chapter) => ({
      ...chapter,
      topics: chapter.topics.map((topic) =>
        topic.id === topicId
          ? (typeof updater === "function" ? updater(topic) : { ...topic, ...updater })
          : topic,
      ),
    }));
  };

  const addChapter = () => {
    const title = cleanText(chapterDraft, 180);
    if (!title) return;
    const chapter = normalizeChapter({ id: makeId("chapter"), title, topics: [] }, activeNotebook.chapters.length, activeNotebook.id);
    updateNotebook((current) => ({ ...current, chapters: [...current.chapters, chapter] }));
    setExpandedChapters((current) => new Set(current).add(chapter.id));
    setSelectedNodeId(chapter.id);
    setChapterDraft("");
    setChapterComposerOpen(false);
  };

  const addTopic = (chapterId) => {
    const title = cleanText(topicComposer.value, 180);
    if (!title || topicComposer.chapterId !== chapterId) return;
    const topic = normalizeTopic({ id: makeId("topic"), title, subtopics: [] }, 0, chapterId);
    updateChapter(chapterId, (chapter) => ({ ...chapter, topics: [...chapter.topics, topic] }));
    setSelectedNodeId(topic.id);
    setTopicComposer({ chapterId: "", value: "" });
  };

  const addSubtopic = (chapterId, topicId) => {
    const title = cleanText(subtopicComposer.value, 180);
    if (!title || subtopicComposer.chapterId !== chapterId || subtopicComposer.topicId !== topicId) return;
    const subtopic = normalizeSubtopic({ id: makeId("subtopic"), title }, 0, topicId);
    updateTopic(chapterId, topicId, (topic) => ({ ...topic, subtopics: [...topic.subtopics, subtopic] }));
    setSelectedNodeId(subtopic.id);
    setSubtopicComposer({ chapterId: "", topicId: "", value: "" });
  };

  const removeChapter = (chapterId) => {
    updateNotebook((current) => ({
      ...current,
      chapters: current.chapters.filter((chapter) => chapter.id !== chapterId),
    }));
  };

  const persistActiveNotebook = async ({
    errorMessage = "The notebook could not be saved.",
    expectedRevision = "",
    reconcileListById = false,
    snapshot: requestedSnapshot,
    successMessage = "Learning notebook saved.",
  } = {}) => {
    const snapshot = requestedSnapshot || activeNotebook;
    if (!snapshot?.id || saving) return null;
    const baselineRevision = expectedRevision || snapshot.updatedAt;
    if (masteryAutosaveTimerRef.current) {
      window.clearTimeout(masteryAutosaveTimerRef.current);
      masteryAutosaveTimerRef.current = null;
    }
    ++masterySaveSequenceRef.current;
    setMasterySaving(false);
    setSaving(true);
    try {
      const payload = await enqueueNotebookPatch(snapshot);
      if (!mountedRef.current) return null;
      const normalized = normalizeNotebook(payload?.notebook || snapshot);
      const revisionMatches = activeNotebookRef.current?.id === snapshot.id
        && activeNotebookRef.current?.updatedAt === baselineRevision;
      setNotebooks((current) => {
        let matched = false;
        const next = current.map((notebook) => {
          if (notebook.id !== normalized.id) return notebook;
          matched = true;
          return reconcileListById
            || revisionMatches
            || notebook.updatedAt === baselineRevision
            ? normalized
            : notebook;
        });
        return reconcileListById && !matched ? [normalized, ...next] : next;
      });
      if (revisionMatches) {
        activeNotebookRef.current = normalized;
        setActiveNotebook(normalized);
        setDirty(false);
      }
      setNotification?.(
        revisionMatches ? successMessage : `${successMessage} Newer changes are still being saved.`,
      );
      return { applied: revisionMatches, notebook: normalized };
    } catch (error) {
      if (mountedRef.current) {
        setNotification?.(error instanceof Error ? error.message : errorMessage);
      }
      return null;
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  };

  const saveNotebook = () => persistActiveNotebook();

  const saveCareerPreparation = async () => {
    if (!activeNotebook?.id || !activeCareerDraft) {
      setNotification?.("Analyze placement topics before saving a preparation guide.");
      return;
    }

    let snapshot;
    try {
      snapshot = mergePlacementDraft(activeNotebook, activeCareerDraft, {
        savedAt: new Date().toISOString(),
      });
    } catch (error) {
      setNotification?.(error instanceof Error ? error.message : "The preparation draft could not be saved.");
      return;
    }

    const draftIdentity = `${activeCareerDraft.notebookId}:${activeCareerDraft.generatedAt}`;
    activeNotebookRef.current = snapshot;
    setActiveNotebook(snapshot);
    setDirty(true);
    const result = await persistActiveNotebook({
      errorMessage: "The placement preparation could not be saved.",
      expectedRevision: snapshot.updatedAt,
      reconcileListById: true,
      snapshot,
      successMessage: "Placement preparation saved and available in Saved placement notes.",
    });
    if (result) {
      setCareerDraft((current) => (
        current && `${current.notebookId}:${current.generatedAt}` === draftIdentity
          ? null
          : current
      ));
    }
  };

  const saveMedicalTraining = async () => {
    if (!activeNotebook?.id || !activeMedicalDraft) {
      setNotification?.("Build a Medical training session before saving it.");
      return;
    }

    let snapshot;
    try {
      snapshot = mergeMedicalTrainingDraft(activeNotebook, activeMedicalDraft, {
        savedAt: new Date().toISOString(),
      });
    } catch (error) {
      setNotification?.(error instanceof Error ? error.message : "The Medical training draft could not be saved.");
      return;
    }

    const draftIdentity = `${activeMedicalDraft.notebookId}:${activeMedicalDraft.generatedAt}`;
    activeNotebookRef.current = snapshot;
    setActiveNotebook(snapshot);
    setDirty(true);
    const result = await persistActiveNotebook({
      errorMessage: "Medical training could not be saved.",
      expectedRevision: snapshot.updatedAt,
      reconcileListById: true,
      snapshot,
      successMessage: "Medical training saved and available in Saved medical training.",
    });
    if (result) {
      setMedicalDraft((current) => (
        current && `${current.notebookId}:${current.generatedAt}` === draftIdentity
          ? null
          : current
      ));
    }
  };

  const deleteNotebook = async (notebookId) => {
    if (careerAnalyzing || medicalAnalyzing || saving) return;
    setDeletingId(notebookId);
    try {
      await api.delete(`/api/learning-notebooks/${encodeURIComponent(notebookId)}`, {
        academicProfileId: academicProfileDataId,
        timeoutMs: 30000,
      });
      if (!mountedRef.current) return;
      setNotebooks((current) => current.filter((notebook) => notebook.id !== notebookId));
      setCareerDraft((current) => (
        current?.notebookId === notebookId ? null : current
      ));
      setMedicalDraft((current) => (
        current?.notebookId === notebookId ? null : current
      ));
      if (activeNotebook?.id === notebookId) {
        activeNotebookRef.current = null;
        setActiveNotebook(null);
        setWorkspaceView("intake");
      }
      setDeleteCandidateId("");
      setNotification?.("Learning notebook deleted.");
    } catch (error) {
      if (mountedRef.current) {
        setNotification?.(error instanceof Error ? error.message : "The notebook could not be deleted.");
      }
    } finally {
      if (mountedRef.current) setDeletingId("");
    }
  };

  const exportNotebook = async () => {
    if (!activeNotebook || exporting) return;
    setExporting(true);
    try {
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
      const margin = 16;
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const width = pageWidth - margin * 2;
      let y = 18;

      const ensureSpace = (needed = 14) => {
        if (y + needed <= pageHeight - 16) return;
        pdf.addPage();
        y = 18;
      };
      const addHeading = (text, size = 14) => {
        ensureSpace(size * 0.8 + 5);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(size);
        pdf.setTextColor(16, 111, 105);
        pdf.text(cleanText(text, 240), margin, y);
        y += size * 0.45 + 4;
      };
      const addParagraph = (text, options = {}) => {
        const clean = cleanText(text, 12000);
        if (!clean) return;
        pdf.setFont("helvetica", options.bold ? "bold" : "normal");
        pdf.setFontSize(options.size || 9.5);
        pdf.setTextColor(options.muted ? 90 : 32, options.muted ? 101 : 43, options.muted ? 116 : 58);
        const lines = pdf.splitTextToSize(clean, width - (options.indent || 0));
        lines.forEach((line) => {
          ensureSpace(5);
          pdf.text(line, margin + (options.indent || 0), y);
          y += options.leading || 4.8;
        });
        y += 2;
      };

      pdf.setFillColor(13, 37, 43);
      pdf.roundedRect(margin, 12, width, 30, 5, 5, "F");
      pdf.setTextColor(255, 255, 255);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(21);
      pdf.text(activeNotebook.title, margin + 7, 25);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.text(`${activeNotebook.subjectName} · PrepMatrix Learning Notebook`, margin + 7, 34);
      y = 51;
      addParagraph(activeNotebook.summary, { size: 10.5 });

      addHeading("Important questions", 15);
      activeNotebook.importantQuestions.forEach((question, index) => {
        addParagraph(`${index + 1}. ${question.question}`, { bold: true });
        if (question.answer) addParagraph(question.answer, { indent: 5, muted: true });
      });

      addHeading("Revised notes", 15);
      activeNotebook.revisedNotes.forEach((section) => {
        addHeading(section.title, 11.5);
        addParagraph(section.content);
        section.bullets.forEach((bullet) => addParagraph(`• ${bullet}`, { indent: 3 }));
      });

      addHeading("Chapter outline", 15);
      activeNotebook.chapters.forEach((chapter, chapterIndex) => {
        addHeading(`${chapterIndex + 1}. ${chapter.title}`, 11.5);
        addParagraph(chapter.summary, { muted: true });
        chapter.topics.forEach((topic, topicIndex) => {
          addParagraph(`${chapterIndex + 1}.${topicIndex + 1} ${topic.title}`, { bold: true, indent: 3 });
          topic.subtopics.forEach((subtopic) => addParagraph(`• ${subtopic.title}`, { indent: 8 }));
        });
      });

      const chapterGroups = [];
      const chaptersPerMapPage = 4;
      for (let index = 0; index < activeNotebook.chapters.length; index += chaptersPerMapPage) {
        chapterGroups.push(activeNotebook.chapters.slice(index, index + chaptersPerMapPage));
      }
      if (!chapterGroups.length) chapterGroups.push([]);

      chapterGroups.forEach((chapterGroup, groupIndex) => {
        pdf.addPage("a4", "landscape");
        const mapPageWidth = pdf.internal.pageSize.getWidth();
        const mapPageHeight = pdf.internal.pageSize.getHeight();
        const mapCenter = mapPageWidth / 2;
        const mapTop = 13;
        const rootWidth = 72;
        const rootHeight = 16;
        const branchGap = 8;
        const branchCount = Math.max(chapterGroup.length, 1);
        const branchWidth = Math.min(62, (mapPageWidth - 28 - branchGap * (branchCount - 1)) / branchCount);
        const branchesWidth = branchWidth * branchCount + branchGap * (branchCount - 1);
        const branchStart = (mapPageWidth - branchesWidth) / 2;
        const chapterY = 62;

        pdf.setFillColor(247, 250, 249);
        pdf.rect(0, 0, mapPageWidth, mapPageHeight, "F");
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(15);
        pdf.setTextColor(26, 49, 55);
        pdf.text("Concept mind map", 14, mapTop);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.setTextColor(93, 106, 113);
        pdf.text(`Map ${groupIndex + 1} of ${chapterGroups.length}`, mapPageWidth - 14, mapTop, { align: "right" });

        pdf.setFillColor(13, 112, 105);
        pdf.setDrawColor(13, 112, 105);
        pdf.roundedRect(mapCenter - rootWidth / 2, 24, rootWidth, rootHeight, 4, 4, "FD");
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(9.5);
        pdf.setTextColor(255, 255, 255);
        const rootLabel = pdf.splitTextToSize(activeNotebook.subjectName, rootWidth - 8).slice(0, 1);
        pdf.text(rootLabel, mapCenter, 34, { align: "center" });

        if (!chapterGroup.length) {
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(9);
          pdf.setTextColor(93, 106, 113);
          pdf.text("No mapped chapters were available for this notebook.", mapCenter, 62, { align: "center" });
          return;
        }

        const firstCenter = branchStart + branchWidth / 2;
        const lastCenter = branchStart + (branchCount - 1) * (branchWidth + branchGap) + branchWidth / 2;
        pdf.setDrawColor(85, 169, 157);
        pdf.setLineWidth(0.45);
        pdf.line(mapCenter, 40, mapCenter, 52);
        pdf.line(firstCenter, 52, lastCenter, 52);

        chapterGroup.forEach((chapter, chapterIndex) => {
          const x = branchStart + chapterIndex * (branchWidth + branchGap);
          const centerX = x + branchWidth / 2;
          pdf.line(centerX, 52, centerX, chapterY);
          pdf.setFillColor(226, 244, 240);
          pdf.setDrawColor(85, 169, 157);
          pdf.roundedRect(x, chapterY, branchWidth, 18, 3, 3, "FD");
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(7.8);
          pdf.setTextColor(24, 61, 63);
          const chapterLabel = pdf.splitTextToSize(chapter.title, branchWidth - 7).slice(0, 2);
          pdf.text(chapterLabel, centerX, chapterY + 7, { align: "center" });

          const visibleTopics = chapter.topics.slice(0, 4);
          visibleTopics.forEach((topic, topicIndex) => {
            const topicY = 88 + topicIndex * 24;
            pdf.setDrawColor(190, 205, 205);
            pdf.line(centerX, topicIndex === 0 ? chapterY + 18 : topicY - 4, centerX, topicY);
            pdf.setFillColor(255, 255, 255);
            pdf.roundedRect(x + 2, topicY, branchWidth - 4, 19, 2.5, 2.5, "FD");
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(7.2);
            pdf.setTextColor(38, 55, 61);
            const topicLabel = pdf.splitTextToSize(topic.title, branchWidth - 11).slice(0, 1);
            pdf.text(topicLabel, x + 5, topicY + 6);
            const subtopicLabel = topic.subtopics.slice(0, 2).map((item) => item.title).join(" ? ");
            if (subtopicLabel) {
              pdf.setFont("helvetica", "normal");
              pdf.setFontSize(6.2);
              pdf.setTextColor(100, 112, 119);
              const subtopicLines = pdf.splitTextToSize(subtopicLabel, branchWidth - 11).slice(0, 1);
              pdf.text(subtopicLines, x + 5, topicY + 13);
            }
          });

          if (chapter.topics.length > visibleTopics.length) {
            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(6.4);
            pdf.setTextColor(13, 112, 105);
            pdf.text(`+${chapter.topics.length - visibleTopics.length} more topics`, centerX, mapPageHeight - 13, { align: "center" });
          }
        });
      });

      const totalPages = pdf.getNumberOfPages();
      for (let page = 1; page <= totalPages; page += 1) {
        pdf.setPage(page);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.setTextColor(108, 117, 125);
        pdf.text("PrepMatrix · Start Learning", margin, pageHeight - 8);
        pdf.text(`${page} / ${totalPages}`, pageWidth - margin, pageHeight - 8, { align: "right" });
      }
      pdf.save(pdfFileName(activeNotebook));
      setNotification?.("Learning notebook exported as PDF.");
    } catch {
      setNotification?.("The learning notebook PDF could not be exported.");
    } finally {
      setExporting(false);
    }
  };

  const askAI = () => {
    if (!activeNotebook) return;
    const focus = selectedNode ? ` Focus on ${selectedNode.type} "${selectedNode.title}".` : "";
    const questions = activeNotebook.importantQuestions
      .slice(0, 3)
      .map((question) => question.question)
      .join("; ");
    window.dispatchEvent(new CustomEvent("openPrepMatrixAIChat", {
      detail: {
        createNewChat: true,
        message: `Use my learning notebook "${activeNotebook.title}" for ${activeNotebook.subjectName}.${focus} Teach it step by step, then test me. Important questions: ${questions || "Create a short recall check."}`,
      },
    }));
  };

  const closePlannerDialog = () => {
    setPlannerDialogOpen(false);
    setPlannerCustomNode(null);
    setPlannerError("");
  };

  const openPlannerForNode = (node) => {
    if (!node) return;
    const isNotebookNode = nodes.some((item) => item.id === node.id);
    if (isNotebookNode) setSelectedNodeId(node.id);
    setPlannerCustomNode(isNotebookNode ? null : node);
    setPlannerNodeId(node.id);
    setPlannerDateKey(dateOptions[0]?.dateKey || "");
    setPlannerError("");
    setPlannerDialogOpen(true);
  };

  const placementActionTarget = (topic, item, kind, index) => buildPlacementActionTarget({
    codingRelevant: activeNotebook?.careerPreparation?.codingRelevant,
    index,
    item,
    kind,
    notebook: activeNotebook,
    targetRole: careerAnalysis?.targetRole || careerRole,
    topic,
  });

  const placementNoteOptions = (target) => ({
    details: target.explanation,
    title: target.title,
  });

  const savePlacementItem = (target) => saveLearningTopicToNotes(
    target,
    placementNoteOptions(target),
  );

  const askPlacementItemAI = (target, topic) => {
    if (!target || !activeNotebook) return;
    window.dispatchEvent(new CustomEvent("openPrepMatrixAIChat", {
      detail: {
        createNewChat: true,
        message: buildPlacementChatPrompt({
          notebook: activeNotebook,
          target,
          targetRole: careerAnalysis?.targetRole || careerRole,
          topic,
        }),
      },
    }));
  };

  const medicalActionTarget = (module, item, kind, index) => buildMedicalTrainingActionTarget({
    focus: medicalAnalysis?.trainingTitle || medicalFocus,
    index,
    item,
    kind,
    module,
    notebook: activeNotebook,
  });

  const saveMedicalItem = (target, reasoning = {}) => {
    const answer = cleanText(reasoning?.answer, 5_000);
    const prompt = cleanText(reasoning?.prompt, 900);
    const reference = cleanText(
      reasoning?.reference || target?.explanation,
      4_000,
    );
    return saveLearningTopicToNotes(target, {
      details: [
        prompt ? ["Reasoning prompt", prompt].join("\n") : "",
        answer ? ["My reasoning", answer].join("\n") : "",
        reference ? ["Reference reasoning and safety framework", reference].join("\n") : "",
      ].filter(Boolean).join("\n\n"),
      title: target.title,
    });
  };

  const askMedicalItemAI = (target, module) => {
    if (!target || !activeNotebook || !module) return;
    if (medicalAnalysisIsDraft) {
      setNotification?.("Save this Medical training before opening its audited study-coach session.");
      return;
    }
    window.dispatchEvent(new CustomEvent("openPrepMatrixAIChat", {
      detail: {
        context: {
          artifact: "medical-training",
          mode: "education-only",
          notebookId: target.metadata?.notebookId,
          moduleId: target.metadata?.moduleId,
        },
        createNewChat: true,
        message: buildMedicalTrainingChatPrompt({
          focus: medicalAnalysis?.trainingTitle || medicalFocus,
          module,
          target,
        }),
      },
    }));
  };
  const toggleLearningNodeCompletion = (node) => {
    const state = completionStateByNodeId.get(node?.id);
    if (!node || !state?.isScheduled) {
      openPlannerForNode(node);
      setNotification?.(
        `${node?.title || "This learning unit"} is not scheduled yet. Choose a planner date first.`,
      );
      return;
    }

    const result = setLearningPlannerNodeCompletion(
      schedule,
      completed,
      activeLearningProject,
      node,
      !state.isCompleted,
    );
    if (!result) return;

    setCompleted?.(result.completed);
    if (result.isCompleted) {
      applyLearningState((learningState, now) => markLearningNodeLearned(
        learningState,
        node.id,
        { notebook: activeNotebook, now },
      ));
    }
    setNotification?.(
      result.isCompleted
        ? `${node.title} marked complete in Study schedule.`
        : `${node.title} marked incomplete in Study schedule.`,
    );
  };

  const renderCompletionAction = (node, { iconOnly = false } = {}) => {
    if (!node || node.type === "notebook") return null;
    const state = completionStateByNodeId.get(node.id) || {
      isCompleted: false,
      isScheduled: false,
    };
    const label = state.isScheduled
      ? state.isCompleted ? "Completed" : "Mark as completed"
      : "Add to planner";
    const Icon = state.isScheduled ? Check : CalendarPlus;
    const title = state.isScheduled && state.isCompleted
      ? `Mark ${node.title} incomplete`
      : state.isScheduled
        ? `Mark ${node.title} as completed`
        : `Add ${node.title} to the planner before completing it`;

    return (
      <button
        aria-label={title}
        aria-pressed={state.isScheduled ? state.isCompleted : undefined}
        className={`learning-completion-action${state.isCompleted ? " is-complete" : ""}${state.isScheduled ? "" : " is-unscheduled"}`}
        onClick={() => toggleLearningNodeCompletion(node)}
        title={title}
        type="button"
      >
        <Icon size={iconOnly ? 15 : 14} />
        {!iconOnly && <span>{label}</span>}
      </button>
    );
  };

  const addToPlanner = () => {
    const node = plannerCustomNode?.id === plannerNodeId
      ? plannerCustomNode
      : nodes.find((item) => item.id === plannerNodeId);
    if (!node || !plannerDateKey || !activeNotebook) {
      setPlannerError("Choose a learning unit and an available date.");
      return;
    }
    const result = upsertLearningPlannerTask(
      schedule,
      {
        id: activeNotebook.id,
        subjectName: activeNotebook.subjectName,
        title: activeNotebook.title,
      },
      node,
      plannerDateKey,
      scheduleStartDate,
    );
    if (!result) {
      setPlannerError("That planner date is unavailable. Refresh the schedule and choose another date.");
      return;
    }
    setSchedule?.(result.schedule);
    if (result.renamedFrom && completed.includes(result.renamedFrom) && result.task?.task) {
      const migratedCompleted = completed.map((taskName) => (
        taskName === result.renamedFrom ? result.task.task : taskName
      ));
      setCompleted?.([...new Set(migratedCompleted)]);
    }
    closePlannerDialog();
    setNotification?.(
      result.moved
        ? `${node.title} moved to ${result.dateKey}.`
        : `${node.title} added to the planner.`,
    );
  };

  const addNotebookSubject = () => {
    if (!activeNotebook || !setSubjects) return;
    const name = activeNotebook.subjectName || activeNotebook.title;
    const chapterNames = activeNotebook.chapters.map((chapter) => cleanText(chapter.title, 180)).filter(Boolean);
    const existingIndex = subjects.findIndex(
      (subject) => cleanText(subject?.name, 160).toLowerCase() === name.toLowerCase(),
    );
    const existingSubject = existingIndex >= 0 ? subjects[existingIndex] : null;
    const nextSubject = {
      ...(existingSubject || {}),
      name,
      chapters: chapterNames.length,
      chapterNames,
      topics: existingSubject?.topics || [],
      difficulty: existingSubject?.difficulty || "medium",
      studyPreferences: existingSubject?.studyPreferences || {
        sessionsPerWeek: 3,
        sessionMinutes: 45,
        preferredTime: "any",
        studyGoal: "coverage",
      },
    };
    const nextSubjects = existingIndex >= 0
      ? subjects.map((subject, index) => (index === existingIndex ? nextSubject : subject))
      : [...subjects, nextSubject];
    setSubjects(nextSubjects, { preserveSchedule: true });
    setNotification?.(`${name} chapter names synced with Subjects.`);
  };

  const toggleQuestion = (questionId) => {
    setExpandedQuestions((current) => {
      const next = new Set(current);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
  };

  const toggleChapter = (chapterId) => {
    setExpandedChapters((current) => {
      const next = new Set(current);
      if (next.has(chapterId)) next.delete(chapterId);
      else next.add(chapterId);
      return next;
    });
  };

  const noSavedNotebooks = !notebooksLoading && !notebooksError && notebooks.length === 0;
  const noSavedPlacementNotes = !notebooksLoading
    && !notebooksError
    && savedPlacementNotes.length === 0;
  const noSavedMedicalTraining = !notebooksLoading
    && !notebooksError
    && savedMedicalTrainingNotes.length === 0;
  const savedPanelEmpty = activeArtifactKind === "placement"
    ? noSavedPlacementNotes
    : activeArtifactKind === "medical"
      ? noSavedMedicalTraining
      : noSavedNotebooks;
  return (
    <div className="learning-page">
      <section
        className={workspaceView !== "intake" && activeNotebook
          ? "card learning-hero has-workspace-controls"
          : "card learning-hero"}
      >
        <div className="learning-hero-copy">
          <div className="learning-hero-eyebrow">
            <span className="section-tag"><Sparkles size={14} /> AI learning workspace</span>
            <button
              aria-controls="learning-subject-mastery-dialog"
              aria-expanded={masteryDialogOpen}
              aria-haspopup="dialog"
              aria-label="Open subject mastery"
              className="learning-mastery-trigger"
              onClick={() => setMasteryDialogOpen(true)}
              title="Subject mastery"
              type="button"
            >
              <Target aria-hidden="true" size={18} />
            </button>
          </div>
          <h2>Start Learning</h2>
        </div>
        <div className="learning-hero-metrics" aria-label="Learning notebook summary">
          <div><strong>{notebooks.length}</strong><span>Saved notebooks</span></div>
          <div><strong>{activeNotebook?.chapters.length || 0}</strong><span>Mapped chapters</span></div>
          <div><strong>{nodes.length}</strong><span>Study concepts</span></div>
        </div>
        {workspaceView !== "intake" && activeNotebook && (
          <nav className="learning-hero-controls" aria-label="Start Learning view">
            <div className="learning-workspace-context">
              {workspaceView === "career" ? <BriefcaseBusiness aria-hidden="true" size={15} />
                : workspaceView === "medical" ? <Stethoscope aria-hidden="true" size={15} />
                  : <BookOpenCheck aria-hidden="true" size={15} />}
              <span>
                {workspaceView === "career" ? "Placement preparation"
                  : workspaceView === "medical" ? "Medical training"
                    : "Notebook preparation"}
              </span>
            </div>
            <button
              aria-label="Back to preparation choices"
              className="learning-icon-button"
              onClick={returnToPreparationChoice}
              title="Back to preparation choices"
              type="button"
            >
              <ArrowLeft size={17} />
            </button>
          </nav>
        )}
      </section>

      <div className={`learning-workspace is-${workspaceView}`}>
        <aside className="learning-source-rail" aria-label="Sources and saved work">
          <section
            className="card learning-intake-source-panel"
            id={intakeMode === "medical" ? "medical-training" : "placement-prep"}
          >
          {intakeMode === null ? (
            <div className="learning-intake-choice">
              <div className="learning-panel-heading">
                <div>
                  <span className="section-tag">Choose a workspace</span>
                  <h3>What do you want to prepare?</h3>
                  <p>
                    {medicalEligible
                      ? "Keep course notebooks and Medical training in separate workspaces."
                      : placementEligible
                        ? "Keep course notebooks and placement notes in separate workspaces."
                        : "Build and revisit focused course notebooks in one learning workspace."}
                  </p>
                </div>
              </div>
              <div className="learning-intake-choice-grid">
                <button
                  className="learning-intake-choice-card is-notebook"
                  onClick={openNotebookIntake}
                  type="button"
                >
                  <span><BookOpenCheck aria-hidden="true" size={21} /></span>
                  <strong>Notebook preparation</strong>
                  <small>Build subject notes from files, chapters, topics, or a prompt.</small>
                  <em>{notebooks.length} saved</em>
                  <ChevronRight aria-hidden="true" size={18} />
                </button>
                {placementEligible && (
                  <button
                    className="learning-intake-choice-card is-placement"
                    onClick={openPlacementIntake}
                    type="button"
                  >
                    <span><BriefcaseBusiness aria-hidden="true" size={21} /></span>
                    <strong>Placement preparation</strong>
                    <small>Analyze role-specific topics and save a focused interview guide.</small>
                    <em>{savedPlacementNotes.length} saved</em>
                    <ChevronRight aria-hidden="true" size={18} />
                  </button>
                )}
                {medicalEligible && (
                  <button
                    className="learning-intake-choice-card is-medical"
                    onClick={openMedicalIntake}
                    type="button"
                  >
                    <span><Stethoscope aria-hidden="true" size={21} /></span>
                    <strong>Medical training</strong>
                    <small>Practice fictional cases, conceptual reasoning, evidence, uncertainty, and safety.</small>
                    <em>{savedMedicalTrainingNotes.length} saved</em>
                    <ChevronRight aria-hidden="true" size={18} />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="learning-intake-flow-bar">
              <div>
                {intakeMode === "placement" ? <BriefcaseBusiness aria-hidden="true" size={16} />
                  : intakeMode === "medical" ? <Stethoscope aria-hidden="true" size={16} />
                    : <BookOpenCheck aria-hidden="true" size={16} />}
                <strong>
                  {intakeMode === "placement" ? "Placement preparation"
                    : intakeMode === "medical" ? "Medical training"
                      : "Notebook preparation"}
                </strong>
              </div>
              <button
                aria-label="Back to preparation choices"
                onClick={returnToPreparationChoice}
                type="button"
              >
                <ArrowLeft size={15} /> Back
              </button>
            </div>
          )}
          {intakeMode === "notebook" ? (
          <>
          <div className="learning-panel-heading">
            <div>
              <span className="section-tag">Sources</span>
              <h3>Build a notebook</h3>
            </div>
            <span className="learning-count">{sources.length}/{MAX_CHAT_ATTACHMENTS}</span>
          </div>

          <input
            accept={LEARNING_SOURCE_ACCEPT}
            className="learning-file-input"
            multiple
            onChange={(event) => handleFiles(event.target.files)}
            ref={fileInputRef}
            type="file"
          />
          <button
            className="learning-dropzone"
            disabled={preparingSources || sources.length >= MAX_CHAT_ATTACHMENTS}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              handleFiles(event.dataTransfer.files);
            }}
            type="button"
          >
            {preparingSources ? <LoaderCircle className="spinner" size={25} /> : <UploadCloud size={25} />}
            <strong>{preparingSources ? "Preparing sources…" : "Upload files"}</strong>
            <span>PDF, image, TXT or Markdown · up to 3</span>
          </button>

          {sourceError && <p className="learning-inline-error" role="alert">{sourceError}</p>}
          {sources.length > 0 && (
            <div aria-label="Selected learning sources" className="learning-source-list">
              {sources.map((source) => (
                <div className="learning-source-chip" key={source.id}>
                  <span className="learning-source-icon">
                    {source.type?.startsWith("image/") ? <ImageIcon size={15} /> : <FileText size={15} />}
                  </span>
                  <span>
                    <strong title={source.name}>{source.name}</strong>
                    <small>{formatChatFileSize(source.size)}</small>
                  </span>
                  <button
                    aria-label={`Remove ${source.name}`}
                    onClick={() => removeSource(source.id)}
                    type="button"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="learning-or-divider"><span>or build from a prompt</span></div>
          <div
            className={subjectPickerOpen
              ? "learning-field learning-subject-field is-open"
              : "learning-field learning-subject-field"}
          >
            <label htmlFor="learning-subject-input">Subject</label>
            <div
              className={`learning-subject-picker${subjectPickerOpen ? " is-open" : ""}`}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setSubjectPickerOpen(false);
              }}
            >
              <input
                aria-activedescendant={
                  subjectPickerOpen && visibleSavedSubjectNames.length
                    ? `learning-subject-option-${activeSubjectOptionIndex}`
                    : undefined
                }
                aria-autocomplete="list"
                aria-controls={
                  subjectPickerOpen ? "learning-saved-subject-options" : undefined
                }
                aria-describedby="learning-subject-help"
                aria-expanded={subjectPickerOpen && savedSubjectNames.length > 0}
                autoComplete="off"
                disabled={analyzing}
                id="learning-subject-input"
                onChange={(event) => {
                  setSubjectName(event.target.value);
                  setSubjectOptionIndex(0);
                  setSubjectPickerOpen(savedSubjectNames.length > 0);
                }}
                onClick={() => setSubjectPickerOpen(savedSubjectNames.length > 0)}
                onFocus={() => setSubjectPickerOpen(savedSubjectNames.length > 0)}
                onKeyDown={handleSubjectPickerKeyDown}
                placeholder={savedSubjectNames.length ? "Choose or type a subject" : "e.g. Operating Systems"}
                ref={subjectInputRef}
                role="combobox"
                type="text"
                value={subjectName}
              />
              {savedSubjectNames.length > 0 && (
                <button
                  aria-label={subjectPickerOpen ? "Close saved subjects" : "Show saved subjects"}
                  aria-controls={
                    subjectPickerOpen ? "learning-saved-subject-options" : undefined
                  }
                  aria-expanded={subjectPickerOpen}
                  aria-haspopup="listbox"
                  className="learning-subject-picker-toggle"
                  disabled={analyzing}
                  onClick={() => {
                    setSubjectPickerOpen((current) => !current);
                    subjectInputRef.current?.focus();
                  }}
                  onMouseDown={(event) => event.preventDefault()}
                  type="button"
                >
                  <ChevronDown size={15} />
                </button>
              )}
              {subjectPickerOpen && savedSubjectNames.length > 0 && (
                <div
                  aria-label="Saved subjects"
                  className="learning-subject-options"
                  id="learning-saved-subject-options"
                  ref={subjectOptionsRef}
                  role="listbox"
                >
                  {visibleSavedSubjectNames.length > 0 ? visibleSavedSubjectNames.map((name, index) => {
                    const selected = name.toLocaleLowerCase() === subjectName.trim().toLocaleLowerCase();
                    return (
                      <button
                        aria-selected={selected}
                        className={`learning-subject-option${index === activeSubjectOptionIndex ? " is-active" : ""}${selected ? " is-selected" : ""}`}
                        id={`learning-subject-option-${index}`}
                        key={name}
                        onClick={() => chooseSavedSubject(name)}
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseEnter={() => setSubjectOptionIndex(index)}
                        role="option"
                        tabIndex={-1}
                        type="button"
                      >
                        <span>{name}</span>
                        {selected && <Check size={14} />}
                      </button>
                    );
                  }) : (
                    <div aria-live="polite" className="learning-subject-options-empty" role="status">
                      <strong>No saved subject matches.</strong>
                      <span>Keep typing to use this as a new subject.</span>
                    </div>
                  )}
                </div>
              )}
            </div>
            <small id="learning-subject-help">
              {savedSubjectNames.length
                ? `Choose from ${savedSubjectNames.length} saved subject${savedSubjectNames.length === 1 ? "" : "s"}, or type another.`
                : "No saved subjects yet. Type a subject here or add one from the Subjects page."}
            </small>
          </div>
          <div className="learning-scope-builder">
            <div className="learning-scope-heading">
              <span>Notebook scope</span>
              <small>Link generated content to a chapter and topic from this subject.</small>
            </div>
            <div className="learning-scope-fields">
              <label className="learning-field">
                <span>Chapter</span>
                <input
                  autoComplete="off"
                  disabled={analyzing}
                  list="learning-chapter-options"
                  onChange={(event) => {
                    const nextChapter = event.target.value;
                    setScopeChapter(nextChapter);
                    if (!nextChapter.trim()) setScopeTopic("");
                    setAnalysisError("");
                  }}
                  placeholder={savedChapterOptions.length ? "Choose or type a chapter" : "e.g. CPU Scheduling"}
                  value={scopeChapter}
                />
                <datalist id="learning-chapter-options">
                  {savedChapterOptions.map((chapter) => (
                    <option key={chapter} value={chapter} />
                  ))}
                </datalist>
                <small>
                  {savedChapterOptions.length
                    ? `${savedChapterOptions.length} saved chapter${savedChapterOptions.length === 1 ? "" : "s"} available.`
                    : "Type a chapter or leave it blank for AI to organize."}
                </small>
              </label>
              <label className="learning-field">
                <span>Topic</span>
                <input
                  autoComplete="off"
                  disabled={analyzing || !scopeChapter.trim()}
                  list="learning-topic-options"
                  onChange={(event) => {
                    setScopeTopic(event.target.value);
                    setAnalysisError("");
                  }}
                  placeholder={!scopeChapter.trim() ? "Choose a chapter first" : savedTopicOptions.length ? "Choose or type a topic" : "e.g. Round-robin scheduling"}
                  value={scopeTopic}
                />
                <datalist id="learning-topic-options">
                  {savedTopicOptions.map((topic) => (
                    <option key={topic} value={topic} />
                  ))}
                </datalist>
                <small>Optional focus inside the selected chapter.</small>
              </label>
            </div>
          </div>
          <label className="learning-field">
            <span>More chapters (optional)</span>
            <textarea
              disabled={analyzing}
              onChange={(event) => {
                setManualChapters(event.target.value);
                setAnalysisError("");
              }}
              placeholder={"Processes, Threads\nCPU Scheduling"}
              rows={4}
              value={manualChapters}
            />
            <small>Add extra chapters with commas or new lines.</small>
          </label>
          <label className="learning-field learning-prompt-field">
            <span>What do you want to learn?</span>
            <textarea
              disabled={analyzing}
              maxLength={MAX_LEARNING_PROMPT_CHARS}
              onChange={(event) => {
                setLearningPrompt(event.target.value);
                setAnalysisError("");
              }}
              placeholder="e.g. Explain deadlocks from first principles, compare prevention and avoidance, and include a worked Banker's algorithm example."
              rows={5}
              value={learningPrompt}
            />
            <small className="learning-prompt-meta">
              <span>
                Use a prompt by itself, or combine it with a subject, chapter, topic, or upload.
              </span>
              <span>
                {learningPrompt.length.toLocaleString()}/{MAX_LEARNING_PROMPT_CHARS.toLocaleString()}
              </span>
            </small>
          </label>
          {!analyzing && analysisError && (
            <p className="learning-inline-error" role="alert">{analysisError}</p>
          )}
          <button
            className="learning-analyze-btn"
            disabled={analyzing || preparingSources || hasInsufficientCredits(AI_FEATURES.LEARNING_NOTEBOOK)}
            onClick={analyzeNotebook}
            type="button"
          >
            {analyzing ? <LoaderCircle className="spinner" size={17} /> : <BrainCircuit size={17} />}
            {analyzing ? "Building notebook…" : "Analyze & start learning"}
            <AiCreditCost feature={AI_FEATURES.LEARNING_NOTEBOOK} />
          </button>

          {analyzing && (
            <div className="learning-intake-progress" role="status">
              <span className="learning-intake-progress-icon">
                <LoaderCircle className="spinner" size={18} />
              </span>
              <div>
                <strong>{ANALYSIS_STEPS[analysisStep]}</strong>
                <small>Step {analysisStep + 1} of {ANALYSIS_STEPS.length}. Your notebook will open here when ready.</small>
              </div>
              <span
                aria-hidden="true"
                className="learning-intake-progress-bar"
                style={{ "--learning-progress": `${((analysisStep + 1) / ANALYSIS_STEPS.length) * 100}%` }}
              />
            </div>
          )}
          </>
          ) : intakeMode === "medical" ? (
          <MedicalTrainingLabIntake
            analyzing={medicalAnalyzing}
            canAnalyze={Boolean(
              activeNotebook?.id
              && parseCareerTopics(medicalTopics).length
              && !medicalAnalyzing
              && !saving
              && !hasInsufficientCredits(AI_FEATURES.CAREER_ANALYSIS)
            )}
            error={medicalError}
            focus={medicalFocus}
            notebooks={notebooks}
            notebooksLoading={notebooksLoading}
            onAnalyze={analyzeMedicalTopics}
            onFocusChange={(value) => {
              setMedicalFocus(value);
              setMedicalError("");
            }}
            onNotebookChange={selectMedicalNotebook}
            onQuickAdd={addMedicalTopic}
            onTopicsChange={(value) => {
              setMedicalTopics(value);
              setMedicalError("");
            }}
            saving={saving}
            selectedNotebookId={activeNotebook?.id || ""}
            suggestedTopics={MEDICAL_TRAINING_STARTERS}
            topicCount={parseCareerTopics(medicalTopics).length}
            topics={medicalTopics}
          />
          ) : intakeMode === "placement" ? (
          <div className="learning-placement-intake">
            <div className="learning-panel-heading">
              <div>
                <span className="section-tag"><Sparkles size={13} /> Personalized analysis</span>
                <h3>Build your placement preparation</h3>
                <p>
                  Choose a learning source, then enter the role and interview topics you want
                  explained.
                </p>
              </div>
              <span className="learning-count">{parseCareerTopics(careerTopics).length}/12</span>
            </div>

            <label className="learning-field">
              <span>Preparation source</span>
              <select
                disabled={careerAnalyzing || saving || notebooksLoading || !notebooks.length}
                onChange={(event) => selectPlacementNotebook(event.target.value)}
                value={activeNotebook?.id || ""}
              >
                <option disabled value="">
                  {notebooksLoading ? "Loading saved notebooks..." : "Choose a saved notebook"}
                </option>
                {notebooks.map((notebook) => (
                  <option key={notebook.id} value={notebook.id}>{notebook.title}</option>
                ))}
              </select>
              <small>
                Choose the saved study context used to personalize this placement note.
              </small>
            </label>

            {!notebooksLoading && !notebooks.length && (
              <p className="learning-placement-notebook-note">
                Add a learning source first so PrepMatrix can ground your placement note.
              </p>
            )}

            <div className="learning-career-fields">
              <label className="learning-field">
                <span>Target role</span>
                <input
                  disabled={careerAnalyzing || saving}
                  onChange={(event) => setCareerRole(event.target.value)}
                  placeholder="e.g. Software engineering intern"
                  value={careerRole}
                />
              </label>
              <label className="learning-field">
                <span>Topics to analyze</span>
                <textarea
                  disabled={careerAnalyzing || saving}
                  onChange={(event) => setCareerTopics(event.target.value)}
                  placeholder={"Arrays and strings\nOperating systems\nProject walkthrough"}
                  rows={6}
                  value={careerTopics}
                />
                <small>Separate topics with commas or new lines. Add up to 12.</small>
              </label>
            </div>

            <div className="learning-placement-suggestions" aria-label="Suggested placement topics">
              <span>Quick add</span>
              <div>
                {[...careerFoundationTopics.slice(0, 3), ...careerCodingTopics.slice(0, 3)].map((topic) => (
                  <button
                    disabled={careerAnalyzing || saving}
                    key={topic.id || topic.title}
                    onClick={() => addCareerTopic(topic.title)}
                    type="button"
                  >
                    <Plus size={13} /> {topic.title}
                  </button>
                ))}
              </div>
            </div>

            {careerError && <p className="learning-inline-error" role="alert">{careerError}</p>}
            <button
              className="learning-career-analyze"
              disabled={
                careerAnalyzing
                || saving
                || !activeNotebook?.id
                || hasInsufficientCredits(AI_FEATURES.CAREER_ANALYSIS)
              }
              onClick={analyzeCareerTopics}
              type="button"
            >
              {careerAnalyzing ? <LoaderCircle className="spinner" size={17} /> : <BrainCircuit size={17} />}
              {careerAnalyzing ? "Analyzing preparation topics..." : "Analyze preparation topics"}
              <AiCreditCost feature={AI_FEATURES.CAREER_ANALYSIS} />
            </button>
          </div>
          ) : null}
          </section>
          <section className="card learning-saved-panel">
          <div className="learning-saved-heading">
            <div>
              {activeArtifactKind === "placement" ? <BriefcaseBusiness aria-hidden="true" size={16} />
                : activeArtifactKind === "medical" ? <Stethoscope aria-hidden="true" size={16} />
                  : <Layers3 aria-hidden="true" size={16} />}
              <strong>
                {activeArtifactKind === "placement" ? "Saved placement notes"
                  : activeArtifactKind === "medical" ? "Saved Medical training"
                    : activeArtifactKind === "notebook" ? "Saved notebooks" : "Saved work"}
              </strong>
            </div>
            {notebooksLoading && <LoaderCircle aria-label="Loading saved work" className="spinner" size={15} />}
          </div>
          {notebooksError && (
            <div className="learning-rail-empty">
              <p>{notebooksError}</p>
              <button onClick={loadNotebooks} type="button">Retry</button>
            </div>
          )}
          {activeArtifactKind === null && !notebooksError && (
            <div className="learning-saved-kind-grid">
              <button className="learning-saved-kind-card is-notebook" onClick={openNotebookIntake} type="button">
                <span><BookOpenCheck aria-hidden="true" size={17} /></span>
                <strong>{notebooks.length}</strong>
                <small>Saved notebooks</small>
                <ChevronRight aria-hidden="true" size={16} />
              </button>
              {placementEligible && (
                <button className="learning-saved-kind-card is-placement" onClick={openPlacementIntake} type="button">
                  <span><BriefcaseBusiness aria-hidden="true" size={17} /></span>
                  <strong>{savedPlacementNotes.length}</strong>
                  <small>Saved placement notes</small>
                  <ChevronRight aria-hidden="true" size={16} />
                </button>
              )}
              {medicalEligible && (
                <button className="learning-saved-kind-card is-medical" onClick={openMedicalIntake} type="button">
                  <span><Stethoscope aria-hidden="true" size={17} /></span>
                  <strong>{savedMedicalTrainingNotes.length}</strong>
                  <small>Saved Medical training</small>
                  <ChevronRight aria-hidden="true" size={16} />
                </button>
              )}
            </div>
          )}
          {activeArtifactKind !== null && savedPanelEmpty && (
            <p className="learning-notebooks-empty-message">
              {activeArtifactKind === "placement" ? "No saved placement notes yet"
                : activeArtifactKind === "medical" ? "No saved Medical training yet"
                  : "No saved notebooks yet"}
            </p>
          )}
          {activeArtifactKind === "notebook" && (
          <div className="learning-notebook-list">
            {notebooks.map((notebook) => (
              <article
                className={`learning-notebook-row${activeNotebook?.id === notebook.id && workspaceView === "notebook" ? " is-active" : ""}`}
                key={notebook.id}
              >
                <button
                  aria-current={activeNotebook?.id === notebook.id && workspaceView === "notebook" ? "page" : undefined}
                  className="learning-notebook-select"
                  disabled={careerAnalyzing || saving}
                  onClick={() => selectNotebook(notebook)}
                  type="button"
                >
                  <span><BookOpenCheck size={16} /></span>
                  <span>
                    <strong>{notebook.title}</strong>
                    <small>{notebook.chapters.length} chapters · {formatNotebookDate(notebook.updatedAt)}</small>
                  </span>
                </button>
                {deleteCandidateId === notebook.id ? (
                  <div className="learning-delete-confirm">
                    <button
                      aria-label={`Confirm deleting ${notebook.title}`}
                      disabled={careerAnalyzing || saving || deletingId === notebook.id}
                      onClick={() => deleteNotebook(notebook.id)}
                      type="button"
                    >
                      {deletingId === notebook.id ? <LoaderCircle className="spinner" size={13} /> : <Check size={13} />}
                    </button>
                    <button
                      aria-label="Cancel delete"
                      disabled={careerAnalyzing || saving}
                      onClick={() => setDeleteCandidateId("")}
                      type="button"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <button
                    aria-label={`Delete ${notebook.title}`}
                    className="learning-notebook-delete"
                    disabled={careerAnalyzing || saving}
                    onClick={() => setDeleteCandidateId(notebook.id)}
                    type="button"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </article>
            ))}
          </div>
          )}
          {activeArtifactKind === "placement" && (
            <div className="learning-notebook-list">
              {savedPlacementNotes.map((note) => (
                <article
                  className={`learning-notebook-row is-placement${activeNotebook?.id === note.notebookId && workspaceView === "career" ? " is-active" : ""}`}
                  key={note.id}
                >
                  <button
                    aria-current={activeNotebook?.id === note.notebookId && workspaceView === "career" ? "page" : undefined}
                    className="learning-notebook-select"
                    disabled={careerAnalyzing || saving}
                    onClick={() => openSavedPlacementNote(note)}
                    type="button"
                  >
                    <span><BriefcaseBusiness aria-hidden="true" size={16} /></span>
                    <span>
                      <strong>{note.title}</strong>
                      <small>{note.topicCount} topics · {formatNotebookDate(note.updatedAt)}</small>
                      <small className="learning-placement-source-label">From {note.notebook.title}</small>
                    </span>
                  </button>
                </article>
              ))}
            </div>
          )}
          {activeArtifactKind === "medical" && (
            <div className="learning-notebook-list">
              {savedMedicalTrainingNotes.map((note) => (
                <article
                  className={`learning-notebook-row is-medical${activeNotebook?.id === note.notebookId && workspaceView === "medical" ? " is-active" : ""}`}
                  key={note.id}
                >
                  <button
                    aria-current={activeNotebook?.id === note.notebookId && workspaceView === "medical" ? "page" : undefined}
                    className="learning-notebook-select"
                    disabled={medicalAnalyzing || saving}
                    onClick={() => openSavedMedicalTraining(note)}
                    type="button"
                  >
                    <span><Stethoscope aria-hidden="true" size={16} /></span>
                    <span>
                      <strong>{note.title}</strong>
                      <small>{note.topicCount} modules · {formatNotebookDate(note.updatedAt)}</small>
                      <small className="learning-placement-source-label">From {note.notebook.title}</small>
                    </span>
                  </button>
                </article>
              ))}
            </div>
          )}
          </section>
        </aside>

        <section className="learning-notebook-stage" aria-live="polite">
          {analyzing ? (
            <div className="card learning-analysis-state" role="status">
              <div className="learning-analysis-orbit" aria-hidden="true">
                <BrainCircuit size={34} />
                <span />
                <span />
              </div>
              <span className="section-tag">Notebook intelligence</span>
              <h3>{ANALYSIS_STEPS[analysisStep]}</h3>
              <p>PrepMatrix is organizing the source into a clean study path. You can keep this page open.</p>
              <ol className="learning-analysis-steps">
                {ANALYSIS_STEPS.map((step, index) => (
                  <li className={index < analysisStep ? "is-done" : index === analysisStep ? "is-current" : ""} key={step}>
                    <span>{index < analysisStep ? <Check size={13} /> : index + 1}</span>
                    <strong>{step}</strong>
                  </li>
                ))}
              </ol>
            </div>
          ) : !activeNotebook ? (
            <div className="card learning-empty-stage">
              <div className="learning-empty-visual" aria-hidden="true">
                <span><FileText size={26} /></span>
                <span><BrainCircuit size={30} /></span>
                <span><BookOpenCheck size={26} /></span>
              </div>
              <span className="section-tag">Notebook canvas</span>
              <h3>Bring a chapter to life</h3>
              <p>
                Upload course material or type a subject and chapter list. Your notebook will open
                with exam-relevant questions first, then revised notes and a concept map.
              </p>
              <div className="learning-empty-features">
                <span><CircleHelp size={15} /> Important questions first</span>
                <span><BrainCircuit size={15} /> Connected topic map</span>
                <span><CalendarPlus size={15} /> Planner-ready units</span>
              </div>
            </div>
          ) : (
            <>
              <section className="card learning-notebook-header">
                <div>
                  <span className="section-tag">Active notebook</span>
                  <h2>{activeNotebook.title}</h2>
                  <p>{activeNotebook.summary || `${activeNotebook.subjectName} organized into a focused revision workspace.`}</p>
                  <div className="learning-notebook-meta">
                    <span>{activeNotebook.subjectName}</span>
                    <span>{activeNotebook.chapters.length} chapters</span>
                    <span>{nodes.length} concepts</span>
                    {dirty && <span className="is-unsaved">Unsaved edits</span>}
                    {masterySaving && <span className="is-saving">Saving learning progress...</span>}
                  </div>
                  {activeNotebook.coverageWarnings.length > 0 && (
                    <details className="learning-coverage-warning">
                      <summary>
                        <FileText aria-hidden="true" size={14} />
                        Coverage note ? {activeNotebook.coverageWarnings.length}
                      </summary>
                      <ul>
                        {activeNotebook.coverageWarnings.map((warning) => <li key={warning}>{warning}</li>)}
                      </ul>
                    </details>
                  )}
                </div>
                <div className="learning-header-actions" aria-label="Notebook actions">
                  <button aria-label="Save notebook" disabled={!dirty || saving} onClick={saveNotebook} title="Save notebook" type="button">
                    {saving ? <LoaderCircle className="spinner" size={16} /> : <Save size={16} />}
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button aria-label="Export notebook PDF" disabled={exporting} onClick={exportNotebook} title="Export PDF" type="button">
                    {exporting ? <LoaderCircle className="spinner" size={16} /> : <Download size={16} />}
                    {exporting ? "Exporting…" : "Export PDF"}
                  </button>
                  <button aria-label="Ask AI about this notebook" onClick={askAI} title="Ask AI" type="button">
                    <MessageSquareText size={16} /> Ask AI
                  </button>                  <button aria-label="Refer subject learning materials" onClick={() => referLearningMaterial(selectedNode)} title="Refer material" type="button">
                    <BookOpenCheck size={16} /> Refer material
                  </button>
                  <button aria-label="Add a learning unit to planner" onClick={() => openPlannerForNode(selectedNode)} title="Add to planner" type="button">
                    <CalendarPlus size={16} /> Add to planner
                  </button>
                </div>
              </section>

              {activeTab === "notes" && (
              <section className="card learning-question-priority">
                <div className="learning-panel-heading">
                  <div>
                    <span className="section-tag"><CircleHelp size={13} /> Revise first</span>
                    <h3>Important questions</h3>
                    <p>Start here before reading the full notebook.</p>
                  </div>
                  <span className="learning-count">{activeNotebook.importantQuestions.length}</span>
                </div>
                {activeNotebook.importantQuestions.length ? (
                  <div className="learning-question-grid">
                    {activeNotebook.importantQuestions.map((question, index) => {
                      const expanded = expandedQuestions.has(question.id);
                      return (
                        <article
                          className={`learning-question-card${expanded ? " is-open" : ""}`}
                          key={question.id}
                          style={{ "--reveal-index": index }}
                        >
                          <button
                            aria-expanded={expanded}
                            onClick={() => toggleQuestion(question.id)}
                            type="button"
                          >
                            <span className="learning-question-number">{String(index + 1).padStart(2, "0")}</span>
                            <span>
                              <small>{question.priority}</small>
                              <strong>{question.question}</strong>
                            </span>
                            {expanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
                          </button>
                          {expanded && (
                            <div className="learning-question-answer">
                              {(question.answer || "Use Ask AI to work through this question step by step.")
                                .split(/\n{2,}/)
                                .filter(Boolean)
                                .map((paragraph, paragraphIndex) => (
                                  <p key={`${question.id}-answer-${paragraphIndex}`}>{paragraph}</p>
                                ))}
                              {question.whyItMatters && (
                                <aside>
                                  <strong>Why this matters</strong>
                                  <span>{question.whyItMatters}</span>
                                </aside>
                              )}
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="learning-section-empty">No important questions were returned for this source.</div>
                )}
              </section>
              )}

              <section className="card learning-content-card">
                <div className="learning-tablist" role="tablist" aria-label="Notebook views">
                  {[
                    ["studio", "Study studio", <Sparkles aria-hidden="true" key="studio-icon" size={15} />],
                    ["notes", "Revised notes", <FileText aria-hidden="true" key="notes-icon" size={15} />],
                    ["outline", "Topic outline", <BookOpenCheck aria-hidden="true" key="outline-icon" size={15} />],
                    ["map", "Mastery map", <BrainCircuit aria-hidden="true" key="map-icon" size={15} />],
                  ].map(([tabId, label, icon]) => (
                    <button
                      aria-selected={activeTab === tabId}
                      className={activeTab === tabId ? "is-active" : ""}
                      key={tabId}
                      onClick={() => setActiveTab(tabId)}
                      role="tab"
                      type="button"
                    >
                      {icon} {label}
                    </button>
                  ))}
                </div>

                {activeTab === "studio" && (
                  <div className="learning-studio-view" role="tabpanel">
                    <LearningStudyStudio
                      activeSession={activeLearningSession}
                      coachState={coachState}
                      isSavingNote={isLearningNoteSaving}
                      latestReceipt={latestReceipt}
                      nodes={nodes}
                      notebook={activeNotebook}
                      onAddMisconception={addLearningMisconception}
                      onAdvanceSession={advanceStudySession}
                      onCoachAction={runLearningCoachAction}
                      onFinishSession={finishStudySession}
                      onOpenMap={() => setActiveTab("map")}
                      onPauseSession={pauseStudySession}
                      onRecordAttempt={recordStudyAttempt}
                      onReferMaterial={referLearningMaterial}
                      onResolveMisconception={resolveLearningMisconception}
                      onSaveToNotes={saveLearningTopicToNotes}
                      onSelectNode={setSelectedNodeId}
                      onStartSession={startStudySession}
                      progressByNodeId={progressByNodeId}
                      renderPlannerAction={(node) => renderCompletionAction(node)}
                      reviewQueue={reviewQueue}
                      selectedNode={selectedNode}
                    />
                  </div>
                )}
                {activeTab === "notes" && (
                  <div className="learning-notes-view" role="tabpanel">
                    {activeNotebook.revisedNotes.length ? activeNotebook.revisedNotes.map((section, index) => (
                      <article className="learning-note-section" key={section.id} style={{ "--reveal-index": index }}>
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        <div>
                          <h3>{section.title}</h3>
                          {section.content.split(/\n{2,}/).filter(Boolean).map((paragraph, paragraphIndex) => (
                            <p key={`${section.id}-paragraph-${paragraphIndex}`}>{paragraph}</p>
                          ))}
                          {(section.keyPoints.length > 0 || section.revisionTips.length > 0) && (
                            <div className="learning-note-details">
                              {section.keyPoints.length > 0 && (
                                <section>
                                  <h4>Key ideas</h4>
                                  <ul>
                                    {section.keyPoints.map((point) => <li key={point}>{point}</li>)}
                                  </ul>
                                </section>
                              )}
                              {section.revisionTips.length > 0 && (
                                <section className="is-revision">
                                  <h4>Revision cues</h4>
                                  <ul>
                                    {section.revisionTips.map((tip) => <li key={tip}>{tip}</li>)}
                                  </ul>
                                </section>
                              )}
                            </div>
                          )}
                        </div>
                      </article>
                    )) : (
                      <div className="learning-section-empty">No revised note sections were returned.</div>
                    )}
                  </div>
                )}

                {activeTab === "outline" && (
                  <div className="learning-outline-view" role="tabpanel">
                    <div className="learning-outline-toolbar">
                      <div>
                        <h3>Editable learning path</h3>
                      </div>
                      <div>
                        <button aria-label="Add chapter" onClick={() => setChapterComposerOpen(true)} title="Add chapter" type="button">
                          <Plus size={15} /> Add chapter
                        </button>
                        <button aria-label="Sync notebook with subjects" onClick={addNotebookSubject} title="Sync with subjects" type="button">
                          <BookOpenCheck size={15} /> Sync subjects
                        </button>
                      </div>
                    </div>
                    {chapterComposerOpen && (
                      <div className="learning-inline-composer">
                        <label>
                          <span>New chapter name</span>
                          <input
                            autoFocus
                            onChange={(event) => setChapterDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") addChapter();
                              if (event.key === "Escape") setChapterComposerOpen(false);
                            }}
                            placeholder="Chapter name"
                            value={chapterDraft}
                          />
                        </label>
                        <button disabled={!chapterDraft.trim()} onClick={addChapter} type="button"><Check size={15} /> Add</button>
                        <button aria-label="Cancel adding chapter" onClick={() => setChapterComposerOpen(false)} type="button"><X size={15} /></button>
                      </div>
                    )}
                    <div className="learning-outline-tree" role="tree">
                      {activeNotebook.chapters.map((chapter, chapterIndex) => {
                        const expanded = expandedChapters.has(chapter.id);
                        return (
                          <article
                            className="learning-outline-chapter"
                            key={chapter.id}
                            role="treeitem"
                            aria-expanded={expanded}
                            style={{ "--reveal-index": chapterIndex }}
                          >
                            <div className="learning-outline-chapter-row">
                              <button
                                aria-label={`${expanded ? "Collapse" : "Expand"} ${chapter.title}`}
                                onClick={() => toggleChapter(chapter.id)}
                                type="button"
                              >
                                {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                              </button>
                              <span>{String(chapterIndex + 1).padStart(2, "0")}</span>
                              <label>
                                <span className="sr-only">Chapter name</span>
                                <input
                                  onChange={(event) => updateChapter(chapter.id, { title: event.target.value })}
                                  onFocus={() => setSelectedNodeId(chapter.id)}
                                  value={chapter.title}
                                />
                              </label>
                              <button
                                aria-label={`Add topic to ${chapter.title}`}
                                onClick={() => setTopicComposer({ chapterId: chapter.id, value: "" })}
                                title="Add topic"
                                type="button"
                              >
                                <Plus size={14} />
                              </button>
                              <button
                                aria-label={`Remove ${chapter.title}`}
                                onClick={() => removeChapter(chapter.id)}
                                type="button"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                            {expanded && (
                              <div className="learning-outline-topic-list" role="group">
                                {chapter.summary && <p className="learning-outline-summary">{chapter.summary}</p>}
                                <div className="learning-unit-completion-row is-chapter">
                                  {renderCompletionAction(nodes.find((node) => node.id === chapter.id))}
                                </div>
                                {chapter.topics.map((topic) => (
                                  <div className="learning-outline-topic" key={topic.id} role="treeitem">
                                    <label>
                                      <span className="sr-only">Topic name</span>
                                      <input
                                        onChange={(event) => updateTopic(chapter.id, topic.id, { title: event.target.value })}
                                        onFocus={() => setSelectedNodeId(topic.id)}
                                        value={topic.title}
                                      />
                                    </label>
                                    <button
                                      aria-label={`Add subtopic to ${topic.title}`}
                                      onClick={() => setSubtopicComposer({ chapterId: chapter.id, topicId: topic.id, value: "" })}
                                      title="Add subtopic"
                                      type="button"
                                    >
                                      <Plus size={13} />
                                    </button>
                                    <button
                                      aria-label={`Remove ${topic.title}`}
                                      onClick={() => updateChapter(chapter.id, (current) => ({
                                        ...current,
                                        topics: current.topics.filter((item) => item.id !== topic.id),
                                      }))}
                                      type="button"
                                    >
                                      <X size={13} />
                                    </button>
                                    {topic.summary && <p>{topic.summary}</p>}
                                    {(
                                      topic.explanation
                                      || topic.learningObjectives.length > 0
                                      || topic.keyPoints.length > 0
                                      || topic.examples.length > 0
                                      || topic.applications.length > 0
                                      || topic.commonMistakes.length > 0
                                      || topic.revisionTips.length > 0
                                    ) && (
                                      <div className="learning-topic-details">
                                        {topic.explanation && topic.explanation !== topic.summary && (
                                          <div className="learning-topic-explanation">
                                            <strong>Detailed explanation</strong>
                                            {topic.explanation.split(/\n{2,}/).filter(Boolean).map((paragraph, paragraphIndex) => (
                                              <p key={`${topic.id}-explanation-${paragraphIndex}`}>{paragraph}</p>
                                            ))}
                                          </div>
                                        )}
                                        {topic.learningObjectives.length > 0 && (
                                          <div>
                                            <strong>Learning objectives</strong>
                                            <ul>{topic.learningObjectives.map((objective) => <li key={objective}>{objective}</li>)}</ul>
                                          </div>
                                        )}
                                        {topic.keyPoints.length > 0 && (
                                          <div>
                                            <strong>Key points</strong>
                                            <ul>{topic.keyPoints.map((point) => <li key={point}>{point}</li>)}</ul>
                                          </div>
                                        )}
                                        {topic.examples.length > 0 && (
                                          <div className="is-examples">
                                            <strong>Worked examples</strong>
                                            <ol>{topic.examples.map((example, exampleIndex) => <li key={`${topic.id}-example-${exampleIndex}`}>{example}</li>)}</ol>
                                          </div>
                                        )}
                                        {topic.applications.length > 0 && (
                                          <div>
                                            <strong>Applications</strong>
                                            <ul>{topic.applications.map((application) => <li key={application}>{application}</li>)}</ul>
                                          </div>
                                        )}
                                        {topic.commonMistakes.length > 0 && (
                                          <div className="is-mistakes">
                                            <strong>Common mistakes</strong>
                                            <ul>{topic.commonMistakes.map((mistake) => <li key={mistake}>{mistake}</li>)}</ul>
                                          </div>
                                        )}
                                        {topic.revisionTips.length > 0 && (
                                          <div className="is-revision">
                                            <strong>Revision cues</strong>
                                            <ul>{topic.revisionTips.map((tip) => <li key={tip}>{tip}</li>)}</ul>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    <div className="learning-unit-completion-row">
                                      {renderCompletionAction(nodes.find((node) => node.id === topic.id))}
                                    </div>
                                    <div className="learning-subtopic-list" role="group">
                                      {topic.subtopics.map((subtopic) => (
                                        <div className="learning-subtopic-row" key={subtopic.id} role="treeitem">
                                          <span aria-hidden="true">↳</span>
                                          <input
                                            aria-label="Subtopic name"
                                            onChange={(event) => updateTopic(chapter.id, topic.id, (current) => ({
                                              ...current,
                                              subtopics: current.subtopics.map((item) =>
                                                item.id === subtopic.id ? { ...item, title: event.target.value } : item,
                                              ),
                                            }))}
                                            onFocus={() => setSelectedNodeId(subtopic.id)}
                                            value={subtopic.title}
                                          />
                                          <button
                                            aria-label={`Remove ${subtopic.title}`}
                                            onClick={() => updateTopic(chapter.id, topic.id, (current) => ({
                                              ...current,
                                              subtopics: current.subtopics.filter((item) => item.id !== subtopic.id),
                                            }))}
                                            type="button"
                                          >
                                            <X size={12} />
                                          </button>
                                          {subtopic.summary && (
                                            <p className="learning-subtopic-summary">{subtopic.summary}</p>
                                          )}
                                          {subtopic.explanation && subtopic.explanation !== subtopic.summary && (
                                            <div className="learning-subtopic-explanation">
                                              <strong>Explanation</strong>
                                              {subtopic.explanation.split(/\n{2,}/).filter(Boolean).map((paragraph, paragraphIndex) => (
                                                <p key={`${subtopic.id}-explanation-${paragraphIndex}`}>{paragraph}</p>
                                              ))}
                                            </div>
                                          )}
                                          {subtopic.examples.length > 0 && (
                                            <div className="learning-subtopic-examples">
                                              <strong>Example</strong>
                                              <ul>{subtopic.examples.map((example, exampleIndex) => <li key={`${subtopic.id}-example-${exampleIndex}`}>{example}</li>)}</ul>
                                            </div>
                                          )}
                                          {subtopic.keyPoints.length > 0 && (
                                            <ul className="learning-subtopic-points">
                                              {subtopic.keyPoints.map((point) => <li key={point}>{point}</li>)}
                                            </ul>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                    {subtopicComposer.chapterId === chapter.id && subtopicComposer.topicId === topic.id && (
                                      <div className="learning-mini-composer">
                                        <input
                                          autoFocus
                                          onChange={(event) => setSubtopicComposer((current) => ({ ...current, value: event.target.value }))}
                                          onKeyDown={(event) => {
                                            if (event.key === "Enter") addSubtopic(chapter.id, topic.id);
                                            if (event.key === "Escape") setSubtopicComposer({ chapterId: "", topicId: "", value: "" });
                                          }}
                                          placeholder="New subtopic"
                                          value={subtopicComposer.value}
                                        />
                                        <button onClick={() => addSubtopic(chapter.id, topic.id)} type="button"><Check size={13} /></button>
                                      </div>
                                    )}
                                  </div>
                                ))}
                                {topicComposer.chapterId === chapter.id && (
                                  <div className="learning-mini-composer">
                                    <input
                                      autoFocus
                                      onChange={(event) => setTopicComposer((current) => ({ ...current, value: event.target.value }))}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter") addTopic(chapter.id);
                                        if (event.key === "Escape") setTopicComposer({ chapterId: "", value: "" });
                                      }}
                                      placeholder="New topic"
                                      value={topicComposer.value}
                                    />
                                    <button onClick={() => addTopic(chapter.id)} type="button"><Check size={13} /></button>
                                  </div>
                                )}
                              </div>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  </div>
                )}

                {activeTab === "map" && (
                  <div className="learning-map-view" role="tabpanel">

                    <LearningMasteryMap
                      notebook={activeNotebook}
                      onSelectNode={setSelectedNodeId}
                      onStartNode={(nodeId) => {
                        setSelectedNodeId(nodeId);
                        setActiveTab("studio");
                        startStudySession(nodeId);
                      }}
                      plannerByNodeId={completionStateByNodeId}
                      progressByNodeId={progressByNodeId}
                      selectedNodeId={selectedNodeId}
                    />
                    {selectedNode?.type === "topic" && (
                      <div className="learning-map-smart-actions" aria-live="polite">
                        <div>
                          <span>{selectedNode.type}</span>
                          <strong>{selectedNode.title}</strong>
                          <small>{selectedNode.chapterName}</small>
                        </div>
                        <button onClick={() => startStudySession(selectedNode.id)} type="button">
                          <Sparkles size={14} /> Study this concept
                        </button>
                        <button disabled={isLearningNoteSaving(selectedNode)} onClick={() => saveLearningTopicToNotes(selectedNode)} type="button">
                          <Save size={14} /> {isLearningNoteSaving(selectedNode) ? "Saving..." : "Save to notes"}
                        </button>
                        {renderCompletionAction(selectedNode)}
                      </div>
                    )}
                  </div>
                )}              </section>

            </>
          )}
        </section>
        {activeNotebook && medicalVisible && (
          <section className="learning-medical-workspace" aria-label="Medical training and conceptual reasoning">
            <MedicalTrainingLab
              analysis={medicalAnalysis}
              analyzing={medicalAnalyzing}
              focus={medicalAnalysis?.trainingTitle || medicalFocus}
              getActionTarget={medicalActionTarget}
              isDraft={medicalAnalysisIsDraft}
              isItemSaving={(target) => isLearningNoteSaving(target, {
                details: target.explanation,
                title: target.title,
              })}
              onAddToPlanner={openPlannerForNode}
              onAskAI={askMedicalItemAI}
              onQuickAdd={(title) => addMedicalTopic(title, { openIntake: true })}
              onSaveDraft={saveMedicalTraining}
              onSaveItem={saveMedicalItem}
              saving={saving}
              suggestedTopics={MEDICAL_TRAINING_STARTERS}
              topicCount={parseCareerTopics(medicalTopics).length}
            />
          </section>
        )}
        {activeNotebook && careerVisible && (
          <section className="learning-career-workspace" aria-label="Placement and internship preparation">
            <section className="card learning-career-intro">
              <div>
                <span className="section-tag"><BriefcaseBusiness size={14} /> Career preparation</span>
                <h2>Prepare for the questions that matter</h2>
                <p>
                  Start with role fundamentals and frequently tested coding patterns, then ask AI
                  to turn your selected topics into an explained interview plan.
                </p>
              </div>
              <div className="learning-career-intro-metrics">
                <span><strong>{careerFoundationTopics.length}</strong> role areas</span>
                <span><strong>{careerCodingTopics.length}</strong> coding patterns</span>
                <span><strong>{parseCareerTopics(careerTopics).length}</strong> selected</span>
              </div>
            </section>

            <section className="learning-career-primer" aria-label="Frequently tested preparation areas">
              <article className="card">
                <div className="learning-career-section-heading">
                  <span><BriefcaseBusiness size={17} /></span>
                  <div>
                    <h3>Important role topics</h3>
                    <p>Build clear explanations and evidence before practicing answers.</p>
                  </div>
                </div>
                <div className="learning-career-topic-grid">
                  {careerFoundationTopics.slice(0, 8).map((topic) => (
                    <button key={topic.id || topic.title} onClick={() => addCareerTopic(topic.title, { openIntake: true })} type="button">
                      <span><Plus size={13} /></span>
                      <strong>{topic.title}</strong>
                      <small>{topic.summary || "Add this area to your personalized preparation guide."}</small>
                    </button>
                  ))}
                </div>
              </article>

              <article className="card">
                <div className="learning-career-section-heading">
                  <span><Code2 size={17} /></span>
                  <div>
                    <h3>Frequently tested coding</h3>
                    <p>Prioritize patterns, complexity, edge cases, and spoken reasoning.</p>
                  </div>
                </div>
                <div className="learning-career-topic-grid">
                  {careerCodingTopics.slice(0, 8).map((topic) => (
                    <button key={topic.id || topic.title} onClick={() => addCareerTopic(topic.title, { openIntake: true })} type="button">
                      <span><Plus size={13} /></span>
                      <strong>{topic.title}</strong>
                      <small>{topic.summary || "Add this coding pattern to your personalized preparation guide."}</small>
                    </button>
                  ))}
                </div>
              </article>
            </section>

            {careerAnalysisReady && (
              <section className="card learning-career-results" aria-live="polite">
                <div className="learning-panel-heading">
                  <div>
                    <span className="section-tag"><Check size={13} /> Preparation guide</span>
                    <h3>{careerAnalysis.targetRole || careerRole || "Placement preparation"}</h3>
                    <p>{careerAnalysis.overview}</p>
                  </div>
                  <div className="learning-career-results-actions">
                    <span className={`learning-career-draft-status${careerAnalysisIsDraft ? " is-draft" : " is-saved"}`}>
                      {careerAnalysisIsDraft ? "Unsaved draft" : "Saved placement note"}
                    </span>
                    <span className="learning-count">{listFrom(careerAnalysis.topics).length}</span>
                    <button
                      aria-label={careerAnalysisIsDraft ? "Save placement preparation" : "Placement preparation saved"}
                      className="learning-career-save"
                      disabled={!careerAnalysisIsDraft || saving || careerAnalyzing}
                      onClick={saveCareerPreparation}
                      title={careerAnalysisIsDraft ? "Save placement preparation" : "Saved placement note"}
                      type="button"
                    >
                      {saving
                        ? <LoaderCircle className="spinner" size={16} />
                        : careerAnalysisIsDraft ? <Save size={16} /> : <Check size={16} />}
                      <span>{saving ? "Saving..." : careerAnalysisIsDraft ? "Save preparation" : "Saved"}</span>
                    </button>
                  </div>
                </div>
                <div className="learning-career-analysis-grid">
                  {listFrom(careerAnalysis.topics).map((topic, index) => (
                    <article key={topic?.id || topic?.title || index}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <h4>{cleanText(topic?.title, 180)}</h4>
                      <p>{cleanText(topic?.explanation, 3000)}</p>
                      {cleanText(topic?.whyItMatters, 900) && (
                        <aside><strong>Why it matters</strong>{cleanText(topic.whyItMatters, 900)}</aside>
                      )}
                      {listFrom(topic?.interviewQuestions).length > 0 && (
                        <div>
                          <h5>Interview checks</h5>
                          {listFrom(topic.interviewQuestions).map((question, questionIndex) => {
                            const target = placementActionTarget(topic, question, "interview", questionIndex);
                            const noteOptions = placementNoteOptions(target);
                            return (
                              <PlacementPrepDisclosure
                                key={target.id}
                                label={cleanText(question?.question || question, 500)}
                              >
                                {target.explanation.split(/\n{2,}/).map((paragraph, guidanceIndex) => (
                                  <p key={`${target.id}-guidance-${guidanceIndex}`}>{paragraph}</p>
                                ))}
                                <div className="learning-career-item-actions">
                                  <button
                                    disabled={isLearningNoteSaving(target, noteOptions)}
                                    onClick={() => savePlacementItem(target)}
                                    type="button"
                                  >
                                    <Save size={14} /> {isLearningNoteSaving(target, noteOptions) ? "Saving..." : "Save"}
                                  </button>
                                  <button onClick={() => askPlacementItemAI(target, topic)} type="button">
                                    <MessageSquareText size={14} /> Ask AI
                                  </button>
                                  <button onClick={() => openPlannerForNode(target)} type="button">
                                    <CalendarPlus size={14} /> Add to planner
                                  </button>
                                </div>
                              </PlacementPrepDisclosure>
                            );
                          })}
                        </div>
                      )}
                      {listFrom(topic?.practiceSteps).length > 0 && (
                        <div>
                          <h5>Practice next</h5>
                          <div className="learning-career-practice-list">
                            {listFrom(topic.practiceSteps).map((step, stepIndex) => {
                              const target = placementActionTarget(topic, step, "practice", stepIndex);
                              const noteOptions = placementNoteOptions(target);
                              return (
                                <PlacementPrepDisclosure
                                  key={target.id}
                                  label={cleanText(step?.title || step?.text || step, 500)}
                                >
                                  {target.explanation.split(/\n{2,}/).map((paragraph, guidanceIndex) => (
                                    <p key={`${target.id}-guidance-${guidanceIndex}`}>{paragraph}</p>
                                  ))}
                                  <div className="learning-career-item-actions">
                                    <button
                                      disabled={isLearningNoteSaving(target, noteOptions)}
                                      onClick={() => savePlacementItem(target)}
                                      type="button"
                                    >
                                      <Save size={14} /> {isLearningNoteSaving(target, noteOptions) ? "Saving..." : "Save"}
                                    </button>
                                    <button onClick={() => askPlacementItemAI(target, topic)} type="button">
                                      <MessageSquareText size={14} /> Ask AI
                                    </button>
                                    <button onClick={() => openPlannerForNode(target)} type="button">
                                      <CalendarPlus size={14} /> Add to planner
                                    </button>
                                  </div>
                                </PlacementPrepDisclosure>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
                {listFrom(careerAnalysis.preparationPlan).length > 0 && (
                  <div className="learning-career-plan">
                    <h3>Your preparation sequence</h3>
                    {listFrom(careerAnalysis.preparationPlan).map((phase, index) => (
                      <article key={phase?.id || phase?.title || index}>
                        <span>{index + 1}</span>
                        <div>
                          <h4>{cleanText(phase?.title, 180)}</h4>
                          <p>{cleanText(phase?.description, 1200)}</p>
                          <ul>{listFrom(phase?.actions).map((action) => <li key={cleanText(action, 500)}>{cleanText(action, 500)}</li>)}</ul>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )}
          </section>
        )}
      </div>

      <LearningSubjectMasteryDialog
        error={notebooksError}
        loading={notebooksLoading}
        notebooks={masteryNotebooks}
        now={new Date(masteryClock).toISOString()}
        onClose={() => {
          setMasteryDialogOpen(false);
          if (String(location.hash || "").toLowerCase() === "#subject-mastery") {
            navigate("/learn", { replace: true });
          }
        }}
        onRetry={loadNotebooks}
        open={masteryDialogOpen}
      />

      {privacyConsentOpen && typeof document !== "undefined" && createPortal(
        <div
          className="learning-dialog-backdrop learning-privacy-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) declinePrivacyConsent();
          }}
          role="presentation"
        >
          <section
            aria-describedby="learning-privacy-description"
            aria-labelledby="learning-privacy-title"
            aria-modal="true"
            className="learning-planner-dialog learning-privacy-dialog card"
            ref={privacyConsentDialogRef}
            role="dialog"
          >
            <div className="learning-privacy-heading">
              <span className="learning-privacy-icon" aria-hidden="true">
                <ShieldCheck size={23} />
              </span>
              <div>
                <span className="section-tag">One-time privacy notice</span>
                <h3 id="learning-privacy-title">Allow AI processing?</h3>
              </div>
            </div>

            <div className="learning-privacy-copy" id="learning-privacy-description">
              {pendingAnalysisRef.current?.kind === "medical" ? (
                <>
                  <p>
                    To build Medical training, PrepMatrix sends only the academic training focus,
                    concept labels, and relevant registered academic-profile context to Google
                    Gemini for AI processing. The selected notebook is an owned save location; its
                    uploaded source contents are not included in this Medical training request.
                  </p>
                  <p>
                    If Gemini cannot complete the request, the same focus, concept labels, and
                    academic context may be sent to Groq as a fallback.
                  </p>
                  <p>
                    The generated reasoning guide stays a draft until you explicitly save it. Use
                    fictional or de-identified academic scenarios only. Never enter patient names,
                    records, images, contact details, identifiers, symptoms, or requests for diagnosis,
                    dosing, prescribing, treatment, or emergency decisions.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    To build a notebook or placement-preparation guide, PrepMatrix sends uploaded
                    PDFs, images, notes, prompts, subjects, chapters, target roles, or topics you enter,
                    together with relevant academic-profile context, to Google Gemini for AI processing.
                  </p>
                  <p>
                    If Gemini cannot complete the request, the same information may be sent to
                    Groq as a fallback.
                  </p>
                  <p>
                    PrepMatrix saves the generated notebook and source metadata, such as file name,
                    type, size, and coverage. Raw uploaded or typed source contents are not saved in
                    notebook records. Placement topics and their generated preparation guide are saved
                    with the notebook so you can return to them.
                  </p>
                </>
              )}
            </div>

            <p className="learning-privacy-warning">
              {pendingAnalysisRef.current?.kind === "medical"
                ? "Educational conceptual practice only; not medical advice or clinical decision support."
                : "Only continue with material you are allowed to share. Avoid confidential, sensitive, or personally identifying information."}
            </p>

            <div className="learning-dialog-actions learning-privacy-actions">
              <button
                onClick={declinePrivacyConsent}
                ref={privacyConsentCancelRef}
                type="button"
              >
                Not now
              </button>
              <button
                className="learning-privacy-agree"
                onClick={agreeToPrivacyConsent}
                type="button"
              >
                <ShieldCheck size={16} /> Agree &amp; analyze
              </button>
            </div>
          </section>
        </div>,
        document.body,
      )}

      {plannerDialogOpen && activeNotebook && createPortal(
        <div
          className="learning-dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closePlannerDialog();
          }}
          role="presentation"
        >
          <section
            aria-labelledby="learning-planner-title"
            aria-modal="true"
            className="learning-planner-dialog card"
            role="dialog"
          >
            <div className="learning-dialog-header">
              <div>
                <span className="section-tag">Planner bridge</span>
                <h3 id="learning-planner-title">Schedule a learning unit</h3>
                <p>Choose exactly what to study and place it on a real available schedule date.</p>
              </div>
              <button aria-label="Close planner dialog" onClick={closePlannerDialog} type="button">
                <X size={17} />
              </button>
            </div>
            <label className="learning-field">
              <span>Learning unit</span>
              <select
                onChange={(event) => {
                  setPlannerNodeId(event.target.value);
                  setPlannerError("");
                }}
                value={plannerNodeId}
              >
                {plannerCustomNode && !nodes.some((node) => node.id === plannerCustomNode.id) && (
                  <option value={plannerCustomNode.id}>
                    {plannerCustomNode.chapterName ? `${plannerCustomNode.chapterName} - ` : ""}{plannerCustomNode.title}
                  </option>
                )}
                {nodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.chapterName ? `${node.chapterName} · ` : ""}{node.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="learning-field">
              <span>Available schedule date</span>
              <select
                disabled={!dateOptions.length}
                onChange={(event) => {
                  setPlannerDateKey(event.target.value);
                  setPlannerError("");
                }}
                value={plannerDateKey}
              >
                {!dateOptions.length && <option value="">No future schedule dates</option>}
                {dateOptions.map((option) => (
                  <option key={option.dateKey} value={option.dateKey}>
                    {option.label} · {option.taskCount} {option.taskCount === 1 ? "task" : "tasks"}
                  </option>
                ))}
              </select>
            </label>
            {plannerError && <p className="learning-inline-error" role="alert">{plannerError}</p>}
            {!dateOptions.length && (
              <p className="learning-dialog-note">
                Generate a dated planner schedule first, then return to add this learning unit.
              </p>
            )}
            <div className="learning-dialog-actions">
              <button onClick={closePlannerDialog} type="button">Cancel</button>
              <button disabled={(!nodes.length && !plannerCustomNode) || !dateOptions.length} onClick={addToPlanner} type="button">
                <CalendarPlus size={16} /> Add to planner
              </button>
            </div>
          </section>
        </div>,
        document.body
      )}
    </div>
  );
}

export default StartLearningPage;
