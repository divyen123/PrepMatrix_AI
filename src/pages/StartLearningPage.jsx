import {
  ArrowLeft,
  BookOpenCheck,
  BrainCircuit,
  BriefcaseBusiness,
  CalendarPlus,
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Download,
  FileText,
  Layers3,
  LoaderCircle,

  Pin,
  Plus,
  Save,
  ShieldCheck,
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
import { toast } from "../utils/toast";
import NotebookLibrary from "../components/NotebookLibrary";
import NotebookCreateDialog from "../components/NotebookCreateDialog";
import NotebookContent from "../components/NotebookContent";
import { notebookLibraryShortcut } from "../components/notebookLibraryModel.js";
import LearningMasteryMap from "../components/LearningMasteryMap";
import PlacementPrepTopicCard from "../components/PlacementPrepTopicCard";
import LearningSubjectMasteryDialog from "../components/LearningSubjectMasteryDialog";
import LearningRecallSession from "../components/LearningRecallSession";
import LatticeLoader from "../components/LatticeLoader";
import MedicalTrainingLab from "../components/MedicalTrainingLab";
import MedicalTrainingLabIntake from "../components/MedicalTrainingLabIntake";
import CodeMatrixSetupReturn from "../components/CodeMatrixSetupReturn";
import { CODE_MATRIX_PATH, getCodeMatrixEligibility, getCodeMatrixSetupSteps } from "../utils/codeMatrixProfile.js";
import { buildPlacementCodeMatrixHandoff } from "../utils/placementCodeMatrix.js";
import api from "../utils/apiClient";
import { getAcademicProfileExamples } from "../utils/academicProfileExamples";
import {
  AI_FEATURES,
  createAiIdempotencyKey,
  getAiRequestErrorMessage,
  useAiQuota,
} from "../utils/aiQuota";
import { AiCreditCost } from "../components/AiQuotaProvider";
import { useBackgroundTasks } from "../utils/backgroundTaskContext";
import { getBackgroundTaskKey } from "../utils/backgroundTasks";
import {
  LEARNING_ATTACHMENT_ACCEPT,
  MAX_CHAT_ATTACHMENTS,
  formatChatFileSize,
  prepareChatAttachment,
  validateChatAttachmentSelection,
} from "../utils/chatAttachments";
import {
  getLearningPlannerAvailability,
  getLearningPlannerCompletionState,
  getLearningScheduleDateOptions,
  setLearningPlannerNodeCompletion,
  upsertLearningPlannerTask,
} from "../utils/learningPlanner";
import {
  completeLearningSession,
  getNotebookCompletionSummary,
  setNotebookTopicCompleted,
  getLearningNodeStatus,
  getLearningReviewQueue,
  hasLearningNodeAchievement,
  normalizeLearningState,
  recordLearningAttempt,
  setLearningNodeStatus,
  startLearningSession,
  updateLearningSession,
} from "../utils/learningMastery";
import { buildLearningTopicNote } from "../utils/learningNoteIntegration";
import { getRevisedNoteTopicIds } from "../utils/learningRevisedNoteActions.js";
import { notifyLearningNotebookSaved } from "../utils/learningNotebookEvents.js";
import {
  buildPlacementActionTarget,
  buildPlacementChatPrompt,
  canCompletePlacementRole,
  createPlacementDraft,
  clearPlacementHistory,
  deletePlacementHistoryEntry,
  getNotebookPlacementRoleSuggestion,
  getNotebookPlacementTopics,
  getPlacementHistoryEntry,
  mergePlacementDraft,
  normalizePlacementPreparationSource,
  setPlacementHistoryPinned,
} from "../utils/placementPreparation";
import {
  MEDICAL_TRAINING_STARTERS,
  buildMedicalTrainingActionTarget,
  buildMedicalTrainingChatPrompt,
  clearMedicalTrainingHistory,
  createMedicalTrainingDraft,
  deleteMedicalTrainingHistoryEntry,
  getMedicalTrainingInputValues,
  getMedicalTrainingHistoryEntry,
  getSavedMedicalTrainingAnalysis,
  getSavedMedicalTrainingNotes,
  mergeMedicalTrainingDraft,
  setMedicalTrainingHistoryPinned,
} from "../utils/medicalTrainingClient.js";
import {
  getSavedPlacementNotes,
  getStartLearningArtifactKind,
  isLearningWorkspaceNotebook,
  isMedicalTrainingHash,
  isPlacementPrepHash,
  sortStartLearningNotebooks,
} from "../utils/startLearningWorkspace";
import {
  getLearningCareerEligibility,
  getLearningMedicalTrainingEligibility,
  getLearningPreparationMode,
} from "../utils/learningNotebook";
import { LEARNING_NOTEBOOK_REQUEST_TIMEOUT_MS } from "../utils/learningNotebookRequest";
import { MAX_NOTEBOOK_SCOPE_CHARS, MAX_NOTEBOOK_TOPICS, notebookRequirementsKey, getNotebookScopeSuggestion, parseNotebookScope, buildNotebookFocus } from "../utils/notebookCreation";
import {
  LEARNING_PRIVACY_CONSENT_VERSION,
  MEDICAL_TRAINING_PRIVACY_CONSENT_KIND,
  MEDICAL_TRAINING_PRIVACY_CONSENT_VERSION,
  acceptLearningPrivacyConsent,
  hasLearningPrivacyConsent,
} from "../utils/learningPrivacyConsent";
import { normalizeSubjectNames } from "../utils/subjectPlanning";
import "./StartLearningPage.css";

const TEXT_SOURCE_ACCEPT = ".txt,.md,text/plain,text/markdown";
const LEARNING_SOURCE_ACCEPT = `${LEARNING_ATTACHMENT_ACCEPT},${TEXT_SOURCE_ACCEPT}`;
const MAX_TEXT_SOURCE_BYTES = 30_000;
const MAX_TEXT_TOTAL_CHARS = 60_000;
const MAX_LEARNING_PROMPT_CHARS = MAX_NOTEBOOK_SCOPE_CHARS;
const PLANNER_REQUIRED_NOTICE_ID = "learning-planner-required";
const MAX_PLACEMENT_CONTEXT_CHARS = 3_000;
const CUSTOM_PLACEMENT_SOURCE_VALUE = "__custom_context__";
const MAX_MEDICAL_CONTEXT_CHARS = 3_000;
const CUSTOM_MEDICAL_SOURCE_VALUE = "__custom_medical_context__";
const LEARNING_BACKGROUND_FEATURES = Object.freeze({
  career: "learning-career-analysis",
  medical: "learning-medical-analysis",
  notebook: "learning-notebook",
});
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

function buildNotebookMapProgress(notebook, learningState, now) {
  const next = Object.fromEntries(Object.entries(learningState.nodes || {}).map(([nodeId, node]) => [
    nodeId,
    { ...node, status: getLearningNodeStatus(node, { now }) },
  ]));

  const aggregateTopics = (topics, previous = {}) => {
    const childStates = topics.map((topic) => next[topic.id] || {});
    const learnedCount = childStates.filter(hasLearningNodeAchievement).length;
    const allLearned = childStates.length > 0 && learnedCount === childStates.length;
    const allMastered = allLearned && childStates.every((node) => (
      Boolean(node.masteredAt) || node.status === "mastered"
    ));
    const hasProgress = learnedCount > 0 || childStates.some((node) => node.status === "learning");
    return {
      ...previous,
      status: allMastered ? "mastered" : allLearned ? "learned" : hasProgress ? "learning" : "ready",
      masteryScore: childStates.length ? Math.round(learnedCount / childStates.length * 100) : 0,
      learnedAt: "",
      masteredAt: "",
      completedAt: "",
    };
  };

  const chapters = notebook?.chapters || [];
  chapters.forEach((chapter) => {
    next[chapter.id] = aggregateTopics(chapter.topics || [], next[chapter.id]);
  });
  next.root = aggregateTopics(chapters.flatMap((chapter) => chapter.topics || []), next.root);
  return next;
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

function placementInputValues(notebook, draft, userProfile = {}, historyId = "") {
  const matchingDraft = draft?.notebookId === notebook?.id ? draft : null;
  const historyEntry = getPlacementHistoryEntry(notebook, historyId);
  const analysis = matchingDraft?.analysis || historyEntry?.analysis || null;
  const preparationSource = normalizePlacementPreparationSource(
    matchingDraft?.preparationSource || historyEntry?.preparationSource,
    notebook?.id ? {
      context: [notebook.title, notebook.subjectName].filter(Boolean).join(" - "),
      label: notebook.title || notebook.subjectName,
      notebookId: notebook.id,
      type: "notebook",
    } : "",
  );
  const topics = listFrom(analysis?.topics)
    .map((topic) => cleanText(topic?.title || topic, 140))
    .filter(Boolean)
    .slice(0, 12);
  return {
    context: preparationSource.type === "custom"
      ? cleanText(
          preparationSource.context || preparationSource.label,
          MAX_PLACEMENT_CONTEXT_CHARS,
        )
      : "",
    role: cleanText(
      analysis?.targetRole || userProfile?.primaryGoal || userProfile?.careerGoal,
      160,
    ),
    sourceValue: preparationSource.type === "notebook" && (
      preparationSource.notebookId || notebook?.id
    )
      ? preparationSource.notebookId || notebook.id
      : CUSTOM_PLACEMENT_SOURCE_VALUE,
    topics: topics.join("\n"),
  };
}

function formatNotebookDate(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "Recently updated";
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(date);
}

function placementHistorySourceLabel(note) {
  if (note?.preparationSource?.type === "notebook") {
    return `From notebook: ${note.sourceLabel || note.notebook?.title || "Learning notebook"}`;
  }
  if (note?.sourceLabel) return `Context: ${note.sourceLabel}`;
  return `From ${note?.notebook?.title || "placement history"}`;
}

function pdfFileName(notebook) {
  const name = cleanText(notebook?.title || notebook?.subjectName || "Learning notebook", 80)
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return `${name || "learning-notebook"}.pdf`;
}

function patchLearningNotebookSnapshot(snapshot, academicProfileDataId) {
  return api.patch(
    `/api/learning-notebooks/${encodeURIComponent(snapshot.id)}`,
    { notebook: snapshot },
    { academicProfileId: academicProfileDataId, timeoutMs: 30000 },
  );
}

function learningTabPanelProps(activeTab, tabId, viewClassName) {
  const isActive = activeTab === tabId;
  return {
    "aria-hidden": !isActive,
    "aria-labelledby": `learning-${tabId}-tab`,
    className: `${viewClassName} learning-tab-panel${isActive ? " is-active" : ""}`,
    id: `learning-${tabId}-panel`,
    inert: !isActive,
    role: "tabpanel",
  };
}

function StartLearningPage({
  academicProfileDataId = "",
  academicLevel = "College",
  academicTrack = "General",
  userProfile = {},
  subjects = [],
  completed = [],
  schedule = [],
  onOpenCodeMatrix,
  setSchedule,
  setCompleted,
  scheduleStartDate,
  setNotification,
}) {
  const { hasInsufficientCredits } = useAiQuota();
  const { acknowledgeTask, runTask, tasks: backgroundTasks } = useBackgroundTasks();
  const location = useLocation();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const requirementsInputRef = useRef(null);
  const sourcePreparationRef = useRef(false);
  const subjectInputRef = useRef(null);
  const subjectOptionsRef = useRef(null);
  const analysisTimerRef = useRef(null);
  const mountedRef = useRef(true);
  const pendingAnalysisRef = useRef(null);
  const privacyConsentCancelRef = useRef(null);
  const privacyConsentDialogRef = useRef(null);
  const pendingNotebookSavesRef = useRef(new Map());
  const notebookSaveChainRef = useRef(Promise.resolve());
  const activeNotebookRef = useRef(null);
  const careerAnalysisRequestRef = useRef({ context: "", notebookId: "", pending: false, sequence: 0 });
  const medicalAnalysisRequestRef = useRef({ context: "", notebookId: "", pending: false, sequence: 0 });
  const [notebooks, setNotebooks] = useState([]);
  const [notebooksLoading, setNotebooksLoading] = useState(true);
  const [notebooksError, setNotebooksError] = useState("");
  const [activeNotebook, setActiveNotebook] = useState(null);
  const [workspaceView, setWorkspaceView] = useState("intake");
  const [intakeMode, setIntakeMode] = useState(null);
  const [careerSourceValue, setCareerSourceValue] = useState(CUSTOM_PLACEMENT_SOURCE_VALUE);
  const [careerContext, setCareerContext] = useState("");
  const [careerRole, setCareerRole] = useState("");
  const [careerTopics, setCareerTopics] = useState("");
  const [careerAnalyzing, setCareerAnalyzing] = useState(false);
  const [careerError, setCareerError] = useState("");
  const [careerDraft, setCareerDraft] = useState(null);
  const [activeCareerHistoryId, setActiveCareerHistoryId] = useState("");
  const [medicalSourceValue, setMedicalSourceValue] = useState(CUSTOM_MEDICAL_SOURCE_VALUE);
  const [medicalContext, setMedicalContext] = useState("");
  const [medicalFocus, setMedicalFocus] = useState("");
  const [medicalTopics, setMedicalTopics] = useState("");
  const [medicalAnalyzing, setMedicalAnalyzing] = useState(false);
  const [medicalError, setMedicalError] = useState("");
  const [medicalDraft, setMedicalDraft] = useState(null);
  const [activeMedicalHistoryId, setActiveMedicalHistoryId] = useState("");
  const [sources, setSources] = useState([]);
  const [sourceError, setSourceError] = useState("");
  const [preparingSources, setPreparingSources] = useState(false);
  const [subjectName, setSubjectName] = useState("");
  const [subjectPickerOpen, setSubjectPickerOpen] = useState(false);
  const [subjectOptionIndex, setSubjectOptionIndex] = useState(0);
  const [scopeDrafts, setScopeDrafts] = useState({});
  const [newNotebookOpen, setNewNotebookOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState(0);
  const [analysisError, setAnalysisError] = useState("");
  const [activeTab, setActiveTab] = useState("notes");
  const [selectedNodeId, setSelectedNodeId] = useState("");

  const [dirty, setDirty] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleteCandidateId, setDeleteCandidateId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [historyMutationKey, setHistoryMutationKey] = useState("");
  const [clearHistoryCandidate, setClearHistoryCandidate] = useState("");
  const [clearingHistory, setClearingHistory] = useState(false);
  const [plannerDialogOpen, setPlannerDialogOpen] = useState(false);
  const [plannerNodeId, setPlannerNodeId] = useState("");
  const [plannerCustomNode, setPlannerCustomNode] = useState(null);
  const [plannerDateKey, setPlannerDateKey] = useState("");
  const [plannerError, setPlannerError] = useState("");
  const [privacyConsentOpen, setPrivacyConsentOpen] = useState(false);
  const [masterySaving, setMasterySaving] = useState(false);
  const [masteryDialogOpen, setMasteryDialogOpen] = useState(false);
  const [latestReceipt, setLatestReceipt] = useState(null);
  const [noteSavingKeys, setNoteSavingKeys] = useState(() => new Set());
  const noteSavingKeysRef = useRef(new Set());
  const presentedBackgroundRunsRef = useRef(new Set());
  const [masteryClock, setMasteryClock] = useState(() => Date.now());

  const backgroundProfileId = cleanText(
    academicProfileDataId || userProfile?.id || "default-profile",
    180,
  );
  const notebookTaskKey = getBackgroundTaskKey(
    LEARNING_BACKGROUND_FEATURES.notebook,
    backgroundProfileId,
  );
  const careerTaskKey = getBackgroundTaskKey(
    LEARNING_BACKGROUND_FEATURES.career,
    backgroundProfileId,
  );
  const medicalTaskKey = getBackgroundTaskKey(
    LEARNING_BACKGROUND_FEATURES.medical,
    backgroundProfileId,
  );
  const notebookBackgroundTask = backgroundTasks[notebookTaskKey];
  const careerBackgroundTask = backgroundTasks[careerTaskKey];
  const medicalBackgroundTask = backgroundTasks[medicalTaskKey];

  const preparationProfile = useMemo(
    () => ({
      ...userProfile,
      academicLevel,
      academicTrack,
    }),
    [academicLevel, academicTrack, userProfile],
  );
  const curriculumExamples = useMemo(
    () => getAcademicProfileExamples(preparationProfile),
    [preparationProfile],
  );
  const scopeKey = notebookRequirementsKey(subjectName);
  const suggestedScope = useMemo(
    () => getNotebookScopeSuggestion(subjects, subjectName), [subjects, subjectName],
  );
  const scopeText = Object.hasOwn(scopeDrafts, scopeKey)
    ? scopeDrafts[scopeKey] : suggestedScope;
  const setScopeText = (value) => setScopeDrafts((current) => ({ ...current, [scopeKey]: value }));
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
  const codeMatrixEligibility = useMemo(() => getCodeMatrixEligibility(preparationProfile, subjects), [preparationProfile, subjects]);
  const medicalEligible = preparationMode === "medical" && medicalEligibility.enabled;
  const workspaceChoiceCount = 1
    + Number(codeMatrixEligibility.eligible)
    + Number(placementEligible)
    + Number(medicalEligible);
  const savedPlacementNotes = useMemo(
    () => getSavedPlacementNotes(notebooks),
    [notebooks],
  );
  const courseNotebooks = useMemo(
    () => notebooks.filter((notebook) => !isLearningWorkspaceNotebook(notebook)),
    [notebooks],
  );
  const selectedCareerSourceNotebook = useMemo(
    () => courseNotebooks.find((notebook) => notebook.id === careerSourceValue) || null,
    [careerSourceValue, courseNotebooks],
  );
  const usesCustomPlacementSource = careerSourceValue === CUSTOM_PLACEMENT_SOURCE_VALUE;
  const careerRoleSuggestion = useMemo(
    () => getNotebookPlacementRoleSuggestion(
      selectedCareerSourceNotebook,
      curriculumExamples.placementRolePlaceholder,
    ),
    [curriculumExamples.placementRolePlaceholder, selectedCareerSourceNotebook],
  );
  const selectedMedicalSourceNotebook = useMemo(
    () => courseNotebooks.find((notebook) => notebook.id === medicalSourceValue) || null,
    [courseNotebooks, medicalSourceValue],
  );
  const usesCustomMedicalSource = medicalSourceValue === CUSTOM_MEDICAL_SOURCE_VALUE;
  const savedMedicalTrainingNotes = useMemo(
    () => getSavedMedicalTrainingNotes(notebooks),
    [notebooks],
  );
  const notebookHistory = useMemo(
    () => sortStartLearningNotebooks(notebooks),
    [notebooks],
  );
  const activeArtifactKind = getStartLearningArtifactKind({ intakeMode, workspaceView });
  const historyBusy = Boolean(historyMutationKey || clearingHistory);
  const saving = historyBusy;

  useEffect(() => {
    const hash = String(location.hash || "").toLowerCase();
    if (hash === "#notebook-preparation") {
      setIntakeMode("notebook");
      setWorkspaceView("intake");
      const requestedSubject = new URLSearchParams(location.search).get("subject");
      if (requestedSubject) setSubjectName(requestedSubject.slice(0, 160));
      return;
    }
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
  }, [location.hash, location.search, medicalEligible, placementEligible]);

  const savedSubjectNames = useMemo(
    () => normalizeSubjectNames(subjects),
    [subjects],
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
    if (
      notebooksLoading
      || careerSourceValue === CUSTOM_PLACEMENT_SOURCE_VALUE
      || selectedCareerSourceNotebook
    ) return;
    setCareerSourceValue(CUSTOM_PLACEMENT_SOURCE_VALUE);
  }, [careerSourceValue, notebooksLoading, selectedCareerSourceNotebook]);

  useEffect(() => {
    if (
      notebooksLoading
      || medicalSourceValue === CUSTOM_MEDICAL_SOURCE_VALUE
      || selectedMedicalSourceNotebook
    ) return;
    setMedicalSourceValue(CUSTOM_MEDICAL_SOURCE_VALUE);
  }, [medicalSourceValue, notebooksLoading, selectedMedicalSourceNotebook]);

  useEffect(() => {
    if (placementEligible) return;
    careerAnalysisRequestRef.current = {
      context: "",
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
      context: "",
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

  const nodes = useMemo(
    () => isLearningWorkspaceNotebook(activeNotebook) ? [] : learningNodes(activeNotebook),
    [activeNotebook],
  );
  const masteryNotebooks = useMemo(() => {
    if (!activeNotebook || isLearningWorkspaceNotebook(activeNotebook)) return courseNotebooks;
    return [
      activeNotebook,
      ...courseNotebooks.filter((notebook) => notebook.id !== activeNotebook.id),
    ];
  }, [activeNotebook, courseNotebooks]);
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
  const normalizedMasteryState = useMemo(
    () => normalizeLearningState(activeNotebook?.learningState, {
      notebook: activeNotebook || {},
      now: new Date(masteryClock).toISOString(),
    }),
    [activeNotebook, masteryClock],
  );
  const progressByNodeId = useMemo(() => {
    const now = new Date(masteryClock).toISOString();
    return buildNotebookMapProgress(activeNotebook, normalizedMasteryState, now);
  }, [activeNotebook, masteryClock, normalizedMasteryState]);
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
    () => plannerDialogOpen ? getLearningScheduleDateOptions(schedule, scheduleStartDate) : [],
    [plannerDialogOpen, schedule, scheduleStartDate],
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
  const activeCareerHistoryEntry = getPlacementHistoryEntry(
    activeNotebook,
    activeCareerHistoryId || activeCareerDraft?.id,
  );
  const careerAnalysis = activeCareerDraft?.analysis
    || activeCareerHistoryEntry?.analysis
    || null;
  const careerAnalysisReady = Boolean(
    careerAnalysis && listFrom(careerAnalysis.topics).some((topic) => cleanText(topic?.title || topic, 180)),
  );
  const activeMedicalDraft = medicalDraft?.notebookId === activeNotebook?.id
    ? medicalDraft
    : null;
  const activeMedicalHistoryEntry = getMedicalTrainingHistoryEntry(
    activeNotebook,
    activeMedicalHistoryId || activeMedicalDraft?.id,
  );
  const medicalAnalysis = activeMedicalDraft?.analysis
    || activeMedicalHistoryEntry?.analysis
    || getSavedMedicalTrainingAnalysis(activeNotebook)
    || null;
  const medicalAnalysisReady = Boolean(
    medicalAnalysis && listFrom(medicalAnalysis.modules).some((module) => cleanText(module?.title, 180)),
  );
  const medicalAnalysisIsDraft = Boolean(activeMedicalDraft && medicalAnalysisReady);
  const medicalVisible = Boolean(medicalEligible && medicalAnalysisReady);

  const selectNotebook = useCallback((value) => {
    if (careerAnalyzing || historyBusy || medicalAnalyzing || saving) return;
    const normalized = normalizeNotebook(value);
    setActiveNotebook(normalized);
    setWorkspaceView("notebook");
    setIntakeMode("notebook");
    setCareerError("");
    setDirty(false);
    setActiveTab("notes");
    const firstTopic = normalized.chapters.find((chapter) => chapter.topics.length)?.topics[0];
    setSelectedNodeId(firstTopic?.id || "");

  }, [careerAnalyzing, historyBusy, medicalAnalyzing, saving]);

  const selectPlacementNotebook = (notebookId, historyId = "") => {
    if (careerAnalyzing || historyBusy || medicalAnalyzing || saving) return false;
    const notebook = notebooks.find((item) => item.id === notebookId);
    if (!notebook) return false;
    const normalized = normalizeNotebook(notebook);
    const selectedHistory = getPlacementHistoryEntry(normalized, historyId);
    const fields = placementInputValues(normalized, careerDraft, userProfile, selectedHistory?.id);
    activeNotebookRef.current = normalized;
    setActiveNotebook(normalized);
    setActiveCareerHistoryId(selectedHistory?.id || "");
    setCareerError("");
    setCareerSourceValue(fields.sourceValue);
    setCareerContext(fields.context);
    setCareerRole(fields.role);
    setCareerTopics(fields.topics);
    return true;
  };

  const selectCareerPreparationSource = (sourceValue) => {
    if (careerAnalyzing || saving) return;
    setCareerSourceValue(sourceValue);
    setCareerError("");
    if (sourceValue === CUSTOM_PLACEMENT_SOURCE_VALUE) return;
    const notebook = courseNotebooks.find((item) => item.id === sourceValue);
    if (!notebook) return;
    const normalized = normalizeNotebook(notebook);
    activeNotebookRef.current = normalized;
    setActiveNotebook(normalized);
    setActiveCareerHistoryId("");
    setCareerRole("");
    setCareerTopics(getNotebookPlacementTopics(normalized).join("\n"));
  };

  const completeSuggestedCareerRole = (event) => {
    if (
      usesCustomPlacementSource
      || event.key !== "Tab"
      || event.shiftKey
      || event.altKey
      || event.ctrlKey
      || event.metaKey
      || !canCompletePlacementRole(careerRole, careerRoleSuggestion)
    ) return;
    event.preventDefault();
    setCareerRole(careerRoleSuggestion);
  };

  const selectMedicalNotebook = (notebookId, historyId = "", { includeWorkspace = false } = {}) => {
    if (careerAnalyzing || historyBusy || medicalAnalyzing || saving) return false;
    const availableNotebooks = includeWorkspace ? notebooks : courseNotebooks;
    const notebook = availableNotebooks.find((item) => item.id === notebookId);
    if (!notebook) return false;
    const normalized = normalizeNotebook(notebook);
    const selectedHistory = getMedicalTrainingHistoryEntry(normalized, historyId);
    const fields = getMedicalTrainingInputValues(
      normalized,
      medicalDraft,
      userProfile,
      selectedHistory?.id,
    );
    activeNotebookRef.current = normalized;
    setActiveNotebook(normalized);
    setActiveMedicalHistoryId(selectedHistory?.id || "");
    setMedicalError("");
    setMedicalSourceValue(
      isLearningWorkspaceNotebook(normalized) ? CUSTOM_MEDICAL_SOURCE_VALUE : normalized.id,
    );
    setMedicalContext("");
    setMedicalFocus(fields.focus);
    setMedicalTopics(fields.topics);
    return true;
  };

  const selectMedicalTrainingSource = (sourceMode) => {
    if (careerAnalyzing || historyBusy || medicalAnalyzing || saving) return;
    if (sourceMode === "custom") {
      setMedicalSourceValue(CUSTOM_MEDICAL_SOURCE_VALUE);
      setActiveMedicalHistoryId("");
      setMedicalError("");
      return;
    }

    const firstNotebook = courseNotebooks[0];
    if (!firstNotebook) {
      setMedicalSourceValue(CUSTOM_MEDICAL_SOURCE_VALUE);
      setMedicalError("");
      return;
    }
    selectMedicalNotebook(firstNotebook.id);
  };

  const openNotebookIntake = () => {
    if (analyzing || careerAnalyzing || medicalAnalyzing || saving) return;
    setAnalysisError("");
    setIntakeMode("notebook");
    setWorkspaceView("intake");
  };

  const notebookSearchRequestedRef = useRef(false);
  useEffect(() => {
    if (intakeMode !== "notebook" || workspaceView !== "notebook") return undefined;
    const handleKey = (event) => {
      const shortcut = notebookLibraryShortcut(event, {
        enabled: !newNotebookOpen && !privacyConsentOpen && !analyzing && !saving,
        hasNotebooks: notebookHistory.length > 0,
        modalOpen: Boolean(document.querySelector('[role="dialog"][aria-modal="true"]')),
      });
      if (!shortcut) return;
      event.preventDefault();
      if (shortcut === "new") setNewNotebookOpen(true);
      else {
        notebookSearchRequestedRef.current = true;
        setWorkspaceView("intake");
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [intakeMode, workspaceView, newNotebookOpen, privacyConsentOpen, analyzing, saving, notebookHistory.length]);

  useEffect(() => {
    if (intakeMode !== "notebook" || workspaceView !== "intake" || !notebookSearchRequestedRef.current) return undefined;
    notebookSearchRequestedRef.current = false;
    const frame = requestAnimationFrame(() => document.querySelector('.notebook-library-search input')?.focus());
    return () => cancelAnimationFrame(frame);
  }, [intakeMode, workspaceView]);

  const openPlacementIntake = () => {
    if (!placementEligible || careerAnalyzing || medicalAnalyzing || saving) return;
    if (!careerRole && !careerTopics) {
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
    if (!medicalFocus && !medicalTopics) {
      const fields = getMedicalTrainingInputValues(null, null, userProfile);
      setMedicalFocus(fields.focus);
      setMedicalTopics(fields.topics);
    }
    setMedicalSourceValue(CUSTOM_MEDICAL_SOURCE_VALUE);
    setMedicalContext("");
    setActiveMedicalHistoryId("");
    setMedicalError("");
    setIntakeMode("medical");
    setWorkspaceView("intake");
  };

  const returnToPreparationChoice = () => {
    if (analyzing || careerAnalyzing || medicalAnalyzing || saving) return;
    setWorkspaceView("intake");
    setIntakeMode(null);
    if (isPlacementPrepHash(location.hash) || isMedicalTrainingHash(location.hash) || location.hash === "#notebook-preparation") {
      navigate("/learn", { replace: true });
    }
  };

  const openSavedPlacementNote = (note) => {
    if (!note?.notebookId || !selectPlacementNotebook(note.notebookId, note.historyId)) return;
    setIntakeMode("placement");
    setWorkspaceView("career");
  };

  const openSavedMedicalTraining = (note) => {
    if (!note?.notebookId || !selectMedicalNotebook(note.notebookId, note.historyId, { includeWorkspace: true })) return;
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
      const payload = await api.get("/api/learning-notebooks?includePlacementWorkspace=true", {
        academicProfileId: academicProfileDataId,
        timeoutMs: 30000,
      });
      if (!mountedRef.current) return;
      const loaded = listFrom(payload?.notebooks).map(normalizeNotebook);
      setNotebooks(loaded);
    } catch (error) {
      if (!mountedRef.current) return;
      setNotebooksError(error instanceof Error ? error.message : "Notebook history could not be loaded.");
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
      intakeMode !== "medical"
      || usesCustomMedicalSource
      || selectedMedicalSourceNotebook
      || medicalAnalyzing
      || saving
    ) return;
    setMedicalSourceValue(CUSTOM_MEDICAL_SOURCE_VALUE);
  }, [
    intakeMode,
    medicalAnalyzing,
    saving,
    selectedMedicalSourceNotebook,
    usesCustomMedicalSource,
  ]);

  useEffect(() => () => toast.dismiss(PLANNER_REQUIRED_NOTICE_ID), [academicProfileDataId]);

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
    if (analyzing || sourcePreparationRef.current) return;
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

    sourcePreparationRef.current = true;
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
      sourcePreparationRef.current = false;
      if (mountedRef.current) setPreparingSources(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeSource = (sourceId) => {
    setSources((current) => current.filter((source) => source.id !== sourceId));
    setSourceError("");
  };

  const chooseSavedSubject = (name) => {
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

  const beginAnalysisProgress = useCallback(() => {
    setAnalysisStep(0);
    if (analysisTimerRef.current) window.clearInterval(analysisTimerRef.current);
    analysisTimerRef.current = window.setInterval(() => {
      setAnalysisStep((current) => Math.min(current + 1, ANALYSIS_STEPS.length - 2));
    }, 1050);
  }, []);

  const getAnalysisRequest = () => {
    if (analyzing || preparingSources || sourcePreparationRef.current) return null;
    const cleanSubject = cleanText(subjectName, 160);
    const topicNames = parseNotebookScope(scopeText);
    if (!cleanSubject || !topicNames.length) {
      setAnalysisError("Choose a subject and enter the topics or chapters you want explained.");
      return null;
    }
    if (topicNames.length > MAX_NOTEBOOK_TOPICS || topicNames.some((name) => name.length > 140)) {
      setAnalysisError("Use up to 12 topics or chapters, with each name under 140 characters.");
      return null;
    }
    return { cleanSubject, topicNames, learningPrompt: buildNotebookFocus(cleanSubject, topicNames), scopeText };
  };

  const presentNotebookAnalysis = useCallback((payload, { notify = true } = {}) => {
    if (!payload?.notebook) return false;
    if (analysisTimerRef.current) window.clearInterval(analysisTimerRef.current);
    analysisTimerRef.current = null;
    setAnalysisStep(ANALYSIS_STEPS.length - 1);
    const normalized = normalizeNotebook(payload.notebook);
    setNotebooks((current) => [
      normalized,
      ...current.filter((notebook) => notebook.id !== normalized.id),
    ]);
    selectNotebook(normalized);
    setSources([]);
    setSubjectName("");
    setScopeDrafts({});
    setAnalyzing(false);
    setNewNotebookOpen(false);
    if (notify) setNotification?.("Your learning notebook is ready.");
    notifyLearningNotebookSaved({ academicProfileId: academicProfileDataId, notebookId: normalized.id });
    return true;
  }, [academicProfileDataId, selectNotebook, setNotification]);

  const presentCareerAnalysis = useCallback((payload, request = {}, { notify = true } = {}) => {
    const requestNotebookId = cleanText(
      request.notebookId || payload?.notebook?.id || payload?.notebook?._id,
      120,
    );
    if (!requestNotebookId || !payload?.topicAnalysis) return false;
    const requestedTopics = parseCareerTopics(request.topics);
    const targetRole = cleanText(request.targetRole, 160);
    const sourceNotebook = payload?.notebook ? normalizeNotebook(payload.notebook) : null;
    const usesNotebookSource = request.sourceMode === "notebook"
      || Boolean(cleanText(request.notebookId, 120));
    const notebookSource = sourceNotebook
      || (activeNotebookRef.current?.id === requestNotebookId ? activeNotebookRef.current : null);
    const preparationSource = normalizePlacementPreparationSource(usesNotebookSource ? {
      context: [notebookSource?.title, notebookSource?.subjectName].filter(Boolean).join(" - "),
      label: notebookSource?.title || notebookSource?.subjectName || "Learning notebook",
      notebookId: requestNotebookId,
      type: "notebook",
    } : {
      context: request.context,
      label: request.context,
      type: "custom",
    });
    const draft = createPlacementDraft(payload, {
      notebookId: requestNotebookId,
      preparationSource,
      requestedTopics,
      targetRole,
    });
    const baseNotebook = activeNotebookRef.current?.id === requestNotebookId
      ? activeNotebookRef.current
      : sourceNotebook;
    if (!baseNotebook?.id) return false;
    let snapshot;
    try {
      snapshot = mergePlacementDraft(baseNotebook, draft, {
        savedAt: new Date().toISOString(),
      });
    } catch (error) {
      setCareerError(error instanceof Error ? error.message : "The preparation guide could not be added to history.");
      return false;
    }
    activeNotebookRef.current = snapshot;
    setActiveNotebook(snapshot);
    setNotebooks((current) => [
      snapshot,
      ...current.filter((notebook) => notebook.id !== snapshot.id),
    ]);
    setCareerDraft(draft);
    setActiveCareerHistoryId(draft.id);
    setCareerSourceValue(usesNotebookSource
      ? requestNotebookId
      : CUSTOM_PLACEMENT_SOURCE_VALUE);
    setCareerContext(usesNotebookSource
      ? ""
      : draft.preparationSource?.context || preparationSource.context);
    setCareerRole(draft.analysis.targetRole || targetRole);
    setCareerTopics(requestedTopics.join("\n"));
    setCareerError("");
    setCareerAnalyzing(false);
    setIntakeMode("placement");
    setWorkspaceView("career");
    const mutationKey = `placement:${draft.id}`;
    setHistoryMutationKey(mutationKey);
    void patchLearningNotebookSnapshot(snapshot, academicProfileDataId)
      .then((response) => {
        if (!mountedRef.current) return;
        const normalized = normalizeNotebook(response?.notebook || snapshot);
        setNotebooks((current) => current.map((notebook) => (
          notebook.id === normalized.id ? normalized : notebook
        )));
        if (activeNotebookRef.current?.id === normalized.id) {
          activeNotebookRef.current = normalized;
          setActiveNotebook(normalized);
        }
        setCareerDraft((current) => current?.id === draft.id ? null : current);
        setNotification?.("Preparation guide added to history.");
      })
      .catch((error) => {
        if (mountedRef.current) {
          setNotification?.(error instanceof Error
            ? error.message
            : "The preparation guide could not be added to history.");
        }
      })
      .finally(() => {
        if (mountedRef.current) {
          setHistoryMutationKey((current) => current === mutationKey ? "" : current);
        }
      });
    if (notify) setNotification?.("Your preparation guide is ready and is being added to history.");
    return true;
  }, [academicProfileDataId, setNotification]);

  const presentMedicalAnalysis = useCallback((payload, request = {}, { notify = true } = {}) => {
    const requestNotebookId = cleanText(
      request.notebookId || payload?.notebook?.id || payload?.notebook?._id,
      120,
    );
    if (!requestNotebookId || !payload?.medicalTraining) return false;
    const requestContext = cleanText(request.context, MAX_MEDICAL_CONTEXT_CHARS);
    const usesNotebookSource = request.sourceMode === "notebook" || Boolean(request.notebookId);
    const requestedTopics = parseCareerTopics(request.topics);
    const trainingFocus = cleanText(request.trainingFocus, 160);
    const sourceNotebook = payload?.notebook ? normalizeNotebook(payload.notebook) : null;
    const draft = createMedicalTrainingDraft(payload, {
      notebookId: requestNotebookId,
      requestedTopics,
      trainingFocus,
    });
    const baseNotebook = activeNotebookRef.current?.id === requestNotebookId
      ? activeNotebookRef.current
      : sourceNotebook;
    if (!baseNotebook?.id) return false;
    let snapshot;
    try {
      snapshot = mergeMedicalTrainingDraft(baseNotebook, draft, {
        savedAt: new Date().toISOString(),
      });
    } catch (error) {
      setMedicalError(error instanceof Error ? error.message : "Medical training could not be added to history.");
      return false;
    }
    activeNotebookRef.current = snapshot;
    setActiveNotebook(snapshot);
    setNotebooks((current) => [
      snapshot,
      ...current.filter((notebook) => notebook.id !== snapshot.id),
    ]);
    setMedicalDraft(draft);
    setActiveMedicalHistoryId(draft.id);
    setMedicalSourceValue(usesNotebookSource
      ? requestNotebookId
      : CUSTOM_MEDICAL_SOURCE_VALUE);
    setMedicalContext(usesNotebookSource ? "" : requestContext);
    setMedicalFocus(draft.analysis.trainingTitle || trainingFocus);
    setMedicalTopics(requestedTopics.join("\n"));
    setMedicalError("");
    setMedicalAnalyzing(false);
    setIntakeMode("medical");
    setWorkspaceView("medical");
    const mutationKey = `medical:${draft.id}`;
    setHistoryMutationKey(mutationKey);
    void patchLearningNotebookSnapshot(snapshot, academicProfileDataId)
      .then((response) => {
        if (!mountedRef.current) return;
        const normalized = normalizeNotebook(response?.notebook || snapshot);
        setNotebooks((current) => current.map((notebook) => (
          notebook.id === normalized.id ? normalized : notebook
        )));
        if (activeNotebookRef.current?.id === normalized.id) {
          activeNotebookRef.current = normalized;
          setActiveNotebook(normalized);
        }
        setMedicalDraft((current) => current?.id === draft.id ? null : current);
        setNotification?.("Medical training added to history.");
      })
      .catch((error) => {
        if (mountedRef.current) {
          setNotification?.(error instanceof Error
            ? error.message
            : "Medical training could not be added to history.");
        }
      })
      .finally(() => {
        if (mountedRef.current) {
          setHistoryMutationKey((current) => current === mutationKey ? "" : current);
        }
      });
    if (notify) setNotification?.("Your Medical training is ready and is being added to history.");
    return true;
  }, [academicProfileDataId, setNotification]);

  const runNotebookAnalysis = async ({
    topicNames,
    scopeText: requestedScope,
    cleanSubject,
    learningPrompt: requestedPrompt,
  }) => {
    if (hasInsufficientCredits(AI_FEATURES.LEARNING_NOTEBOOK)) {
      setAnalysisError(getAiRequestErrorMessage({ code: "AI_USER_QUOTA_EXHAUSTED" }));
      return;
    }
    if (notebookBackgroundTask) return;

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
      const requestBody = {
        subjectName: cleanSubject,
        topicNames,
        learningPrompt: requestedPrompt,
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
      };
      const idempotencyKey = createAiIdempotencyKey();
      await runTask({
        academicProfileId: backgroundProfileId,
        execute: async () => {
          const result = await api.post("/api/learning-notebooks/analyze", requestBody, {
            academicProfileId: academicProfileDataId,
            timeoutMs: LEARNING_NOTEBOOK_REQUEST_TIMEOUT_MS,
            headers: { "Idempotency-Key": idempotencyKey },
          });
          if (!result?.notebook) throw new Error("The generated notebook response was incomplete.");
          return result;
        },
        feature: LEARNING_BACKGROUND_FEATURES.notebook,
        key: notebookTaskKey,
        label: cleanSubject ? `Building ${cleanSubject} notebook` : "Building learning notebook",
        meta: {
          kind: "notebook",
          request: { subjectName: cleanSubject, learningPrompt: requestedPrompt, scopeText: requestedScope, topicNames, sources },
        },
        route: "/learn",
      });
    } catch {
      // The provider retains the failure so this page can present it after remount.
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

  const runCareerAnalysis = async ({ context, notebookId, sourceMode, targetRole, topics }) => {
    if (hasInsufficientCredits(AI_FEATURES.CAREER_ANALYSIS)) {
      setCareerError(getAiRequestErrorMessage({ code: "AI_USER_QUOTA_EXHAUSTED" }));
      return;
    }

    const requestNotebookId = cleanText(notebookId, 120);
    const requestContext = requestNotebookId
      ? ""
      : cleanText(context, MAX_PLACEMENT_CONTEXT_CHARS);
    if (
      (!requestNotebookId && !requestContext)
      || careerAnalysisRequestRef.current.pending
      || careerBackgroundTask
    ) return;
    const sequence = careerAnalysisRequestRef.current.sequence + 1;
    careerAnalysisRequestRef.current = {
      context: requestContext,
      notebookId: requestNotebookId,
      pending: true,
      sequence,
    };
    setCareerAnalyzing(true);
    setCareerError("");
    const request = {
      context: requestContext,
      notebookId: requestNotebookId,
      sourceMode: sourceMode === "notebook" || requestNotebookId ? "notebook" : "custom",
      targetRole: cleanText(targetRole, 160),
      topics: parseCareerTopics(topics),
    };
    try {
      const idempotencyKey = createAiIdempotencyKey();
      await runTask({
        academicProfileId: backgroundProfileId,
        execute: async () => {
          const endpoint = request.notebookId
            ? `/api/learning-notebooks/${encodeURIComponent(request.notebookId)}/career-analyze`
            : "/api/learning-notebooks/career-analyze";
          const result = await api.post(
            endpoint,
            {
              ...(request.notebookId ? {} : { context: request.context }),
              targetRole: request.targetRole,
              topics: request.topics,
              privacyConsent: {
                accepted: true,
                version: LEARNING_PRIVACY_CONSENT_VERSION,
              },
            },
            {
              academicProfileId: academicProfileDataId,
              timeoutMs: 120000,
              headers: { "Idempotency-Key": idempotencyKey },
            },
          );
          if (!result?.topicAnalysis) throw new Error("The generated placement analysis was incomplete.");
          return result;
        },
        feature: LEARNING_BACKGROUND_FEATURES.career,
        key: careerTaskKey,
        label: request.targetRole
          ? `Analyzing preparation for ${request.targetRole}`
          : "Analyzing placement preparation",
        meta: { kind: "career", request },
        route: "/learn",
      });
    } catch {
      // The provider retains the failure so this page can present it after remount.
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
    const context = usesCustomPlacementSource
      ? cleanText(careerContext, MAX_PLACEMENT_CONTEXT_CHARS)
      : "";
    const notebookId = usesCustomPlacementSource ? "" : selectedCareerSourceNotebook?.id || "";
    if (usesCustomPlacementSource && !context) {
      setCareerError("Describe the topic or context you want to prepare for.");
      return;
    }
    if (!usesCustomPlacementSource && !notebookId) {
      setCareerError("Choose an available notebook or use your own context.");
      return;
    }
    const request = {
      context,
      notebookId,
      sourceMode: usesCustomPlacementSource ? "custom" : "notebook",
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

  const runMedicalAnalysis = async ({ context, notebookId, sourceMode, trainingFocus, topics }) => {
    if (hasInsufficientCredits(AI_FEATURES.CAREER_ANALYSIS)) {
      setMedicalError(getAiRequestErrorMessage({ code: "AI_USER_QUOTA_EXHAUSTED" }));
      return;
    }

    const requestNotebookId = cleanText(notebookId, 120);
    const requestContext = requestNotebookId
      ? ""
      : cleanText(context, MAX_MEDICAL_CONTEXT_CHARS);
    if (
      (!requestNotebookId && !requestContext)
      || medicalAnalysisRequestRef.current.pending
      || medicalBackgroundTask
    ) return;
    if (requestNotebookId && activeNotebookRef.current?.id !== requestNotebookId) {
      setMedicalError("The medical training source changed. Review the selected source and try again.");
      return;
    }
    const sequence = medicalAnalysisRequestRef.current.sequence + 1;
    medicalAnalysisRequestRef.current = {
      context: requestContext,
      notebookId: requestNotebookId,
      pending: true,
      sequence,
    };
    setMedicalAnalyzing(true);
    setMedicalError("");
    const request = {
      context: requestContext,
      notebookId: requestNotebookId,
      sourceMode: sourceMode === "notebook" || requestNotebookId ? "notebook" : "custom",
      topics: parseCareerTopics(topics),
      trainingFocus: cleanText(trainingFocus, 160),
    };
    try {
      const idempotencyKey = createAiIdempotencyKey();
      await runTask({
        academicProfileId: backgroundProfileId,
        execute: async () => {
          const endpoint = request.notebookId
            ? `/api/learning-notebooks/${encodeURIComponent(request.notebookId)}/medical-training-analyze`
            : "/api/learning-notebooks/medical-training-analyze";
          const result = await api.post(
            endpoint,
            {
              ...(request.notebookId ? {} : { context: request.context }),
              trainingFocus: request.trainingFocus,
              topics: request.topics,
              privacyConsent: {
                accepted: true,
                kind: MEDICAL_TRAINING_PRIVACY_CONSENT_KIND,
                version: MEDICAL_TRAINING_PRIVACY_CONSENT_VERSION,
              },
            },
            {
              academicProfileId: academicProfileDataId,
              timeoutMs: 120000,
              headers: { "Idempotency-Key": idempotencyKey },
            },
          );
          if (!result?.medicalTraining) throw new Error("The generated medical training was incomplete.");
          return result;
        },
        feature: LEARNING_BACKGROUND_FEATURES.medical,
        key: medicalTaskKey,
        label: request.trainingFocus
          ? `Building ${request.trainingFocus} training`
          : "Building medical training",
        meta: { kind: "medical", request },
        route: "/learn",
      });
    } catch {
      // The provider retains the failure so this page can present it after remount.
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
    const context = usesCustomMedicalSource
      ? cleanText(medicalContext, MAX_MEDICAL_CONTEXT_CHARS)
      : "";
    const notebookId = usesCustomMedicalSource ? "" : selectedMedicalSourceNotebook?.id || "";
    if (usesCustomMedicalSource && !context) {
      setMedicalError("Describe the fictional educational context you want to train with.");
      return;
    }
    if (!usesCustomMedicalSource && !notebookId) {
      setMedicalError("Choose an available notebook or type your own context.");
      return;
    }
    const request = {
      context,
      notebookId,
      sourceMode: usesCustomMedicalSource ? "custom" : "notebook",
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

  useEffect(() => {
    const task = notebookBackgroundTask;
    if (!task) return;
    // Background task metadata is held in memory only; restore the form after navigation.
    const request = task.meta?.request;
    if (request && task.status !== "completed") {
      setSubjectName(request.subjectName);
      setScopeDrafts((current) => ({
        ...current,
        [notebookRequirementsKey(request.subjectName)]: request.scopeText ?? (request.topicNames || []).join("\n"),
      }));
      setSources(request.sources || []);
    }
    if (task.status === "running") {
      setNewNotebookOpen(true);
      setIntakeMode("notebook");
      setWorkspaceView("intake");
      setAnalyzing(true);
      setAnalysisError("");
      if (!analysisTimerRef.current) beginAnalysisProgress();
      return;
    }

    const presentationId = `${task.key}:${task.runId}`;
    if (presentedBackgroundRunsRef.current.has(presentationId)) return;
    presentedBackgroundRunsRef.current.add(presentationId);
    setAnalyzing(false);
    if (task.status === "completed") {
      if (!presentNotebookAnalysis(task.result)) {
        setIntakeMode("notebook");
        setWorkspaceView("intake");
        setAnalysisError("The generated notebook could not be opened. Refresh notebook history and try again.");
      }
    } else if (task.status === "failed") {
      setNewNotebookOpen(true);
      if (analysisTimerRef.current) window.clearInterval(analysisTimerRef.current);
      analysisTimerRef.current = null;
      setIntakeMode("notebook");
      setWorkspaceView("intake");
      setAnalysisError(getAiRequestErrorMessage(
        new Error(task.error || "The notebook could not be generated."),
        "The notebook could not be generated.",
      ));
    }
    acknowledgeTask(task.key, task.runId);
  }, [
    acknowledgeTask,
    beginAnalysisProgress,
    notebookBackgroundTask,
    presentNotebookAnalysis,
  ]);

  useEffect(() => {
    const task = careerBackgroundTask;
    if (!task) return;
    const request = task.meta?.request || {};
    const requestNotebookId = cleanText(request.notebookId, 120);
    const requestContext = cleanText(request.context, MAX_PLACEMENT_CONTEXT_CHARS);
    setCareerSourceValue(requestNotebookId
      ? requestNotebookId
      : CUSTOM_PLACEMENT_SOURCE_VALUE);
    setCareerContext(requestNotebookId ? "" : requestContext);
    setCareerRole(cleanText(request.targetRole, 160));
    setCareerTopics(parseCareerTopics(request.topics).join("\n"));
    if (task.status === "running") {
      careerAnalysisRequestRef.current = {
        ...careerAnalysisRequestRef.current,
        context: requestContext,
        notebookId: requestNotebookId,
        pending: true,
      };
      const sourceNotebook = notebooks.find((notebook) => notebook.id === requestNotebookId);
      if (sourceNotebook && activeNotebookRef.current?.id !== sourceNotebook.id) {
        const normalized = normalizeNotebook(sourceNotebook);
        activeNotebookRef.current = normalized;
        setActiveNotebook(normalized);
      }
      setCareerError("");
      setCareerAnalyzing(true);
      setIntakeMode("placement");
      setWorkspaceView("intake");
      return;
    }

    const presentationId = `${task.key}:${task.runId}`;
    if (presentedBackgroundRunsRef.current.has(presentationId)) return;
    presentedBackgroundRunsRef.current.add(presentationId);
    careerAnalysisRequestRef.current = {
      ...careerAnalysisRequestRef.current,
      context: requestContext,
      notebookId: requestNotebookId,
      pending: false,
    };
    setCareerAnalyzing(false);
    if (task.status === "completed") {
      if (!presentCareerAnalysis(task.result, request)) {
        setIntakeMode("placement");
        setWorkspaceView("intake");
        setCareerError("The generated preparation draft could not be opened. Please try again.");
      }
    } else if (task.status === "failed") {
      setIntakeMode("placement");
      setWorkspaceView("intake");
      setCareerError(getAiRequestErrorMessage(
        new Error(task.error || "Placement topics could not be analyzed."),
        "Placement topics could not be analyzed.",
      ));
    }
    acknowledgeTask(task.key, task.runId);
  }, [
    acknowledgeTask,
    careerBackgroundTask,
    notebooks,
    presentCareerAnalysis,
  ]);

  useEffect(() => {
    const task = medicalBackgroundTask;
    if (!task) return;
    const request = task.meta?.request || {};
    const requestNotebookId = cleanText(request.notebookId, 120);
    const requestContext = cleanText(request.context, MAX_MEDICAL_CONTEXT_CHARS);
    const usesNotebookSource = request.sourceMode === "notebook" || Boolean(requestNotebookId);
    setMedicalSourceValue(usesNotebookSource
      ? requestNotebookId
      : CUSTOM_MEDICAL_SOURCE_VALUE);
    setMedicalContext(usesNotebookSource ? "" : requestContext);
    setMedicalFocus(cleanText(request.trainingFocus, 160));
    setMedicalTopics(parseCareerTopics(request.topics).join("\n"));
    if (task.status === "running") {
      medicalAnalysisRequestRef.current = {
        ...medicalAnalysisRequestRef.current,
        context: requestContext,
        notebookId: requestNotebookId,
        pending: true,
      };
      const sourceNotebook = notebooks.find((notebook) => notebook.id === requestNotebookId);
      if (sourceNotebook && activeNotebookRef.current?.id !== sourceNotebook.id) {
        const normalized = normalizeNotebook(sourceNotebook);
        activeNotebookRef.current = normalized;
        setActiveNotebook(normalized);
      }
      setMedicalError("");
      setMedicalAnalyzing(true);
      setIntakeMode("medical");
      setWorkspaceView("intake");
      return;
    }

    const presentationId = `${task.key}:${task.runId}`;
    if (presentedBackgroundRunsRef.current.has(presentationId)) return;
    presentedBackgroundRunsRef.current.add(presentationId);
    medicalAnalysisRequestRef.current = {
      ...medicalAnalysisRequestRef.current,
      context: requestContext,
      notebookId: requestNotebookId,
      pending: false,
    };
    setMedicalAnalyzing(false);
    if (task.status === "completed") {
      if (!presentMedicalAnalysis(task.result, request)) {
        setIntakeMode("medical");
        setWorkspaceView("intake");
        setMedicalError("The generated medical training could not be opened. Please try again.");
      }
    } else if (task.status === "failed") {
      setIntakeMode("medical");
      setWorkspaceView("intake");
      setMedicalError(getAiRequestErrorMessage(
        new Error(task.error || "Medical training could not be generated."),
        "Medical training could not be generated.",
      ));
    }
    acknowledgeTask(task.key, task.runId);
  }, [
    acknowledgeTask,
    medicalBackgroundTask,
    notebooks,
    presentMedicalAnalysis,
  ]);

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

  const enqueueNotebookPatch = useCallback((snapshot, snapshotForSend = () => snapshot) => {
    const request = notebookSaveChainRef.current
      .catch(() => undefined)
      .then(() => api.patch(
        `/api/learning-notebooks/${encodeURIComponent(snapshot.id)}`,
        { notebook: snapshotForSend() },
        { academicProfileId: academicProfileDataId, timeoutMs: 30000 },
      ))
      .then((payload) => {
        notifyLearningNotebookSaved({ academicProfileId: academicProfileDataId, notebookId: snapshot.id });
        return payload;
      });
    notebookSaveChainRef.current = request.catch(() => undefined);
    return request;
  }, [academicProfileDataId]);

  const queueMasteryAutosave = useCallback((snapshot) => {
    if (!snapshot?.id) return;
    const pending = pendingNotebookSavesRef.current;
    const previous = pending.get(snapshot.id);
    if (previous?.timer) window.clearTimeout(previous.timer);
    const entry = { snapshot, timer: null, promise: null, save: null };
    pending.set(snapshot.id, entry);
    setMasterySaving(true);
    const save = async () => {
      entry.timer = null;
      const currentSnapshot = entry.snapshot;
      try {
        const payload = await enqueueNotebookPatch(currentSnapshot, () => {
          // A pin can commit while this save waits behind its request in the chain.
          const latest = activeNotebookRef.current;
          if (latest?.id === snapshot.id) {
            entry.snapshot = { ...entry.snapshot, pinned: latest.pinned === true };
          }
          return entry.snapshot;
        });
        if (!mountedRef.current || pending.get(snapshot.id) !== entry) return;
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
        if (mountedRef.current && pending.get(snapshot.id) === entry) {
          if (activeNotebookRef.current?.id === snapshot.id) setDirty(true);
          setNotification?.(error instanceof Error ? error.message : "Learning progress could not be saved.");
        }
      } finally {
        if (pending.get(snapshot.id) === entry) pending.delete(snapshot.id);
        if (mountedRef.current) setMasterySaving(pending.size > 0);
      }
    };
    entry.save = () => {
      if (!entry.promise) entry.promise = save();
      return entry.promise;
    };
    entry.timer = window.setTimeout(entry.save, 650);
  }, [enqueueNotebookPatch, setNotification]);

  const flushNotebookSave = async (notebookId) => {
    const pending = pendingNotebookSavesRef.current.get(notebookId);
    if (pending) {
      if (pending.timer) window.clearTimeout(pending.timer);
      await pending.save();
    }
    await notebookSaveChainRef.current;
  };

  const updateNotebook = (updater) => {
    const current = activeNotebookRef.current || activeNotebook;
    if (!current?.id) return;
    const next = typeof updater === "function" ? updater(current) : { ...current, ...updater };
    const stamped = { ...next, updatedAt: new Date().toISOString() };
    activeNotebookRef.current = stamped;
    setActiveNotebook(stamped);
    setNotebooks((items) => items.map((item) => item.id === stamped.id ? stamped : item));
    setDirty(true);
    queueMasteryAutosave(stamped);
  };

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
    setActiveTab("recall");
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
            objective: `Recall and explain ${node.title}`,
            mode: "recall",
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
    setNotification?.("Recall session paused and saved. Continue whenever you are ready.");
  };

  const ratingScore = (rating, fallback) => {
    if (Number.isFinite(Number(fallback))) return Number(fallback);
    return { again: 25, hard: 55, good: 82, easy: 100 }[rating] ?? 60;
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
    setLatestReceipt({
      nodeId,
      title: node.title,
      masteryScore: progress?.masteryScore || score,
      summary: score >= 70
        ? "Recall saved and the next review was scheduled."
        : "This attempt was saved and a shorter review interval was scheduled.",
    });
    setNotification?.(
      score >= 70
        ? `${node.title} recalled. The next review is scheduled.`
        : `${node.title} added to your review queue.`,
    );
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

  const persistNotebookHistoryMutation = async (snapshot, {
    errorMessage,
    mutationKey,
    notebookPinned,
    successMessage,
  }) => {
    if (!snapshot?.id || historyBusy) return null;
    setHistoryMutationKey(mutationKey);
    try {
      const isNotebookPin = typeof notebookPinned === "boolean";
      if (isNotebookPin) await flushNotebookSave(snapshot.id);
      const latest = activeNotebookRef.current?.id === snapshot.id ? activeNotebookRef.current : snapshot;
      const baseRevision = latest.updatedAt;
      const submitted = isNotebookPin
        ? { ...latest, pinned: notebookPinned, updatedAt: new Date().toISOString() }
        : snapshot;
      const payload = await enqueueNotebookPatch(submitted);
      const normalized = normalizeNotebook(payload?.notebook || submitted);
      if (isNotebookPin) {
        const pending = pendingNotebookSavesRef.current.get(snapshot.id);
        if (pending) pending.snapshot = { ...pending.snapshot, pinned: normalized.pinned === true };
      }
      const current = activeNotebookRef.current?.id === normalized.id ? activeNotebookRef.current : null;
      const committed = current
        ? isNotebookPin && current.updatedAt !== baseRevision
          ? { ...current, pinned: normalized.pinned === true }
          : normalized
        : null;
      // Retained background saves must receive confirmed metadata even after navigation.
      if (isNotebookPin && committed) activeNotebookRef.current = committed;
      if (!mountedRef.current) return null;
      setNotebooks((current) => current.map((notebook) => (
        notebook.id !== normalized.id ? notebook
          : isNotebookPin && notebook.updatedAt !== baseRevision
            ? { ...notebook, pinned: normalized.pinned === true }
            : normalized
      )));
      if (committed) {
        activeNotebookRef.current = committed;
        setActiveNotebook(committed);
      }
      setNotification?.(successMessage);
      return normalized;
    } catch (error) {
      if (mountedRef.current) {
        setNotification?.(error instanceof Error ? error.message : errorMessage);
      }
      return null;
    } finally {
      if (mountedRef.current) {
        setHistoryMutationKey((current) => current === mutationKey ? "" : current);
      }
    }
  };

  const toggleActiveNotebookPin = async () => {
    if (!activeNotebook?.id) return;
    const nextPinned = activeNotebook.pinned !== true;
    const snapshot = {
      ...activeNotebook,
      pinned: nextPinned,
      updatedAt: new Date().toISOString(),
    };
    await persistNotebookHistoryMutation(snapshot, {
      errorMessage: "The notebook pin could not be updated.",
      mutationKey: `notebook-pin:${activeNotebook.id}`,
      notebookPinned: nextPinned,
      successMessage: nextPinned ? "Notebook pinned to the top of history." : "Notebook unpinned.",
    });
  };

  const toggleCareerHistoryPin = async () => {
    const historyId = activeCareerHistoryEntry?.id || activeCareerDraft?.id;
    if (!activeNotebook?.id || !historyId) return;
    const nextPinned = activeCareerHistoryEntry?.pinned !== true;
    let snapshot;
    try {
      snapshot = setPlacementHistoryPinned(
        activeNotebook,
        historyId,
        nextPinned,
        { updatedAt: new Date().toISOString() },
      );
    } catch (error) {
      setNotification?.(error instanceof Error ? error.message : "The preparation pin could not be updated.");
      return;
    }
    const normalized = await persistNotebookHistoryMutation(snapshot, {
      errorMessage: "The preparation pin could not be updated.",
      mutationKey: `placement-pin:${historyId}`,
      successMessage: nextPinned ? "Preparation guide pinned to the top of history." : "Preparation guide unpinned.",
    });
    if (normalized) setCareerDraft((current) => current?.id === historyId ? null : current);
  };

  const toggleMedicalHistoryPin = async () => {
    const historyId = activeMedicalHistoryEntry?.id || activeMedicalDraft?.id;
    if (!activeNotebook?.id || !historyId) return;
    const nextPinned = activeMedicalHistoryEntry?.pinned !== true;
    let snapshot;
    try {
      snapshot = setMedicalTrainingHistoryPinned(
        activeNotebook,
        historyId,
        nextPinned,
        { updatedAt: new Date().toISOString() },
      );
    } catch (error) {
      setNotification?.(error instanceof Error ? error.message : "The Medical training pin could not be updated.");
      return;
    }
    const normalized = await persistNotebookHistoryMutation(snapshot, {
      errorMessage: "The Medical training pin could not be updated.",
      mutationKey: `medical-pin:${historyId}`,
      successMessage: nextPinned ? "Medical training pinned to the top of history." : "Medical training unpinned.",
    });
    if (normalized) setMedicalDraft((current) => current?.id === historyId ? null : current);
  };

  const deletePreparationHistoryItem = async (note, kind) => {
    const notebook = notebooks.find((item) => item.id === note?.notebookId);
    if (!notebook?.id || !note?.historyId || historyBusy) return;
    const now = new Date().toISOString();
    const snapshot = kind === "medical"
      ? deleteMedicalTrainingHistoryEntry(notebook, note.historyId, { updatedAt: now })
      : deletePlacementHistoryEntry(notebook, note.historyId, { updatedAt: now });
    setDeletingId(note.id);
    const normalized = await persistNotebookHistoryMutation(snapshot, {
      errorMessage: kind === "medical"
        ? "The Medical training history item could not be deleted."
        : "The placement history item could not be deleted.",
      mutationKey: `${kind}-delete:${note.historyId}`,
      successMessage: kind === "medical"
        ? "Medical training history item deleted."
        : "Placement history item deleted.",
    });
    if (normalized) {
      const wasActive = activeNotebook?.id === note.notebookId && (
        kind === "medical"
          ? activeMedicalHistoryEntry?.id === note.historyId
          : activeCareerHistoryEntry?.id === note.historyId
      );
      if (wasActive) {
        const nextEntry = kind === "medical"
          ? getMedicalTrainingHistoryEntry(normalized)
          : getPlacementHistoryEntry(normalized);
        if (kind === "medical") setActiveMedicalHistoryId(nextEntry?.id || "");
        else setActiveCareerHistoryId(nextEntry?.id || "");
        if (!nextEntry) setWorkspaceView("intake");
      }
      setDeleteCandidateId("");
    }
    if (mountedRef.current) setDeletingId("");
  };

  const clearCurrentHistory = async () => {
    const kind = activeArtifactKind;
    if (!kind || historyBusy) return false;
    const targets = kind === "notebook"
      ? notebookHistory
      : kind === "placement"
        ? notebooks.filter((notebook) => getSavedPlacementNotes([notebook]).length > 0)
        : notebooks.filter((notebook) => getSavedMedicalTrainingNotes([notebook]).length > 0);
    if (!targets.length) return true;
    setClearingHistory(true);
    const now = new Date().toISOString();
    const results = await Promise.allSettled(targets.map(async (notebook) => {
      if (kind === "notebook") {
        await flushNotebookSave(notebook.id);
        await api.delete(`/api/learning-notebooks/${encodeURIComponent(notebook.id)}`, {
          academicProfileId: academicProfileDataId,
          timeoutMs: 30000,
        });
        return { deleted: true, id: notebook.id };
      }
      const snapshot = kind === "placement"
        ? clearPlacementHistory(notebook, { updatedAt: now })
        : clearMedicalTrainingHistory(notebook, { updatedAt: now });
      const payload = await patchLearningNotebookSnapshot(snapshot, academicProfileDataId);
      return { deleted: false, id: notebook.id, notebook: normalizeNotebook(payload?.notebook || snapshot) };
    }));

    if (mountedRef.current) {
      const completed = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      setNotebooks((current) => {
        if (kind === "notebook") {
          const deletedIds = new Set(completed.map((item) => item.id));
          return current.filter((notebook) => !deletedIds.has(notebook.id));
        }
        const replacements = new Map(completed.map((item) => [item.id, item.notebook]));
        return current.map((notebook) => replacements.get(notebook.id) || notebook);
      });
      const failedCount = results.length - completed.length;
      if (kind === "notebook" && completed.some((item) => item.id === activeNotebook?.id)) {
        activeNotebookRef.current = null;
        setActiveNotebook(null);
        setWorkspaceView("intake");
      } else if (kind === "placement") {
        setCareerDraft(null);
        setActiveCareerHistoryId("");
        if (workspaceView === "career") setWorkspaceView("intake");
      } else if (kind === "medical") {
        setMedicalDraft(null);
        setActiveMedicalHistoryId("");
        if (workspaceView === "medical") setWorkspaceView("intake");
      }
      setClearHistoryCandidate("");
      if (kind === "notebook" && completed.length) notifyLearningNotebookSaved({ academicProfileId: academicProfileDataId });
      setNotification?.(failedCount
        ? `${completed.length} history item source${completed.length === 1 ? "" : "s"} cleared; ${failedCount} could not be cleared.`
        : `${kind === "notebook" ? "Notebook" : kind === "placement" ? "Placement" : "Medical training"} history cleared.`);
      setClearingHistory(false);
    }
    return results.every((result) => result.status === "fulfilled");
  };

  const deleteNotebook = async (notebookId) => {
    if (careerAnalyzing || historyBusy || medicalAnalyzing || saving) return false;
    setDeletingId(notebookId);
    try {
      await flushNotebookSave(notebookId);
      await api.delete(`/api/learning-notebooks/${encodeURIComponent(notebookId)}`, {
        academicProfileId: academicProfileDataId,
        timeoutMs: 30000,
      });
      if (!mountedRef.current) return true;
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
        setActiveCareerHistoryId("");
        setActiveMedicalHistoryId("");
        setWorkspaceView("intake");
      }
      setDeleteCandidateId("");
      notifyLearningNotebookSaved({ academicProfileId: academicProfileDataId, notebookId });
      setNotification?.("Learning notebook deleted.");
      return true;
    } catch (error) {
      if (mountedRef.current) {
        setNotification?.(error instanceof Error ? error.message : "The notebook could not be deleted.");
      }
      return false;
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

      addHeading("Notebook content", 15);
      activeNotebook.chapters.forEach((chapter) => chapter.topics.forEach((topic) => {
        addHeading(topic.title, 11.5);
        addParagraph(topic.explanation || topic.summary);
        topic.keyPoints.forEach((point) => addParagraph(`• ${point}`, { indent: 3 }));
        topic.examples.forEach((example) => addParagraph(example, { indent: 3 }));
        topic.subtopics.forEach((subtopic) => {
          addHeading(subtopic.title, 10.5);
          addParagraph(subtopic.explanation || subtopic.summary);
          subtopic.keyPoints.forEach((point) => addParagraph(`• ${point}`, { indent: 3 }));
          subtopic.examples.forEach((example) => addParagraph(example, { indent: 3 }));
        });
        [topic.applications, topic.commonMistakes, topic.revisionTips].forEach((points) => {
          points.forEach((point) => addParagraph(`• ${point}`, { indent: 3 }));
        });
      }));

      const legacyTopicIds = new Set(activeNotebook.chapters.flatMap((chapter) => chapter.topics)
        .filter((topic) => !topic.explanation?.trim()).map((topic) => topic.id));
      const savedNotes = activeNotebook.revisedNotes.filter((note) => {
        const references = getRevisedNoteTopicIds(note, activeNotebook);
        return references.length !== 1 || references.some((id) => legacyTopicIds.has(id));
      });
      if (savedNotes.length) {
        addHeading("Saved notes", 15);
        savedNotes.forEach((note) => {
          addHeading(note.title, 11.5);
          addParagraph(note.content);
          [...note.keyPoints, ...note.revisionTips].forEach((point) => addParagraph(`• ${point}`, { indent: 3 }));
        });
      }

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

  const setTopicCompletion = (topic, complete) => {
    updateNotebook((current) => setNotebookTopicCompleted(current, topic.id, complete));
    const plannerCompletion = setLearningPlannerNodeCompletion(schedule, completed, activeLearningProject, topic, complete);
    if (plannerCompletion) setCompleted?.(plannerCompletion.completed);
  };

  const closePlannerDialog = () => {
    setPlannerDialogOpen(false);
    setPlannerCustomNode(null);
    setPlannerError("");
  };

  const openPlannerForNode = (node) => {
    if (!node) return false;
    const availableDates = requirePlannerDates();
    if (!availableDates.length) return false;
    const isNotebookNode = nodes.some((item) => item.id === node.id);
    if (isNotebookNode) setSelectedNodeId(node.id);
    setPlannerCustomNode(isNotebookNode ? null : node);
    setPlannerNodeId(node.id);
    setPlannerDateKey(availableDates[0].dateKey);
    setPlannerError("");
    setPlannerDialogOpen(true);
    return true;
  };

  const requirePlannerDates = () => {
    const availability = getLearningPlannerAvailability(schedule, scheduleStartDate);
    if (availability.dateOptions.length) {
      toast.dismiss(PLANNER_REQUIRED_NOTICE_ID);
      return availability.dateOptions;
    }

    closePlannerDialog();
    toast.info(({ closeToast }) => (
      <div className="learning-planner-notice">
        <strong>{availability.message}</strong>
        <p>{availability.detail}</p>
        <button onClick={() => { closeToast(); navigate("/planner"); }} type="button">
          Open Planner <ChevronRight size={14} aria-hidden="true" />
        </button>
      </div>
    ), {
      toastId: PLANNER_REQUIRED_NOTICE_ID,
      autoClose: 8000,
      closeOnClick: false,
      pauseOnFocusLoss: true,
      role: "status",
      icon: <CalendarPlus size={22} aria-hidden="true" />,
    });
    return [];
  };

  const placementActionTarget = (topic, item, kind, index) => buildPlacementActionTarget({
    codingRelevant: activeNotebook?.careerPreparation?.codingRelevant,
    index,
    item,
    kind,
    notebook: activeNotebook,
    preparationSource: activeCareerHistoryEntry?.preparationSource
      || activeCareerDraft?.preparationSource,
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
        autoSend: true,
        createNewChat: true,
        message: buildPlacementChatPrompt({
          notebook: activeNotebook,
          preparationSource: activeCareerHistoryEntry?.preparationSource
            || activeCareerDraft?.preparationSource,
          target,
          targetRole: careerAnalysis?.targetRole || careerRole,
          topic,
        }),
      },
    }));
  };

  const openPlacementItemInCodeMatrix = (target, topic) => {
    if (!codeMatrixEligibility.eligible || typeof onOpenCodeMatrix !== "function") return;
    const handoff = buildPlacementCodeMatrixHandoff({
      fallbackLanguage: codeMatrixEligibility.defaultLanguage,
      notebook: activeNotebook,
      target,
      topic,
    });
    if (!handoff) return;
    onOpenCodeMatrix(handoff);
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
      setNotification?.("Wait for this Medical training to finish saving to history before opening its study coach.");
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
  const addToPlanner = () => {
    if (!requirePlannerDates().length) return;
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

  const noSavedNotebooks = !notebooksLoading && !notebooksError && notebookHistory.length === 0;
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
  const medicalIntakeOpen = workspaceView === "intake" && intakeMode === "medical";
  return (
    <div className={`learning-page${medicalIntakeOpen ? " is-medical-intake" : ""}`}>
      <CodeMatrixSetupReturn step="notebook" complete={getCodeMatrixSetupSteps({ notebooks: notebookHistory })[1].complete} subjectName={subjectName} />
      {workspaceView === "medical" && (
        <nav className="learning-workspace-compact-controls" aria-label="Opened learning workspace controls">
          <button
            aria-label="Back to Start Learning home"
            className="learning-workspace-return-button"
            onClick={returnToPreparationChoice}
            title="Back to Start Learning home"
            type="button"
          >
            <ArrowLeft aria-hidden="true" size={16} />
            <span>Back to Start Learning</span>
          </button>
        </nav>
      )}

      {intakeMode === "notebook" && workspaceView === "intake" ? (
        <NotebookLibrary notebooks={notebookHistory} loading={notebooksLoading} error={notebooksError} onRetry={loadNotebooks}
          onOpen={selectNotebook} onNew={() => setNewNotebookOpen(true)} onBack={returnToPreparationChoice}
          onDelete={(notebook) => deleteNotebook(notebook.id)} onDeleteAll={clearCurrentHistory} busy={historyBusy || Boolean(deletingId) || analyzing}
          completionForNotebook={getNotebookCompletionSummary} shortcutsEnabled={!newNotebookOpen && !privacyConsentOpen} />
      ) : (
      <div className={`learning-workspace is-${workspaceView}${intakeMode === null ? " is-choice-home" : ""}`}>
        <aside
          aria-label={activeArtifactKind ? "Sources and learning history" : "Learning workspace choices"}
          className="learning-source-rail"
        >
          <section
            className={intakeMode === null
              ? "learning-intake-source-panel is-workspace-choice"
              : "card learning-intake-source-panel"}
            id={intakeMode === "medical" ? "medical-training" : "placement-prep"}
          >
          {intakeMode === null ? (
            <div className={`learning-intake-choice is-count-${workspaceChoiceCount}`}>
              <div className="learning-panel-heading learning-intake-choice-heading">
                <h2 className="learning-intake-choice-title">Choose a workspace</h2>
              </div>
              <div className="learning-intake-choice-grid">
                {codeMatrixEligibility.eligible && (
                  <button
                    className="learning-intake-choice-card is-code-matrix"
                    onClick={() => navigate(CODE_MATRIX_PATH)}
                    type="button"
                  >
                    <span><Code2 aria-hidden="true" size={21} /></span>
                    <strong>CodeMatrix</strong>
                    <small>Write, run, and debug your code. See the result in one workspace.</small>
                    <em>Open compiler</em>
                    <ChevronRight aria-hidden="true" size={18} />
                  </button>
                )}
                <button
                  className="learning-intake-choice-card is-notebook"
                  onClick={openNotebookIntake}
                  type="button"
                >
                  <span><BookOpenCheck aria-hidden="true" size={21} /></span>
                  <strong>Notebook preparation</strong>
                  <small>Build subject notes from files, chapters, topics, or a prompt.</small>
                  <em>{notebookHistory.length} in history</em>
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
                    <small>Analyze role-specific topics and build a focused interview guide.</small>
                    <em>{savedPlacementNotes.length} in history</em>
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
                    <em>{savedMedicalTrainingNotes.length} in history</em>
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
              <div className="learning-intake-flow-actions">
                {intakeMode === "notebook" && (
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
                    <Target aria-hidden="true" size={15} />
                  </button>
                )}
                <button
                  aria-label="Back to preparation choices"
                  className="learning-intake-return-button"
                  onClick={returnToPreparationChoice}
                  type="button"
                >
                  <ArrowLeft size={15} /> Back
                </button>
              </div>
            </div>
          )}
          {intakeMode === "medical" ? (
          <MedicalTrainingLabIntake
            analyzing={medicalAnalyzing}
            canAnalyze={Boolean(
              (usesCustomMedicalSource
                ? cleanText(medicalContext, MAX_MEDICAL_CONTEXT_CHARS)
                : selectedMedicalSourceNotebook?.id)
              && parseCareerTopics(medicalTopics).length
              && !medicalAnalyzing
              && !saving
              && !hasInsufficientCredits(AI_FEATURES.CAREER_ANALYSIS)
            )}
            context={medicalContext}
            error={medicalError}
            focus={medicalFocus}
            notebooks={courseNotebooks}
            notebooksLoading={notebooksLoading}
            onAnalyze={analyzeMedicalTopics}
            onContextChange={(value) => {
              setMedicalContext(value);
              setMedicalError("");
            }}
            onFocusChange={(value) => {
              setMedicalFocus(value);
              setMedicalError("");
            }}
            onNotebookChange={selectMedicalNotebook}
            onQuickAdd={addMedicalTopic}
            onSourceModeChange={selectMedicalTrainingSource}
            onTopicsChange={(value) => {
              setMedicalTopics(value);
              setMedicalError("");
            }}
            saving={saving}
            selectedNotebookId={selectedMedicalSourceNotebook?.id || ""}
            sourceMode={usesCustomMedicalSource ? "custom" : "notebook"}
            suggestedTopics={MEDICAL_TRAINING_STARTERS}
            topics={medicalTopics}
          />
          ) : intakeMode === "placement" ? (
          <div className="learning-placement-intake">
            <div className="learning-panel-heading">
              <div>
                <h3>Build your placement preparation</h3>
                <p>
                  Use a saved notebook or type your own context, then choose the interview topics
                  you want explained.
                </p>
              </div>
            </div>

            <div className="learning-placement-source-role-row">
              <fieldset className="learning-placement-source">
                <legend>Preparation source</legend>
                <div className="learning-placement-source-options">
                  <label className={usesCustomPlacementSource ? "is-selected" : ""}>
                    <input
                      checked={usesCustomPlacementSource}
                      disabled={careerAnalyzing || saving}
                      name="placement-source-mode"
                      onChange={() => selectCareerPreparationSource(CUSTOM_PLACEMENT_SOURCE_VALUE)}
                      type="radio"
                    />
                    <FileText aria-hidden="true" size={14} />
                    <span>Type context</span>
                  </label>
                  <label className={!usesCustomPlacementSource ? "is-selected" : ""}>
                    <input
                      checked={!usesCustomPlacementSource}
                      disabled={careerAnalyzing || saving || notebooksLoading || !courseNotebooks.length}
                      name="placement-source-mode"
                      onChange={() => selectCareerPreparationSource(notebookHistory[0]?.id || CUSTOM_PLACEMENT_SOURCE_VALUE)}
                      type="radio"
                    />
                    <BookOpenCheck aria-hidden="true" size={14} />
                    <span>Saved notebook</span>
                  </label>
                </div>
              </fieldset>
              <label className="learning-field learning-placement-role">
                <span>Target role</span>
                <input
                  aria-describedby="learning-placement-role-suggestion"
                  disabled={careerAnalyzing || saving}
                  onChange={(event) => setCareerRole(event.target.value)}
                  onKeyDown={completeSuggestedCareerRole}
                  placeholder={usesCustomPlacementSource
                    ? `e.g. ${curriculumExamples.placementRolePlaceholder}`
                    : `Suggested: ${careerRoleSuggestion}`}
                  value={careerRole}
                />
                <span className="sr-only" id="learning-placement-role-suggestion">
                  {usesCustomPlacementSource
                    ? "Enter the role you are preparing for."
                    : `Suggested from the selected notebook: ${careerRoleSuggestion}. Type the beginning and press Tab to complete it.`}
                </span>
              </label>
            </div>

            {usesCustomPlacementSource ? (
              <label className="learning-field">
                <span>Your context</span>
                <textarea
                  className="learning-placement-context"
                  disabled={careerAnalyzing || saving}
                  maxLength={MAX_PLACEMENT_CONTEXT_CHARS}
                  onChange={(event) => {
                    setCareerContext(event.target.value);
                    setCareerError("");
                  }}
                  placeholder="e.g. TCP/IP networking for a backend engineering interview, with emphasis on HTTP, routing, and API troubleshooting"
                  rows={3}
                  value={careerContext}
                />
              </label>
            ) : (
              <label className="learning-field">
                <span>Notebook</span>
                <select
                  disabled={careerAnalyzing || saving || notebooksLoading}
                  onChange={(event) => selectCareerPreparationSource(event.target.value)}
                  value={selectedCareerSourceNotebook?.id || ""}
                >
                  {notebookHistory.map((notebook) => (
                    <option key={notebook.id} value={notebook.id}>{notebook.title}</option>
                  ))}
                </select>
                <small>The selected notebook is used as the preparation context.</small>
              </label>
            )}

            <label className="learning-field learning-placement-topics">
              <span>Topics to analyze</span>
              <textarea
                disabled={careerAnalyzing || saving}
                onChange={(event) => setCareerTopics(event.target.value)}
                placeholder={curriculumExamples.placementTopicsPlaceholder}
                rows={6}
                value={careerTopics}
              />
              <small>Separate topics with commas or new lines. Add up to 12.</small>
            </label>

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
            {careerAnalyzing ? (
              <LatticeLoader className="generation-lattice-loader" label="Analyzing preparation topics" />
            ) : (
              <button
                className="learning-career-analyze"
                disabled={
                  saving
                  || (usesCustomPlacementSource
                    ? !cleanText(careerContext, MAX_PLACEMENT_CONTEXT_CHARS)
                    : !selectedCareerSourceNotebook)
                  || !parseCareerTopics(careerTopics).length
                  || hasInsufficientCredits(AI_FEATURES.CAREER_ANALYSIS)
                }
                onClick={analyzeCareerTopics}
                type="button"
              >
                <BrainCircuit size={17} />
                Analyze preparation topics
                <AiCreditCost feature={AI_FEATURES.CAREER_ANALYSIS} />
              </button>
            )}
          </div>
          ) : null}
          </section>
          {activeArtifactKind && (
          savedPanelEmpty ? (
            <p className={activeArtifactKind === "placement"
              ? "learning-placement-history-empty"
              : activeArtifactKind === "medical"
                ? "learning-medical-history-empty"
                : "learning-notebook-history-empty"}>
              {activeArtifactKind === "placement"
                ? "Your preparation history appears here."
                : activeArtifactKind === "medical"
                  ? "Your training histories appears here."
                  : "Your notebook history appears here."}
            </p>
          ) : (
          <section className="card learning-saved-panel">
            <div className="learning-saved-heading">
              <div>
                {activeArtifactKind === "placement" ? <BriefcaseBusiness aria-hidden="true" size={16} />
                  : activeArtifactKind === "medical" ? <Stethoscope aria-hidden="true" size={16} />
                    : <Layers3 aria-hidden="true" size={16} />}
                <strong>
                  {activeArtifactKind === "placement" ? "Placement history"
                    : activeArtifactKind === "medical" ? "Medical training history"
                      : "Notebook history"}
                </strong>
              </div>
              <span className="learning-history-global-actions">
                {notebooksLoading && <LoaderCircle aria-label="Loading history" className="spinner" size={15} />}
                {activeArtifactKind && !savedPanelEmpty && (clearHistoryCandidate === activeArtifactKind ? (
                  <span className="learning-delete-confirm">
                    <button
                      aria-label={`Confirm clearing ${activeArtifactKind} history`}
                      disabled={clearingHistory}
                      onClick={clearCurrentHistory}
                      type="button"
                    >
                      {clearingHistory ? <LoaderCircle className="spinner" size={13} /> : <Check size={13} />}
                    </button>
                    <button
                      aria-label="Cancel clearing history"
                      disabled={clearingHistory}
                      onClick={() => setClearHistoryCandidate("")}
                      type="button"
                    >
                      <X size={13} />
                    </button>
                  </span>
                ) : (
                  <button
                    aria-label={`Clear ${activeArtifactKind} history`}
                    className="learning-history-clear"
                    disabled={historyBusy}
                    onClick={() => setClearHistoryCandidate(activeArtifactKind)}
                    title="Clear this history"
                    type="button"
                  >
                    <Trash2 size={14} />
                  </button>
                ))}
              </span>
            </div>
            {notebooksError && (
              <div className="learning-rail-empty">
                <p>{notebooksError}</p>
                <button onClick={loadNotebooks} type="button">Retry</button>
              </div>
            )}
            {activeArtifactKind === "notebook" && (
              <div className="learning-notebook-list">
                {notebookHistory.map((notebook) => (
                  <article
                    className={`learning-notebook-row${notebook.pinned ? " is-pinned" : ""}${activeNotebook?.id === notebook.id && workspaceView === "notebook" ? " is-active" : ""}`}
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
                        <strong className="learning-history-title">
                          <span>{notebook.title}</span>
                          {notebook.pinned && <Pin aria-label="Pinned" fill="currentColor" size={12} />}
                        </strong>
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
                        <button aria-label="Cancel delete" disabled={careerAnalyzing || saving} onClick={() => setDeleteCandidateId("")} type="button">
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
                {savedPlacementNotes.map((note) => {
                  const isActive = activeNotebook?.id === note.notebookId
                    && activeCareerHistoryEntry?.id === note.historyId
                    && workspaceView === "career";
                  return (
                    <article className={`learning-notebook-row is-placement${note.pinned ? " is-pinned" : ""}${isActive ? " is-active" : ""}`} key={note.id}>
                      <button
                        aria-current={isActive ? "page" : undefined}
                        className="learning-notebook-select"
                        disabled={careerAnalyzing || saving}
                        onClick={() => openSavedPlacementNote(note)}
                        type="button"
                      >
                        <span><BriefcaseBusiness aria-hidden="true" size={16} /></span>
                        <span>
                          <strong className="learning-history-title">
                            <span>{note.title}</span>
                            {note.pinned && <Pin aria-label="Pinned" fill="currentColor" size={12} />}
                          </strong>
                          <small>{note.topicCount} topics · {formatNotebookDate(note.updatedAt)}</small>
                          <small className="learning-placement-source-label">
                            {placementHistorySourceLabel(note)}
                          </small>
                        </span>
                      </button>
                      {deleteCandidateId === note.id ? (
                        <div className="learning-delete-confirm">
                          <button aria-label={`Confirm deleting ${note.title}`} disabled={saving || deletingId === note.id} onClick={() => deletePreparationHistoryItem(note, "placement")} type="button">
                            {deletingId === note.id ? <LoaderCircle className="spinner" size={13} /> : <Check size={13} />}
                          </button>
                          <button aria-label="Cancel delete" disabled={saving} onClick={() => setDeleteCandidateId("")} type="button"><X size={13} /></button>
                        </div>
                      ) : (
                        <button aria-label={`Delete ${note.title}`} className="learning-notebook-delete" disabled={saving} onClick={() => setDeleteCandidateId(note.id)} type="button"><Trash2 size={13} /></button>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
            {activeArtifactKind === "medical" && (
              <div className="learning-notebook-list">
                {savedMedicalTrainingNotes.map((note) => {
                  const isActive = activeNotebook?.id === note.notebookId
                    && activeMedicalHistoryEntry?.id === note.historyId
                    && workspaceView === "medical";
                  return (
                    <article className={`learning-notebook-row is-medical${note.pinned ? " is-pinned" : ""}${isActive ? " is-active" : ""}`} key={note.id}>
                      <button
                        aria-current={isActive ? "page" : undefined}
                        className="learning-notebook-select"
                        disabled={medicalAnalyzing || saving}
                        onClick={() => openSavedMedicalTraining(note)}
                        type="button"
                      >
                        <span><Stethoscope aria-hidden="true" size={16} /></span>
                        <span>
                          <strong className="learning-history-title">
                            <span>{note.title}</span>
                            {note.pinned && <Pin aria-label="Pinned" fill="currentColor" size={12} />}
                          </strong>
                          <small>{note.topicCount} modules · {formatNotebookDate(note.updatedAt)}</small>
                          <small className="learning-placement-source-label">From {note.notebook.title}</small>
                        </span>
                      </button>
                      {deleteCandidateId === note.id ? (
                        <div className="learning-delete-confirm">
                          <button aria-label={`Confirm deleting ${note.title}`} disabled={saving || deletingId === note.id} onClick={() => deletePreparationHistoryItem(note, "medical")} type="button">
                            {deletingId === note.id ? <LoaderCircle className="spinner" size={13} /> : <Check size={13} />}
                          </button>
                          <button aria-label="Cancel delete" disabled={saving} onClick={() => setDeleteCandidateId("")} type="button"><X size={13} /></button>
                        </div>
                      ) : (
                        <button aria-label={`Delete ${note.title}`} className="learning-notebook-delete" disabled={saving} onClick={() => setDeleteCandidateId(note.id)} type="button"><Trash2 size={13} /></button>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
          )
          )}
        </aside>

        <section className="learning-notebook-stage" aria-live="polite">
          {analyzing ? (
            <div className="learning-analysis-copy">
              <h3>{ANALYSIS_STEPS[analysisStep]}</h3>
              <p>PrepMatrix is organizing the source into a clean study path. You can keep this page open.</p>
            </div>
          ) : !activeNotebook || isLearningWorkspaceNotebook(activeNotebook) ? (
            <div className="card learning-empty-stage">
              <div className="learning-empty-visual" aria-hidden="true">
                <span><FileText size={26} /></span>
                <span><BrainCircuit size={30} /></span>
                <span><BookOpenCheck size={26} /></span>
              </div>
              <span className="section-tag">Notebook preparation</span>
              <h3>Build a focused revision notebook</h3>
              <p>
                Enter your requirements or add a source. PrepMatrix will create revised notes,
                and a mastery map you can use for recall practice.
              </p>
              <div className="learning-empty-features">
                <span><FileText size={15} /> Revised notes</span>
                <span><BrainCircuit size={15} /> Mastery map</span>
              </div>
            </div>
          ) : (
            <>
              <section className="card learning-notebook-header">
                <div className="learning-notebook-header-copy">
                  <h2>{activeNotebook.title}</h2>
                  <p>{activeNotebook.summary || `${activeNotebook.subjectName} organized into a focused revision notebook.`}</p>
                  <div className="learning-notebook-meta">
                    <span>{activeNotebook.subjectName}</span>
                    <span>{getNotebookCompletionSummary(activeNotebook).totalTopics} topics</span>
                    <span>{getNotebookCompletionSummary(activeNotebook).percent}% completed</span>
                    {dirty && <span className="is-unsaved">Changes pending</span>}
                    {masterySaving && <span className="is-saving">Saving changes...</span>}
                  </div>
                </div>
                <button
                  aria-label="Back to notebooks home"
                  className="learning-workspace-return-button is-inside-card"
                  onClick={openNotebookIntake}
                  title="Back to notebooks home"
                  type="button"
                >
                  <ArrowLeft aria-hidden="true" size={16} />
                  <span>Back to notebooks</span>
                </button>
                <div className="learning-header-actions" aria-label="Notebook actions">
                  <button
                    aria-label={activeNotebook.pinned ? "Unpin notebook" : "Pin notebook"}
                    aria-pressed={activeNotebook.pinned === true}
                    disabled={saving}
                    onClick={toggleActiveNotebookPin}
                    title={activeNotebook.pinned ? "Unpin from history" : "Pin to top of history"}
                    type="button"
                  >
                    {historyMutationKey === `notebook-pin:${activeNotebook.id}`
                      ? <LoaderCircle className="spinner" size={16} />
                      : <Pin fill={activeNotebook.pinned ? "currentColor" : "none"} size={16} />}
                    {historyMutationKey === `notebook-pin:${activeNotebook.id}`
                      ? "Updating…"
                      : activeNotebook.pinned ? "Unpin notebook" : "Pin notebook"}
                  </button>
                  <button aria-label="Export notebook PDF" disabled={exporting} onClick={exportNotebook} title="Export PDF" type="button">
                    {exporting ? <LoaderCircle className="spinner" size={16} /> : <Download size={16} />}
                    {exporting ? "Exporting…" : "Export PDF"}
                  </button>
                </div>
              </section>

              <section className="card learning-content-card">
                <div className="learning-tablist" role="tablist" aria-label="Notebook views">
                  {[
                    ["notes", "Notebook content", <FileText aria-hidden="true" key="notes-icon" size={15} />],
                    ["map", "Mastery map", <BrainCircuit aria-hidden="true" key="map-icon" size={15} />],
                    ["recall", "Recall session", <Target aria-hidden="true" key="recall-icon" size={15} />],
                  ].map(([tabId, label, icon]) => (
                    <button
                      aria-controls={`learning-${tabId}-panel`}
                      aria-selected={activeTab === tabId}
                      className={activeTab === tabId ? "is-active" : ""}
                      id={`learning-${tabId}-tab`}
                      key={tabId}
                      onClick={() => setActiveTab(tabId)}
                      role="tab"
                      type="button"
                    >
                      {icon} {label}
                    </button>
                  ))}
                </div>

                <div className="learning-tab-panels">
                  <div {...learningTabPanelProps(activeTab, "recall", "learning-recall-view")}>
                    <LearningRecallSession
                      activeSession={activeLearningSession}
                      latestReceipt={latestReceipt}
                      nodes={nodes}
                      notebook={activeNotebook}
                      onFinishSession={finishStudySession}
                      onOpenNotes={() => setActiveTab("notes")}
                      onPauseSession={pauseStudySession}
                      onSelectNode={setSelectedNodeId}
                      onStartSession={startStudySession}
                      progressByNodeId={progressByNodeId}
                      reviewQueue={reviewQueue}
                      selectedNode={selectedNode}
                    />
                  </div>
                  <div {...learningTabPanelProps(activeTab, "notes", "learning-notes-view")}>
                    <NotebookContent notebook={activeNotebook} completionByTopic={getNotebookCompletionSummary(activeNotebook).completionByTopic}
                      onComplete={setTopicCompletion} onPlanner={openPlannerForNode} onSave={saveLearningTopicToNotes} isSaving={isLearningNoteSaving}
                      onRecall={(topic) => { setActiveTab("recall"); startStudySession(topic.id); }} />
                  </div>

                  <div {...learningTabPanelProps(activeTab, "map", "learning-map-view")}>

                    <LearningMasteryMap
                      notebook={activeNotebook}
                      onSelectNode={setSelectedNodeId}
                      onStartNode={(nodeId) => {
                        setSelectedNodeId(nodeId);
                        setActiveTab("recall");
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
                          <Target size={14} /> Recall this concept
                        </button>
                        <button disabled={isLearningNoteSaving(selectedNode)} onClick={() => saveLearningTopicToNotes(selectedNode)} type="button">
                          <Save size={14} /> {isLearningNoteSaving(selectedNode) ? "Saving..." : "Save to notes"}
                        </button>
                        <button aria-pressed={getNotebookCompletionSummary(activeNotebook).completionByTopic[selectedNode.id] === true}
                          className={`learning-completion-action${getNotebookCompletionSummary(activeNotebook).completionByTopic[selectedNode.id] ? " is-complete" : ""}`}
                          onClick={() => setTopicCompletion(selectedNode, !getNotebookCompletionSummary(activeNotebook).completionByTopic[selectedNode.id])} type="button">
                          <Check size={14} />{getNotebookCompletionSummary(activeNotebook).completionByTopic[selectedNode.id] ? "Completed" : "Mark completed"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </section>

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
              onTogglePin={toggleMedicalHistoryPin}
              onSaveItem={saveMedicalItem}
              pinned={activeMedicalHistoryEntry?.pinned === true}
              saving={historyMutationKey.startsWith("medical:") || historyMutationKey.startsWith("medical-pin:")}
              suggestedTopics={MEDICAL_TRAINING_STARTERS}
              topicCount={parseCareerTopics(medicalTopics).length}
            />
          </section>
        )}
        {activeNotebook && careerVisible && (
          <section className="learning-career-workspace" aria-label="Placement and internship preparation">
            <header className="learning-career-intro">
              <div className="learning-career-intro-copy">
                <h2>Prepare for the questions that matter</h2>
              </div>
              {!careerAnalysisReady && (
                <button
                  aria-label="Back to Start Learning home"
                  className="learning-workspace-return-button"
                  onClick={returnToPreparationChoice}
                  title="Back to Start Learning home"
                  type="button"
                >
                  <ArrowLeft aria-hidden="true" size={16} />
                  <span>Back to Start Learning</span>
                </button>
              )}
            </header>

            {careerAnalysisReady && (
              <section className="card learning-career-results" aria-live="polite">
                <div className="learning-panel-heading">
                  <div>
                    <span className="section-tag"><Check size={13} /> Preparation guide</span>
                    <h3>{careerAnalysis.targetRole || careerRole || "Placement preparation"}</h3>
                    <p>{careerAnalysis.overview}</p>
                  </div>
                  <div className="learning-career-results-actions">
                    <button
                      aria-label={activeCareerHistoryEntry?.pinned ? "Unpin placement preparation" : "Pin placement preparation"}
                      aria-pressed={activeCareerHistoryEntry?.pinned === true}
                      className="learning-career-save"
                      disabled={saving || careerAnalyzing}
                      onClick={toggleCareerHistoryPin}
                      title={activeCareerHistoryEntry?.pinned ? "Unpin from history" : "Pin to top of history"}
                      type="button"
                    >
                      {historyMutationKey.startsWith("placement:") || historyMutationKey.startsWith("placement-pin:")
                        ? <LoaderCircle className="spinner" size={16} />
                        : <Pin fill={activeCareerHistoryEntry?.pinned ? "currentColor" : "none"} size={16} />}
                      <span>
                        {historyMutationKey.startsWith("placement:") || historyMutationKey.startsWith("placement-pin:")
                          ? "Updating..."
                          : activeCareerHistoryEntry?.pinned ? "Unpin" : "Pin"}
                      </span>
                    </button>
                    <button
                      aria-label="Back to Start Learning home"
                      className="learning-workspace-return-button"
                      onClick={returnToPreparationChoice}
                      title="Back to Start Learning home"
                      type="button"
                    >
                      <ArrowLeft aria-hidden="true" size={16} />
                      <span>Back to Start Learning</span>
                    </button>
                  </div>
                </div>
                <div className="learning-career-analysis-grid">
                  {listFrom(careerAnalysis.topics).map((topic, index) => (
                    <PlacementPrepTopicCard
                      codingRelevant={activeNotebook?.careerPreparation?.codingRelevant}
                      codeMatrixAvailable={codeMatrixEligibility.eligible && typeof onOpenCodeMatrix === "function"}
                      key={topic?.id || topic?.title || index}
                      topic={topic}
                      index={index}
                      getActionTarget={placementActionTarget}
                      getNoteOptions={placementNoteOptions}
                      isSaving={isLearningNoteSaving}
                      onSave={savePlacementItem}
                      onAskAI={askPlacementItemAI}
                      onAddToPlanner={openPlannerForNode}
                      onCode={openPlacementItemInCodeMatrix}
                    />
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

            <section
              aria-labelledby="learning-career-practice-more-title"
              className="learning-career-practice-more"
            >
              <header className="learning-career-practice-more-heading">
                <h2 id="learning-career-practice-more-title">Practice more</h2>
              </header>
              <div className="learning-career-primer" aria-label="Frequently tested preparation areas">
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
              </div>
            </section>
          </section>
        )}
      </div>

      )}

      <NotebookCreateDialog open={newNotebookOpen} onClose={() => { setNewNotebookOpen(false); setSubjectPickerOpen(false); }} suspended={privacyConsentOpen}>
        <div className="learning-page notebook-create-fields">
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
                  const nextSubjectName = event.target.value;
                  setSubjectName(nextSubjectName);
                  setAnalysisError("");
                  setSubjectOptionIndex(0);
                  setSubjectPickerOpen(savedSubjectNames.length > 0);
                }}
                onClick={() => setSubjectPickerOpen(savedSubjectNames.length > 0)}
                onFocus={() => setSubjectPickerOpen(savedSubjectNames.length > 0)}
                onKeyDown={handleSubjectPickerKeyDown}
                placeholder={savedSubjectNames.length ? "Choose or type a subject" : curriculumExamples.subjectPlaceholder}
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

          <label className="learning-field notebook-scope-field" htmlFor="learning-notebook-scope">
            <span>Topics or chapters</span>
            <textarea id="learning-notebook-scope" disabled={analyzing} ref={requirementsInputRef} maxLength={MAX_LEARNING_PROMPT_CHARS} rows={4} value={scopeText}
              placeholder={subjectName ? `Topics or chapters to explain in ${subjectName}` : "e.g. Coulomb’s law, electric fields"}
              onChange={(event) => { setScopeText(event.target.value); setAnalysisError(""); }} aria-describedby="notebook-scope-help" />
            <small id="notebook-scope-help">Add up to 12 names, separated by commas or new lines. Each gets detailed notes, examples and key points.</small>
          </label>
          <input accept={LEARNING_SOURCE_ACCEPT} className="learning-file-input" disabled={analyzing || preparingSources} multiple onChange={(event) => handleFiles(event.target.files)} ref={fileInputRef} type="file" />
          <button className="notebook-attach" disabled={analyzing || preparingSources || sources.length >= MAX_CHAT_ATTACHMENTS} type="button" onClick={() => fileInputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); handleFiles(event.dataTransfer.files); }}>
            {preparingSources ? <LoaderCircle size={17} className="spinner" /> : <UploadCloud size={17} />}Optional reference files · drop or upload
          </button>
          {sources.length > 0 && <div className="learning-source-list">{sources.map((source) => <div className="learning-source-chip" key={source.id}><FileText size={14} /><strong>{source.name}</strong><button aria-label={`Remove ${source.name}`} disabled={analyzing} onClick={() => removeSource(source.id)} type="button"><X size={13} /></button></div>)}</div>}
          {sourceError && <p className="learning-inline-error" role="alert">{sourceError}</p>}
          {analysisError && <p className="learning-inline-error" role="alert">{analysisError}</p>}
          {analyzing ? <LatticeLoader className="generation-lattice-loader" label="Building notebook" /> : <button className="learning-analyze-btn" disabled={preparingSources || hasInsufficientCredits(AI_FEATURES.LEARNING_NOTEBOOK)} onClick={analyzeNotebook} type="button"><BrainCircuit size={17} />Generate notebook<AiCreditCost feature={AI_FEATURES.LEARNING_NOTEBOOK} /></button>}
        </div>
      </NotebookCreateDialog>

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
                    concept labels, typed academic context when provided, and relevant registered
                    academic-profile context to Google Gemini for AI processing. A selected notebook
                    supplies context only; its uploaded source contents are not included in this
                    Medical training request.
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
                    type, size, and coverage. Raw uploaded file contents and general notebook prompts
                    are not saved in notebook records. A placement context you type is saved with its
                    generated guide so it can be restored from history. Every generated placement or
                    Medical training guide is added automatically to its history so you can return to it.
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
                {getLearningPlannerAvailability(schedule, scheduleStartDate).message}. Open Planner to choose upcoming study dates.
              </p>
            )}
            <div className="learning-dialog-actions">
              <button onClick={closePlannerDialog} type="button">Cancel</button>
              {dateOptions.length ? (
                <button disabled={!nodes.length && !plannerCustomNode} onClick={addToPlanner} type="button">
                  <CalendarPlus size={16} /> Add to planner
                </button>
              ) : (
                <button onClick={() => { closePlannerDialog(); navigate("/planner"); }} type="button">
                  Open Planner <ChevronRight size={16} />
                </button>
              )}
            </div>
          </section>
        </div>,
        document.body
      )}
    </div>
  );
}

export default StartLearningPage;
