import {
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
  Maximize2,
  MessageSquareText,
  Plus,
  Save,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import api from "../utils/apiClient";
import {
  CHAT_ATTACHMENT_ACCEPT,
  MAX_CHAT_ATTACHMENTS,
  formatChatFileSize,
  prepareChatAttachment,
  validateChatAttachmentSelection,
} from "../utils/chatAttachments";
import {
  getLearningScheduleDateOptions,
  upsertLearningPlannerTask,
} from "../utils/learningPlanner";
import "./StartLearningPage.css";

const TEXT_SOURCE_ACCEPT = ".txt,.md,text/plain,text/markdown";
const LEARNING_SOURCE_ACCEPT = `${CHAT_ATTACHMENT_ACCEPT},${TEXT_SOURCE_ACCEPT}`;
const MAX_TEXT_SOURCE_BYTES = 30_000;
const MAX_TEXT_TOTAL_CHARS = 60_000;
const ANALYSIS_STEPS = [
  "Reading your sources",
  "Structuring chapters and concepts",
  "Prioritizing important questions",
  "Building your revision notebook",
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

function normalizeSubtopic(value, index, topicId) {
  const source = value && typeof value === "object" ? value : { title: value };
  return {
    ...source,
    id: cleanText(source.id || source._id, 120) || `${topicId}-subtopic-${index + 1}`,
    title: cleanText(source.title || source.name || source.label, 180) || `Subtopic ${index + 1}`,
    summary: cleanText(source.summary || source.description || source.note, 1200),
  };
}

function normalizeTopic(value, index, chapterId) {
  const source = value && typeof value === "object" ? value : { title: value };
  const id = cleanText(source.id || source._id, 120) || `${chapterId}-topic-${index + 1}`;
  return {
    ...source,
    id,
    title: cleanText(source.title || source.name || source.label, 180) || `Topic ${index + 1}`,
    summary: cleanText(source.summary || source.description || source.note, 1600),
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
    priority: cleanText(source.priority || source.importance || source.difficulty, 40)
      || (index < 3 ? "High" : "Review"),
  };
}

function normalizeNoteSection(value, index, notebookId) {
  const source = value && typeof value === "object" ? value : { content: value };
  return {
    ...source,
    id: cleanText(source.id || source._id, 120) || `${notebookId}-note-${index + 1}`,
    title: cleanText(source.title || source.heading || source.name, 180) || `Revision note ${index + 1}`,
    content: cleanText(source.content || source.body || source.summary || source.text, 6000),
    bullets: [
      ...listFrom(source.bullets || source.keyPoints || source.points),
      ...listFrom(source.revisionTips).map((item) => `Revision tip: ${cleanText(item, 900)}`),
    ]
      .map((item) => cleanText(item?.text || item?.title || item, 1000))
      .filter(Boolean),
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
  const nodes = [];
  (notebook?.chapters || []).forEach((chapter) => {
    nodes.push({
      id: chapter.id,
      title: chapter.title,
      type: "chapter",
      chapterName: chapter.title,
      subjectName: notebook.subjectName,
    });
    chapter.topics.forEach((topic) => {
      nodes.push({
        id: topic.id,
        title: topic.title,
        type: "topic",
        chapterName: chapter.title,
        subjectName: notebook.subjectName,
      });
      topic.subtopics.forEach((subtopic) => {
        nodes.push({
          id: subtopic.id,
          title: subtopic.title,
          type: "subtopic",
          chapterName: chapter.title,
          subjectName: notebook.subjectName,
        });
      });
    });
  });
  return nodes;
}

function careerProfileAllows(careerPreparation) {
  return Boolean(careerPreparation?.enabled);
}

function careerItems(value) {
  const pickText = (item) => cleanText(
    item?.title
    || item?.question
    || item?.guidance
    || item?.whyItMatters
    || item?.text
    || item,
    500,
  );
  if (Array.isArray(value)) return value.map(pickText).filter(Boolean);
  if (value && typeof value === "object") {
    return Object.values(value)
      .flatMap((item) => listFrom(item))
      .map(pickText)
      .filter(Boolean);
  }
  return cleanText(value, 500) ? [cleanText(value, 500)] : [];
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
  const fileInputRef = useRef(null);
  const analysisTimerRef = useRef(null);
  const mountedRef = useRef(true);
  const [notebooks, setNotebooks] = useState([]);
  const [notebooksLoading, setNotebooksLoading] = useState(true);
  const [notebooksError, setNotebooksError] = useState("");
  const [activeNotebook, setActiveNotebook] = useState(null);
  const [sources, setSources] = useState([]);
  const [sourceError, setSourceError] = useState("");
  const [preparingSources, setPreparingSources] = useState(false);
  const [subjectName, setSubjectName] = useState("");
  const [manualChapters, setManualChapters] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState(0);
  const [analysisError, setAnalysisError] = useState("");
  const [activeTab, setActiveTab] = useState("notes");
  const [expandedQuestions, setExpandedQuestions] = useState(() => new Set());
  const [expandedChapters, setExpandedChapters] = useState(() => new Set());
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [zoom, setZoom] = useState(1);
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
  const [plannerDateKey, setPlannerDateKey] = useState("");
  const [plannerError, setPlannerError] = useState("");

  const nodes = useMemo(() => learningNodes(activeNotebook), [activeNotebook]);
  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) || nodes[0] || null,
    [nodes, selectedNodeId],
  );
  const dateOptions = useMemo(
    () => getLearningScheduleDateOptions(schedule, scheduleStartDate),
    [schedule, scheduleStartDate],
  );
  const careerVisible = useMemo(
    () => careerProfileAllows(activeNotebook?.careerPreparation),
    [activeNotebook?.careerPreparation],
  );

  const selectNotebook = useCallback((value) => {
    const normalized = normalizeNotebook(value);
    setActiveNotebook(normalized);
    setDirty(false);
    setActiveTab("notes");
    setExpandedChapters(new Set(normalized.chapters.slice(0, 1).map((chapter) => chapter.id)));
    setSelectedNodeId(normalized.chapters[0]?.id || "");
    setZoom(1);
  }, []);

  const loadNotebooks = useCallback(async () => {
    setNotebooksLoading(true);
    setNotebooksError("");
    try {
      const payload = await api.get("/api/learning-notebooks", { timeoutMs: 30000 });
      if (!mountedRef.current) return;
      const loaded = listFrom(payload?.notebooks).map(normalizeNotebook);
      setNotebooks(loaded);
    } catch (error) {
      if (!mountedRef.current) return;
      setNotebooksError(error instanceof Error ? error.message : "Saved notebooks could not be loaded.");
    } finally {
      if (mountedRef.current) setNotebooksLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    loadNotebooks();
    return () => {
      mountedRef.current = false;
      if (analysisTimerRef.current) window.clearInterval(analysisTimerRef.current);
    };
  }, [loadNotebooks]);

  useEffect(() => {
    if (!plannerDialogOpen) return;
    setPlannerNodeId((current) => current || selectedNode?.id || nodes[0]?.id || "");
    setPlannerDateKey((current) => current || dateOptions[0]?.dateKey || "");
  }, [dateOptions, nodes, plannerDialogOpen, selectedNode?.id]);

  const handleFiles = async (fileList) => {
    const selected = Array.from(fileList || []);
    if (!selected.length) return;
    if (sources.length + selected.length > MAX_CHAT_ATTACHMENTS) {
      setSourceError(`Add up to ${MAX_CHAT_ATTACHMENTS} sources to one notebook.`);
      return;
    }

    const binaryFiles = selected.filter((file) => !isTextSource(file));
    const existingBinary = sources.filter((source) => source.kind === "attachment");
    const binaryError = validateChatAttachmentSelection(binaryFiles, existingBinary);
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

  const beginAnalysisProgress = () => {
    setAnalysisStep(0);
    if (analysisTimerRef.current) window.clearInterval(analysisTimerRef.current);
    analysisTimerRef.current = window.setInterval(() => {
      setAnalysisStep((current) => Math.min(current + 1, ANALYSIS_STEPS.length - 2));
    }, 1050);
  };

  const analyzeNotebook = async () => {
    const chapterNames = parseChapterNames(manualChapters);
    const cleanSubject = cleanText(subjectName, 160);
    if (!sources.length && (!cleanSubject || !chapterNames.length)) {
      setAnalysisError("Upload a source, or add a subject and at least one chapter.");
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
      }, { timeoutMs: 120000 });
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
      setNotification?.("Your learning notebook is ready.");
    } catch (error) {
      if (!mountedRef.current) return;
      setAnalysisError(error instanceof Error ? error.message : "The notebook could not be generated.");
    } finally {
      if (analysisTimerRef.current) window.clearInterval(analysisTimerRef.current);
      analysisTimerRef.current = null;
      if (mountedRef.current) setAnalyzing(false);
    }
  };

  const updateNotebook = (updater) => {
    setActiveNotebook((current) => {
      if (!current) return current;
      const next = typeof updater === "function" ? updater(current) : { ...current, ...updater };
      return { ...next, updatedAt: new Date().toISOString() };
    });
    setDirty(true);
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

  const saveNotebook = async () => {
    if (!activeNotebook?.id || saving) return;
    setSaving(true);
    try {
      const payload = await api.patch(
        `/api/learning-notebooks/${encodeURIComponent(activeNotebook.id)}`,
        { notebook: activeNotebook },
        { timeoutMs: 30000 },
      );
      if (!mountedRef.current) return;
      const normalized = normalizeNotebook(payload?.notebook || activeNotebook);
      setActiveNotebook(normalized);
      setNotebooks((current) => current.map((notebook) =>
        notebook.id === normalized.id ? normalized : notebook,
      ));
      setDirty(false);
      setNotification?.("Learning notebook saved.");
    } catch (error) {
      if (mountedRef.current) {
        setNotification?.(error instanceof Error ? error.message : "The notebook could not be saved.");
      }
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  };

  const deleteNotebook = async (notebookId) => {
    setDeletingId(notebookId);
    try {
      await api.delete(`/api/learning-notebooks/${encodeURIComponent(notebookId)}`, { timeoutMs: 30000 });
      if (!mountedRef.current) return;
      setNotebooks((current) => current.filter((notebook) => notebook.id !== notebookId));
      if (activeNotebook?.id === notebookId) setActiveNotebook(null);
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

  const addToPlanner = () => {
    const node = nodes.find((item) => item.id === plannerNodeId);
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
    setPlannerDialogOpen(false);
    setPlannerError("");
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

  const fitMindMap = () => {
    const branchCount = activeNotebook?.chapters.length || 1;
    setZoom(branchCount > 6 ? 0.62 : branchCount > 4 ? 0.75 : branchCount > 2 ? 0.88 : 1);
  };

  return (
    <div className="learning-page">
      <section className="card learning-hero">
        <div className="learning-hero-copy">
          <span className="section-tag"><Sparkles size={14} /> AI learning workspace</span>
          <h2>Start Learning</h2>
          <p>
            Turn files or a chapter list into revision-first notes, important questions,
            and a living concept map calibrated to {academicLevel} · {academicTrack}.
          </p>
        </div>
        <div className="learning-hero-metrics" aria-label="Learning notebook summary">
          <div><strong>{notebooks.length}</strong><span>Saved notebooks</span></div>
          <div><strong>{activeNotebook?.chapters.length || 0}</strong><span>Mapped chapters</span></div>
          <div><strong>{nodes.length}</strong><span>Study concepts</span></div>
        </div>
      </section>

      <div className="learning-workspace">
        <aside className="card learning-source-rail" aria-label="Sources and saved notebooks">
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

          <div className="learning-or-divider"><span>or map manually</span></div>
          <label className="learning-field">
            <span>Subject</span>
            <input
              disabled={analyzing}
              onChange={(event) => setSubjectName(event.target.value)}
              placeholder="e.g. Operating Systems"
              value={subjectName}
            />
          </label>
          <label className="learning-field">
            <span>Chapter names</span>
            <textarea
              disabled={analyzing}
              onChange={(event) => setManualChapters(event.target.value)}
              placeholder={"Processes, Threads\nCPU Scheduling"}
              rows={4}
              value={manualChapters}
            />
            <small>Separate names with commas or new lines.</small>
          </label>
          {analysisError && <p className="learning-inline-error" role="alert">{analysisError}</p>}
          <button
            className="learning-analyze-btn"
            disabled={analyzing || preparingSources}
            onClick={analyzeNotebook}
            type="button"
          >
            {analyzing ? <LoaderCircle className="spinner" size={17} /> : <BrainCircuit size={17} />}
            {analyzing ? "Building notebook…" : "Analyze & start learning"}
          </button>

          <div className="learning-saved-heading">
            <div><Layers3 size={16} /><strong>Saved notebooks</strong></div>
            {notebooksLoading && <LoaderCircle aria-label="Loading notebooks" className="spinner" size={15} />}
          </div>
          {notebooksError && (
            <div className="learning-rail-empty">
              <p>{notebooksError}</p>
              <button onClick={loadNotebooks} type="button">Retry</button>
            </div>
          )}
          {!notebooksLoading && !notebooksError && notebooks.length === 0 && (
            <div className="learning-rail-empty">
              <BookOpenCheck size={20} />
              <p>Your generated notebooks will stay here.</p>
            </div>
          )}
          <div className="learning-notebook-list">
            {notebooks.map((notebook) => (
              <article
                className={`learning-notebook-row${activeNotebook?.id === notebook.id ? " is-active" : ""}`}
                key={notebook.id}
              >
                <button
                  aria-current={activeNotebook?.id === notebook.id ? "page" : undefined}
                  className="learning-notebook-select"
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
                      disabled={deletingId === notebook.id}
                      onClick={() => deleteNotebook(notebook.id)}
                      type="button"
                    >
                      {deletingId === notebook.id ? <LoaderCircle className="spinner" size={13} /> : <Check size={13} />}
                    </button>
                    <button
                      aria-label="Cancel delete"
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
                    onClick={() => setDeleteCandidateId(notebook.id)}
                    type="button"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </article>
            ))}
          </div>
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
                  <button disabled={!dirty || saving} onClick={saveNotebook} type="button">
                    {saving ? <LoaderCircle className="spinner" size={16} /> : <Save size={16} />}
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button disabled={exporting} onClick={exportNotebook} type="button">
                    {exporting ? <LoaderCircle className="spinner" size={16} /> : <Download size={16} />}
                    {exporting ? "Exporting…" : "Export PDF"}
                  </button>
                  <button onClick={askAI} type="button">
                    <MessageSquareText size={16} /> Ask AI
                  </button>
                  <button onClick={() => setPlannerDialogOpen(true)} type="button">
                    <CalendarPlus size={16} /> Add to planner
                  </button>
                </div>
              </section>

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
                              {question.answer || "Use Ask AI to work through this question step by step."}
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

              <section className="card learning-content-card">
                <div className="learning-tablist" role="tablist" aria-label="Notebook views">
                  {[
                    ["notes", "Revised notes", <FileText aria-hidden="true" key="notes-icon" size={15} />],
                    ["outline", "Topic outline", <BookOpenCheck aria-hidden="true" key="outline-icon" size={15} />],
                    ["map", "Mind map", <BrainCircuit aria-hidden="true" key="map-icon" size={15} />],
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
                          {section.bullets.length > 0 && (
                            <ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>
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
                        <p>Refine the structure before saving or syncing it to Subjects.</p>
                      </div>
                      <div>
                        <button onClick={() => setChapterComposerOpen(true)} type="button">
                          <Plus size={15} /> Add chapter
                        </button>
                        <button onClick={addNotebookSubject} type="button">
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
                                {chapter.topics.map((topic) => (
                                  <div className="learning-outline-topic" key={topic.id} role="treeitem">
                                    <span className="learning-tree-marker" aria-hidden="true" />
                                    <label>
                                      <span className="sr-only">Topic name</span>
                                      <input
                                        onChange={(event) => updateTopic(chapter.id, topic.id, { title: event.target.value })}
                                        onFocus={() => setSelectedNodeId(topic.id)}
                                        value={topic.title}
                                      />
                                    </label>
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
                                        </div>
                                      ))}
                                    </div>
                                    {subtopicComposer.chapterId === chapter.id && subtopicComposer.topicId === topic.id ? (
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
                                    ) : (
                                      <button
                                        className="learning-add-nested"
                                        onClick={() => setSubtopicComposer({ chapterId: chapter.id, topicId: topic.id, value: "" })}
                                        type="button"
                                      >
                                        <Plus size={13} /> Add subtopic
                                      </button>
                                    )}
                                  </div>
                                ))}
                                {topicComposer.chapterId === chapter.id ? (
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
                                ) : (
                                  <button
                                    className="learning-add-nested"
                                    onClick={() => setTopicComposer({ chapterId: chapter.id, value: "" })}
                                    type="button"
                                  >
                                    <Plus size={13} /> Add topic
                                  </button>
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
                    <div className="learning-map-toolbar">
                      <div>
                        <h3>Concept mind map</h3>
                        <p>Select a node to focus Ask AI or planner actions.</p>
                      </div>
                      <div aria-label="Mind map zoom controls">
                        <button aria-label="Zoom out" onClick={() => setZoom((current) => Math.max(0.55, current - 0.1))} type="button">
                          <ZoomOut size={15} />
                        </button>
                        <span aria-live="polite">{Math.round(zoom * 100)}%</span>
                        <button aria-label="Zoom in" onClick={() => setZoom((current) => Math.min(1.35, current + 0.1))} type="button">
                          <ZoomIn size={15} />
                        </button>
                        <button aria-label="Fit mind map to view" onClick={fitMindMap} type="button">
                          <Maximize2 size={15} />
                        </button>
                      </div>
                    </div>
                    <div className="learning-map-viewport" tabIndex="0">
                      <div className="learning-map-canvas" style={{ "--map-zoom": zoom }}>
                        <button
                          className="learning-map-root"
                          onClick={() => setSelectedNodeId("")}
                          type="button"
                        >
                          <BrainCircuit size={19} />
                          <span>
                            <small>Notebook</small>
                            <strong>{activeNotebook.subjectName}</strong>
                          </span>
                        </button>
                        <div className="learning-map-trunk" aria-hidden="true" />
                        <div className="learning-map-branches">
                          {activeNotebook.chapters.map((chapter, chapterIndex) => (
                            <div className="learning-map-branch" key={chapter.id} style={{ "--reveal-index": chapterIndex }}>
                              <span className="learning-map-connector" aria-hidden="true" />
                              <button
                                className={`learning-map-node is-chapter${selectedNodeId === chapter.id ? " is-selected" : ""}`}
                                onClick={() => setSelectedNodeId(chapter.id)}
                                type="button"
                              >
                                <small>Chapter {chapterIndex + 1}</small>
                                <strong>{chapter.title}</strong>
                              </button>
                              <div className="learning-map-topic-stack">
                                {chapter.topics.map((topic, topicIndex) => (
                                  <div className="learning-map-topic-group" key={topic.id}>
                                    <button
                                      className={`learning-map-node is-topic${selectedNodeId === topic.id ? " is-selected" : ""}`}
                                      onClick={() => setSelectedNodeId(topic.id)}
                                      style={{ "--reveal-index": chapterIndex + topicIndex + 1 }}
                                      type="button"
                                    >
                                      <strong>{topic.title}</strong>
                                    </button>
                                    {topic.subtopics.length > 0 && (
                                      <div className="learning-map-subtopics">
                                        {topic.subtopics.map((subtopic, subtopicIndex) => (
                                          <button
                                            className={selectedNodeId === subtopic.id ? "is-selected" : ""}
                                            key={subtopic.id}
                                            onClick={() => setSelectedNodeId(subtopic.id)}
                                            style={{ "--reveal-index": chapterIndex + topicIndex + subtopicIndex + 2 }}
                                            type="button"
                                          >
                                            {subtopic.title}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    {selectedNode && (
                      <div className="learning-map-focus" aria-live="polite">
                        <div>
                          <span>{selectedNode.type}</span>
                          <strong>{selectedNode.title}</strong>
                        </div>
                        <button onClick={askAI} type="button"><MessageSquareText size={14} /> Ask AI</button>
                        <button onClick={() => setPlannerDialogOpen(true)} type="button"><CalendarPlus size={14} /> Plan</button>
                      </div>
                    )}
                  </div>
                )}
              </section>

              {careerVisible && (
                <section className="card learning-career-panel">
                  <div className="learning-panel-heading">
                    <div>
                      <span className="section-tag"><BriefcaseBusiness size={13} /> Profile matched</span>
                      <h3>Placement & internship preparation</h3>
                      <p>
                        {activeNotebook.careerPreparation.reason
                          || "Recommendations are limited to your field and selected career goal."}
                      </p>
                    </div>
                    {activeNotebook.careerPreparation.field && (
                      <span className="learning-count">{activeNotebook.careerPreparation.field}</span>
                    )}
                  </div>
                  <div className="learning-career-grid">
                    <article>
                      <BriefcaseBusiness size={20} />
                      <h4>Role-ready focus</h4>
                      {activeNotebook.careerPreparation.focus && (
                        <p className="learning-career-focus">{activeNotebook.careerPreparation.focus}</p>
                      )}
                      <ul>
                        {careerItems(activeNotebook.careerPreparation.skills).slice(0, 8).map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </article>
                    <article>
                      <CircleHelp size={20} />
                      <h4>Interview questions</h4>
                      <div className="learning-career-question-list">
                        {listFrom(
                          activeNotebook.careerPreparation.interviewQuestions
                          || activeNotebook.careerPreparation.interview,
                        ).slice(0, 6).map((item, index) => (
                          <div className="learning-career-question" key={item?.id || item?.question || index}>
                            <strong>{cleanText(item?.question || item?.title || item, 500)}</strong>
                            {cleanText(item?.guidance || item?.answer, 800) && (
                              <p>{cleanText(item?.guidance || item?.answer, 800)}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </article>
                    {activeNotebook.careerPreparation.codingRelevant && listFrom(
                      activeNotebook.careerPreparation.codingTopics
                      || activeNotebook.careerPreparation.codingInterview
                      || activeNotebook.careerPreparation.coding,
                    ).length > 0 && (
                      <article className="learning-career-code-lane">
                        <Code2 size={20} />
                        <h4>Coding interview lane</h4>
                        <div className="learning-career-code-list">
                          {listFrom(
                            activeNotebook.careerPreparation.codingTopics
                            || activeNotebook.careerPreparation.codingInterview
                            || activeNotebook.careerPreparation.coding,
                          ).slice(0, 6).map((item, index) => (
                            <div className="learning-career-code-topic" key={item?.id || item?.title || index}>
                              <strong>{cleanText(item?.title || item?.name || item, 300)}</strong>
                              {cleanText(item?.whyItMatters || item?.summary, 700) && (
                                <p>{cleanText(item?.whyItMatters || item?.summary, 700)}</p>
                              )}
                              {listFrom(item?.practiceSteps).length > 0 && (
                                <ol>
                                  {listFrom(item.practiceSteps).slice(0, 4).map((step) => (
                                    <li key={cleanText(step, 500)}>{cleanText(step, 500)}</li>
                                  ))}
                                </ol>
                              )}
                            </div>
                          ))}
                        </div>
                      </article>
                    )}
                  </div>
                </section>
              )}
            </>
          )}
        </section>
      </div>

      {plannerDialogOpen && activeNotebook && (
        <div
          className="learning-dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPlannerDialogOpen(false);
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
              <button aria-label="Close planner dialog" onClick={() => setPlannerDialogOpen(false)} type="button">
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
              <button onClick={() => setPlannerDialogOpen(false)} type="button">Cancel</button>
              <button disabled={!nodes.length || !dateOptions.length} onClick={addToPlanner} type="button">
                <CalendarPlus size={16} /> Add to planner
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default StartLearningPage;
