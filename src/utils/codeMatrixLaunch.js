import { CODE_MATRIX_LANGUAGES, CODE_MATRIX_MAX_CODE } from "./codeMatrixWorkspace.js";

const SUPPORTED_LANGUAGES = new Set(CODE_MATRIX_LANGUAGES.map(({ id }) => id));
const LANGUAGE_ALIASES = Object.freeze({
  c: "c",
  "c++": "cpp",
  cpp: "cpp",
  css: "css",
  htm: "html",
  html: "html",
  java: "java",
  javascript: "javascript",
  js: "javascript",
  jsx: "javascript",
  py: "python",
  python: "python",
  sql: "sql",
  ts: "javascript",
  tsx: "javascript",
  typescript: "javascript",
});

function cleanText(value, maxLength = 600) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, maxLength);
}

function cleanCode(value) {
  return String(value ?? "").replace(/\r\n?/gu, "\n").slice(0, CODE_MATRIX_MAX_CODE);
}

function codeFingerprint(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function normalizedLanguageAlias(value) {
  const key = String(value ?? "")
    .trim()
    .toLocaleLowerCase()
    .replace(/^language-/u, "")
    .split(/\s+/u)[0]
    .replace(/[^a-z0-9+#.-]/gu, "");
  return LANGUAGE_ALIASES[key] || "";
}

export function inferCodeMatrixLanguage(code = "", language = "") {
  const declared = normalizedLanguageAlias(language);
  if (declared) return declared;

  const source = cleanCode(code);
  if (!source.trim()) return "";
  if (/^\s*(?:<!doctype\s+html|<html\b|<(?:main|section|article|div|form|button)\b)/iu.test(source)) return "html";
  if (/^\s*#include\s*<iostream>/mu.test(source) || /\bstd::(?:cout|cin|vector|string)\b/u.test(source)) return "cpp";
  if (/^\s*#include\s*<(?:stdio|stdlib|string)\.h>/mu.test(source)) return "c";
  if (/\bpublic\s+(?:final\s+)?class\s+\w+|\bSystem\.out\.print/u.test(source)) return "java";
  if (/^\s*(?:def|class)\s+\w+.*:|\bprint\s*\(|\bimport\s+(?:numpy|pandas|math)\b/mu.test(source)) return "python";
  if (/\b(?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE)\b[\s\S]*\b(?:FROM|VALUES|SET|TABLE)\b/iu.test(source)) return "sql";
  if (/\b(?:const|let|var)\s+[$\w]+|\bfunction\s+[$\w]+|=>|\bconsole\.log\s*\(/u.test(source)) return "javascript";
  if (/^\s*(?:[.#][\w-]+|[a-z][\w-]*)\s*\{[\s\S]*\b(?:color|display|margin|padding|font-size)\s*:/imu.test(source)) return "css";
  return "";
}

export function buildChatCodeMatrixLaunch({ code, language } = {}) {
  const normalizedCode = cleanCode(code);
  const normalizedLanguage = inferCodeMatrixLanguage(normalizedCode, language);
  if (!normalizedCode.trim() || !SUPPORTED_LANGUAGES.has(normalizedLanguage)) return null;
  const label = CODE_MATRIX_LANGUAGES.find(({ id }) => id === normalizedLanguage)?.label || "Code";

  return {
    code: normalizedCode,
    id: `chat:${normalizedLanguage}:${normalizedCode.length}:${codeFingerprint(normalizedCode)}`,
    language: normalizedLanguage,
    source: "chat",
    task: "Run, edit, and inspect this AI-generated code.",
    title: `${label} from AI Chat`,
  };
}

export function normalizeCodeMatrixLaunch(value) {
  if (!value || typeof value !== "object" || !["chat", "placement"].includes(value.source)) return null;
  const language = SUPPORTED_LANGUAGES.has(value.language) ? value.language : "";
  const title = cleanText(value.title, 180);
  const task = cleanText(value.task, 420);
  const code = value.source === "chat" ? cleanCode(value.code) : "";
  if (!language || !title || !task || (value.source === "chat" && !code.trim())) return null;

  return {
    code,
    id: cleanText(value.id, 240) || `${value.source}:${language}:${title}`,
    language,
    notebookId: cleanText(value.notebookId, 120),
    returnTo: value.source === "placement" ? "/learn#placement-prep" : "",
    source: value.source,
    task,
    title,
    topicId: cleanText(value.topicId, 120),
  };
}
