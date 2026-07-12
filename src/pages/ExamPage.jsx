import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import {
  AlertTriangle,
  ArrowRight,
  Award,
  BookOpenCheck,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Code2,
  Download,
  Expand,
  Eye,
  FileCheck2,
  FilePlus2,
  Flag,
  Gauge,
  GraduationCap,
  Info,
  ListChecks,
  LoaderCircle,
  Maximize2,
  Pause,
  Play,
  RefreshCcw,
  RotateCcw,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
  Trophy,
  X,
} from "lucide-react";
import api from "../utils/apiClient";
import { exportExamResultPdf, exportQuestionPaperPdf } from "../utils/examPaperPdf";
import { EXAM_ELIGIBILITY_THRESHOLD } from "../utils/plannerMetrics";
import "./ExamPage.css";

const TOTAL_MARK_OPTIONS = [30, 40, 50, 60, 70, 80, 90, 100];
const MARK_TYPES = [1, 3, 4, 5, 10, 15];
const DEFAULT_MARK_BLUEPRINTS = {
  30: { 1: 5, 3: 2, 4: 1, 5: 1, 10: 1, 15: 0 },
  40: { 1: 5, 3: 2, 4: 1, 5: 1, 10: 2, 15: 0 },
  50: { 1: 5, 3: 2, 4: 1, 5: 2, 10: 1, 15: 1 },
  60: { 1: 5, 3: 2, 4: 1, 5: 2, 10: 2, 15: 1 },
  70: { 1: 5, 3: 2, 4: 1, 5: 2, 10: 3, 15: 1 },
  80: { 1: 5, 3: 2, 4: 1, 5: 2, 10: 4, 15: 1 },
  90: { 1: 5, 3: 2, 4: 1, 5: 2, 10: 5, 15: 1 },
  100: { 1: 5, 3: 2, 4: 1, 5: 2, 10: 6, 15: 1 },
};
const ACTIVE_ATTEMPT_KEY = "prepmatrix_active_exam_attempt";
const TIMER_STORAGE_KEY = "prepmatrix_exam_timer_v1";

function getId(resource) {
  return resource?.id || resource?._id || resource?.attemptId || resource?.examId || "";
}

function unwrapOne(payload, keys) {
  for (const key of keys) {
    if (payload?.[key]) return payload[key];
  }
  return payload || null;
}

function unwrapList(payload, keys) {
  if (Array.isArray(payload)) return payload;
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

function safeDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function formatDate(value, includeTime = true) {
  const date = safeDate(value);
  if (!date) return "Not available";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    ...(includeTime ? { timeStyle: "short" } : {}),
  }).format(date);
}

function formatClock(totalSeconds) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  if (hours > 0) {
    return String(hours).padStart(2, "0") + ":" + String(minutes).padStart(2, "0") + ":" + String(remainder).padStart(2, "0");
  }
  return String(minutes).padStart(2, "0") + ":" + String(remainder).padStart(2, "0");
}

function formatCountdown(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days) return days + "d " + hours + "h " + minutes + "m";
  if (hours) return hours + "h " + minutes + "m " + seconds + "s";
  return minutes + "m " + seconds + "s";
}

function Countdown({ until, onReachZero }) {
  const [now, setNow] = useState(() => Date.now());
  const target = safeDate(until)?.getTime() || now;
  const remaining = Math.max(0, target - now);
  const reachedRef = useRef(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (remaining > 0 || reachedRef.current) return;
    reachedRef.current = true;
    onReachZero?.();
  }, [onReachZero, remaining]);

  return <span>{remaining > 0 ? formatCountdown(remaining) : "Available now"}</span>;
}

function normalizeQuestion(question, index) {
  const rawOptions = question?.options || question?.choices || [];
  return {
    ...question,
    id: getId(question) || "question-" + (index + 1),
    prompt: question?.question || question?.text || question?.prompt || "Question " + (index + 1),
    options: rawOptions.map((option) => option?.text ?? option?.label ?? option),
  };
}

function normalizeAttempt(resource) {
  const attempt = resource?.attempt || resource || {};
  const questions = attempt?.questions || attempt?.exam?.questions || [];
  return {
    ...attempt,
    id: getId(attempt),
    questions: questions.map(normalizeQuestion),
    answers: attempt?.answers || {},
    violationCount: Number(attempt?.violationCount || attempt?.violations?.length || 0),
  };
}

function subjectNames(subjects) {
  return (subjects || [])
    .map((subject) => (typeof subject === "string" ? subject : subject?.name))
    .filter(Boolean);
}

function defaultBlueprint(totalMarks) {
  const preset = DEFAULT_MARK_BLUEPRINTS[Number(totalMarks)] || DEFAULT_MARK_BLUEPRINTS[50];
  return { ...preset };
}

function recommendedDuration(totalMarks, codingHeavy) {
  const base = totalMarks * 1.5 * (codingHeavy ? 1.2 : 1);
  return Math.min(180, Math.ceil(base / 5) * 5);
}

function detectCoding(text) {
  const pattern = /\b(code|coding|program|programming|computer|software|algorithm|data structure|java|javascript|python|c\+\+|c sharp|web|database|sql|artificial intelligence|machine learning|operating system)\b/i;
  return pattern.test(text || "");
}

function isResultLocked(result) {
  if (result?.locked === true || result?.isLocked === true || result?.available === false) return true;
  const release = safeDate(result?.resultAvailableAt || result?.availableAt || result?.releaseAt);
  return Boolean(release && release.getTime() > Date.now());
}

function resultReleaseAt(result) {
  return result?.resultAvailableAt || result?.availableAt || result?.releaseAt;
}

function notifyTimer(title, body) {
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    new Notification(title, { body });
  }
}

