const MAX_NOTE_TITLE_CHARS = 180;
const MAX_NOTE_DETAILS_CHARS = 8_000;
const MAX_CONTEXT_CHARS = 180;
const MAX_LIST_ITEMS = 8;

function replaceInlineControlCharacters(value) {
  return Array.from(String(value ?? ""), (character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127 ? " " : character;
  }).join("");
}

function cleanInlineText(value, maxLength = MAX_CONTEXT_CHARS) {
  return replaceInlineControlCharacters(value)
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, maxLength);
}

function cleanLongText(value, maxLength = MAX_NOTE_DETAILS_CHARS) {
  return String(value ?? "")
    .split("\u0000").join("")
    .replace(/\r\n?/gu, "\n")
    .replace(/[\t\f\v]+/gu, " ")
    .replace(/\n{3,}/gu, "\n\n")
    .trim()
    .slice(0, maxLength);
}

function cleanList(value, maxItems = MAX_LIST_ITEMS) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanInlineText(
      typeof item === "string" ? item : item?.title ?? item?.content ?? item?.text,
      420,
    ))
    .filter(Boolean)
    .slice(0, maxItems);
}

function fallbackId(sourceKey, createdAt) {
  let hash = 2166136261;
  const input = `${sourceKey}:${createdAt}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `learning-note-${(hash >>> 0).toString(36)}`;
}

function createNoteId(sourceKey, createdAt, idFactory) {
  if (typeof idFactory === "function") {
    const suppliedId = cleanInlineText(idFactory(), 160);
    if (suppliedId) return suppliedId;
  }
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return fallbackId(sourceKey, createdAt);
}

function sourcePart(value) {
  return encodeURIComponent(cleanInlineText(value, MAX_CONTEXT_CHARS).toLocaleLowerCase());
}

export function buildLearningNoteSourceKey({ subject, chapter, topic } = {}) {
  const parts = [subject, chapter, topic].map(sourcePart);
  if (!parts[2]) throw new Error("A topic is required before saving to Notes.");
  return `start-learning:${parts.join("/")}`.slice(0, 600);
}

export function buildLearningTopicNote(input = {}, options = {}) {
  const subject = cleanInlineText(input.subject ?? input.subjectName) || "General learning";
  const chapter = cleanInlineText(input.chapter ?? input.chapterTitle) || "Independent study";
  const topic = cleanInlineText(input.topic ?? input.topicTitle ?? input.title);
  if (!topic) throw new Error("A topic is required before saving to Notes.");

  const summary = cleanLongText(input.summary, 1_600);
  const explanation = cleanLongText(input.explanation ?? input.content, 4_400);
  const keyPoints = cleanList(input.keyPoints);
  const examples = cleanList(input.examples, 5);
  const revisionTips = cleanList(input.revisionTips, 5);
  const sourceKey = buildLearningNoteSourceKey({ subject, chapter, topic });
  const createdAt = options.now instanceof Date
    ? options.now.toISOString()
    : cleanInlineText(options.now, 40) || new Date().toISOString();

  const sections = [
    `Subject: ${subject}`,
    `Chapter: ${chapter}`,
    summary ? `Summary\n${summary}` : "",
    explanation && explanation !== summary ? `Explanation\n${explanation}` : "",
    keyPoints.length ? `Key points\n${keyPoints.map((item) => `• ${item}`).join("\n")}` : "",
    examples.length ? `Examples\n${examples.map((item) => `• ${item}`).join("\n")}` : "",
    revisionTips.length ? `Revision tips\n${revisionTips.map((item) => `• ${item}`).join("\n")}` : "",
    "Saved from Start Learning.",
  ].filter(Boolean);

  return {
    id: createNoteId(sourceKey, createdAt, options.idFactory),
    topic: `${topic} · ${subject}`.slice(0, MAX_NOTE_TITLE_CHARS),
    leftTopics: [],
    details: cleanLongText(sections.join("\n\n"), MAX_NOTE_DETAILS_CHARS),
    priority: ["Low", "Medium", "High"].includes(input.priority) ? input.priority : "Medium",
    status: "Open",
    source: "start-learning",
    sourceKey,
    learningContext: {
      subject,
      chapter,
      topic,
      notebookId: cleanInlineText(input.notebookId, 160),
      chapterId: cleanInlineText(input.chapterId, 160),
      topicId: cleanInlineText(input.topicId, 160),
    },
    createdAt,
  };
}

export function normalizeLearningTopicNote(input = {}, options = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("A learning note is required.");
  }

  const context = input.learningContext && typeof input.learningContext === "object"
    ? input.learningContext
    : {};
  const subject = cleanInlineText(context.subject ?? input.subject) || "General learning";
  const chapter = cleanInlineText(context.chapter ?? input.chapter) || "Independent study";
  const rawTopic = cleanInlineText(context.topic ?? input.topicTitle)
    || cleanInlineText(input.topic, MAX_NOTE_TITLE_CHARS).split(" · ")[0];
  if (!rawTopic) throw new Error("A topic is required before saving to Notes.");

  const sourceKey = buildLearningNoteSourceKey({ subject, chapter, topic: rawTopic });
  const createdAt = cleanInlineText(input.createdAt, 40) || new Date().toISOString();
  const details = cleanLongText(input.details, MAX_NOTE_DETAILS_CHARS);

  return {
    id: cleanInlineText(input.id, 160) || createNoteId(sourceKey, createdAt, options.idFactory),
    topic: (cleanInlineText(input.topic, MAX_NOTE_TITLE_CHARS) || `${rawTopic} · ${subject}`)
      .slice(0, MAX_NOTE_TITLE_CHARS),
    leftTopics: [],
    details: details || `Subject: ${subject}\n\nChapter: ${chapter}\n\nSaved from Start Learning.`,
    priority: ["Low", "Medium", "High"].includes(input.priority) ? input.priority : "Medium",
    status: "Open",
    source: "start-learning",
    sourceKey,
    learningContext: {
      subject,
      chapter,
      topic: rawTopic,
      notebookId: cleanInlineText(context.notebookId, 160),
      chapterId: cleanInlineText(context.chapterId, 160),
      topicId: cleanInlineText(context.topicId, 160),
    },
    createdAt,
  };
}
