import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, ArrowRight, BookOpen, Bug, CalendarDays, Check, ChevronLeft, ChevronRight, CircleAlert, Code2, Download, FileCode2, LoaderCircle, Maximize2, Minimize2, Play, Plus, RotateCcw, Settings2, Square, Terminal, X } from "lucide-react";
import CodeMatrixEditor from "../components/CodeMatrixEditor";
import CodeMatrixTerminal from "../components/CodeMatrixTerminal";
import CodeMatrixAssistant from '../components/CodeMatrixAssistant';
import CodeMatrixPracticePanel from '../components/CodeMatrixPracticePanel';
import CodeMatrixTestResults from '../components/CodeMatrixTestResults';
import api from '../utils/apiClient';
import { codeReviewSnapshot, codeReviewMatchesDraft, createCodeReviewSession } from '../utils/codeMatrixReview';
import useCodeMatrixWorkspace from "../hooks/useCodeMatrixWorkspace.js";
import useCodeRunRewards from '../hooks/useCodeRunRewards';
import useCodeMatrixTracking from '../hooks/useCodeMatrixTracking';
import useCodeMatrixPractice from '../hooks/useCodeMatrixPractice';
import { getCodeMatrixEligibility, getCodeMatrixSetupSteps } from "../utils/codeMatrixProfile.js";
import { normalizeCodeMatrixLaunch } from "../utils/codeMatrixLaunch.js";
import { CODE_MATRIX_LANGUAGES, CODE_MATRIX_MAX_CODE, CODE_MATRIX_STARTERS, codeMatrixSetupNavigation, getCodeMatrixDiagnostics } from "../utils/codeMatrixWorkspace.js";
import { buildCodeMatrixPreview, createCodeMatrixBrowserRun } from "../utils/codeMatrixRuntime.js";
import { normalizePlacementCodeMatrixHandoff } from "../utils/placementCodeMatrix.js";
import { resolveCodeMatrixShortcut } from "../utils/codeMatrixShortcuts.js";
import { CODE_MATRIX_PRACTICE_LANGUAGES, CODE_MATRIX_PRACTICE_QUESTIONS, isSuccessfulPracticeResult, practiceResultMatchesDraft, readCodeMatrixPracticeState } from '../utils/codeMatrixPractice.js';
import { createCodeMatrixPracticeRun } from '../utils/codeMatrixPracticeRunner.js';
import { celebrateCompletion } from '../utils/completionCelebration.js';
import "./CodeMatrixPage.css";

const SETUP_COPY = {
  subjects: { title: "Add your subjects", description: "Choose the subjects you’re studying to personalise your workspace.", button: "Add subject", icon: Plus },
  notebook: { title: "Prepare your first notebook", description: "Bring your subject notes, chapters, and topics together in a notebook.", button: "Start learning", icon: BookOpen },
  plan: { title: "Plan your study schedule", description: "Make room for your subjects around the time you have available.", button: "Create plan", icon: CalendarDays },
};
const SYNC_LABELS = { loading: "Loading your workspace…", saving: "Saving…", saved: "All changes saved", pending: "Saved on this device · syncing…", local: "Saved on this device · sync unavailable", unsaved: "Draft not saved · retry saving" };
const STATUS_LABELS = { success: "Completed", error: "Execution error", timeout: "Time limit reached", stopped: "Stopped", running: "Running", waiting: "Waiting for input", loading: "Preparing runtime" };
const EMPTY_DIAGNOSTICS = [];
const CodeMatrixInsights = lazy(() => import('../components/CodeMatrixInsights'));

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