function ExamRunner({ initialAttempt, onFinished }) {
  const [attempt, setAttempt] = useState(() => normalizeAttempt(initialAttempt));
  const [answers, setAnswers] = useState(() => normalizeAttempt(initialAttempt).answers);
  const [flagged, setFlagged] = useState(() => new Set());
  const [questionIndex, setQuestionIndex] = useState(0);
  const [remaining, setRemaining] = useState(3600);
  const [fullscreenActive, setFullscreenActive] = useState(() => Boolean(document.fullscreenElement));
  const [warning, setWarning] = useState("");
  const [saveState, setSaveState] = useState("saved");
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const runnerRef = useRef(null);
  const hasEnteredFullscreenRef = useRef(Boolean(document.fullscreenElement));
  const lastViolationRef = useRef(0);
  const autosaveReadyRef = useRef(false);
  const saveQueueRef = useRef(Promise.resolve());
  const timedSubmitRef = useRef(false);
  const submittingRef = useRef(false);
  const questions = attempt.questions || [];
  const current = questions[questionIndex];
  const attemptId = getId(attempt);

  const submitExam = useCallback(async (reason = "manual") => {
    if (!attemptId || submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      const payload = await api.post("/api/exam-attempts/" + attemptId + "/submit", { answers, reason });
      const submitted = normalizeAttempt(unwrapOne(payload, ["attempt", "result"]));
      localStorage.removeItem(ACTIVE_ATTEMPT_KEY);
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
      toast.success(reason === "manual" ? "Exam submitted successfully." : "Exam submitted automatically.");
      onFinished(submitted, reason);
    } catch (error) {
      submittingRef.current = false;
      toast.error(error instanceof Error ? error.message : "Could not submit the exam.");
    } finally {
      setIsSubmitting(false);
      setConfirmSubmit(false);
    }
  }, [answers, attemptId, onFinished]);

  const registerViolation = useCallback(async (type) => {
    const now = Date.now();
    if (!attemptId || submittingRef.current || now - lastViolationRef.current < 1100) return;
    lastViolationRef.current = now;
    const eventId = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : attemptId + "-" + now + "-" + Math.random().toString(36).slice(2);
    try {
      const payload = await api.post("/api/exam-attempts/" + attemptId + "/violations", { answers, eventId, type });
      const count = Number(payload?.violationCount ?? payload?.attempt?.violationCount ?? attempt.violationCount + 1);
      setAttempt((currentAttempt) => ({ ...currentAttempt, violationCount: count }));
      setWarning(payload?.warning || "Exam focus violation " + count + " of 3. A fourth violation submits the exam.");
      if (payload?.autoSubmitted) {
        const submitted = normalizeAttempt(payload?.attempt || attempt);
        localStorage.removeItem(ACTIVE_ATTEMPT_KEY);
        if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
        onFinished(submitted, "violation_limit");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not record the exam warning.");
    }
  }, [answers, attempt, attemptId, onFinished]);

  const enterFullscreen = useCallback(async () => {
    if (!runnerRef.current || document.fullscreenElement) return;
    try {
      await runnerRef.current.requestFullscreen();
      hasEnteredFullscreenRef.current = true;
      setFullscreenActive(true);
    } catch {
      setWarning("Fullscreen permission is required. Select Enter fullscreen to continue securely.");
    }
  }, []);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") registerViolation("tab_hidden");
    };
    const handleFullscreen = () => {
      const active = Boolean(document.fullscreenElement);
      setFullscreenActive(active);
      if (active) hasEnteredFullscreenRef.current = true;
      if (!active && hasEnteredFullscreenRef.current) registerViolation("fullscreen_exit");
    };
    document.addEventListener("visibilitychange", handleVisibility);
    document.addEventListener("fullscreenchange", handleFullscreen);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      document.removeEventListener("fullscreenchange", handleFullscreen);
    };
  }, [registerViolation]);

  useEffect(() => {
    const expiry = safeDate(attempt.expiresAt || attempt.expiryAt || attempt.endsAt)?.getTime()
      || Date.now() + Number(attempt.remainingSeconds || 3600) * 1000;
    const update = () => {
      const next = Math.max(0, Math.ceil((expiry - Date.now()) / 1000));
      setRemaining(next);
      if (next === 0 && !timedSubmitRef.current) {
        timedSubmitRef.current = true;
        submitExam("time_expired");
      }
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [attempt.endsAt, attempt.expiresAt, attempt.expiryAt, attempt.remainingSeconds, submitExam]);

  useEffect(() => {
    if (!autosaveReadyRef.current) {
      autosaveReadyRef.current = true;
      return undefined;
    }
    setSaveState("saving");
    const snapshot = { ...answers };
    const timer = window.setTimeout(() => {
      const queued = saveQueueRef.current
        .catch(() => undefined)
        .then(() => api.put("/api/exam-attempts/" + attemptId + "/answers", { answers: snapshot }));
      saveQueueRef.current = queued;
      queued
        .then(() => {
          if (saveQueueRef.current === queued) setSaveState("saved");
        })
        .catch(() => {
          if (saveQueueRef.current === queued) setSaveState("error");
        });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [answers, attemptId]);

  const answeredCount = questions.filter((question) => answers[question.id] !== undefined).length;

  return createPortal(
    <div className="exam-runner" ref={runnerRef} role="dialog" aria-modal="true" aria-label="Online exam">
      <header className="exam-runner__header">
        <div className="exam-runner__identity">
          <div className="exam-runner__brand"><GraduationCap size={22} /></div>
          <div>
            <span>PrepMatrix secure exam</span>
            <strong>{attempt.subjectName || attempt.exam?.subjectName || "Online examination"}</strong>
          </div>
        </div>
        <div className="exam-runner__status">
          <span className={"exam-save-state is-" + saveState}><CheckCircle2 size={14} /> {saveState === "saving" ? "Saving" : saveState === "error" ? "Save failed" : "Autosaved"}</span>
          <span className="exam-violation-pill"><ShieldAlert size={14} /> Warnings {attempt.violationCount}/3</span>
          <strong className={remaining < 300 ? "is-urgent" : ""}><Clock3 size={17} /> {formatClock(remaining)}</strong>
          {!fullscreenActive && <button className="exam-compact-btn" onClick={enterFullscreen} type="button"><Maximize2 size={15} /> Enter fullscreen</button>}
        </div>
      </header>

      {warning && (
        <div className="exam-runner__warning" role="alert">
          <AlertTriangle size={18} />
          <span>{warning}</span>
          <button aria-label="Dismiss warning" onClick={() => setWarning("")} type="button"><X size={15} /></button>
        </div>
      )}

      {!fullscreenActive && (
        <div className="exam-fullscreen-gate">
          <div className="exam-fullscreen-gate__card">
            <div className="exam-dialog-icon"><Maximize2 size={22} /></div>
            <span className="section-tag">Fullscreen required</span>
            <h2>Enter the secure exam frame</h2>
            <p>The 60-minute timer is already server-authoritative. Enter fullscreen to view and answer the questions.</p>
            <button className="exam-primary-btn" onClick={enterFullscreen} type="button"><Expand size={16} /> Enter fullscreen</button>
          </div>
        </div>
      )}

      <div className="exam-runner__body">
        <aside className="exam-runner__rail">
          <div className="exam-progress-copy">
            <span>Exam progress</span>
            <strong>{answeredCount} / {questions.length || 40} answered</strong>
          </div>
          <div className="exam-progress-track"><i style={{ width: ((answeredCount / Math.max(questions.length, 1)) * 100) + "%" }} /></div>
          <div className="exam-question-map" aria-label="Question navigation">
            {questions.map((question, index) => (
              <button
                className={[
                  index === questionIndex ? "is-current" : "",
                  answers[question.id] !== undefined ? "is-answered" : "",
                  flagged.has(question.id) ? "is-flagged" : "",
                ].filter(Boolean).join(" ")}
                key={question.id}
                onClick={() => setQuestionIndex(index)}
                type="button"
              >
                {index + 1}
                {flagged.has(question.id) && <Flag size={8} fill="currentColor" />}
              </button>
            ))}
          </div>
          <div className="exam-runner__legend">
            <span><i className="is-answered" /> Answered</span>
            <span><i className="is-current" /> Current</span>
            <span><i className="is-flagged" /> Flagged</span>
          </div>
          <button className="exam-submit-btn" onClick={() => setConfirmSubmit(true)} type="button"><FileCheck2 size={17} /> Submit exam</button>
        </aside>

        <main className="exam-runner__question">
          {current ? (
            <>
              <div className="exam-question-heading">
                <div><span>Question {questionIndex + 1} of {questions.length}</span><b>1 mark</b></div>
                <button
                  className={flagged.has(current.id) ? "is-active" : ""}
                  onClick={() => setFlagged((currentFlags) => {
                    const next = new Set(currentFlags);
                    if (next.has(current.id)) next.delete(current.id); else next.add(current.id);
                    return next;
                  })}
                  type="button"
                ><Flag size={16} /> {flagged.has(current.id) ? "Flagged" : "Review later"}</button>
              </div>
              <h1>{current.prompt}</h1>
              <div className="exam-answer-options">
                {current.options.map((option, optionIndex) => (
                  <button
                    className={answers[current.id] === optionIndex ? "is-selected" : ""}
                    key={current.id + "-" + optionIndex}
                    onClick={() => setAnswers((currentAnswers) => ({ ...currentAnswers, [current.id]: optionIndex }))}
                    type="button"
                  >
                    <span>{String.fromCharCode(65 + optionIndex)}</span>
                    <p>{option}</p>
                    {answers[current.id] === optionIndex && <Check size={18} />}
                  </button>
                ))}
              </div>
              <footer className="exam-question-actions">
                <button disabled={questionIndex === 0} onClick={() => setQuestionIndex((index) => index - 1)} type="button"><ChevronLeft size={17} /> Previous</button>
                {questionIndex < questions.length - 1 ? (
                  <button className="is-primary" onClick={() => setQuestionIndex((index) => index + 1)} type="button">Next question <ChevronRight size={17} /></button>
                ) : (
                  <button className="is-primary" onClick={() => setConfirmSubmit(true)} type="button">Review & submit <FileCheck2 size={17} /></button>
                )}
              </footer>
            </>
          ) : (
            <div className="exam-empty-state"><AlertTriangle size={28} /><h2>No questions available</h2><p>This attempt could not load its question set.</p></div>
          )}
        </main>
      </div>

      {confirmSubmit && (
        <div className="exam-confirm-layer">
          <div className="exam-confirm-dialog">
            <div className="exam-dialog-icon"><FileCheck2 size={22} /></div>
            <h2>Submit this exam?</h2>
            <p>You answered {answeredCount} of {questions.length} questions. Unanswered questions will be recorded as incorrect.</p>
            <div><button onClick={() => setConfirmSubmit(false)} type="button">Continue exam</button><button className="is-primary" disabled={isSubmitting} onClick={() => submitExam("manual")} type="button">{isSubmitting ? "Submitting..." : "Submit now"}</button></div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

function readTimerState() {
  try {
    const saved = JSON.parse(localStorage.getItem(TIMER_STORAGE_KEY) || "null");
    if (saved && typeof saved === "object") return saved;
  } catch {
    // Ignore invalid local timer state.
  }
  return {
    preset: "pomodoro",
    phase: "focus",
    remainingSeconds: 25 * 60,
    running: false,
    endsAt: null,
    cycles: 0,
    paperMinutes: 60,
  };
}

function OfflineExamTimer({ paperMinutes = 60 }) {
  const [timer, setTimer] = useState(readTimerState);
  const presets = useMemo(() => ({
    pomodoro: { label: "25 / 5 Pomodoro", focus: 25 * 60, break: 5 * 60 },
    extended: { label: "50 / 10 Focus", focus: 50 * 60, break: 10 * 60 },
    paper: { label: "Paper time (" + paperMinutes + " min)", focus: paperMinutes * 60, break: 0 },
  }), [paperMinutes]);
  const preset = presets[timer.preset] || presets.pomodoro;

  useEffect(() => {
    localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(timer));
  }, [timer]);

  useEffect(() => {
    if (!timer.running || !timer.endsAt) return undefined;
    const tick = () => {
      const remainingSeconds = Math.max(0, Math.ceil((timer.endsAt - Date.now()) / 1000));
      if (remainingSeconds > 0) {
        setTimer((current) => ({ ...current, remainingSeconds }));
        return;
      }
      setTimer((current) => {
        const currentPreset = presets[current.preset] || presets.pomodoro;
        const completedFocus = current.phase === "focus";
        const nextPhase = completedFocus && currentPreset.break > 0 ? "break" : "focus";
        const nextSeconds = nextPhase === "break" ? currentPreset.break : currentPreset.focus;
        notifyTimer(
          completedFocus ? "Focus session complete" : "Break complete",
          completedFocus ? "Take a short reset before the next session." : "Ready for the next study block.",
        );
        return {
          ...current,
          phase: nextPhase,
          remainingSeconds: nextSeconds,
          running: false,
          endsAt: null,
          cycles: current.cycles + (completedFocus ? 1 : 0),
        };
      });
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [presets, timer.endsAt, timer.running]);

  useEffect(() => {
    if (timer.preset !== "paper" || timer.running) return;
    setTimer((current) => ({ ...current, paperMinutes, remainingSeconds: paperMinutes * 60 }));
  }, [paperMinutes, timer.preset, timer.running]);

  const choosePreset = (event) => {
    const nextPreset = event.target.value;
    const next = presets[nextPreset];
    setTimer((current) => ({
      ...current,
      preset: nextPreset,
      phase: "focus",
      remainingSeconds: next.focus,
      running: false,
      endsAt: null,
      paperMinutes,
    }));
  };

  const start = () => {
    setTimer((current) => ({ ...current, running: true, endsAt: Date.now() + Math.max(1, current.remainingSeconds) * 1000 }));
  };

  const pause = () => {
    setTimer((current) => {
      const remainingSeconds = current.endsAt ? Math.max(0, Math.ceil((current.endsAt - Date.now()) / 1000)) : current.remainingSeconds;
      return { ...current, running: false, endsAt: null, remainingSeconds };
    });
  };

  const reset = () => {
    setTimer((current) => ({
      ...current,
      phase: "focus",
      running: false,
      endsAt: null,
      remainingSeconds: (presets[current.preset] || presets.pomodoro).focus,
    }));
  };

  const skip = () => {
    const nextPhase = timer.phase === "focus" && preset.break > 0 ? "break" : "focus";
    setTimer((current) => ({
      ...current,
      phase: nextPhase,
      running: false,
      endsAt: null,
      remainingSeconds: nextPhase === "break" ? preset.break : preset.focus,
      cycles: current.cycles + (current.phase === "focus" ? 1 : 0),
    }));
  };

  return (
    <section className="card exam-timer-card">
      <div className="exam-card-heading">
        <div className="exam-heading-icon"><Clock3 size={19} /></div>
        <div><span className="section-tag">Offline exam timer</span><h3>Focus without the browser exam</h3></div>
      </div>
      <div className="exam-timer-layout">
        <div className="exam-timer-face">
          <span>{timer.phase === "break" ? "Recovery break" : timer.preset === "paper" ? "Offline paper" : "Focus session"}</span>
          <strong>{formatClock(timer.remainingSeconds)}</strong>
          <small>{timer.cycles} focus cycle{timer.cycles === 1 ? "" : "s"} completed</small>
        </div>
        <div className="exam-timer-controls">
          <label className="field-stack">
            Timer mode
            <select onChange={choosePreset} value={timer.preset}>
              {Object.entries(presets).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}
            </select>
          </label>
          <div className="exam-timer-buttons">
            {timer.running ? (
              <button className="exam-compact-btn is-primary" onClick={pause} type="button"><Pause size={15} /> Pause</button>
            ) : (
              <button className="exam-compact-btn is-primary" onClick={start} type="button"><Play size={15} /> Start</button>
            )}
            <button className="exam-compact-btn" onClick={skip} type="button"><ArrowRight size={15} /> Skip</button>
            <button className="exam-icon-btn" aria-label="Reset timer" onClick={reset} title="Reset timer" type="button"><RotateCcw size={15} /></button>
          </div>
        </div>
      </div>
    </section>
  );
}

function PaperBuilder({ subjects, academicLevel, academicTrack, userProfile, onGenerated }) {
  const names = useMemo(() => subjectNames(subjects), [subjects]);
  const [selectedSubjects, setSelectedSubjects] = useState(() => names.slice(0, 1));
  const [totalMarks, setTotalMarks] = useState(50);
  const [blueprint, setBlueprint] = useState(() => defaultBlueprint(50));
  const [scopeText, setScopeText] = useState("");
  const [difficulty, setDifficulty] = useState("balanced");
  const [codingMode, setCodingMode] = useState("auto");
  const [questionStyle, setQuestionStyle] = useState("mixed");
  const [programmingLanguage, setProgrammingLanguage] = useState("");
  const [paperTitle, setPaperTitle] = useState("");
  const [institutionName, setInstitutionName] = useState(userProfile?.institutionName || "");
  const [instructions, setInstructions] = useState("Answer every required question. Show working where appropriate.");
  const [internalChoice, setInternalChoice] = useState(false);
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [includeAnswerKey, setIncludeAnswerKey] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPaper, setGeneratedPaper] = useState(null);

  useEffect(() => {
    if (!selectedSubjects.length && names.length) setSelectedSubjects(names.slice(0, 1));
  }, [names, selectedSubjects.length]);

  const allocatedMarks = MARK_TYPES.reduce((sum, marks) => sum + marks * Number(blueprint[marks] || 0), 0);
  const remainingMarks = totalMarks - allocatedMarks;
  const codingDetected = detectCoding([
    ...selectedSubjects,
    scopeText,
    userProfile?.department,
    academicTrack,
  ].filter(Boolean).join(" "));
  const codingHeavy = codingMode === "high" || (codingMode === "auto" && codingDetected);
  const suggestedMinutes = recommendedDuration(totalMarks, codingHeavy);
  const canGenerate = selectedSubjects.length > 0 && allocatedMarks === totalMarks && !isGenerating;

  const toggleSubject = (name) => {
    setSelectedSubjects((current) =>
      current.includes(name) ? current.filter((item) => item !== name) : [...current, name],
    );
  };

  const changeTotal = (event) => {
    const next = Number(event.target.value);
    setTotalMarks(next);
    setBlueprint(defaultBlueprint(next));
  };

  const generate = async () => {
    if (!canGenerate) return;
    setIsGenerating(true);
    try {
      const payload = await api.post("/api/question-papers/generate", {
        subjectNames: selectedSubjects,
        totalMarks,
        markDistribution: MARK_TYPES.map((marks) => ({ marks, count: Number(blueprint[marks] || 0) })),
        scopeText,
        difficulty,
        codingEmphasis: codingMode,
        questionStyle,
        programmingLanguage,
        paperTitle,
        institutionName,
        instructions,
        internalChoice,
        shuffleQuestions,
        includeAnswerKey,
        academicLevel,
        academicTrack,
        department: userProfile?.department || "",
      }, { timeoutMs: 240000 });
      const paper = unwrapOne(payload, ["paper"]);
      setGeneratedPaper(paper);
      onGenerated?.(paper);
      toast.success("Question paper generated and saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not generate the question paper.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="exam-paper-layout">
      <section className="card exam-paper-form">
        <div className="exam-section-title">
          <div><span className="section-tag">Paper specification</span><h2>Design the exact paper blueprint</h2><p>Allocation must match the selected total before generation.</p></div>
          <div className={remainingMarks === 0 ? "exam-allocation-status is-complete" : "exam-allocation-status"}>
            <span>{allocatedMarks} / {totalMarks}</span>
            <small>{remainingMarks === 0 ? "Allocation complete" : remainingMarks + " marks remaining"}</small>
          </div>
        </div>

        <div className="exam-form-grid">
          <label className="field-stack">
            Total marks
            <select onChange={changeTotal} value={totalMarks}>
              {TOTAL_MARK_OPTIONS.map((marks) => <option key={marks} value={marks}>{marks} marks</option>)}
            </select>
          </label>
          <label className="field-stack">
            Difficulty
            <select onChange={(event) => setDifficulty(event.target.value)} value={difficulty}>
              <option value="balanced">Balanced</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </label>
          <label className="field-stack">
            Question style
            <select onChange={(event) => setQuestionStyle(event.target.value)} value={questionStyle}>
              <option value="mixed">Mixed</option>
              <option value="theory">Theory</option>
              <option value="application">Application</option>
              <option value="numerical">Numerical</option>
              <option value="coding">Coding</option>
            </select>
          </label>
          <label className="field-stack">
            Coding emphasis
            <select onChange={(event) => setCodingMode(event.target.value)} value={codingMode}>
              <option value="auto">Automatic detection</option>
              <option value="standard">Standard paper</option>
              <option value="high">Coding-heavy</option>
            </select>
          </label>
        </div>

        <fieldset className="exam-subject-picker">
          <legend>Subjects</legend>
          {names.length ? names.map((name) => (
            <label className={selectedSubjects.includes(name) ? "is-selected" : ""} key={name}>
              <input checked={selectedSubjects.includes(name)} onChange={() => toggleSubject(name)} type="checkbox" />
              <BookOpenCheck size={15} />
              <span>{name}</span>
            </label>
          )) : <p>Add subjects before generating a paper.</p>}
        </fieldset>

        <label className="field-stack exam-field-wide">
          Chapters, topics, or syllabus scope
          <textarea onChange={(event) => setScopeText(event.target.value)} placeholder="Example: Arrays, linked lists, sorting, and recursion" rows={3} value={scopeText} />
        </label>

        <div className="exam-blueprint">
          <div className="exam-blueprint-heading"><div><h3>Marks split-up</h3><p>Choose how many questions appear at each mark value.</p></div><Gauge size={19} /></div>
          <div className="exam-blueprint-grid">
            {MARK_TYPES.map((marks) => (
              <label key={marks}>
                <span><strong>{marks}</strong> mark{marks === 1 ? "" : "s"}</span>
                <input
                  max={Math.floor(totalMarks / marks)}
                  min="0"
                  onChange={(event) => setBlueprint((current) => ({ ...current, [marks]: Math.min(Math.floor(totalMarks / marks), Math.max(0, Math.floor(Number(event.target.value) || 0))) }))}
                  step="1"
                  type="number"
                  value={blueprint[marks] || 0}
                />
                <small>{marks * Number(blueprint[marks] || 0)} marks</small>
              </label>
            ))}
          </div>
        </div>

        <div className="exam-form-grid">
          <label className="field-stack">
            Paper title
            <input onChange={(event) => setPaperTitle(event.target.value)} placeholder="Semester practice paper" value={paperTitle} />
          </label>
          <label className="field-stack">
            Institution
            <input onChange={(event) => setInstitutionName(event.target.value)} placeholder="Institution name" value={institutionName} />
          </label>
          {(codingHeavy || questionStyle === "coding") && (
            <label className="field-stack">
              Programming language
              <input onChange={(event) => setProgrammingLanguage(event.target.value)} placeholder="Java, Python, C++..." value={programmingLanguage} />
            </label>
          )}
          <label className="field-stack exam-field-wide">
            Instructions
            <textarea onChange={(event) => setInstructions(event.target.value)} rows={2} value={instructions} />
          </label>
        </div>

        <div className="exam-toggle-grid">
          <label><input checked={internalChoice} onChange={(event) => setInternalChoice(event.target.checked)} type="checkbox" /><span>Allow internal choices</span></label>
          <label><input checked={shuffleQuestions} onChange={(event) => setShuffleQuestions(event.target.checked)} type="checkbox" /><span>Shuffle questions</span></label>
          <label><input checked={includeAnswerKey} onChange={(event) => setIncludeAnswerKey(event.target.checked)} type="checkbox" /><span>Include answer key</span></label>
        </div>

        <div className="exam-paper-summary">
          <div><Clock3 size={17} /><span>Recommended maximum time</span><strong>{suggestedMinutes} minutes</strong></div>
          <div><Code2 size={17} /><span>Subject mode</span><strong>{codingHeavy ? "Coding-heavy" : "Standard"}</strong></div>
          <button className="exam-primary-btn" disabled={!canGenerate} onClick={generate} type="button">
            {isGenerating ? <><LoaderCircle className="spin" size={17} /> Generating paper...</> : <><Sparkles size={17} /> Generate question paper</>}
          </button>
        </div>
      </section>

      {generatedPaper && (
        <section className="card exam-paper-ready">
          <div className="exam-ready-mark"><FileCheck2 size={25} /></div>
          <span className="section-tag">Paper ready</span>
          <h3>{generatedPaper.paperTitle || generatedPaper.title}</h3>
          <p>{generatedPaper.totalMarks} marks | {generatedPaper.recommendedTimeMinutes || generatedPaper.durationMinutes} minutes | {(generatedPaper.questions || []).length} questions</p>
          <div>
            <button className="exam-compact-btn is-primary" onClick={() => exportQuestionPaperPdf(generatedPaper)} type="button"><Download size={15} /> Export paper</button>
            {generatedPaper.includeAnswerKey !== false && (
              <button className="exam-compact-btn" onClick={() => exportQuestionPaperPdf(generatedPaper, { answerKey: true })} type="button"><FileCheck2 size={15} /> Answer key</button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function ResultsPanel({ results, onRefresh }) {
  const [selectedResult, setSelectedResult] = useState(null);
  const [loadingId, setLoadingId] = useState("");

  const openResult = async (item) => {
    const id = getId(item);
    if (!id || isResultLocked(item)) return;
    setLoadingId(id);
    try {
      const payload = await api.get("/api/exam-results/" + id);
      setSelectedResult(unwrapOne(payload, ["result"]));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load the result.");
    } finally {
      setLoadingId("");
    }
  };

  return (
    <section className="exam-results-section">
      <div className="exam-section-title">
        <div><span className="section-tag">View results</span><h2>Released and pending exams</h2><p>Scores remain private for exactly 72 hours after submission.</p></div>
        <button className="exam-icon-btn" aria-label="Refresh results" onClick={onRefresh} title="Refresh results" type="button"><RefreshCcw size={16} /></button>
      </div>

      <div className="exam-results-grid">
        {results.length ? results.map((result) => {
          const locked = isResultLocked(result);
          const id = getId(result);
          const cardClass = "card exam-result-card " + (locked ? "is-locked" : "is-released");
          return (
            <article className={cardClass} key={id}>
              <div className="exam-result-top">
                <div className="exam-heading-icon">{locked ? <Clock3 size={18} /> : <Trophy size={18} />}</div>
                <span>{locked ? "Result pending" : "Result released"}</span>
              </div>
              <h3>{result.title || result.subjectName}</h3>
              <p>{result.subjectName} | Submitted {formatDate(result.submittedAt)}</p>
              {locked ? (
                <div className="exam-result-countdown">
                  <small>Unlocks in</small>
                  <strong><Countdown onReachZero={onRefresh} until={resultReleaseAt(result)} /></strong>
                  <span>{formatDate(resultReleaseAt(result))}</span>
                </div>
              ) : (
                <div className="exam-result-score"><strong>{result.score}/{result.total || 40}</strong><span>{result.percentage}%</span></div>
              )}
              <button className="exam-compact-btn" disabled={locked || loadingId === id} onClick={() => openResult(result)} type="button">
                {locked ? <><Clock3 size={14} /> Await release</> : loadingId === id ? <><LoaderCircle className="spin" size={14} /> Loading...</> : <><Eye size={14} /> View result</>}
              </button>
            </article>
          );
        }) : (
          <div className="card exam-empty-state"><Award size={28} /><h3>No submitted exams yet</h3><p>Complete an online exam and its release countdown will appear here.</p></div>
        )}
      </div>

      {selectedResult && (
        <div className="exam-result-modal" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelectedResult(null);
        }}>
          <section role="dialog" aria-modal="true" aria-labelledby="exam-result-title">
            <header>
              <div><span className="section-tag">Released result</span><h2 id="exam-result-title">{selectedResult.title || selectedResult.subjectName}</h2></div>
              <button className="exam-close-btn" aria-label="Close result" onClick={() => setSelectedResult(null)} type="button"><X size={17} /></button>
            </header>
            <div className="exam-result-metrics">
              <div><span>Score</span><strong>{selectedResult.score}/{selectedResult.total || 40}</strong></div>
              <div><span>Percentage</span><strong>{selectedResult.percentage}%</strong></div>
              <div><span>Correct</span><strong>{selectedResult.correctCount}</strong></div>
              <div><span>Unanswered</span><strong>{selectedResult.unansweredCount}</strong></div>
            </div>
            <div className="exam-result-review">
              {(selectedResult.questions || []).map((question, index) => (
                <article className={question.isCorrect ? "is-correct" : "is-wrong"} key={question.id || index}>
                  <h4>{index + 1}. {question.question}</h4>
                  <p><span>Your answer</span>{question.selectedAnswer || "Not answered"}</p>
                  <p><span>Correct answer</span>{question.correctAnswer}</p>
                  <small>{question.explanation}</small>
                </article>
              ))}
            </div>
            <footer>
              <span>Submission: {String(selectedResult.submissionReason || "manual").replaceAll("_", " ")}</span>
              <button className="exam-compact-btn is-primary" onClick={() => exportExamResultPdf(selectedResult)} type="button"><Download size={15} /> Export result</button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}

function PaperHistory({ papers, onRefresh, onPaperLoaded }) {
  const [search, setSearch] = useState("");
  const [loadingId, setLoadingId] = useState("");
  const filtered = papers.filter((paper) =>
    [paper.title, paper.paperTitle, ...(paper.subjectNames || [])].join(" ").toLowerCase().includes(search.trim().toLowerCase()),
  );

  const loadPaper = async (paper, mode) => {
    const id = getId(paper);
    setLoadingId(id);
    try {
      const payload = await api.get("/api/question-papers/" + id);
      const fullPaper = unwrapOne(payload, ["paper"]);
      onPaperLoaded?.(fullPaper);
      if (mode === "paper") exportQuestionPaperPdf(fullPaper);
      if (mode === "answer") exportQuestionPaperPdf(fullPaper, { answerKey: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load the paper.");
    } finally {
      setLoadingId("");
    }
  };

  const removePaper = async (paper) => {
    const id = getId(paper);
    try {
      await api.delete("/api/question-papers/" + id);
      toast.success("Question paper deleted.");
      onRefresh?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the paper.");
    }
  };

  return (
    <section className="card exam-paper-history">
      <div className="exam-section-title">
        <div><span className="section-tag">Saved history</span><h2>Generated question papers</h2></div>
        <label className="exam-search"><Search size={15} /><input onChange={(event) => setSearch(event.target.value)} placeholder="Search papers" type="search" value={search} /></label>
      </div>
      <div className="exam-paper-history-grid">
        {filtered.length ? filtered.map((paper) => (
          <article key={getId(paper)}>
            <div className="exam-heading-icon"><FilePlus2 size={17} /></div>
            <div><strong>{paper.paperTitle || paper.title}</strong><span>{(paper.subjectNames || []).join(", ")}</span><small>{paper.totalMarks} marks | {paper.recommendedTimeMinutes || paper.durationMinutes} min | {formatDate(paper.createdAt, false)}</small></div>
            <div>
              <button aria-label="Export paper" disabled={loadingId === getId(paper)} onClick={() => loadPaper(paper, "paper")} title="Export paper" type="button"><Download size={14} /></button>
              {paper.includeAnswerKey !== false && (
                <button aria-label="Export answer key" disabled={loadingId === getId(paper)} onClick={() => loadPaper(paper, "answer")} title="Export answer key" type="button"><FileCheck2 size={14} /></button>
              )}
              <button aria-label="Delete paper" className="is-danger" onClick={() => removePaper(paper)} title="Delete paper" type="button"><Trash2 size={14} /></button>
            </div>
          </article>
        )) : <div className="exam-empty-inline">No saved question papers match this search.</div>}
      </div>
    </section>
  );
}

function ExamPage({
  subjects = [],
  academicLevel = "College",
  academicTrack = "General",
  userProfile = {},
  examReadiness = 0,
  isExamEligible: examEligibilityOverride,
  tasksToExamEligibility = 0,
}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const names = useMemo(() => subjectNames(subjects), [subjects]);
  const readinessPercent = Math.max(0, Math.min(100, Math.round(Number(examReadiness) || 0)));
  const isOnlineExamEligible = typeof examEligibilityOverride === "boolean"
    ? examEligibilityOverride
    : readinessPercent >= EXAM_ELIGIBILITY_THRESHOLD;
  const requestedSection = searchParams.get("section");
  const requestedAttendHandledRef = useRef(false);
  const [section, setSection] = useState(() => (
    requestedSection === "attend" && isOnlineExamEligible ? "attend" : "overview"
  ));
  const [subjectName, setSubjectName] = useState(() => names[0] || "");
  const [scopeText, setScopeText] = useState("");
  const [difficulty, setDifficulty] = useState("medium");
  const [preparedExam, setPreparedExam] = useState(null);
  const [activeAttempt, setActiveAttempt] = useState(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [results, setResults] = useState([]);
  const [papers, setPapers] = useState([]);
  const [paperMinutes, setPaperMinutes] = useState(60);

  useEffect(() => {
    if (!subjectName && names.length) setSubjectName(names[0]);
  }, [names, subjectName]);

  useEffect(() => {
    if (requestedSection !== "attend") {
      requestedAttendHandledRef.current = false;
    } else if (isOnlineExamEligible && !requestedAttendHandledRef.current) {
      requestedAttendHandledRef.current = true;
      setSection("attend");
    }

    if (!isOnlineExamEligible && section === "attend" && !activeAttempt) {
      setSection("overview");
    }
  }, [activeAttempt, isOnlineExamEligible, requestedSection, section]);

  const loadResults = useCallback(async () => {
    try {
      const payload = await api.get("/api/exam-results");
      setResults(unwrapList(payload, ["results", "attempts"]));
    } catch {
      setResults([]);
    }
  }, []);

  const loadPapers = useCallback(async () => {
    try {
      const payload = await api.get("/api/question-papers");
      setPapers(unwrapList(payload, ["papers"]));
    } catch {
      setPapers([]);
    }
  }, []);

  useEffect(() => {
    loadResults();
    loadPapers();
  }, [loadPapers, loadResults]);

  useEffect(() => {
    const attemptId = localStorage.getItem(ACTIVE_ATTEMPT_KEY);
    if (!attemptId) return;
    api.get("/api/exam-attempts/" + attemptId)
      .then((payload) => {
        const attempt = normalizeAttempt(unwrapOne(payload, ["attempt"]));
        if (attempt.status === "in_progress") setActiveAttempt(attempt);
        else {
          localStorage.removeItem(ACTIVE_ATTEMPT_KEY);
          setSection("results");
          loadResults();
        }
      })
      .catch(() => localStorage.removeItem(ACTIVE_ATTEMPT_KEY));
  }, [loadResults]);

  const prepareExam = async () => {
    if (!isOnlineExamEligible) {
      toast.error(`Complete at least ${EXAM_ELIGIBILITY_THRESHOLD}% of your planner before attending an exam. Current readiness: ${readinessPercent}%.`);
      return;
    }
    if (!subjectName) {
      toast.error("Add and select a subject before preparing an exam.");
      return;
    }
    setIsPreparing(true);
    try {
      const payload = await api.post("/api/exams/generate", {
        subjectName,
        scopeText,
        difficulty,
        academicLevel,
        academicTrack,
        department: userProfile?.department || "",
      }, { timeoutMs: 240000 });
      setPreparedExam(unwrapOne(payload, ["exam"]));
      toast.success("Your secure 40-question exam is ready.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not prepare the exam.");
    } finally {
      setIsPreparing(false);
    }
  };

  const startExam = async () => {
    if (!isOnlineExamEligible) {
      toast.error(`Attend Exam unlocks at ${EXAM_ELIGIBILITY_THRESHOLD}% planner completion. Current readiness: ${readinessPercent}%.`);
      return;
    }
    const examId = getId(preparedExam);
    if (!examId) return;
    setIsStarting(true);
    let enteredForStart = false;
    try {
      if (!document.fullscreenElement) {
        if (typeof document.documentElement.requestFullscreen !== "function") {
          throw new Error("Fullscreen is not supported by this browser.");
        }
        await document.documentElement.requestFullscreen();
        enteredForStart = true;
      }
      const payload = await api.post("/api/exams/" + examId + "/start", {});
      const attempt = normalizeAttempt(unwrapOne(payload, ["attempt"]));
      localStorage.setItem(ACTIVE_ATTEMPT_KEY, attempt.id);
      setActiveAttempt(attempt);
    } catch (error) {
      if (enteredForStart && document.fullscreenElement) {
        await document.exitFullscreen().catch(() => undefined);
      }
      toast.error(error instanceof Error ? error.message : "Could not start the exam.");
    } finally {
      setIsStarting(false);
    }
  };

  const finishExam = useCallback(() => {
    setActiveAttempt(null);
    setPreparedExam(null);
    setSection("results");
    loadResults();
  }, [loadResults]);

  const handlePaperLoaded = (paper) => {
    const minutes = Number(paper?.recommendedTimeMinutes || paper?.durationMinutes || 60);
    setPaperMinutes(minutes);
  };

  const pendingResults = results.filter(isResultLocked).length;
  const releasedResults = results.length - pendingResults;

  return (
    <section className="page-stack exam-page">
      <header className="exam-page__header">
        <div><span className="section-tag">Exam workspace</span><h2>Practice under pressure. Prepare with precision.</h2><p>Attend secure online exams, create exact question papers, and review results after release.</p></div>
        <button className="exam-about-btn" onClick={() => navigate("/exam/about")} title="How the Exam workspace works" type="button"><Info size={16} /><span>About</span></button>
      </header>

      <nav className="exam-page__tabs" aria-label="Exam workspace sections">
        {[
          ["overview", "Overview", GraduationCap],
          ["attend", "Attend Exam", ListChecks],
          ["paper", "Generate Paper", FilePlus2],
          ["results", "View Results", Trophy],
        ].map(([id, label, Icon]) => {
          const isLockedAttendTab = id === "attend" && !isOnlineExamEligible;
          return (
            <button
              className={`${section === id ? "active" : ""}${isLockedAttendTab ? " is-locked" : ""}`}
              disabled={isLockedAttendTab}
              key={id}
              onClick={() => setSection(id)}
              title={isLockedAttendTab ? `Complete ${EXAM_ELIGIBILITY_THRESHOLD}% of your planner to unlock Attend Exam (${readinessPercent}% complete)` : undefined}
              type="button"
            >
              {createElement(Icon, { size: 16 })} {label}
            </button>
          );
        })}
      </nav>

      <section className={`exam-eligibility-banner ${isOnlineExamEligible ? "is-eligible" : "is-locked"}`} aria-live="polite">
        <div className="exam-eligibility-icon" aria-hidden="true">
          {isOnlineExamEligible ? <CheckCircle2 size={20} /> : <ShieldAlert size={20} />}
        </div>
        <div className="exam-eligibility-copy">
          <span>Online exam eligibility</span>
          <strong>{isOnlineExamEligible ? "Attend Exam is unlocked" : `${readinessPercent}% planner completion`}</strong>
          <p>
            {isOnlineExamEligible
              ? "You are now eligible to attend the exam."
              : tasksToExamEligibility > 0
                ? `Complete ${tasksToExamEligibility} more planner task${tasksToExamEligibility === 1 ? "" : "s"} to reach the ${EXAM_ELIGIBILITY_THRESHOLD}% requirement.`
                : `Complete at least ${EXAM_ELIGIBILITY_THRESHOLD}% of your scheduled planner tasks to unlock Attend Exam.`}
          </p>
        </div>
        <div className="exam-eligibility-progress">
          <progress aria-label={`${readinessPercent}% complete`} max={100} value={readinessPercent}>{readinessPercent}%</progress>
          <strong>{readinessPercent}% <small>/ {EXAM_ELIGIBILITY_THRESHOLD}%</small></strong>
        </div>
      </section>

      {section === "overview" && (
        <>
          <section className="card exam-hero">
            <div>
              <span className="exam-hero-badge"><ShieldAlert size={14} /> Secure assessment workspace</span>
              <h2>From focused practice to a complete exam workflow.</h2>
              <p>Prepare a 40-question online assessment, generate printable papers with exact mark allocation, and keep every result or paper organized.</p>
              <div><button className="exam-primary-btn" disabled={!isOnlineExamEligible} onClick={() => setSection("attend")} title={!isOnlineExamEligible ? `Complete ${EXAM_ELIGIBILITY_THRESHOLD}% of your planner to unlock Attend Exam` : undefined} type="button"><ListChecks size={17} /> {isOnlineExamEligible ? "Attend exam" : `Unlock at ${EXAM_ELIGIBILITY_THRESHOLD}%`}</button><button className="exam-secondary-btn" onClick={() => setSection("paper")} type="button"><FilePlus2 size={17} /> Generate paper</button></div>
            </div>
            <div className="exam-hero-stats">
              <div><strong>40</strong><span>MCQs</span></div>
              <div><strong>60m</strong><span>Fixed duration</span></div>
              <div><strong>72h</strong><span>Result release</span></div>
            </div>
          </section>

          <div className="exam-feature-grid">
            <button className={`card exam-feature-card${isOnlineExamEligible ? "" : " is-locked"}`} disabled={!isOnlineExamEligible} onClick={() => setSection("attend")} title={!isOnlineExamEligible ? `Complete ${EXAM_ELIGIBILITY_THRESHOLD}% of your planner to unlock Attend Exam` : undefined} type="button"><span><ListChecks size={21} /></span><h3>Attend Exam</h3><p>{isOnlineExamEligible ? "Fullscreen MCQ exam with autosave, warnings, and server-side grading." : `Locked until your planner reaches ${EXAM_ELIGIBILITY_THRESHOLD}% completion. You are currently at ${readinessPercent}%.`}</p><b>{isOnlineExamEligible ? <>Start setup <ArrowRight size={14} /></> : "Planner progress required"}</b></button>
            <button className="card exam-feature-card" onClick={() => setSection("paper")} type="button"><span><FilePlus2 size={21} /></span><h3>Generate Question Paper</h3><p>Build a precise mark split, coding emphasis, answer key, and exportable PDF.</p><b>Design paper <ArrowRight size={14} /></b></button>
            <button className="card exam-feature-card" onClick={() => setSection("results")} type="button"><span><Trophy size={21} /></span><h3>View Results</h3><p>{pendingResults} pending and {releasedResults} released result{releasedResults === 1 ? "" : "s"}.</p><b>Open results <ArrowRight size={14} /></b></button>
          </div>
        </>
      )}

      {section === "attend" && (
        <div className="exam-attend-layout">
          <section className="card exam-attend-form">
            <div className="exam-section-title"><div><span className="section-tag">Attend exam</span><h2>Prepare a secure online exam</h2><p>Exactly 40 MCQs, 60 minutes, and server-side grading.</p></div><div className="exam-heading-icon"><GraduationCap size={21} /></div></div>
            <div className="exam-form-grid">
              <label className="field-stack">
                Subject
                <select onChange={(event) => setSubjectName(event.target.value)} value={subjectName}>
                  <option value="">Choose subject</option>
                  {names.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
              </label>
              <label className="field-stack">
                Difficulty
                <select onChange={(event) => setDifficulty(event.target.value)} value={difficulty}>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </label>
              <label className="field-stack exam-field-wide">
                Topic or chapter focus (optional)
                <textarea onChange={(event) => setScopeText(event.target.value)} placeholder="Leave blank for broad subject coverage" rows={3} value={scopeText} />
              </label>
            </div>
            <div className="exam-rule-strip"><span><Clock3 size={15} /> 60 minutes</span><span><ListChecks size={15} /> 40 MCQs</span><span><ShieldAlert size={15} /> 3 warnings allowed</span></div>
            <button className="exam-primary-btn" disabled={!isOnlineExamEligible || isPreparing || !subjectName} onClick={prepareExam} type="button">
              {isPreparing ? <><LoaderCircle className="spin" size={17} /> Generating 4 secure batches...</> : <><Sparkles size={17} /> Prepare exam</>}
            </button>

            {preparedExam && (
              <div className="exam-prepared-card">
                <div className="exam-ready-mark"><CheckCircle2 size={22} /></div>
                <div><span>Exam ready</span><strong>{preparedExam.title}</strong><p>{preparedExam.questionCount || 40} questions | {preparedExam.durationMinutes || 60} minutes | {preparedExam.difficulty}</p></div>
                <button className="exam-primary-btn" disabled={!isOnlineExamEligible || isStarting} onClick={startExam} type="button">{isStarting ? "Starting..." : <><Expand size={16} /> Enter fullscreen exam</>}</button>
              </div>
            )}
          </section>

          <aside className="card exam-integrity-card">
            <ShieldAlert size={25} />
            <span className="section-tag">Integrity rules</span>
            <h3>Stay inside the exam</h3>
            <ol><li>Fullscreen is required throughout the attempt.</li><li>Tab changes and fullscreen exits count as violations.</li><li>The first three violations show warnings.</li><li>The fourth violation submits automatically.</li><li>The timer continues after refresh or connection loss.</li></ol>
          </aside>
        </div>
      )}

      {section === "paper" && (
        <>
          <PaperBuilder
            academicLevel={academicLevel}
            academicTrack={academicTrack}
            onGenerated={(paper) => { handlePaperLoaded(paper); loadPapers(); }}
            subjects={subjects}
            userProfile={userProfile}
          />
          <PaperHistory onPaperLoaded={handlePaperLoaded} onRefresh={loadPapers} papers={papers} />
        </>
      )}

      {section === "results" && <ResultsPanel onRefresh={loadResults} results={results} />}

      <OfflineExamTimer paperMinutes={paperMinutes} />

      {activeAttempt && <ExamRunner initialAttempt={activeAttempt} onFinished={finishExam} />}
    </section>
  );
}

export default ExamPage;
