import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, BookOpen, Bug, CalendarDays, Check, ChevronLeft, ChevronRight, CircleAlert, Code2, Download, FileCode2, LoaderCircle, Play, Plus, RotateCcw, Settings2, Square, Terminal, X } from "lucide-react";
import CodeMatrixEditor from "../components/CodeMatrixEditor";
import CodeMatrixTerminal from "../components/CodeMatrixTerminal";
import useCodeMatrixWorkspace from "../hooks/useCodeMatrixWorkspace.js";
import { getCodeMatrixEligibility, getCodeMatrixSetupSteps } from "../utils/codeMatrixProfile.js";
import { CODE_MATRIX_LANGUAGES, CODE_MATRIX_MAX_CODE, CODE_MATRIX_STARTERS, codeMatrixSetupNavigation, getCodeMatrixDiagnostics } from "../utils/codeMatrixWorkspace.js";
import { buildCodeMatrixPreview, createCodeMatrixBrowserRun } from "../utils/codeMatrixRuntime.js";
import "./CodeMatrixPage.css";

const SETUP_COPY = {
  subjects: { title: "Add your subjects", description: "Choose the subjects you’re studying to personalise your workspace.", button: "Add subject", icon: Plus },
  notebook: { title: "Prepare your first notebook", description: "Bring your subject notes, chapters, and topics together in a notebook.", button: "Start learning", icon: BookOpen },
  plan: { title: "Plan your study schedule", description: "Make room for your subjects around the time you have available.", button: "Create plan", icon: CalendarDays },
};
const SYNC_LABELS = { loading: "Loading your workspace…", saving: "Saving…", saved: "All changes saved", pending: "Saved on this device · syncing…", local: "Saved on this device · sync unavailable", unsaved: "Draft not saved · retry saving" };
const STATUS_LABELS = { success: "Completed", error: "Execution error", timeout: "Time limit reached", stopped: "Stopped", running: "Running", waiting: "Waiting for input", loading: "Preparing runtime" };
const EMPTY_DIAGNOSTICS = [];

