import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

const LANGUAGE_LABELS = Object.freeze({
  bash: "Bash",
  c: "C",
  "c#": "C#",
  "c++": "C++",
  cpp: "C++",
  csharp: "C#",
  css: "CSS",
  go: "Go",
  html: "HTML",
  java: "Java",
  javascript: "JavaScript",
  js: "JavaScript",
  json: "JSON",
  jsx: "JSX",
  kotlin: "Kotlin",
  markdown: "Markdown",
  md: "Markdown",
  php: "PHP",
  plaintext: "Plain text",
  powershell: "PowerShell",
  ps1: "PowerShell",
  py: "Python",
  python: "Python",
  rb: "Ruby",
  ruby: "Ruby",
  rust: "Rust",
  sh: "Shell",
  shell: "Shell",
  sql: "SQL",
  swift: "Swift",
  text: "Plain text",
  ts: "TypeScript",
  tsx: "TSX",
  typescript: "TypeScript",
  xml: "XML",
  yaml: "YAML",
  yml: "YAML",
});

function languageLabel(value = "") {
  const normalized = String(value)
    .trim()
    .toLocaleLowerCase()
    .replace(/^language-/u, "")
    .split(/\s+/u)[0]
    .replace(/[^a-z0-9+#.-]/gu, "");

  if (!normalized) return "Code";
  return LANGUAGE_LABELS[normalized]
    || normalized.charAt(0).toLocaleUpperCase() + normalized.slice(1);
}

export default function AssistantCodeBlock({ code = "", language = "" }) {
  const copiedTimerRef = useRef(null);
  const [copiedCode, setCopiedCode] = useState("");
  const normalizedCode = String(code).replace(/\n$/u, "");
  const label = languageLabel(language);
  const copied = copiedCode === normalizedCode && Boolean(normalizedCode);

  useEffect(() => () => {
    if (copiedTimerRef.current) window.clearTimeout(copiedTimerRef.current);
  }, []);

  const copyCode = async () => {
    if (!normalizedCode || !navigator.clipboard?.writeText) return;

    try {
      await navigator.clipboard.writeText(normalizedCode);
      setCopiedCode(normalizedCode);
      if (copiedTimerRef.current) window.clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = window.setTimeout(() => setCopiedCode(""), 1800);
    } catch {
      setCopiedCode("");
    }
  };

  return (
    <section
      aria-label={`${label} code snippet`}
      className="assistant-code-block"
    >
      <header className="assistant-code-toolbar">
        <span aria-hidden="true" className="assistant-code-window-dots">
          <i />
          <i />
          <i />
        </span>
        <span className="assistant-code-language">{label}</span>
        <button
          aria-label={copied ? "Code copied" : `Copy ${label} code`}
          className={`assistant-code-copy${copied ? " is-copied" : ""}`}
          disabled={!normalizedCode}
          onClick={copyCode}
          type="button"
        >
          {copied
            ? <Check aria-hidden="true" size={14} strokeWidth={2.4} />
            : <Copy aria-hidden="true" size={14} strokeWidth={2.2} />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </header>
      <div
        aria-label={`Scrollable ${label} code`}
        className="assistant-code-viewport"
        role="region"
        tabIndex={0}
      >
        <pre><code>{normalizedCode || " "}</code></pre>
      </div>
    </section>
  );
}
