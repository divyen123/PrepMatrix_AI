import { academicProfileStorageKey } from "./academicProfileScope.js";

export const CODE_MATRIX_LANGUAGES = Object.freeze([
  { id: "python", label: "Python", file: "main.py", runtime: "browser" },
  { id: "c", label: "C", file: "main.c", runtime: "remote" },
  { id: "cpp", label: "C++", file: "main.cpp", runtime: "remote" },
  { id: "java", label: "Java", file: "Main.java", runtime: "remote" },
  { id: "javascript", label: "JavaScript", file: "script.js", runtime: "browser" },
  { id: "sql", label: "SQL", file: "query.sql", runtime: "browser" },
  { id: "html", label: "HTML", file: "index.html", runtime: "preview" },
  { id: "css", label: "CSS", file: "style.css", runtime: "preview" },
]);
export const CODE_MATRIX_MAX_CODE = 50_000;
export const CODE_MATRIX_MAX_INPUT = 10_000;
export const CODE_MATRIX_STARTERS = Object.freeze({
  python: 'name = input("Your name: ")\nprint(f"Hello, {name}! Welcome to CodeMatrix.")\n',
  c: '#include <stdio.h>\n\nint main(void) {\n    printf("Hello, CodeMatrix!\\n");\n    return 0;\n}\n',
  cpp: '#include <iostream>\n\nint main() {\n    std::cout << "Hello, CodeMatrix!" << std::endl;\n    return 0;\n}\n',
  java: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, CodeMatrix!");\n    }\n}\n',
  javascript: 'const message = "Hello, CodeMatrix!";\nconsole.log(message);\n',
  sql: '-- A fresh sample students table is available on each run.\nSELECT name, marks\nFROM students\nWHERE marks >= 80\nORDER BY marks DESC;\n',
  html: '<main>\n  <span class="badge">My first page</span>\n  <h1>Hello, CodeMatrix!</h1>\n  <p>Edit the HTML, CSS, and JavaScript tabs, then run your page.</p>\n</main>\n',
  css: 'body {\n  margin: 0;\n  padding: 48px 24px;\n  background: #f0fdfa;\n  color: #134e4a;\n  font-family: system-ui, sans-serif;\n}\n\nmain { max-width: 600px; margin: auto; }\nh1 { font-size: 36px; letter-spacing: -1px; }\np { line-height: 1.7; }\n.badge { color: #0f766e; font-weight: 600; }\n',
});

const languageIds = new Set(CODE_MATRIX_LANGUAGES.map(({ id }) => id));
export function normalizeCodeMatrixWorkspace(value = {}, defaultLanguage = "python") {
  const source = value && typeof value === "object" ? value : {};
  return {
    language: languageIds.has(source.language) ? source.language : languageIds.has(defaultLanguage) ? defaultLanguage : "python",
    drafts: Object.fromEntries(CODE_MATRIX_LANGUAGES.map(({ id }) => [id,
      typeof source.drafts?.[id] === "string" ? source.drafts[id].slice(0, CODE_MATRIX_MAX_CODE) : CODE_MATRIX_STARTERS[id],
    ])),
    inputs: Object.fromEntries(CODE_MATRIX_LANGUAGES.map(({ id }) => [id,
      typeof source.inputs?.[id] === "string" ? source.inputs[id].slice(0, CODE_MATRIX_MAX_INPUT) : id === "python" ? "Student" : "",
    ])),
    setupDismissed: source.setupDismissed === true,
    completedSteps: [...new Set((Array.isArray(source.completedSteps) ? source.completedSteps : [])
      .filter((id) => ["subjects", "notebook", "plan"].includes(id)))],
    updatedAt: Number.isFinite(Date.parse(source.updatedAt)) ? new Date(source.updatedAt).toISOString() : "",
  };
}

export function readCodeMatrixDraft(profileId, storage) {
  const key = academicProfileStorageKey(profileId, "code-matrix-v1");
  try {
    storage ??= globalThis.localStorage;
    const value = key && storage?.getItem(key);
    return value ? normalizeCodeMatrixWorkspace(JSON.parse(value)) : null;
  } catch { return null; }
}

export function writeCodeMatrixDraft(profileId, workspace, storage) {
  const key = academicProfileStorageKey(profileId, "code-matrix-v1");
  if (!key) return false;
  try {
    storage ??= globalThis.localStorage;
    if (!storage) return false;
    storage.setItem(key, JSON.stringify(normalizeCodeMatrixWorkspace(workspace)));
    return true;
  } catch { return false; }
}

export function reconcileCodeMatrixDraft(remote, local, defaultLanguage) {
  const server = normalizeCodeMatrixWorkspace(remote, defaultLanguage);
  const restored = local && Date.parse(local.updatedAt) > (Date.parse(server.updatedAt) || 0);
  const result = restored ? normalizeCodeMatrixWorkspace(local, defaultLanguage) : server;
  return {
    ...result,
    setupDismissed: server.setupDismissed || local?.setupDismissed === true,
    completedSteps: [...new Set([...server.completedSteps, ...(local?.completedSteps || [])])],
  };
}

export function getCodeMatrixDiagnostics(stderr = "", language = "python") {
  const text = String(stderr).slice(0, 24_000);
  const patterns = language === "python"
    ? [/File "(?:<exec>|<code-matrix>|main\.py|<string>)", line (\d+)/g]
    : [/(?:Main\.java|main\.(?:c|cpp)|script\.js):(\d+)(?::(\d+))?/g, /<anonymous>:(\d+):(\d+)/g];
  let last = null;
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      last = { line: Math.max(1, Number(match[1]) - (language === "javascript" && match[0].startsWith("<anonymous>") ? 3 : 0)), column: Number(match[2]) || 1 };
      if (language !== "python") break;
    }
    if (last) break;
  }
  const lines = text.trim().split("\n").filter(Boolean);
  return text ? [{ ...last, message: lines.find((line) => /(?:error|exception):/i.test(line)) || lines.at(-1) || "Execution failed.", severity: "error" }] : [];
}

export function codeMatrixSetupNavigation(step, subjectName = "") {
  const query = new URLSearchParams({ from: "code-matrix" });
  if (subjectName) query.set("subject", subjectName);
  if (step === "subjects") return `/subjects?${query}#add-subject`;
  if (step === "notebook") return `/learn?${query}#notebook-preparation`;
  return `/planner/schedule?${query}`;
}