function ResultTables({ tables }) {
  return tables.map((table, tableIndex) => (
    <div className="cmx-table-wrap" key={tableIndex}>
      <table>
        <caption>Result {tableIndex + 1} · {table.values.length} row{table.values.length === 1 ? "" : "s"}</caption>
        <thead><tr>{table.columns.map((column, index) => <th key={index} scope="col">{column}</th>)}</tr></thead>
        <tbody>{table.values.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell === null ? <em>NULL</em> : String(cell)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  ));
}

export default function CodeMatrixPage({ academicProfileDataId = "", userProfile = {}, subjects = [], schedule = [], workspaceLoaded = true }) {
  const eligibility = useMemo(() => getCodeMatrixEligibility(userProfile, subjects), [userProfile, subjects]);
  const { workspace, update, ready, syncState, setup, flush, retry } = useCodeMatrixWorkspace(academicProfileDataId, eligibility.defaultLanguage);
  const [showSetup, setShowSetup] = useState(false);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [runtimeMessage, setRuntimeMessage] = useState("");
  const [resultTab, setResultTab] = useState("output");
  const [webTab, setWebTab] = useState("");
  const [traceIndex, setTraceIndex] = useState(0);
  const [activeLine, setActiveLine] = useState(0);
  const [resetOpen, setResetOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState(null);
  const runRef = useRef(null);
  const runSequenceRef = useRef(0);
  const previewRef = useRef(null);
  const mountedRef = useRef(true);
  const language = CODE_MATRIX_LANGUAGES.find(({ id }) => id === workspace.language) || CODE_MATRIX_LANGUAGES[0];
  const isWeb = language.runtime === "preview";
  const editorLanguage = isWeb ? webTab || workspace.language : workspace.language;
  const editorFile = CODE_MATRIX_LANGUAGES.find(({ id }) => id === editorLanguage)?.file;
  const code = workspace.drafts[editorLanguage];
  const completedSteps = useMemo(() => [...new Set([...workspace.completedSteps, ...(setup?.completedSteps || [])])], [setup, workspace.completedSteps]);
  const steps = useMemo(() => getCodeMatrixSetupSteps({ subjects, schedule, completedSteps }), [subjects, schedule, completedSteps]);
  const remaining = steps.filter((step) => !step.complete);
  const setupVisible = showSetup || (!workspace.setupDismissed && remaining.length > 0);
  const unchanged = result?.code === code && result?.language === editorLanguage;
  const diagnosticLanguage = isWeb ? "javascript" : editorLanguage;
  const diagnosticCode = workspace.drafts[diagnosticLanguage];
  const errorDiagnostics = useMemo(() => result?.code === diagnosticCode && result?.language === diagnosticLanguage
    ? getCodeMatrixDiagnostics(result?.stderr, diagnosticLanguage) : EMPTY_DIAGNOSTICS, [diagnosticCode, diagnosticLanguage, result]);
  const diagnostics = editorLanguage === diagnosticLanguage ? errorDiagnostics : EMPTY_DIAGNOSTICS;
  const trace = unchanged ? result?.trace || [] : [];

  useEffect(() => { setResultTab(isWeb ? "preview" : "output"); }, [isWeb]);

  useEffect(() => {
    if (!ready || !workspaceLoaded) return;
    const observed = steps.filter((step) => step.complete).map((step) => step.id);
    if (observed.some((id) => !workspace.completedSteps.includes(id))) update({ completedSteps: observed });
  }, [ready, steps, update, workspace.completedSteps, workspaceLoaded]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; runSequenceRef.current += 1; runRef.current?.cancel(); };
  }, []);

  useEffect(() => {
    if (!preview) return;
    const onMessage = (event) => {
      if (event.source !== previewRef.current?.contentWindow || event.data?.channel !== preview.channel) return;
      const data = event.data;
      if (data.type === "console" || data.type === "error") {
        const value = String(data.message || data.text || "").slice(0, 4000);
        setResult((current) => {
          if (!current || current.previewChannel !== preview.channel) return current;
          const field = data.type === "error" || data.level === "error" ? "stderr" : "stdout";
          return { ...current, [field]: `${current[field] || ""}${value}\n`.slice(0, 24000), status: field === "stderr" ? "error" : current.status };
        });
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [preview]);

  const stop = useCallback(() => {
    runSequenceRef.current += 1;
    runRef.current?.cancel();
    runRef.current = null;
    setBusy(false);
    setWaiting(false);
    setPreview(null);
    setRuntimeMessage("");
    setResult((current) => current ? ({ ...current, status: "stopped" }) : current);
  }, []);

  const run = useCallback(async (debug = false) => {
    if (busy || !eligibility.eligible || !ready) return;
    if (new TextEncoder().encode(code).length > CODE_MATRIX_MAX_CODE) { setNotice("Keep this file under 50 KB before running."); return; }
    setNotice("");
    setTraceIndex(0);
    setActiveLine(0);
    const sequence = ++runSequenceRef.current;
    if (isWeb) {
      const channel = crypto.randomUUID();
      const srcDoc = buildCodeMatrixPreview({ html: workspace.drafts.html, css: workspace.drafts.css, javascript: workspace.drafts.javascript, channel });
      setResult({ status: "success", stdout: "", stderr: "", code: workspace.drafts.javascript, language: "javascript", previewChannel: channel });
      setPreview({ srcDoc, channel });
      setResultTab("preview");
      return;
    }
    setPreview(null);
    setBusy(true);
    setWaiting(false);
    setResultTab(debug ? "debug" : "output");
    setRuntimeMessage("Preparing your run…");
    const snapshot = { code, language: editorLanguage };
    setResult({ ...snapshot, stdout: '', stderr: '', status: 'loading' });
    try {
      const task = createCodeMatrixBrowserRun({ language: workspace.language, code, interactive: true, debug, onEvent: (event) => {
        if (!mountedRef.current || sequence !== runSequenceRef.current) return;
        if (event.type === 'output') setResult((current) => ({ ...current, ...event.result, ...snapshot, status: current?.status || 'running' }));
        if (event.type === 'input-request') { setWaiting(true); setResultTab('output'); }
        if (event.type === 'status') {
          setRuntimeMessage(event.message || 'Running your code…');
          setResult((current) => ({ ...current, status: event.status }));
        }
      } });
      runRef.current = task;
      const outcome = await task.promise;
      if (!mountedRef.current || sequence !== runSequenceRef.current) return;
      setResult({ ...outcome, ...snapshot });
      if (debug) setResultTab('debug');
      if (debug && outcome.trace?.length) setActiveLine(outcome.trace[0].line);
      else if (outcome.stderr) setActiveLine(getCodeMatrixDiagnostics(outcome.stderr, editorLanguage)[0]?.line || 0);
    } catch (error) {
      if (mountedRef.current && sequence === runSequenceRef.current) setResult({ ...snapshot, status: "error", stdout: "", stderr: error.message || "The code could not be executed. Please try again." });
    } finally {
      if (mountedRef.current && sequence === runSequenceRef.current) { setBusy(false); setWaiting(false); setRuntimeMessage(""); runRef.current = null; }
    }
  }, [busy, code, editorLanguage, eligibility.eligible, isWeb, ready, workspace]);

  const submitInput = (value) => {
    if (!runRef.current?.submitInput(value)) { setNotice('Input could not be sent. Keep terminal input under 64 KB per run.'); return false; }
    setWaiting(false);
    return true;
  };

  const editCode = useCallback((value) => {
    update((current) => ({ drafts: { ...current.drafts, [editorLanguage]: value } }));
    setActiveLine(0);
  }, [editorLanguage, update]);

  function changeLanguage(value) {
    if (busy) stop();
    update({ language: value });
    setWebTab("");
    setResult(null);
    setPreview(null);
    setActiveLine(0);
    setNotice("");
    setResetOpen(false);
    setResultTab(["html", "css"].includes(value) ? "preview" : "output");
  }

  function downloadCode() {
    const url = URL.createObjectURL(new Blob([code], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = editorFile; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const leaveSetup = () => { update({ setupDismissed: true }); setShowSetup(false); };
  const jumpTrace = (index) => { setTraceIndex(index); setActiveLine(trace[index]?.line || 0); };

  if (!ready || !workspaceLoaded) return <section className="cmx-page cmx-loading" role="status"><LoaderCircle className="cmx-spin" /> Opening CodeMatrix…</section>;
  return (
    <section className="cmx-page">
      <header className="cmx-header">
        <div className="cmx-heading">
          <Link className="cmx-back" to="/learn" aria-label="Back to Start Learning"><ArrowLeft size={20} /></Link>
          <div><h1><Code2 size={29} aria-hidden="true" />CodeMatrix<span className="cmx-beta">Compiler</span></h1></div>
        </div>
        <div className="cmx-header-actions">
          {!setupVisible && remaining.length > 0 && <button type="button" className="cmx-button cmx-quiet" onClick={() => { if (busy || preview) stop(); setShowSetup(true); }}><Settings2 size={15} />Finish setup <span>{3 - remaining.length}/3</span></button>}
          <span className={`cmx-sync is-${syncState}`} role="status"><span />{SYNC_LABELS[syncState]}</span>
          {["local", "unsaved"].includes(syncState) && <button type="button" className="cmx-button cmx-quiet" onClick={() => void retry()}>Retry sync</button>}
        </div>
      </header>

      {!eligibility.eligible ? (
        <section className="cmx-setup cmx-eligibility">
          <Code2 size={36} /><h2>A workspace for your coding subjects</h2>
          <p>{eligibility.reason} Add a relevant subject, or update your academic profile to match your course.</p>
          <div className="cmx-actions"><Link className="cmx-button cmx-primary" to={codeMatrixSetupNavigation("subjects")}>Add subject<ArrowRight size={16} /></Link><Link className="cmx-button" to="/settings">Academic profile</Link></div>
        </section>
      ) : setupVisible ? (
        <section className="cmx-setup" aria-labelledby="cmx-setup-title">
          <div className="cmx-setup-heading"><span className="cmx-eyebrow">YOUR WORKSPACE, YOUR WAY</span><span className="cmx-setup-progress">{3 - remaining.length} of 3 ready</span></div>
          <h2 id="cmx-setup-title">Get your study workspace ready.</h2>
          <p>Add your subjects, prepare a notebook, and make a plan.<br />You can also start coding right away.</p>
          <div className="cmx-setup-cards">
            {remaining.map((step) => {
              const copy = SETUP_COPY[step.id]; const Icon = copy.icon;
              return <article className={`cmx-setup-card ${step.recommended ? "is-recommended" : ""}`} key={step.id}>
                <div className="cmx-setup-card-top"><span className="cmx-setup-icon"><Icon size={22} /></span><span>{step.recommended ? "Recommended next" : `0${steps.findIndex(({ id }) => id === step.id) + 1}`}</span></div>
                <h3>{copy.title}</h3><p>{copy.description}</p>
                <Link className={`cmx-button ${step.recommended ? "cmx-primary" : ""}`} onClick={() => void flush()} to={codeMatrixSetupNavigation(step.id, subjects.at(-1)?.name || "")}>{copy.button}<ArrowRight size={16} /></Link>
              </article>;
            })}
          </div>
          {remaining.length === 0 && <p className="cmx-setup-complete"><Check size={18} />Your study workspace is ready.</p>}
          <div className="cmx-setup-footer"><span>Complete these in any order. We’ll remember your progress.</span><button type="button" className="cmx-button cmx-primary" onClick={leaveSetup}>Continue to compiler<ArrowRight size={17} /></button></div>
        </section>
      ) : (
        <>
          <div className="cmx-toolbar">
            <label className="cmx-language"><span>Language</span><select aria-label="Programming language" value={workspace.language} onChange={(event) => changeLanguage(event.target.value)}>{CODE_MATRIX_LANGUAGES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
            <span className="cmx-runtime-label">{isWeb ? "Web preview" : workspace.language === "sql" ? "SQLite · practice database" : "Runs in your browser"}</span>
            <div className="cmx-actions">
              {(busy || preview) && <button type="button" className="cmx-button" onClick={stop}><Square size={15} />Stop</button>}
              <button type="button" className="cmx-button" disabled={busy} onClick={() => void run(true)} title={workspace.language === "python" ? "Run with a recorded line and variable trace" : "Run code and inspect errors"}><Bug size={16} />Debug</button>
              <button type="button" className="cmx-button cmx-primary" disabled={busy} onClick={() => void run()}>{busy ? <LoaderCircle className="cmx-spin" size={16} /> : <Play size={16} fill="currentColor" />} {busy ? "Running…" : isWeb ? "Run preview" : "Run code"}</button>
            </div>
          </div>
          {notice && <div className="cmx-notice" role="alert"><CircleAlert size={18} />{notice}<button type="button" aria-label="Dismiss message" onClick={() => setNotice("")}><X size={16} /></button></div>}
          <div className="cmx-workbench">
            <section className="cmx-source" aria-label="Source code">
              <div className="cmx-panel-bar">
                {isWeb ? <div className="cmx-file-tabs" role="tablist" aria-label="Web files">{["html", "css", "javascript"].map((id) => <button type="button" role="tab" aria-selected={editorLanguage === id} key={id} onClick={() => { setWebTab(id); setActiveLine(0); }}>{CODE_MATRIX_LANGUAGES.find((item) => item.id === id).file}</button>)}</div> : <span><FileCode2 size={15} />{editorFile}</span>}
                <div className="cmx-file-actions"><button type="button" aria-label="Download code" title="Download code" onClick={downloadCode}><Download size={16} /></button><button type="button" aria-label="Reset code to starter" title="Reset code to starter" onClick={() => setResetOpen(!resetOpen)}><RotateCcw size={15} /></button></div>
              </div>
              {resetOpen && <div className="cmx-reset" role="group" aria-label="Confirm resetting code"><span>Replace {editorFile} with its starter code?</span><button type="button" onClick={() => { editCode(CODE_MATRIX_STARTERS[editorLanguage]); setResetOpen(false); }}>Reset file</button><button type="button" onClick={() => setResetOpen(false)}>Cancel</button></div>}
              <CodeMatrixEditor key={editorLanguage} value={code} language={editorLanguage} onChange={editCode} onRun={() => void run()} onLimit={() => setNotice("Each code file can contain up to 50 KB. The edit exceeded that limit.")} diagnostics={diagnostics} activeLine={activeLine} />
              <div className="cmx-editor-footer"><span>{code.split("\n").length} lines · {code.length.toLocaleString()} characters</span><span>UTF-8</span></div>
            </section>
            <section className="cmx-results" aria-label="Execution results">
              <div className="cmx-panel-bar cmx-result-tabs" role="tablist" aria-label="Results">
                {isWeb && <button type="button" role="tab" aria-selected={resultTab === "preview"} onClick={() => setResultTab("preview")}>Preview</button>}
                <button type="button" role="tab" aria-selected={resultTab === "output"} onClick={() => setResultTab("output")}><Terminal size={15} />Output</button>
                <button type="button" role="tab" aria-selected={resultTab === "debug"} onClick={() => setResultTab("debug")}><Bug size={15} />Debug{errorDiagnostics.length > 0 && <span className="cmx-error-count">{errorDiagnostics.length}</span>}</button>
              </div>
              {result && <div className={`cmx-result-status is-${result.status}`} role="status"><span>{STATUS_LABELS[result.status] || result.status}{!unchanged && !isWeb && result.code && " · code changed since this run"}</span>{Number.isFinite(result.durationMs) && <span>{(result.durationMs / 1000).toFixed(2)} s</span>}</div>}
              <div className="cmx-result-content" role="tabpanel" aria-label={resultTab === "preview" ? "Web preview" : resultTab === "debug" ? "Debug results" : "Program output"}>
                {preview && <iframe ref={previewRef} title="CodeMatrix webpage preview" hidden={resultTab !== "preview"} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={preview.srcDoc} />}
                {busy && !waiting && <div className="cmx-running-message" role="status"><LoaderCircle className="cmx-spin" size={14} />{runtimeMessage}</div>}
                {resultTab === "preview" ? (
                  preview ? null : <div className="cmx-empty"><Code2 size={30} /><strong>Your page will appear here</strong><span>Edit the three files and select Run preview.</span></div>
                ) : resultTab === "debug" ? (
                  <div className="cmx-debug-content">
                    <p className="cmx-debug-caption">{workspace.language === "python" ? "Debug records the lines and variables from your Python run. Step through the captured trace below." : "Run with Debug to inspect compiler and runtime errors. Line-by-line traces are available for Python."}</p>
                    {trace.length > 0 && <div className="cmx-trace"><div className="cmx-trace-controls"><button type="button" aria-label="Previous trace step" disabled={traceIndex === 0} onClick={() => jumpTrace(traceIndex - 1)}><ChevronLeft size={17} /></button><span>Step {traceIndex + 1} / {trace.length} · Line {trace[traceIndex]?.line}</span><button type="button" aria-label="Next trace step" disabled={traceIndex >= trace.length - 1} onClick={() => jumpTrace(traceIndex + 1)}><ChevronRight size={17} /></button></div><h3>Variables before this line</h3><dl>{Object.entries(trace[traceIndex]?.locals || {}).map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{String(value)}</dd></div>)}</dl>{Object.keys(trace[traceIndex]?.locals || {}).length === 0 && <p>No variables yet.</p>}</div>}
                    {result?.stderr ? <><strong className="cmx-error-heading">Execution details</strong><pre className="cmx-stderr">{result.stderr}</pre>{errorDiagnostics[0]?.line && <button type="button" className="cmx-button" onClick={() => { if (isWeb) setWebTab("javascript"); setActiveLine(errorDiagnostics[0].line); }}>Go to {isWeb ? "script.js · " : ""}line {errorDiagnostics[0].line}<ArrowRight size={14} /></button>}</> : result ? <p className="cmx-debug-success"><Check size={16} />{result.status === "stopped" ? "Execution was stopped." : "No runtime errors were reported."}</p> : <div className="cmx-empty"><Bug size={28} /><strong>Find what needs fixing</strong><span>Select Debug to run and inspect your code.</span></div>}
                  </div>
                ) : result ? (
                  <div className="cmx-output"><ResultTables tables={result.tables || []} /><CodeMatrixTerminal output={result.stdout} error={result.stderr} waiting={waiting} busy={busy || !!result.tables?.length} onInput={submitInput} /></div>
                ) : <div className="cmx-empty"><Terminal size={30} /><strong>Your output starts here</strong><span>Run your code. Type here when your program asks for input.</span><kbd>Ctrl / ⌘ + Enter</kbd></div>}
              </div>
            </section>
          </div>
          <footer className="cmx-footnote"><span id="code-matrix-editor-help">Ctrl / ⌘ + Enter to run · Tab to indent · Esc, then Tab to leave the editor</span><span>{workspace.language === "sql" ? "Each run starts with a fresh SQLite database." : isWeb ? "Preview is isolated from your account." : "Your code is saved separately for each language."}</span></footer>
        </>
      )}
    </section>
  );
}