export default function CodeMatrixPage({
  academicProfileDataId = "",
  embedded = false,
  launch = null,
  userProfile = {},
  subjects = [],
  schedule = [],
  workspaceLoaded = true,
}) {
  const location = useLocation();
  const routePlacementHandoff = useMemo(
    () => normalizePlacementCodeMatrixHandoff(location.state?.placementCodeMatrix),
    [location.state],
  );
  const popupLaunch = useMemo(() => normalizeCodeMatrixLaunch(launch), [launch]);
  const activeLaunch = popupLaunch || routePlacementHandoff;
  const recordSuccessfulRun = useCodeRunRewards(academicProfileDataId);
  const eligibility = useMemo(() => getCodeMatrixEligibility(userProfile, subjects), [userProfile, subjects]);
  const compilerAvailable = embedded || eligibility.eligible;
  const { workspace, update, ready, syncState, setup, flush, retry } = useCodeMatrixWorkspace(
    academicProfileDataId,
    activeLaunch?.language || eligibility.defaultLanguage,
  );
  const [showSetup, setShowSetup] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [runtimeMessage, setRuntimeMessage] = useState("");
  const [resultTab, setResultTab] = useState("output");
  const [webTab, setWebTab] = useState("");
  const [traceIndex, setTraceIndex] = useState(0);
  const [activeLine, setActiveLine] = useState(0);
  const [lineRequest, setLineRequest] = useState(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState(null);
  const [sourceSplit, setSourceSplit] = useState(0.55);
  const [sourceFullscreen, setSourceFullscreen] = useState(false);
  const [assistantAvailability, setAssistantAvailability] = useState('loading');
  const [assistantConnectionAttempt, setAssistantConnectionAttempt] = useState(0);
  const [sessionLanguage, setSessionLanguage] = useState("");
  const [sessionDrafts, setSessionDrafts] = useState(null);
  const [practiceLanguage, setPracticeLanguage] = useState(() => {
    const saved = readCodeMatrixPracticeState(academicProfileDataId);
    return saved.selectedQuestionId ? saved.selectedLanguage || '' : '';
  });
  const [questionOffset, setQuestionOffset] = useState(0);
  const [showSolvedQuestions, setShowSolvedQuestions] = useState(false);
  const reviewSession = useMemo(() => createCodeReviewSession((snapshot, requestId) => api.post('/api/code-matrix/review', snapshot, {
    academicProfileId: academicProfileDataId, headers: { 'Idempotency-Key': requestId }, timeoutMs: 55_000,
  })), [academicProfileDataId]);
  const reviewSnapshot = useMemo(() => !busy && result?.kind !== 'practice' ? codeReviewSnapshot(result) : null, [busy, result]);
  const runRef = useRef(null);
  const runAttemptRef = useRef(null);
  const insightsButtonRef = useRef(null);
  const pageRef = useRef(null);
  const runSequenceRef = useRef(0);
  const previewRef = useRef(null);
  const workbenchRef = useRef(null);
  const sourceRef = useRef(null);
  const resizeCleanupRef = useRef(null);
  const appliedLaunchRef = useRef("");
  const mountedRef = useRef(true);
  const sessionMode = Boolean(embedded && activeLaunch?.source === "chat" && activeLaunch.code);
  const compilerLanguage = sessionMode
    ? sessionLanguage || activeLaunch.language
    : workspace.language;
  const workspaceLanguage = practiceLanguage || compilerLanguage;
  const practice = useCodeMatrixPractice(academicProfileDataId, workspaceLanguage);
  const { question: practiceQuestion, updateDraft: updatePracticeDraft, markSolved: markPracticeSolved, exitPractice } = practice;
  const practiceActive = Boolean(practice.question);
  const suggestedQuestions = useMemo(() => {
    const ordered = [...CODE_MATRIX_PRACTICE_QUESTIONS].sort((left, right) =>
      Number(practice.solvedIds.includes(left.id)) - Number(practice.solvedIds.includes(right.id)));
    return Array.from({ length: 3 }, (_, index) => ordered[(questionOffset + index) % ordered.length]);
  }, [practice.solvedIds, questionOffset]);
  const solvedQuestions = CODE_MATRIX_PRACTICE_QUESTIONS.filter((question) => practice.solvedIds.includes(question.id));
  const compilerDrafts = sessionMode && sessionDrafts ? sessionDrafts : workspace.drafts;
  const drafts = useMemo(() => practiceActive ? { ...compilerDrafts, [workspaceLanguage]: practice.draft ?? '' } : compilerDrafts,
    [compilerDrafts, practiceActive, practice.draft, workspaceLanguage]);
  const language = CODE_MATRIX_LANGUAGES.find(({ id }) => id === workspaceLanguage) || CODE_MATRIX_LANGUAGES[0];
  const isWeb = language.runtime === "preview";
  const editorLanguage = isWeb ? webTab || workspaceLanguage : workspaceLanguage;
  const editorFile = CODE_MATRIX_LANGUAGES.find(({ id }) => id === editorLanguage)?.file;
  const code = drafts[editorLanguage];
  const completedSteps = useMemo(() => [...new Set([...workspace.completedSteps, ...(setup?.completedSteps || [])])], [setup, workspace.completedSteps]);
  const steps = useMemo(() => getCodeMatrixSetupSteps({ subjects, schedule, completedSteps }), [subjects, schedule, completedSteps]);
  const remaining = steps.filter((step) => !step.complete);
  const setupVisible = !embedded && (showSetup || (
    !activeLaunch && !workspace.setupDismissed && remaining.length > 0
  ));
  const { begin: beginAttempt, finish: finishAttempt, previewError, recordInput, markActivity, pauseActivity, flush: flushInsights } = useCodeMatrixTracking({
    academicProfileDataId,
    embedded,
    context: activeLaunch?.source || 'manual',
    language: isWeb ? 'web' : workspaceLanguage,
    enabled: ready && workspaceLoaded && compilerAvailable && !setupVisible && !insightsOpen,
  });
  const unchanged = result?.kind === 'practice'
    ? practiceResultMatchesDraft(result, practice.question, editorLanguage, code)
    : result?.code === code && result?.language === editorLanguage;
  const diagnosticLanguage = isWeb ? "javascript" : editorLanguage;
  const diagnosticCode = drafts[diagnosticLanguage];
  const errorDiagnostics = useMemo(() => result?.code === diagnosticCode && result?.language === diagnosticLanguage
    ? getCodeMatrixDiagnostics(result?.stderr, diagnosticLanguage) : EMPTY_DIAGNOSTICS, [diagnosticCode, diagnosticLanguage, result]);
  const diagnostics = editorLanguage === diagnosticLanguage ? errorDiagnostics : EMPTY_DIAGNOSTICS;
  const trace = unchanged ? result?.trace || [] : [];

  useEffect(() => { setResultTab(practice.panelOpen || practiceActive ? 'problem' : isWeb ? "preview" : "output"); }, [isWeb, practice.panelOpen, practiceActive]);
  useEffect(() => {
    if (practiceActive && !CODE_MATRIX_PRACTICE_LANGUAGES.includes(workspaceLanguage)) setPracticeLanguage('python');
  }, [practiceActive, workspaceLanguage]);

  useEffect(() => {
    const onReward = (event) => {
      const reward = event.detail;
      if (reward?.academicProfileId !== academicProfileDataId) return;
      setResult((current) => current?.rewardRunId === reward.runId ? {
        ...current, reward: { xp: reward.awardedXp, awarded: reward.awardedXp > 0 && !reward.duplicate },
      } : current);
    };
    window.addEventListener('prepmatrix:code-reward-recorded', onReward);
    return () => window.removeEventListener('prepmatrix:code-reward-recorded', onReward);
  }, [academicProfileDataId]);

  useEffect(() => {
    if (!compilerAvailable) return undefined;
    let active = true;
    setAssistantAvailability('loading');
    api.get('/api/code-matrix/assistant', { academicProfileId: academicProfileDataId }).then((response) => {
      if (active) setAssistantAvailability(response.available ? 'available' : 'unavailable');
    }).catch(() => { if (active) setAssistantAvailability('error'); });
    return () => { active = false; };
  }, [academicProfileDataId, assistantConnectionAttempt, compilerAvailable]);

  useEffect(() => {
    // The editor mounts after the workspace loads; read its current ref on each event.
    const syncFullscreen = () => setSourceFullscreen(Boolean(sourceRef.current) && document.fullscreenElement === sourceRef.current);
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  useEffect(() => {
    if (!resetOpen) return undefined;
    const closeOnEscape = (event) => { if (event.key === "Escape") setResetOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [resetOpen]);

  useEffect(() => {
    if (!ready || !workspaceLoaded) return;
    const observed = steps.filter((step) => step.complete).map((step) => step.id);
    if (observed.some((id) => !workspace.completedSteps.includes(id))) update({ completedSteps: observed });
  }, [ready, steps, update, workspace.completedSteps, workspaceLoaded]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; runSequenceRef.current += 1; runRef.current?.cancel(); resizeCleanupRef.current?.(); };
  }, []);

  useEffect(() => {
    if (!preview) return;
    const onMessage = (event) => {
      if (event.source !== previewRef.current?.contentWindow || event.data?.channel !== preview.channel) return;
      const data = event.data;
      if (data.type === "console" || data.type === "error") {
        const value = String(data.message || data.text || "").slice(0, 4000);
        // Explicit console.error calls can be intentional; only runtime errors
        // change the web-practice insight for this preview.
        if (data.type === 'error') previewError(preview.trackingAttempt, { status: 'error', stderr: value });
        setResult((current) => {
          if (!current || current.previewChannel !== preview.channel) return current;
          const field = data.type === "error" || data.level === "error" ? "stderr" : "stdout";
          return { ...current, [field]: `${current[field] || ""}${value}\n`.slice(0, 24000), status: field === "stderr" ? "error" : current.status };
        });
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [preview, previewError]);

  const stop = useCallback(() => {
    runSequenceRef.current += 1;
    runRef.current?.cancel();
    runRef.current = null;
    runAttemptRef.current = null;
    setBusy(false);
    setWaiting(false);
    setPreview(null);
    setRuntimeMessage("");
    setResult((current) => current && (['loading', 'running', 'waiting'].includes(current.status) || current.previewChannel) ? ({ ...current, status: "stopped", ...(current.kind === 'practice' ? {
      cases: current.cases.map((testCase) => testCase.status === 'pending' ? { ...testCase, status: 'skipped' } : testCase),
    } : {}) }) : current);
  }, []);

  useEffect(() => {
    stop();
    const saved = readCodeMatrixPracticeState(academicProfileDataId);
    setPracticeLanguage(saved.selectedQuestionId ? saved.selectedLanguage || '' : '');
    setShowSolvedQuestions(false);
    setResult(null);
    setResetOpen(false);
    setActiveLine(0);
    setLineRequest(null);
  }, [academicProfileDataId, stop]);

  useEffect(() => {
    if (!ready || !activeLaunch) return;
    const handoffKey = `${embedded ? "embedded" : location.key}:${activeLaunch.id}:${activeLaunch.language}`;
    if (appliedLaunchRef.current === handoffKey) return;
    appliedLaunchRef.current = handoffKey;
    stop();
    exitPractice();
    setPracticeLanguage('');
    setShowSolvedQuestions(false);
    if (sessionMode) {
      setSessionLanguage(activeLaunch.language);
      setSessionDrafts({
        ...workspace.drafts,
        [activeLaunch.language]: activeLaunch.code,
      });
    } else if (workspace.language !== activeLaunch.language) {
      update({ language: activeLaunch.language });
    }
    setShowSetup(false);
    setWebTab(["html", "css"].includes(activeLaunch.language) ? activeLaunch.language : "");
    setResult(null);
    setPreview(null);
    setResultTab(["html", "css"].includes(activeLaunch.language) ? "preview" : "output");
    setTraceIndex(0);
    setActiveLine(0);
    setLineRequest(null);
    setNotice("");
  }, [activeLaunch, busy, embedded, exitPractice, location.key, ready, sessionMode, stop, update, workspace.drafts, workspace.language]);

  const run = useCallback(async (debug = false) => {
    if (busy || runRef.current || !compilerAvailable || !ready) return;
    if (new TextEncoder().encode(code).length > CODE_MATRIX_MAX_CODE) { setNotice("Keep this file under 50 KB before running."); return; }
    pauseActivity();
    setNotice("");
    setTraceIndex(0);
    setActiveLine(0);
    setLineRequest(null);
    const sequence = ++runSequenceRef.current;
    if (isWeb) {
      setBusy(true);
      const channel = crypto.randomUUID();
      try {
        const srcDoc = await buildCodeMatrixPreview({ html: drafts.html, css: drafts.css, javascript: drafts.javascript, channel });
        if (!mountedRef.current || sequence !== runSequenceRef.current) return;
        const trackingAttempt = beginAttempt({ language: 'web', files: { html: drafts.html, css: drafts.css, javascript: drafts.javascript } });
        finishAttempt(trackingAttempt, { status: 'preview' });
        setResult({ status: "success", stdout: "", stderr: "", code: drafts.javascript, language: "javascript", previewChannel: channel, files: { html: drafts.html, css: drafts.css } });
        setPreview({ srcDoc, channel, trackingAttempt });
        setResultTab("preview");
      } catch {
        if (mountedRef.current && sequence === runSequenceRef.current) setNotice('The web preview could not be prepared. Please try again.');
      } finally {
        if (mountedRef.current && sequence === runSequenceRef.current) setBusy(false);
      }
      return;
    }
    setPreview(null);
    setBusy(true);
    setWaiting(false);
    setResultTab(debug ? "debug" : "output");
    setRuntimeMessage("Preparing your run…");
    const snapshot = { code, language: editorLanguage };
    const rewardRunId = crypto.randomUUID();
    const trackingAttempt = beginAttempt(snapshot);
    runAttemptRef.current = trackingAttempt;
    const question = practiceQuestion;
    const isPracticeRun = Boolean(question && !debug);
    setResult({ ...snapshot, stdout: '', stderr: '', status: 'loading', ...(isPracticeRun ? {
      kind: 'practice', questionId: question.id, version: question.version,
      total: question.testCases.length, passed: 0,
      cases: question.testCases.map((testCase) => ({ ...testCase, status: 'pending', passed: false, stdout: '', stderr: '' })), rewardRunId,
    } : {}) });
    if (isPracticeRun) setResultTab('tests');
    try {
      const task = isPracticeRun ? createCodeMatrixPracticeRun({ question, language: workspaceLanguage, code, onEvent: (event) => {
        if (!mountedRef.current || sequence !== runSequenceRef.current) return;
        if (event.type === 'case-start') {
          setRuntimeMessage(`Checking test ${event.index + 1} of ${event.total}…`);
          setResult((current) => ({ ...current, status: 'running' }));
        }
        if (event.type === 'case-result') setResult((current) => ({
          ...current, passed: event.passed,
          cases: current.cases.map((testCase) => testCase.id === event.caseId ? event.case : testCase),
        }));
      } }) : createCodeMatrixBrowserRun({ language: workspaceLanguage, code,
        input: question?.testCases[0]?.input || '', interactive: !question, debug, onEvent: (event) => {
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
      // Persist the outcome even when closing the popup cancels its runtime.
      finishAttempt(trackingAttempt, outcome);
      if (!mountedRef.current || sequence !== runSequenceRef.current) return;
      setResult({ ...outcome, ...snapshot, ...(isPracticeRun ? { kind: 'practice', rewardRunId } : {}) });
      if (outcome.status === 'success' && code.trim()) {
        if (isPracticeRun && isSuccessfulPracticeResult(outcome, question)) {
          markPracticeSolved(outcome);
          recordSuccessfulRun(rewardRunId, editorLanguage, {
            questionId: question.id, version: question.version,
            results: outcome.cases.map(({ id, status, stdout }) => ({ id, status, stdout })),
          });
          // Keep the celebration above the embedded CodeMatrix window.
          celebrateCompletion({ zIndex: 14700 });
        } else if (!question) recordSuccessfulRun(rewardRunId, editorLanguage);
      }
      if (debug) setResultTab('debug');
      if (debug && outcome.trace?.length) setActiveLine(outcome.trace[0].line);
      else if (outcome.stderr) setActiveLine(getCodeMatrixDiagnostics(outcome.stderr, editorLanguage)[0]?.line || 0);
    } catch (error) {
      finishAttempt(trackingAttempt, { status: 'error', errorOrigin: 'environment', stderr: error.message });
      if (mountedRef.current && sequence === runSequenceRef.current) setResult((current) => ({ ...current, ...snapshot, status: "error", errorOrigin: 'environment', stdout: "", stderr: error.message || "The code could not be executed. Please try again." }));
    } finally {
      if (mountedRef.current && sequence === runSequenceRef.current) { setBusy(false); setWaiting(false); setRuntimeMessage(""); runRef.current = null; runAttemptRef.current = null; }
    }
  }, [beginAttempt, busy, code, compilerAvailable, drafts, editorLanguage, finishAttempt, isWeb, markPracticeSolved, pauseActivity, practiceQuestion, ready, recordSuccessfulRun, workspaceLanguage]);

  const submitInput = (value) => {
    if (!runRef.current?.submitInput(value)) { setNotice('Input could not be sent. Keep terminal input under 64 KB per run.'); return false; }
    recordInput(runAttemptRef.current, value);
    markActivity();
    pauseActivity();
    setWaiting(false);
    return true;
  };

  const editCode = useCallback((value) => {
    markActivity();
    if (practiceActive) updatePracticeDraft(value);
    else if (sessionMode) {
      setSessionDrafts((current) => ({
        ...workspace.drafts,
        ...(current || {}),
        [editorLanguage]: value,
      }));
    } else {
      update((current) => ({ drafts: { ...current.drafts, [editorLanguage]: value } }));
    }
    setActiveLine(0);
  }, [editorLanguage, markActivity, practiceActive, sessionMode, update, updatePracticeDraft, workspace.drafts]);

  const updateSourceSplit = useCallback((clientX) => {
    const workbench = workbenchRef.current;
    if (!workbench) return;
    const bounds = workbench.getBoundingClientRect();
    const nextSplit = (clientX - bounds.left) / bounds.width;
    setSourceSplit(Math.min(0.7, Math.max(0.3, nextSplit)));
  }, []);

  const startResize = useCallback((event) => {
    if (event.button !== 0) return;
    const workbench = workbenchRef.current;
    if (!workbench || workbench.getBoundingClientRect().width < 750) return;
    event.preventDefault();
    resizeCleanupRef.current?.();
    const onMove = (moveEvent) => updateSourceSplit(moveEvent.clientX);
    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", cleanup);
      window.removeEventListener("pointercancel", cleanup);
      document.body.classList.remove("cmx-is-resizing");
      resizeCleanupRef.current = null;
    };
    resizeCleanupRef.current = cleanup;
    document.body.classList.add("cmx-is-resizing");
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", cleanup);
    window.addEventListener("pointercancel", cleanup);
  }, [updateSourceSplit]);

  const adjustSourceSplit = useCallback((amount) => {
    setSourceSplit((current) => Math.min(0.7, Math.max(0.3, current + amount)));
  }, []);

  const handleResizeKeyDown = useCallback((event) => {
    if (event.key === "ArrowLeft") { event.preventDefault(); adjustSourceSplit(-0.05); }
    if (event.key === "ArrowRight") { event.preventDefault(); adjustSourceSplit(0.05); }
  }, [adjustSourceSplit]);

  const toggleSourceFullscreen = useCallback(async () => {
    const source = sourceRef.current;
    if (!source) return;
    if (document.fullscreenElement === source) {
      await document.exitFullscreen();
      return;
    }
    if (sourceFullscreen) { setSourceFullscreen(false); return; }
    try {
      if (typeof source.requestFullscreen !== "function") throw new Error("Fullscreen is unavailable");
      await source.requestFullscreen();
    } catch {
      setSourceFullscreen(true);
    }
  }, [sourceFullscreen]);

  function changeLanguage(value) {
    stop();
    if (practice.panelOpen || practiceActive) { setPracticeLanguage(value); practice.setLanguage(value); }
    else if (sessionMode) setSessionLanguage(value);
    else update({ language: value });
    setWebTab("");
    setResult(null);
    setPreview(null);
    setActiveLine(0);
    setLineRequest(null);
    setNotice("");
    setResetOpen(false);
    setResultTab(practice.panelOpen || practiceActive ? 'problem' : ["html", "css"].includes(value) ? "preview" : "output");
  }

  const openPractice = () => {
    stop();
    setShowSolvedQuestions(false);
    if (!CODE_MATRIX_PRACTICE_LANGUAGES.includes(workspaceLanguage)) setPracticeLanguage('python');
    practice.openPanel();
    setResultTab('problem');
    setResetOpen(false);
  };
  const selectPracticeQuestion = (id) => {
    stop();
    setShowSolvedQuestions(false);
    practice.selectQuestion(id);
    setResult(null);
    setResultTab('problem');
    setActiveLine(0);
    setLineRequest(null);
    setResetOpen(false);
    setNotice('');
  };
  const returnToCompiler = () => {
    stop();
    setShowSolvedQuestions(false);
    practice.exitPractice();
    setPracticeLanguage('');
    setResult(null);
    setResultTab(['html', 'css'].includes(compilerLanguage) ? 'preview' : 'output');
    setActiveLine(0);
    setLineRequest(null);
    setResetOpen(false);
    setNotice('');
  };
  const tryAnotherQuestion = () => {
    stop();
    setShowSolvedQuestions(false);
    practice.showQuestions();
    setResult(null);
    setResultTab('problem');
    setActiveLine(0);
    setLineRequest(null);
    setResetOpen(false);
  };
  const navigatePracticeTabs = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tabs = [...event.currentTarget.querySelectorAll('[role="tab"]')];
    const current = tabs.indexOf(event.target);
    if (current < 0) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
      : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].focus();
    tabs[next].click();
  };

  const downloadCode = useCallback(() => {
    const url = URL.createObjectURL(new Blob([code], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = editorFile; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [code, editorFile]);

  useEffect(() => {
    const handleShortcut = (event) => {
      const shortcut = resolveCodeMatrixShortcut(event);
      if (!shortcut || !ready || !workspaceLoaded || !compilerAvailable || setupVisible || insightsOpen || (shortcut === 'run' && resetOpen)) return;

      const target = event.target;
      if (embedded) {
        if (!document.querySelector('.code-matrix-window')?.contains(target)) return;
      } else if (document.querySelector('.code-matrix-window')
        || (!pageRef.current?.contains(target) && target !== document.body && target !== document)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      if (shortcut === 'run') void run();
      else {
        void flush();
        downloadCode();
      }
    };

    document.addEventListener('keydown', handleShortcut, true);
    return () => document.removeEventListener('keydown', handleShortcut, true);
  }, [compilerAvailable, downloadCode, embedded, flush, insightsOpen, ready, resetOpen, run, setupVisible, workspaceLoaded]);

  const leaveSetup = () => { update({ setupDismissed: true }); setShowSetup(false); };
  const jumpTrace = (index) => { setTraceIndex(index); setActiveLine(trace[index]?.line || 0); };
  const openInsights = () => {
    pauseActivity();
    void flushInsights();
    setInsightsOpen(true);
  };
  const closeInsights = () => {
    setInsightsOpen(false);
    requestAnimationFrame(() => insightsButtonRef.current?.focus());
  };
  const editorActivity = (event) => {
    if (event.target.closest?.('.cm-editor, .cmx-terminal-entry')) markActivity();
  };

  if (!ready || !workspaceLoaded) return <section className="cmx-page cmx-loading" role="status"><LoaderCircle className="cmx-spin" /> Opening CodeMatrix…</section>;
  return (
    <>
    {!embedded && insightsOpen && <section className="cmx-page is-insights"><Suspense fallback={<div className="cmx-loading" role="status"><LoaderCircle className="cmx-spin" /> Opening CodeMatrix Insights…</div>}><CodeMatrixInsights academicProfileDataId={academicProfileDataId} onBack={closeInsights} /></Suspense></section>}
    <section ref={pageRef} hidden={!embedded && insightsOpen} className={`cmx-page${compilerAvailable && !setupVisible && !insightsOpen ? " is-compiler" : ""}${embedded ? " is-embedded" : ""}`}>
      {!embedded && (
        <header className="cmx-header">
          <div className="cmx-heading">
            <Link
              aria-label={routePlacementHandoff ? "Back to placement preparation" : "Back to Start Learning"}
              className="cmx-back"
              to={routePlacementHandoff?.returnTo || "/learn"}
            >
              <ArrowLeft size={20} />
            </Link>
            <div><h1><Code2 size={29} aria-hidden="true" />CodeMatrix</h1></div>
          </div>
          <div className="cmx-header-actions">
            {!setupVisible && remaining.length > 0 && <button type="button" className="cmx-button cmx-quiet" onClick={() => { stop(); setShowSetup(true); }}><Settings2 size={15} />Finish setup <span>{3 - remaining.length}/3</span></button>}
            <span className={`cmx-sync is-${syncState}`} role="status"><span />{practiceActive ? practice.storageAvailable ? 'Saved on this device' : 'Draft not saved' : SYNC_LABELS[syncState]}</span>
            {["local", "unsaved"].includes(syncState) && <button type="button" className="cmx-button cmx-quiet" onClick={() => void retry()}>Retry sync</button>}
          </div>
        </header>
      )}

      {!embedded && activeLaunch && compilerAvailable && !setupVisible && (
        <aside className="cmx-placement-handoff" aria-labelledby="cmx-placement-handoff-title">
          <span className="cmx-placement-handoff-icon"><Code2 aria-hidden="true" size={16} /></span>
          <div>
            <span>{activeLaunch.source === "chat" ? "AI Chat code" : "Placement practice"} · {CODE_MATRIX_LANGUAGES.find(({ id }) => id === activeLaunch.language)?.label || "CodeMatrix"}</span>
            <strong id="cmx-placement-handoff-title">{activeLaunch.title}</strong>
            <p>{activeLaunch.task}</p>
          </div>
        </aside>
      )}

      {!compilerAvailable ? (
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
            <label className="cmx-language"><span>Language</span><select aria-label="Programming language" value={workspaceLanguage} onChange={(event) => changeLanguage(event.target.value)}>{CODE_MATRIX_LANGUAGES.filter((item) => !(practice.panelOpen || practiceActive) || CODE_MATRIX_PRACTICE_LANGUAGES.includes(item.id)).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
            <button type="button" className="cmx-practice-trigger" onClick={practice.panelOpen || practiceActive ? returnToCompiler : openPractice}>{practice.panelOpen || practiceActive ? <><ArrowLeft size={14} aria-hidden="true" />Return to compiler</> : 'Try to solve?'}</button>
            <div className="cmx-actions">
              {(busy || preview) && <button type="button" className="cmx-button" onClick={stop}><Square size={15} />Stop</button>}
              <button type="button" className="cmx-button" disabled={busy} onClick={() => void run(true)} title={workspaceLanguage === "python" ? "Run with a recorded line and variable trace" : "Run code and inspect errors"}><Bug size={16} />Debug</button>
              <button type="button" className="cmx-button cmx-primary" disabled={busy} onClick={() => void run()} title="Ctrl / ⌘ + Enter">{busy ? <LoaderCircle className="cmx-spin" size={16} /> : <Play size={16} fill="currentColor" />} {busy ? "Running…" : practiceActive ? 'Run' : isWeb ? "Run preview" : "Run code"}</button>
              {!embedded && <button ref={insightsButtonRef} type="button" className="cmx-button cmx-insights-trigger" aria-label="Open CodeMatrix Insights" onClick={openInsights}>Insights</button>}
            </div>
          </div>
          {notice && <div className="cmx-notice" role="alert"><CircleAlert size={18} />{notice}<button type="button" aria-label="Dismiss message" onClick={() => setNotice("")}><X size={16} /></button></div>}
          <div className="cmx-workbench" ref={workbenchRef} style={{ "--cmx-workbench-columns": `${sourceSplit}fr 10px ${1 - sourceSplit}fr` }}>
            <section className={`cmx-source${sourceFullscreen ? " is-source-fullscreen" : ""}`} ref={sourceRef} aria-label="Source code" onKeyDownCapture={editorActivity} onPointerDownCapture={editorActivity} onWheelCapture={editorActivity} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) pauseActivity(); }}>
              <div className="cmx-panel-bar">
                {isWeb ? <div className="cmx-file-tabs" role="tablist" aria-label="Web files">{["html", "css", "javascript"].map((id) => <button type="button" role="tab" aria-selected={editorLanguage === id} key={id} onClick={() => { setWebTab(id); setActiveLine(0); setLineRequest(null); }}>{CODE_MATRIX_LANGUAGES.find((item) => item.id === id).file}</button>)}</div> : <span><FileCode2 size={15} />{editorFile}</span>}
                <div className="cmx-file-actions"><button type="button" aria-label="Download code" title="Download current code file · Ctrl / ⌘ + S" onClick={downloadCode}><Download size={16} /></button><button type="button" aria-label={sourceFullscreen ? "Exit code fullscreen" : "Open code fullscreen"} title={sourceFullscreen ? "Exit code fullscreen" : "Open code fullscreen"} onClick={() => void toggleSourceFullscreen()}>{sourceFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button><button type="button" aria-label="Reset code to starter" title="Reset code to starter" onClick={() => setResetOpen(true)}><RotateCcw size={15} /></button></div>
              </div>
              {resetOpen && <div className="cmx-reset-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setResetOpen(false); }}>
                <section className="cmx-reset-dialog" role="dialog" aria-modal="true" aria-labelledby="cmx-reset-title" aria-describedby="cmx-reset-description" onMouseDown={(event) => event.stopPropagation()}>
                  <div className="cmx-reset-dialog-heading"><span className="cmx-reset-dialog-icon"><RotateCcw size={17} /></span><button type="button" className="cmx-reset-close" aria-label="Close reset confirmation" onClick={() => setResetOpen(false)}><X size={16} /></button></div>
                  <h2 id="cmx-reset-title">Reset {editorFile}?</h2>
                  <p id="cmx-reset-description">Your current code in this file will be replaced with the starter code.</p>
                  <div className="cmx-reset-actions"><button type="button" className="cmx-button cmx-primary" onClick={() => { if (practiceActive) practice.resetDraft(); else editCode(CODE_MATRIX_STARTERS[editorLanguage]); setResetOpen(false); }}>Reset file</button><button type="button" className="cmx-button" onClick={() => setResetOpen(false)}>Cancel</button></div>
                </section>
              </div>}
              <CodeMatrixEditor key={`${editorLanguage}:${practice.question?.id || 'compiler'}`} value={code} language={editorLanguage} onChange={editCode} onRun={() => void run()} onLimit={() => setNotice("Each code file can contain up to 50 KB. The edit exceeded that limit.")} diagnostics={diagnostics} activeLine={activeLine} lineRequest={lineRequest} />
              <div className="cmx-editor-footer"><span>{code.split("\n").length} lines · {code.length.toLocaleString()} characters</span><span>UTF-8</span></div>
            </section>
            <div className="cmx-resize-handle" role="separator" aria-label="Resize code and output panels" aria-orientation="vertical" aria-valuemin="30" aria-valuemax="70" aria-valuenow={Math.round(sourceSplit * 100)} tabIndex="0" onPointerDown={startResize} onKeyDown={handleResizeKeyDown}><span aria-hidden="true" /></div>
            <section className="cmx-results" aria-label="Execution results" onKeyDownCapture={editorActivity} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) pauseActivity(); }}>
              {(practice.panelOpen || practiceActive) && <div className="cmx-panel-bar cmx-practice-tabs" role="tablist" aria-label="Practice views" onKeyDown={navigatePracticeTabs}>
                <button type="button" role="tab" tabIndex={resultTab === 'problem' ? 0 : -1} aria-selected={resultTab === 'problem'} onClick={() => setResultTab('problem')}>{practiceActive ? 'Problem' : 'Questions'}</button>
                {practiceActive && <button type="button" role="tab" tabIndex={resultTab === 'tests' ? 0 : -1} aria-selected={resultTab === 'tests'} onClick={() => setResultTab('tests')}>Test results</button>}
                {practiceActive && resultTab === 'debug' && <button type="button" role="tab" tabIndex={0} aria-selected onClick={() => setResultTab('debug')}>Debug</button>}
              </div>}
              {result && result.kind !== 'practice' && <div className={`cmx-result-status is-${result.status}${isWeb && resultTab === "preview" && result.stderr ? " has-preview-error" : ""}`} role="status">
                <span>{STATUS_LABELS[result.status] || result.status}{!unchanged && !isWeb && result.code && " · code changed since this run"}</span>
                {isWeb && resultTab === "preview" && result.stderr && <>
                  <button type="button" className="cmx-preview-error-details" onClick={() => setResultTab("debug")}>View details<ArrowRight size={13} aria-hidden="true" /></button>
                  <span className="cmx-preview-error-summary">{result.stderr.trim().split("\n")[0]}</span>
                </>}
                {Number.isFinite(result.durationMs) && <span>{(result.durationMs / 1000).toFixed(2)} s</span>}
              </div>}
              <div className={`cmx-result-content${reviewSnapshot && resultTab !== 'problem' && resultTab !== 'tests' ? ' has-assistant' : ''}`} role="region" aria-label={resultTab === 'problem' ? 'Coding practice' : resultTab === 'tests' ? 'Test results' : resultTab === "preview" ? "Web preview" : resultTab === "debug" ? "Debug results" : "Program output"}>
                {preview && <iframe ref={previewRef} title="CodeMatrix webpage preview" hidden={resultTab !== "preview"} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={preview.srcDoc} />}
                {busy && !waiting && resultTab !== 'problem' && resultTab !== 'tests' && <div className="cmx-running-message" role="status"><LoaderCircle className="cmx-spin" size={14} />{runtimeMessage}</div>}
                {resultTab === 'problem' ? (
                  <CodeMatrixPracticePanel questions={suggestedQuestions} solvedQuestions={solvedQuestions} showSolved={showSolvedQuestions} onToggleSolved={() => setShowSolvedQuestions((shown) => !shown)} question={practice.question} language={workspaceLanguage} solvedIds={practice.solvedIds} onSelect={selectPracticeQuestion} onNext={tryAnotherQuestion} onRefresh={() => setQuestionOffset((offset) => (offset + 3) % CODE_MATRIX_PRACTICE_QUESTIONS.length)} />
                ) : resultTab === 'tests' ? (
                  <CodeMatrixTestResults result={result?.kind === 'practice' ? result : null} stale={Boolean(result?.kind === 'practice' && !unchanged)} busy={busy} onShowProblem={() => setResultTab('problem')} />
                ) : resultTab === "preview" ? (
                  preview ? null : <div className="cmx-empty"><Code2 size={30} /><strong>Your page will appear here</strong><span>Edit the three files and select Run preview.</span></div>
                ) : resultTab === "debug" ? (
                  <div className="cmx-debug-content">
                    <p className="cmx-debug-caption">{isWeb ? "Errors and messages from your latest web preview appear below." : workspaceLanguage === "python" ? "Debug records the lines and variables from your Python run. Step through the captured trace below." : "Run with Debug to inspect compiler and runtime errors. Line-by-line traces are available for Python."}</p>
                    {isWeb && preview && <button type="button" className="cmx-button cmx-preview-return" onClick={() => setResultTab("preview")}>Back to preview</button>}
                    {trace.length > 0 && <div className="cmx-trace"><div className="cmx-trace-controls"><button type="button" aria-label="Previous trace step" disabled={traceIndex === 0} onClick={() => jumpTrace(traceIndex - 1)}><ChevronLeft size={17} /></button><span>Step {traceIndex + 1} / {trace.length} · Line {trace[traceIndex]?.line}</span><button type="button" aria-label="Next trace step" disabled={traceIndex >= trace.length - 1} onClick={() => jumpTrace(traceIndex + 1)}><ChevronRight size={17} /></button></div><h3>Variables before this line</h3><dl>{Object.entries(trace[traceIndex]?.locals || {}).map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{String(value)}</dd></div>)}</dl>{Object.keys(trace[traceIndex]?.locals || {}).length === 0 && <p>No variables yet.</p>}</div>}
                    {result?.stderr ? <><strong className="cmx-error-heading">Execution details</strong><pre className="cmx-stderr">{result.stderr}</pre>{errorDiagnostics[0]?.line && <button type="button" className="cmx-button" onClick={() => { if (isWeb) setWebTab("javascript"); setActiveLine(errorDiagnostics[0].line); }}>Go to {isWeb ? "script.js · " : ""}line {errorDiagnostics[0].line}<ArrowRight size={14} /></button>}</> : result ? <p className="cmx-debug-success"><Check size={16} />{result.status === "stopped" ? "Execution was stopped." : "No runtime errors were reported."}</p> : <div className="cmx-empty"><Bug size={28} /><strong>Find what needs fixing</strong><span>Select Debug to run and inspect your code.</span></div>}
                  </div>
                ) : result ? (
                  <div className="cmx-output"><ResultTables tables={result.tables || []} /><CodeMatrixTerminal output={result.stdout} error={result.stderr} waiting={waiting} busy={busy || !!result.tables?.length} onInput={submitInput} /></div>
                ) : <div className="cmx-empty"><Terminal size={30} /><strong>Your output starts here</strong><span>Run your code. Type here when your program asks for input.</span><kbd>Ctrl / ⌘ + Enter</kbd></div>}
                {reviewSnapshot && resultTab !== 'problem' && resultTab !== 'tests' && <CodeMatrixAssistant
                  key={academicProfileDataId + JSON.stringify(reviewSnapshot)} snapshot={reviewSnapshot} session={reviewSession}
                  stale={!codeReviewMatchesDraft(reviewSnapshot, drafts)} availability={assistantAvailability}
                  onRetryAvailability={() => setAssistantConnectionAttempt((value) => value + 1)}
                  onGoToLine={(line) => { if (isWeb) setWebTab('javascript'); setActiveLine(line); setLineRequest({ line, language: diagnosticLanguage }); }}
                  onRun={() => void run()}
                />}
              </div>
            </section>
          </div>
          {!embedded && <footer className="cmx-footnote"><span id="code-matrix-editor-help">Ctrl / ⌘ + Enter to run · Ctrl / ⌘ + S to download this file · Tab to indent · Esc, then Tab to leave the editor</span>{(workspaceLanguage === "sql" || isWeb) && <span>{workspaceLanguage === "sql" ? "Each run starts with a fresh SQLite database." : "Preview is isolated from your account."}</span>}</footer>}
        </>
      )}
    </section>
    </>
  );
}
