import { CODE_MATRIX_LANGUAGES } from "./codeMatrixWorkspace.js";

const SUPPORTED_LANGUAGES = new Set(CODE_MATRIX_LANGUAGES.map(({ id }) => id));
const DEFAULT_LANGUAGE = "python";

function cleanText(value, maxLength = 600) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, maxLength);
}

function listFrom(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

function validFallback(value) {
  return SUPPORTED_LANGUAGES.has(value) ? value : DEFAULT_LANGUAGE;
}

function explicitLanguage(sourceValue) {
  const source = cleanText(sourceValue, 3200).toLocaleLowerCase();
  if (!source) return "";

  if (/(?:^|[^a-z0-9_])(?:c\+\+|cpp|c plus plus)(?=$|[^a-z0-9_])/iu.test(source)) return "cpp";
  if (/\b(?:javascript|typescript|node(?:\.js)?|react(?:\.js)?|express(?:\.js)?)\b/iu.test(source)) {
    return "javascript";
  }
  if (/\b(?:python|django|flask|pandas|numpy|scikit-learn|pytorch|tensorflow)\b/iu.test(source)) {
    return "python";
  }
  if (/\b(?:java(?!script)|spring boot|spring framework)\b/iu.test(source)) return "java";
  if (/\b(?:sql|sqlite|mysql|postgres(?:ql)?|structured query language)\b/iu.test(source)) return "sql";
  if (/\bhtml\b/iu.test(source)) return "html";
  if (/\bcss\b/iu.test(source)) return "css";
  if (/\b(?:c programming|c language|(?:in|using|with) c)\b/iu.test(source)) return "c";
  return "";
}

export function getPlacementCodeMatrixLanguage({
  fallbackLanguage = DEFAULT_LANGUAGE,
  notebook,
  target,
  topic,
} = {}) {
  const fallback = validFallback(fallbackLanguage);

  // Prefer the selected task over broader notebook context. A web notebook can
  // contain HTML, CSS, and JavaScript at once, while the selected exercise is
  // usually specific to just one of them.
  const prioritizedSources = [
    [target?.title, target?.keyPoints?.[0]],
    [topic?.title, topic?.explanation, topic?.whyItMatters],
    [notebook?.subjectName, notebook?.title],
    [target?.explanation, ...listFrom(topic?.practiceSteps).map((item) => item?.title || item?.text || item)],
  ];
  for (const values of prioritizedSources) {
    const language = explicitLanguage(values.map((value) => cleanText(value, 1000)).filter(Boolean).join(" "));
    if (language) return language;
  }

  const source = prioritizedSources.flat().map((value) => cleanText(value, 1000))
    .filter(Boolean).join(" ").toLocaleLowerCase();

  if (/\b(?:database|dbms|relational schema|query optimization)\b/iu.test(source)) return "sql";
  if (/\b(?:front[\s-]?end|web page|browser interface|dom)\b/iu.test(source)) return "html";
  if (/\b(?:rest(?:ful)?\s*api|back[\s-]?end|crud|server[\s-]?side|microservices?)\b/iu.test(source)) {
    return "javascript";
  }
  if (/\b(?:machine learning|deep learning|data science|computer vision|natural language processing)\b/iu.test(source)) {
    return "python";
  }
  if (/\b(?:android|object[\s-]?oriented design)\b/iu.test(source)) return "java";
  if (/\b(?:pointers?|memory allocation|systems programming)\b/iu.test(source)) return "c";

  return fallback;
}

export function buildPlacementCodeMatrixHandoff({
  fallbackLanguage,
  notebook,
  target,
  topic,
} = {}) {
  if (!target?.metadata?.codingRelevant) return null;
  const title = cleanText(topic?.title || target?.title, 180) || "Placement coding practice";
  const task = cleanText(target?.title, 420).replace(/^Practice:\s*/iu, "")
    || `Implement a solution for ${title}.`;

  return {
    id: cleanText(target?.id || `${notebook?.id || "placement"}:${topic?.id || title}`, 180),
    language: getPlacementCodeMatrixLanguage({ fallbackLanguage, notebook, target, topic }),
    notebookId: cleanText(notebook?.id, 120),
    returnTo: "/learn#placement-prep",
    source: "placement",
    task,
    title,
    topicId: cleanText(topic?.id || target?.metadata?.topicId, 120),
  };
}

export function normalizePlacementCodeMatrixHandoff(value) {
  if (!value || typeof value !== "object" || value.source !== "placement") return null;
  const language = validFallback(value.language);
  const title = cleanText(value.title, 180);
  const task = cleanText(value.task, 420);
  if (!title || !task) return null;

  return {
    id: cleanText(value.id, 180) || `${value.notebookId || "placement"}:${value.topicId || title}`,
    language,
    notebookId: cleanText(value.notebookId, 120),
    returnTo: "/learn#placement-prep",
    source: "placement",
    task,
    title,
    topicId: cleanText(value.topicId, 120),
  };
}
