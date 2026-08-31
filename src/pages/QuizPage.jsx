import { useCallback, useEffect, useRef, useState } from "react";
import {
  useBeforeUnload,
  useBlocker,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { toast } from "react-toastify";
import { Download, Search, Trash2, Check, X, Swords } from "lucide-react";
import api from "../utils/apiClient";
import QuizBattlesPanel from "../components/quiz-battles/QuizBattlesPanel";
import QuizExitDialog from "../components/QuizExitDialog";
import {
  AI_FEATURES,
  createAiIdempotencyKey,
  getAiRequestErrorMessage,
  useAiQuota,
} from "../utils/aiQuota";
import { AiCreditCost } from "../components/AiQuotaProvider";
import {
  academicProfilePayload,
  buildLearnerAcademicContext,
} from "../utils/academicProfile";
import { getAcademicProfileExamples } from "../utils/academicProfileExamples";
import { getSubjectQuizEligibility, QUIZ_ELIGIBILITY_THRESHOLD } from "../utils/plannerMetrics";
import { getRankedQuizSubjects } from "../utils/quizSubjectOptions";
import { getLearnerRoutePolicy } from "../utils/learnerRouting";
import { quizBattleInviteCodeFromHash } from "../utils/quizBattleUi";
import {
  QUIZ_SESSION_STATUSES,
  clearQuizSession,
  createQuizSession,
  quizSessionAnsweredCount,
  readQuizSession,
  writeQuizSession,
} from "../utils/quizSession";

const QUIZ_HISTORY_PER_PAGE = 6;

function rankSearchMatch(fields, query) {
  const cleanQuery = query.trim().toLowerCase();
  if (!cleanQuery) return 0;

  return fields.reduce((best, field) => {
    const value = String(field || "").toLowerCase();
    if (!value.includes(cleanQuery)) return best;
    if (value === cleanQuery) return Math.max(best, 4);
    if (value.startsWith(cleanQuery)) return Math.max(best, 3);
    return Math.max(best, 2);
  }, 0);
}

function QuizPage({ academicProfileDataId = "", academicLevel, academicTrack, userProfile, subjects = [], schedule = [], completed = [] }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { hasInsufficientCredits } = useAiQuota();
  const [topic, setTopic] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [questionLimit, setQuestionLimit] = useState(5);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [saveError, setSaveError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [quizMeta, setQuizMeta] = useState(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [pendingDeleteAttemptId, setPendingDeleteAttemptId] = useState(null);
  const [deletingAttemptId, setDeletingAttemptId] = useState(null);
  const [historySearchQuery, setHistorySearchQuery] = useState("");
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [quizSession, setQuizSession] = useState(null);
  const [multiplayerAttempt, setMultiplayerAttempt] = useState(null);
  const [exitActionBusy, setExitActionBusy] = useState(false);
  const [exitActionError, setExitActionError] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);

  const [searchParams, setSearchParams] = useSearchParams();
  const [pendingInviteCode, setPendingInviteCode] = useState(
    () => searchParams.get("join") || quizBattleInviteCodeFromHash(window.location.hash),
  );
  const hasInitializedSubject = useRef(false);
  const quizSessionRef = useRef(null);
  const isYoungKidsLearner = getLearnerRoutePolicy({
    ...userProfile,
    academicLevel,
    academicTrack,
  }).isYoungKidsLearner;
  const battleTabActive = !isYoungKidsLearner && (
    searchParams.get("tab") === "battles"
    || Boolean(searchParams.get("join"))
    || Boolean(searchParams.get("battle"))
    || Boolean(quizBattleInviteCodeFromHash(location.hash))
  );

  const updateQuizRoute = (mode, battleId = "") => {
    const next = new URLSearchParams(searchParams);
    if (mode === "battles") next.set("tab", "battles");
    else next.delete("tab");
    if (battleId) next.set("battle", battleId);
    else next.delete("battle");
    if (mode !== "battles") {
      next.delete("join");
      setPendingInviteCode("");
    }
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    const inviteCode = searchParams.get("join") || quizBattleInviteCodeFromHash(location.hash);
    if (!inviteCode) return;
    setPendingInviteCode(inviteCode);
    const next = new URLSearchParams(searchParams);
    next.set("tab", "battles");
    next.delete("join");
    navigate({
      pathname: location.pathname,
      search: next.toString() ? `?${next.toString()}` : "",
      hash: "",
    }, { replace: true });
  }, [location.hash, location.pathname, navigate, searchParams]);

  const handleQuizTabKeyDown = (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextMode = event.key === "ArrowRight" || event.key === "End" ? "battles" : "solo";
    updateQuizRoute(nextMode);
    window.requestAnimationFrame(() => {
      document.getElementById(`quiz-tab-${nextMode}`)?.focus();
    });
  };

  useEffect(() => {
    hasInitializedSubject.current = false;
    const stored = readQuizSession(window.localStorage, academicProfileDataId);
    const pausedSession = stored
      ? writeQuizSession(window.localStorage, academicProfileDataId, {
        ...stored,
        status: QUIZ_SESSION_STATUSES.PAUSED,
      }) || { ...stored, status: QUIZ_SESSION_STATUSES.PAUSED }
      : null;

    quizSessionRef.current = pausedSession;
    setQuizSession(pausedSession);
    setResult(null);

    if (pausedSession) {
      hasInitializedSubject.current = true;
      setTopic(pausedSession.topic);
      setSubjectName(pausedSession.subjectName);
      setSearchQuery(pausedSession.subjectName);
      setQuestionLimit(pausedSession.questionLimit);
      setQuestions(pausedSession.questions);
      setAnswers(pausedSession.answers);
      setQuizMeta(pausedSession.quizMeta);
      return;
    }

    setTopic("");
    setSubjectName("");
    setSearchQuery("");
    setQuestionLimit(5);
    setQuestions([]);
    setAnswers({});
    setQuizMeta(null);
  }, [academicProfileDataId]);

  useEffect(() => {
    if (hasInitializedSubject.current) return;

    const initialSubject = searchParams.get("subject")?.trim() || subjects[0]?.name?.trim() || "";
    if (!initialSubject) return;

    hasInitializedSubject.current = true;
    setSubjectName(initialSubject);
    setSearchQuery(initialSubject);
  }, [searchParams, subjects]);

  const filteredSubjects = getRankedQuizSubjects(subjects, searchQuery);

  useEffect(() => {
    let isMounted = true;

    setIsHistoryLoading(true);

    api.getQuizzes({ academicProfileId: academicProfileDataId })
      .then((payload) => {
        if (isMounted) setAttempts(payload.attempts || []);
      })
      .catch((error) => {
        setSaveError(error instanceof Error ? error.message : "Could not load quiz history.");
      })
      .finally(() => {
        if (isMounted) setIsHistoryLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [academicProfileDataId]);



  const selectedSubject = subjectName.trim() || "General study";
  const quizEligibility = getSubjectQuizEligibility(selectedSubject, schedule, completed);
  const quizEligibilityMessage = quizEligibility.isEligible
    ? `${selectedSubject} is ${quizEligibility.completionRate}% complete. Quiz unlocked.`
    : quizEligibility.totalTasks === 0
      ? `Schedule ${selectedSubject} and complete at least ${QUIZ_ELIGIBILITY_THRESHOLD}% to unlock its quiz.`
      : `${quizEligibility.completedTasks}/${quizEligibility.totalTasks} scheduled tasks complete. Complete ${quizEligibility.tasksToEligibility} more scheduled ${quizEligibility.tasksToEligibility === 1 ? "task" : "tasks"} to reach ${QUIZ_ELIGIBILITY_THRESHOLD}%.`;
  const cleanTopic = topic.trim();
  const learnerContext = buildLearnerAcademicContext({
    ...userProfile,
    academicLevel,
    academicTrack,
  });
  const curriculumExamples = getAcademicProfileExamples(learnerContext);
  const hasUnfinishedSoloQuiz = Boolean(
    quizSession
    && questions.length > 0
    && !result,
  );
  const soloQuizPaused = hasUnfinishedSoloQuiz
    && quizSession.status === QUIZ_SESSION_STATUSES.PAUSED;
  const soloQuizActive = hasUnfinishedSoloQuiz
    && quizSession.status === QUIZ_SESSION_STATUSES.ACTIVE;
  const multiplayerQuizActive = Boolean(multiplayerAttempt?.active);

  const persistCurrentQuizSession = useCallback((status) => {
    if (questions.length === 0 || result) return null;
    const current = quizSessionRef.current || createQuizSession({
      answers,
      questions,
      quizMeta,
      status,
      subjectName: quizMeta?.subjectName || selectedSubject,
      topic: quizMeta?.topic || cleanTopic,
    });
    if (!current) return null;

    const persisted = writeQuizSession(window.localStorage, academicProfileDataId, {
      ...current,
      answers,
      questions,
      quizMeta,
      status,
      subjectName: quizMeta?.subjectName || current.subjectName || selectedSubject,
      topic: quizMeta?.topic || current.topic || cleanTopic,
    });
    if (!persisted) return null;
    quizSessionRef.current = persisted;
    setQuizSession(persisted);
    return persisted;
  }, [
    academicProfileDataId,
    answers,
    cleanTopic,
    questions,
    quizMeta,
    result,
    selectedSubject,
  ]);

  useEffect(() => {
    const current = quizSessionRef.current;
    if (!current || questions.length === 0 || result) return;
    const persisted = writeQuizSession(window.localStorage, academicProfileDataId, {
      ...current,
      answers,
      questions,
      quizMeta,
      subjectName: quizMeta?.subjectName || current.subjectName || selectedSubject,
      topic: quizMeta?.topic || current.topic || cleanTopic,
    });
    if (persisted) quizSessionRef.current = persisted;
  }, [
    academicProfileDataId,
    answers,
    cleanTopic,
    questions,
    quizMeta,
    result,
    selectedSubject,
  ]);

  const handleMultiplayerAttemptChange = useCallback((nextAttempt) => {
    setMultiplayerAttempt(nextAttempt?.active ? nextAttempt : null);
  }, []);

  const shouldBlockQuizNavigation = useCallback(({ currentLocation, nextLocation }) => {
    const destinationChanged = currentLocation.pathname !== nextLocation.pathname
      || currentLocation.search !== nextLocation.search
      || currentLocation.hash !== nextLocation.hash;
    return destinationChanged && (soloQuizActive || multiplayerQuizActive);
  }, [multiplayerQuizActive, soloQuizActive]);
  const navigationBlocker = useBlocker(shouldBlockQuizNavigation);

  useBeforeUnload(useCallback((event) => {
    if (!soloQuizActive && !multiplayerQuizActive) return;
    event.preventDefault();
    event.returnValue = "";
  }, [multiplayerQuizActive, soloQuizActive]));

  useEffect(() => {
    if (navigationBlocker.state !== "blocked") {
      setExitActionBusy(false);
      setExitActionError("");
    }
  }, [navigationBlocker.state]);

  const filteredAttempts = historySearchQuery.trim()
    ? attempts
      .map((attempt, index) => ({
        attempt,
        index,
        rank: rankSearchMatch(
          [attempt.topic, attempt.subjectName, attempt.score, attempt.total, attempt.status],
          historySearchQuery
        ),
      }))
      .filter((item) => item.rank > 0)
      .sort((a, b) => b.rank - a.rank || a.index - b.index)
      .map((item) => item.attempt)
    : attempts;

  const historyTotalPages = Math.max(1, Math.ceil(filteredAttempts.length / QUIZ_HISTORY_PER_PAGE));
  const historyStart = (historyPage - 1) * QUIZ_HISTORY_PER_PAGE;
  const paginatedAttempts = filteredAttempts.slice(historyStart, historyStart + QUIZ_HISTORY_PER_PAGE);

  useEffect(() => {
    setHistoryPage((current) => Math.min(current, historyTotalPages));
  }, [historyTotalPages]);

  useEffect(() => {
    setHistoryPage(1);
  }, [historySearchQuery]);

  const downloadQuizPDF = async () => {
    const element = document.getElementById("quiz-export-container");
    if (!element) return;

    try {
      const canvas = await html2canvas(element, {
        backgroundColor: "#0d151c",
        scale: 2
      });
      const imageData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const imageWidth = 190;
      const imageHeight = (canvas.height * imageWidth) / canvas.width;

      pdf.addImage(imageData, "PNG", 10, 10, imageWidth, imageHeight);
      pdf.save(`Quiz_${cleanTopic.replace(/\s+/g, "_")}.pdf`);
      toast.success("Quiz PDF exported.");
    } catch (err) {
      console.error(err);
      toast.error("Failed to export PDF.");
    }
  };

  const exportOldQuizPDF = async (attempt) => {
    if (!attempt.questions || attempt.questions.length === 0) {
      toast.info("Questions were not saved for this older attempt.");
      return;
    }

    const tempContainer = document.createElement("div");
    tempContainer.style.position = "absolute";
    tempContainer.style.left = "-9999px";
    tempContainer.style.width = "800px";
    tempContainer.style.padding = "24px";
    tempContainer.style.backgroundColor = "#0d151c";
    tempContainer.style.color = "#f8fafc";
    tempContainer.style.fontFamily = "sans-serif";

    tempContainer.innerHTML = `
      <div style="margin-bottom: 24px; border-bottom: 2px solid rgba(255, 255, 255, 0.1); padding-bottom: 12px;">
        <span style="font-size: 0.75rem; text-transform: uppercase; color: #38bdf8; font-weight: bold;">Quiz History Export</span>
        <h2 style="margin: 6px 0 2px; font-size: 1.5rem;">${attempt.topic}</h2>
        <p style="margin: 0; font-size: 0.85rem; color: #94a3b8;">Subject: ${attempt.subjectName} | ${attempt.status === "aborted" ? "Status: Aborted" : `Score: ${attempt.score}/${attempt.total}`}</p>
      </div>
      <div id="temp-questions-list"></div>
    `;

    const listContainer = tempContainer.querySelector("#temp-questions-list");

    attempt.questions.forEach((q, idx) => {
      const selectedOpt = attempt.answers[q.id];
      const isCorrect = q.answerIndex === selectedOpt;

      const questionBlock = document.createElement("div");
      questionBlock.style.marginBottom = "20px";
      questionBlock.style.padding = "14px";
      questionBlock.style.backgroundColor = "rgba(255, 255, 255, 0.03)";
      questionBlock.style.borderRadius = "12px";
      questionBlock.style.border = "1px solid rgba(255, 255, 255, 0.05)";

      let optionsHtml = "";
      q.options.forEach((opt, optIdx) => {
        let optStyle = "padding: 8px 12px; margin: 4px 0; border-radius: 6px; font-size: 0.9rem; border: 1px solid rgba(255, 255, 255, 0.05);";
        if (optIdx === q.answerIndex) {
          optStyle += " background-color: rgba(34, 197, 94, 0.15); border-color: rgba(34, 197, 94, 0.3); color: #4ade80;";
        } else if (optIdx === selectedOpt && !isCorrect) {
          optStyle += " background-color: rgba(239, 68, 68, 0.15); border-color: rgba(239, 68, 68, 0.3); color: #f87171;";
        }

        optionsHtml += `
          <div style="${optStyle}">
            ${opt} ${optIdx === q.answerIndex ? "✓" : (optIdx === selectedOpt ? "✕" : "")}
          </div>
        `;
      });

      questionBlock.innerHTML = `
        <h4 style="margin: 0 0 10px; font-size: 1rem;">${idx + 1}. ${q.question}</h4>
        <div>${optionsHtml}</div>
        <div style="margin-top: 8px; font-size: 0.85rem; color: #94a3b8;">
          <p style="margin: 0;"><strong>Explanation:</strong> ${q.explanation}</p>
        </div>
      `;

      listContainer.appendChild(questionBlock);
    });

    document.body.appendChild(tempContainer);

    try {
      const canvas = await html2canvas(tempContainer, {
        backgroundColor: "#0d151c",
        scale: 2
      });
      const imageData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const imageWidth = 190;
      const imageHeight = (canvas.height * imageWidth) / canvas.width;

      pdf.addImage(imageData, "PNG", 10, 10, imageWidth, imageHeight);
      pdf.save(`Quiz_Attempt_${attempt.topic.replace(/\s+/g, "_")}.pdf`);
      toast.success("Attempt PDF exported.");
    } catch (err) {
      console.error(err);
      toast.error("Failed to export PDF.");
    } finally {
      document.body.removeChild(tempContainer);
    }
  };

  const resetGeneratedQuiz = () => {
    if (questions.length === 0 && Object.keys(answers).length === 0 && !result && !quizMeta) return;
    clearQuizSession(window.localStorage, academicProfileDataId);
    quizSessionRef.current = null;
    setQuizSession(null);
    setQuestions([]);
    setAnswers({});
    setResult(null);
    setQuizMeta(null);
  };

  const startQuiz = async () => {
    if (!quizEligibility.isEligible) {
      setSaveError(quizEligibilityMessage);
      return;
    }
    if (!cleanTopic) {
      setSaveError(`Enter the exact topic first, for example: ${curriculumExamples.topic}.`);
      return;
    }
    if (hasInsufficientCredits(AI_FEATURES.QUIZ)) {
      setSaveError(getAiRequestErrorMessage({ code: "AI_USER_QUOTA_EXHAUSTED" }));
      return;
    }

    try {
      setIsGenerating(true);
      setSaveError("");
      setQuestions([]);
      setAnswers({});
      setResult(null);
      setQuizMeta(null);
      clearQuizSession(window.localStorage, academicProfileDataId);
      quizSessionRef.current = null;
      setQuizSession(null);

      const payload = await api.generateQuiz({
        ...academicProfilePayload(learnerContext),
        subjectName: selectedSubject,
        topic: cleanTopic,
        limit: questionLimit,
      }, {
        academicProfileId: academicProfileDataId,
        headers: { "Idempotency-Key": createAiIdempotencyKey() },
        timeoutMs: 120000,
      });

      const nextQuestions = payload.questions || [];
      const nextQuizMeta = {
        model: payload.model,
        limit: payload.limit,
        subjectName: selectedSubject,
        topic: payload.topic,
      };
      const nextSession = createQuizSession({
        questions: nextQuestions,
        quizMeta: nextQuizMeta,
        status: QUIZ_SESSION_STATUSES.ACTIVE,
        subjectName: selectedSubject,
        topic: payload.topic || cleanTopic,
      });
      const persistedSession = nextSession
        ? writeQuizSession(window.localStorage, academicProfileDataId, nextSession)
        : null;

      setQuestions(nextQuestions);
      setQuizMeta(nextQuizMeta);
      quizSessionRef.current = persistedSession || nextSession;
      setQuizSession(persistedSession || nextSession);
    } catch (error) {
      setSaveError(getAiRequestErrorMessage(error, "Could not generate quiz."));
    } finally {
      setIsGenerating(false);
    }
  };

  const submitQuiz = async () => {
    const score = questions.reduce(
      (total, question) => total + (answers[question.id] === question.answerIndex ? 1 : 0),
      0
    );

    try {
      setSaveError("");
      const payload = await api.saveQuizAttempt({
        ...academicProfilePayload(learnerContext),
        answeredCount: Object.keys(answers).length,
        subjectName: quizMeta?.subjectName || selectedSubject,
        topic: quizMeta?.topic || cleanTopic,
        total: questions.length,
        score,
        questions,
        answers,
        sessionId: quizSessionRef.current?.sessionId || "",
        status: "completed",
      }, { academicProfileId: academicProfileDataId });

      clearQuizSession(window.localStorage, academicProfileDataId);
      quizSessionRef.current = null;
      setQuizSession(null);
      setResult(payload.attempt);
      setAttempts((current) => [payload.attempt, ...current]);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save quiz attempt.");
    }
  };

  const resumeQuiz = () => {
    setSaveError("");
    const resumed = persistCurrentQuizSession(QUIZ_SESSION_STATUSES.ACTIVE);
    if (!resumed) {
      setSaveError("This paused quiz could not be restored. Refresh and try again.");
    }
  };

  const stayOnQuiz = useCallback(() => {
    if (exitActionBusy) return;
    setExitActionError("");
    navigationBlocker.reset?.();
  }, [exitActionBusy, navigationBlocker]);

  const pauseAndLeaveQuiz = async () => {
    if (exitActionBusy || navigationBlocker.state !== "blocked") return;
    setExitActionBusy(true);
    setExitActionError("");
    const paused = persistCurrentQuizSession(QUIZ_SESSION_STATUSES.PAUSED);
    if (!paused) {
      setExitActionBusy(false);
      setExitActionError("The quiz draft could not be saved. Stay here and try again.");
      return;
    }
    navigationBlocker.proceed?.();
  };

  const abortAndLeaveQuiz = async () => {
    if (exitActionBusy || navigationBlocker.state !== "blocked") return;
    const session = quizSessionRef.current;
    if (!session) {
      setExitActionError("The active quiz session could not be found.");
      return;
    }

    setExitActionBusy(true);
    setExitActionError("");
    const answeredCount = quizSessionAnsweredCount({ ...session, answers });
    const score = questions.reduce(
      (total, question) => total + (answers[question.id] === question.answerIndex ? 1 : 0),
      0,
    );

    try {
      const payload = await api.saveQuizAttempt({
        ...academicProfilePayload(learnerContext),
        answeredCount,
        answers,
        questions,
        score,
        sessionId: session.sessionId,
        status: "aborted",
        subjectName: quizMeta?.subjectName || session.subjectName || selectedSubject,
        topic: quizMeta?.topic || session.topic || cleanTopic,
        total: questions.length,
      }, { academicProfileId: academicProfileDataId });

      clearQuizSession(window.localStorage, academicProfileDataId);
      quizSessionRef.current = null;
      setQuizSession(null);
      setAttempts((current) => [payload.attempt, ...current.filter((item) => item.id !== payload.attempt?.id)]);
      navigationBlocker.proceed?.();
    } catch (error) {
      setExitActionBusy(false);
      setExitActionError(error instanceof Error
        ? error.message
        : "The aborted attempt could not be saved. Stay here and try again.");
    }
  };

  const clearHistory = async () => {
    if (attempts.length === 0) return;

    try {
      setSaveError("");
      await api.clearQuizHistory({ academicProfileId: academicProfileDataId });
      setAttempts([]);
      setHistoryPage(1);
      setPendingDeleteAttemptId(null);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not clear quiz history.");
    }
  };

  const deleteQuizAttempt = async (attemptId) => {
    if (!attemptId || deletingAttemptId === attemptId) return;

    try {
      setSaveError("");
      setDeletingAttemptId(attemptId);
      await api.deleteQuizAttempt(attemptId, { academicProfileId: academicProfileDataId });
      setAttempts((current) => current.filter((attempt) => attempt.id !== attemptId));
      setPendingDeleteAttemptId((current) => current === attemptId ? null : current);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not delete this quiz attempt.");
    } finally {
      setDeletingAttemptId((current) => current === attemptId ? null : current);
    }
  };

  return (
    <section className="page-stack quiz-page">
      <div className="section-intro">
        <span className="section-tag">Quiz lab</span>
        <h2>Practice solo or challenge a friend</h2>
      </div>

      <div
        className={[
          "quiz-mode-shell",
          battleTabActive ? "is-battles" : "is-solo",
          !isYoungKidsLearner ? "has-mode-tabs" : "",
        ].filter(Boolean).join(" ")}
      >
      {!isYoungKidsLearner && (
        <div
          aria-label="Quiz mode"
          className="quiz-mode-tabs"
          onKeyDown={handleQuizTabKeyDown}
          role="tablist"
        >
          <button
            aria-controls="quiz-panel-solo"
            aria-selected={!battleTabActive}
            id="quiz-tab-solo"
            onClick={() => updateQuizRoute("solo")}
            role="tab"
            tabIndex={battleTabActive ? -1 : 0}
            type="button"
          >
            <Check aria-hidden="true" size={15} />
            Solo quiz
          </button>
          <button
            aria-controls="quiz-panel-battles"
            aria-selected={battleTabActive}
            id="quiz-tab-battles"
            onClick={() => updateQuizRoute("battles")}
            role="tab"
            tabIndex={battleTabActive ? 0 : -1}
            type="button"
          >
            <Swords aria-hidden="true" size={15} />
            Quiz Battles
          </button>
        </div>
      )}

      {battleTabActive ? (
        <div
          aria-labelledby="quiz-tab-battles"
          id="quiz-panel-battles"
          role="tabpanel"
        >
          <QuizBattlesPanel
            academicProfile={learnerContext}
            academicProfileDataId={academicProfileDataId}
            completed={completed}
            initialBattleId={searchParams.get("battle") || ""}
            initialInviteCode={pendingInviteCode}
            onAttemptStateChange={handleMultiplayerAttemptChange}
            onBattleRouteChange={(battleId) => updateQuizRoute("battles", battleId)}
            onInviteConsumed={(battleId) => {
              setPendingInviteCode("");
              const next = new URLSearchParams(searchParams);
              next.set("tab", "battles");
              next.delete("join");
              if (battleId) next.set("battle", battleId);
              setSearchParams(next, { replace: true });
            }}
            schedule={schedule}
            subjects={subjects}
          />
        </div>
      ) : (
        <div
          className="quiz-solo-panel"
          aria-labelledby={isYoungKidsLearner ? undefined : "quiz-tab-solo"}
          id="quiz-panel-solo"
          role={isYoungKidsLearner ? undefined : "tabpanel"}
        >
      <section className="card quiz-builder-card">
        <div className="quiz-builder-header">
          <span className="section-tag">Adaptive setup</span>
          <h3>Build a quiz from your exact topic</h3>
        </div>

        <div className="quiz-builder-grid">
          <label className="field-stack quiz-builder-field quiz-subject-field">
            Subject
            <div className="autocomplete-container" style={{ position: "relative" }}>
              <input
                aria-autocomplete="list"
                aria-controls="quiz-subject-suggestions"
                aria-describedby="quiz-eligibility-status"
                aria-expanded={showDropdown && searchQuery.trim() !== ""}
                autoComplete="off"
                disabled={isGenerating || hasUnfinishedSoloQuiz}
                type="text"
                className="text-input"
                role="combobox"
                value={searchQuery}
                onChange={(event) => {
                  const val = event.target.value;
                  setSearchQuery(val);
                  resetGeneratedQuiz();
                  setSubjectName(val);
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                onBlur={() => {
                  setTimeout(() => setShowDropdown(false), 200);
                }}
                placeholder="Type to search or select subject..."
                style={{ width: "100%", boxSizing: "border-box" }}
              />
              {showDropdown && searchQuery.trim() !== "" && (
                <div
                  id="quiz-subject-suggestions"
                  className="autocomplete-dropdown"
                  role="listbox"
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    border: "1px solid var(--border)",
                    borderRadius: "12px",
                    zIndex: 100,
                    maxHeight: "180px",
                    overflowY: "auto",
                    marginTop: "6px",
                    boxShadow: "0 10px 30px rgba(0, 0, 0, 0.4)"
                  }}
                >
                  {filteredSubjects.length === 0 ? (
                    <div
                      aria-selected="false"
                      role="option"
                      style={{ padding: "10px 14px", fontSize: "0.85rem", color: "var(--text-muted)", cursor: "pointer" }}
                      onMouseDown={() => {
                        resetGeneratedQuiz();
                        setSubjectName(searchQuery);
                        setShowDropdown(false);
                      }}
                    >
                      Use "{searchQuery || "General study"}"
                    </div>
                  ) : (
                    filteredSubjects.map((subject) => (
                      <div
                        className="autocomplete-item"
                        key={subject.id}
                        aria-selected={subject.name === subjectName}
                        role="option"
                        style={{
                          padding: "10px 14px",
                          cursor: "pointer",
                          fontSize: "0.88rem",
                          color: "var(--text)",
                          borderBottom: "1px solid rgba(255, 255, 255, 0.03)",
                          transition: "background 0.2s"
                        }}
                        onMouseDown={() => {
                          resetGeneratedQuiz();
                          setSubjectName(subject.name);
                          setSearchQuery(subject.name);
                          setShowDropdown(false);
                        }}
                      >
                        {subject.name}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </label>

          <label className="field-stack quiz-builder-field quiz-topic-field">
            Topic or doubt
            <input
              disabled={isGenerating || hasUnfinishedSoloQuiz}
              onChange={(event) => {
                resetGeneratedQuiz();
                setTopic(event.target.value);
              }}
              placeholder={curriculumExamples.quizTopicPlaceholder}
              value={topic}
            />
          </label>

          <label className="field-stack quiz-builder-field quiz-limit-field">
            Question limit
            <select
              disabled={isGenerating || hasUnfinishedSoloQuiz}
              onChange={(event) => {
                resetGeneratedQuiz();
                setQuestionLimit(Number(event.target.value));
              }}
              value={questionLimit}
            >
              <option value={5}>5 questions</option>
              <option value={10}>10 questions</option>
            </select>
          </label>
        </div>

        <p aria-live="polite" className={`quiz-eligibility-status ${quizEligibility.isEligible ? "is-eligible" : "is-locked"}`} id="quiz-eligibility-status" role="status">
          {quizEligibilityMessage}
        </p>

        {saveError && <p className="auth-message" role="alert">{saveError}</p>}

        <AiCreditCost feature={AI_FEATURES.QUIZ} />
        <button
          aria-describedby="quiz-eligibility-status"
          className="action-btn"
          disabled={isGenerating || hasUnfinishedSoloQuiz || !quizEligibility.isEligible || hasInsufficientCredits(AI_FEATURES.QUIZ)}
          onClick={startQuiz}
          title={!quizEligibility.isEligible ? quizEligibilityMessage : hasInsufficientCredits(AI_FEATURES.QUIZ) ? "Not enough AI credits" : "Generate AI quiz"}
          type="button"
        >
          {isGenerating ? "Generating topic quiz..." : "Generate AI quiz"}
        </button>
      </section>

      {questions.length > 0 && (
        <section className="card quiz-runner-card">
          {soloQuizPaused && (
            <div className="quiz-resume-banner" role="status">
              <div>
                <strong>Quiz paused safely</strong>
                <span>{Object.keys(answers).length}/{questions.length} answers restored. Resume when you are ready.</span>
              </div>
              <button onClick={resumeQuiz} type="button">Resume quiz</button>
            </div>
          )}
          <div className="quiz-runner-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
            <div>
              <span className="section-tag">Question set</span>
              <h3>{cleanTopic}</h3>
              {quizMeta?.model && <p className="card-subtext" style={{ margin: 0 }}>Generated by {quizMeta.model} with {questions.length} topic-focused questions.</p>}
            </div>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <button 
                className="secondary-btn" 
                onClick={downloadQuizPDF} 
                type="button" 
                title="Export PDF"
                style={{ width: "32px", height: "32px", minWidth: "32px", minHeight: "32px", padding: 0, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
              >
                <Download size={16} />
              </button>
              {result && (
                <strong 
                  className="quiz-score-chip" 
                  style={{ height: "32px", minHeight: "32px", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 14px", fontSize: "0.82rem", margin: 0, boxSizing: "border-box", borderRadius: "999px" }}
                >
                  Score {result.score}/{result.total}
                </strong>
              )}
            </div>
          </div>

          <div className="quiz-question-list" id="quiz-export-container" style={{ padding: "12px" }}>
            {questions.map((question, index) => (
              <article className="quiz-question-card" key={question.id}>
                <h4>{index + 1}. {question.question}</h4>
                <div className="quiz-option-grid">
                  {question.options.map((option, optionIndex) => {
                    const selected = answers[question.id] === optionIndex;
                    const isCorrect = result && question.answerIndex === optionIndex;
                    const isWrong = result && selected && !isCorrect;
                    const className = [
                      "quiz-option",
                      selected ? "selected" : "",
                      isCorrect ? "correct" : "",
                      isWrong ? "wrong" : "",
                    ].filter(Boolean).join(" ");

                    return (
                      <button
                        className={className}
                        disabled={Boolean(result) || soloQuizPaused}
                        key={`${question.id}-${optionIndex}`}
                        onClick={() => setAnswers((current) => ({ ...current, [question.id]: optionIndex }))}
                        type="button"
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
                {result && (
                  <div style={{ marginTop: "12px" }}>
                    {answers[question.id] !== question.answerIndex ? (
                      <p style={{ color: "#ef4444", fontSize: "0.88rem", fontWeight: 700, margin: "0 0 6px" }}>
                        ✕ Incorrect. The correct answer is: {question.options[question.answerIndex]}
                      </p>
                    ) : (
                      <p style={{ color: "#22c55e", fontSize: "0.88rem", fontWeight: 700, margin: "0 0 6px" }}>
                        ✓ Correct!
                      </p>
                    )}
                    <p className="quiz-explanation"><strong>Explanation:</strong> {question.explanation}</p>
                  </div>
                )}
              </article>
            ))}
          </div>

          {!result && (
            <button
              disabled={soloQuizPaused || Object.keys(answers).length !== questions.length}
              onClick={submitQuiz}
              type="button"
            >
              Submit quiz
            </button>
          )}
        </section>
      )}

      <section className="card quiz-history-card">
        <div className="quiz-history-header">
          <div>
            <span className="section-tag">Quiz history</span>
            <h3>Recent attempts</h3>
          </div>
          {attempts.length > 0 && (
            <div className="quiz-history-controls" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <label className="stored-search-field quiz-history-desktop-search">
                <Search size={16} />
                <input
                  aria-label="Search quiz history"
                  onChange={(event) => setHistorySearchQuery(event.target.value)}
                  placeholder="Search by topic, subject, or score"
                  type="search"
                  value={historySearchQuery}
                />
              </label>
              {showClearConfirm ? (
                <div className="quiz-clear-confirm" style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(239, 68, 68, 0.05)", border: "1px solid rgba(239, 68, 68, 0.15)", borderRadius: "20px", padding: "2px 8px 2px 12px", height: "32px", boxSizing: "border-box" }}>
                  <span style={{ fontSize: "0.78rem", color: "#f87171", fontWeight: 600 }}>Clear all?</span>
                  <button 
                    onClick={() => {
                      clearHistory();
                      setShowClearConfirm(false);
                    }}
                    className="inline-confirm-btn yes-btn"
                    title="Yes, clear history"
                    type="button"
                  >
                    <Check size={12} />
                  </button>
                  <button 
                    onClick={() => setShowClearConfirm(false)}
                    className="inline-confirm-btn no-btn"
                    title="Cancel"
                    type="button"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <button 
                  className="clear-history-btn" 
                  onClick={() => {
                    setPendingDeleteAttemptId(null);
                    setShowClearConfirm(true);
                  }}
                  title="Clear quiz history" 
                  type="button"
                  style={{ width: "32px", height: "32px", minWidth: "32px", minHeight: "32px", padding: 0, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(239, 68, 68, 0.2)", background: "rgba(239, 68, 68, 0.08)", color: "#ef4444" }}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          )}
        </div>
        {attempts.length > 0 && (
          <label className="stored-search-field quiz-history-mobile-search">
            <Search size={16} />
            <input
              aria-label="Search quiz history"
              onChange={(event) => setHistorySearchQuery(event.target.value)}
              placeholder="Search by topic, subject, or score"
              type="search"
              value={historySearchQuery}
            />
          </label>
        )}
        <div className="quiz-history-grid">
          {isHistoryLoading ? (
            <p className="card-subtext">Loading quiz history...</p>
          ) : attempts.length === 0 ? (
            <p className="card-subtext">No quiz attempts yet. Generate your first topic quiz.</p>
          ) : filteredAttempts.length === 0 ? (
            <p className="card-subtext">No quiz attempts match your search.</p>
          ) : (
            paginatedAttempts.map((attempt) => {
              const isConfirmingDelete = pendingDeleteAttemptId === attempt.id;
              const isDeleting = deletingAttemptId === attempt.id;
              const isAborted = attempt.status === "aborted";

              return (
                <article className={`quiz-history-item${isAborted ? " is-aborted" : ""}`} key={attempt.id}>
                  <strong>{attempt.topic}</strong>
                  <span>{attempt.subjectName}</span>
                  {isAborted && <span className="quiz-history-status is-aborted">Aborted</span>}
                  <div className="quiz-history-item-footer">
                    <b>{isAborted
                      ? `${Number(attempt.answeredCount) || 0}/${attempt.total} answered`
                      : `${attempt.score}/${attempt.total}`}</b>
                    <div className="quiz-history-item-actions">
                      {attempt.questions && attempt.questions.length > 0 && (
                        <button
                          aria-label={`Export ${attempt.topic} quiz as PDF`}
                          className="history-export-btn"
                          onClick={(event) => {
                            event.stopPropagation();
                            exportOldQuizPDF(attempt);
                          }}
                          title="Export PDF"
                          type="button"
                        >
                          <Download aria-hidden="true" size={12} />
                        </button>
                      )}
                      {isConfirmingDelete ? (
                        <div
                          aria-busy={isDeleting}
                          aria-label={`Confirm deleting ${attempt.topic}`}
                          className="quiz-history-delete-confirm"
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => {
                            if (event.key === "Escape" && !isDeleting) {
                              event.preventDefault();
                              setPendingDeleteAttemptId(null);
                            }
                          }}
                          role="group"
                        >
                          <button
                            aria-label={`Confirm deleting ${attempt.topic}`}
                            autoFocus
                            className="history-export-btn quiz-history-confirm-btn is-confirm"
                            disabled={isDeleting}
                            onClick={() => deleteQuizAttempt(attempt.id)}
                            title="Confirm delete"
                            type="button"
                          >
                            <Check aria-hidden="true" size={12} />
                          </button>
                          <button
                            aria-label={`Cancel deleting ${attempt.topic}`}
                            className="history-export-btn quiz-history-confirm-btn is-cancel"
                            disabled={isDeleting}
                            onClick={() => setPendingDeleteAttemptId(null)}
                            title="Cancel delete"
                            type="button"
                          >
                            <X aria-hidden="true" size={12} />
                          </button>
                        </div>
                      ) : (
                        <button
                          aria-label={`Delete ${attempt.topic} quiz`}
                          className="history-export-btn quiz-history-delete-btn"
                          onClick={(event) => {
                            event.stopPropagation();
                            setShowClearConfirm(false);
                            setPendingDeleteAttemptId(attempt.id);
                          }}
                          title="Delete quiz"
                          type="button"
                        >
                          <Trash2 aria-hidden="true" size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
        {filteredAttempts.length > QUIZ_HISTORY_PER_PAGE && (
          <div className="pagination-bar">
            <button disabled={historyPage === 1} onClick={() => setHistoryPage((current) => current - 1)} type="button">
              Previous
            </button>
            <span>Page {historyPage} of {historyTotalPages}</span>
            <button disabled={historyPage === historyTotalPages} onClick={() => setHistoryPage((current) => current + 1)} type="button">
              Next
            </button>
          </div>
        )}
      </section>
        </div>
      )}
      </div>
      <QuizExitDialog
        busy={exitActionBusy}
        error={exitActionError}
        mode={multiplayerQuizActive ? "multiplayer" : "solo"}
        onAbort={abortAndLeaveQuiz}
        onPause={pauseAndLeaveQuiz}
        onStay={stayOnQuiz}
        open={navigationBlocker.state === "blocked"}
      />
    </section>
  );
}

export default QuizPage;

