import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Copy,
  Plus,
  RefreshCw,
  ShieldCheck,
  Swords,
  Trophy,
  UserPlus,
  XCircle,
} from "lucide-react";
import { toast } from "react-toastify";
import api from "../../utils/apiClient";
import {
  AI_FEATURES,
  createAiIdempotencyKey,
  getAiRequestErrorMessage,
  useAiQuota,
} from "../../utils/aiQuota";
import {
  QUIZ_ELIGIBILITY_THRESHOLD,
  getSubjectQuizEligibility,
} from "../../utils/plannerMetrics";
import { getAcademicProfileExamples } from "../../utils/academicProfileExamples";
import {
  groupQuizBattles,
  normalizeQuizBattleInviteCode,
  quizBattleStatusLabel,
  shouldPreserveQuizBattleLocalAnswers,
} from "../../utils/quizBattleUi";
import { AiCreditCost } from "../AiQuotaProvider";
import "./QuizBattles.css";

function formatDeadline(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "No deadline";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatTimer(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutesPart = Math.floor(seconds / 60);
  return `${String(minutesPart).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function outcomeTitle(battle) {
  if (battle.result?.outcome === "win") return "You won the battle";
  if (battle.result?.outcome === "loss") return "Your friend won this one";
  if (battle.result?.outcome === "draw") return "The battle is a draw";
  if (battle.result?.kind === "forfeit") return "Uncontested result";
  return battle.status === "expired" ? "Battle expired" : "Battle complete";
}

function rewardLines(reward) {
  if (!reward) return [];
  return [
    reward.completionXp > 0 && { label: "Completed battle", xp: reward.completionXp },
    reward.winXp > 0 && { label: "Win bonus", xp: reward.winXp },
    reward.drawXp > 0 && { label: "Draw bonus", xp: reward.drawXp },
    reward.perfectXp > 0 && { label: "Perfect 10/10", xp: reward.perfectXp },
  ].filter(Boolean);
}

export default function QuizBattlesPanel({
  academicProfile = {},
  academicProfileDataId = "",
  completed = [],
  initialBattleId = "",
  initialInviteCode = "",
  onBattleRouteChange,
  onInviteConsumed,
  schedule = [],
  subjects = [],
}) {
  const { hasInsufficientCredits } = useAiQuota();
  const curriculumExamples = useMemo(() => getAcademicProfileExamples(academicProfile), [academicProfile]);
  const [battles, setBattles] = useState([]);
  const [selectedBattle, setSelectedBattle] = useState(null);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(Boolean(initialInviteCode));
  const [createSubject, setCreateSubject] = useState(subjects[0]?.name || "");
  const [createTopic, setCreateTopic] = useState("");
  const [createDifficulty, setCreateDifficulty] = useState("standard");
  const [joinCode, setJoinCode] = useState(() => normalizeQuizBattleInviteCode(initialInviteCode));
  const [invitePreview, setInvitePreview] = useState(null);
  const [saveState, setSaveState] = useState("");
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const saveTimerRef = useRef(null);
  const saveChainRef = useRef(Promise.resolve());
  const saveVersionRef = useRef(0);
  const answersDirtyRef = useRef(false);
  const latestAnswersRef = useRef({});
  const selectedBattleRef = useRef(null);
  const mountedRef = useRef(true);
  const previewRequestRef = useRef(0);
  const deadlineRefreshRef = useRef("");
  const detailHeadingRef = useRef(null);
  const returnBattleIdRef = useRef("");
  const routeChangeRef = useRef(onBattleRouteChange);

  useEffect(() => {
    routeChangeRef.current = onBattleRouteChange;
  }, [onBattleRouteChange]);

  useEffect(() => {
    selectedBattleRef.current = selectedBattle;
  }, [selectedBattle]);

  useEffect(() => {
    if (!selectedBattle?.id) return;
    window.requestAnimationFrame(() => detailHeadingRef.current?.focus());
  }, [selectedBattle?.id]);

  const syncServerClock = useCallback((payload) => {
    const serverTime = new Date(payload?.serverTime).getTime();
    if (Number.isFinite(serverTime)) setServerOffsetMs(serverTime - Date.now());
  }, []);

  const grouped = useMemo(() => groupQuizBattles(battles), [battles]);
  const creationEligibility = getSubjectQuizEligibility(
    createSubject.trim() || "General study",
    schedule,
    completed,
  );
  const attempt = selectedBattle?.attempt;
  const remainingSeconds = attempt?.status === "in_progress"
    ? Math.max(0, Math.ceil((new Date(attempt.deadlineAt).getTime() - (clockNow + serverOffsetMs)) / 1000))
    : 0;

  const hydrateAnswers = useCallback((nextBattle) => {
    const nextAnswers = nextBattle?.attempt?.status === "in_progress"
      ? nextBattle.attempt.answers || {}
      : {};
    saveVersionRef.current += 1;
    answersDirtyRef.current = false;
    latestAnswersRef.current = nextAnswers;
    setAnswers(nextAnswers);
    setSaveState("");
  }, []);

  const enqueueAnswerSave = useCallback((battleId, nextAnswers, version, options = {}) => {
    const snapshot = { ...nextAnswers };
    const queued = saveChainRef.current
      .catch(() => undefined)
      .then(() => api.saveQuizBattleAnswers(battleId, snapshot, {
        ...options,
        academicProfileId: academicProfileDataId,
      }));
    saveChainRef.current = queued.catch(() => undefined);
    queued
      .then((payload) => {
        syncServerClock(payload);
        if (!mountedRef.current || saveVersionRef.current !== version) return;
        answersDirtyRef.current = false;
        setSaveState("Saved");
      })
      .catch(() => {
        if (!mountedRef.current || saveVersionRef.current !== version) return;
        setSaveState("Save failed — final submission will still send your answers");
      });
    return queued;
  }, [academicProfileDataId, syncServerClock]);

  const flushPendingSave = useCallback(({ keepalive = false } = {}) => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const battle = selectedBattleRef.current;
    if (!answersDirtyRef.current || battle?.attempt?.status !== "in_progress") {
      return Promise.resolve();
    }
    return enqueueAnswerSave(
      battle.id,
      latestAnswersRef.current,
      saveVersionRef.current,
      keepalive ? { keepalive: true, timeoutMs: 10_000 } : {},
    );
  }, [enqueueAnswerSave]);

  const refreshList = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const payload = await api.getQuizBattles({ academicProfileId: academicProfileDataId });
      syncServerClock(payload);
      if (!mountedRef.current) return [];
      setBattles(Array.isArray(payload?.battles) ? payload.battles : []);
      setError("");
      return payload?.battles || [];
    } catch (requestError) {
      if (!silent) {
        setError(requestError instanceof Error
          ? requestError.message
          : "Could not load Quiz Battles.");
      }
      return [];
    } finally {
      if (!silent) setLoading(false);
    }
  }, [academicProfileDataId, syncServerClock]);

  const openBattle = useCallback(async (battleId, { silent = false } = {}) => {
    if (!battleId) return null;
    if (!silent) setBusyAction(`open:${battleId}`);
    try {
      const payload = await api.getQuizBattle(battleId, { academicProfileId: academicProfileDataId });
      syncServerClock(payload);
      if (!mountedRef.current) return null;
      const nextBattle = payload.battle || null;
      const preserveLocalAnswers = shouldPreserveQuizBattleLocalAnswers({
        currentBattleId: selectedBattleRef.current?.id,
        nextBattleId: nextBattle?.id || battleId,
        nextAttemptStatus: nextBattle?.attempt?.status,
        silent,
      });
      setSelectedBattle(nextBattle);
      selectedBattleRef.current = nextBattle;
      if (!preserveLocalAnswers) hydrateAnswers(nextBattle);
      setError("");
      if (!silent) routeChangeRef.current?.(payload.battle?.id || battleId);
      return payload.battle;
    } catch (requestError) {
      if (!silent) {
        setError(requestError instanceof Error ? requestError.message : "Could not open this battle.");
      }
      return null;
    } finally {
      if (!silent) setBusyAction("");
    }
  }, [academicProfileDataId, hydrateAnswers, syncServerClock]);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  useEffect(() => {
    if (!initialBattleId) {
      if (selectedBattleRef.current) {
        void flushPendingSave();
        selectedBattleRef.current = null;
        setSelectedBattle(null);
        hydrateAnswers(null);
      }
      return;
    }
    if (selectedBattleRef.current?.id === initialBattleId) return;
    selectedBattleRef.current = null;
    setSelectedBattle(null);
    hydrateAnswers(null);
    void openBattle(initialBattleId);
  }, [flushPendingSave, hydrateAnswers, initialBattleId, openBattle]);

  useEffect(() => {
    if (!initialInviteCode) return;
    const code = normalizeQuizBattleInviteCode(initialInviteCode);
    const requestToken = ++previewRequestRef.current;
    setJoinCode(code);
    setShowJoin(true);
    setInvitePreview(null);
    if (code.length !== 10) return;
    let active = true;
    setBusyAction("preview");
    api.previewQuizBattleInvite(code, { academicProfileId: academicProfileDataId })
      .then((payload) => {
        syncServerClock(payload);
        if (active && requestToken === previewRequestRef.current) {
          setInvitePreview(payload.invite ? { ...payload.invite, inviteCode: code } : null);
        }
      })
      .catch((requestError) => {
        if (active && requestToken === previewRequestRef.current) {
          setInvitePreview(null);
          setError(requestError instanceof Error ? requestError.message : "Invite not found.");
        }
      })
      .finally(() => {
        if (active) setBusyAction("");
      });
    return () => {
      active = false;
    };
  }, [academicProfileDataId, initialInviteCode, syncServerClock]);

  useEffect(() => {
    const refreshVisible = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      if (selectedBattle?.id) void openBattle(selectedBattle.id, { silent: true });
      else void refreshList({ silent: true });
    };
    const interval = window.setInterval(refreshVisible, 30_000);
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [openBattle, refreshList, selectedBattle?.id]);

  useEffect(() => {
    if (attempt?.status !== "in_progress") return undefined;
    const interval = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [attempt?.status]);

  useEffect(() => {
    if (attempt?.status !== "in_progress" || remainingSeconds > 0 || !selectedBattle?.id) return;
    const deadlineKey = `${selectedBattle.id}:${attempt.deadlineAt}`;
    if (deadlineRefreshRef.current === deadlineKey) return;
    deadlineRefreshRef.current = deadlineKey;
    setBusyAction("deadline");
    setSaveState("Time ended — locking your saved answers");
    void flushPendingSave()
      .catch(() => undefined)
      .then(() => openBattle(selectedBattle.id, { silent: true }))
      .finally(() => {
        if (mountedRef.current) setBusyAction("");
      });
  }, [attempt?.deadlineAt, attempt?.status, flushPendingSave, openBattle, remainingSeconds, selectedBattle?.id]);

  useEffect(() => {
    mountedRef.current = true;
    const flushForExit = () => {
      void flushPendingSave({ keepalive: true });
    };
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") flushForExit();
    };
    window.addEventListener("pagehide", flushForExit);
    document.addEventListener("visibilitychange", flushWhenHidden);
    return () => {
      mountedRef.current = false;
      window.removeEventListener("pagehide", flushForExit);
      document.removeEventListener("visibilitychange", flushWhenHidden);
      void flushPendingSave({ keepalive: true });
    };
  }, [flushPendingSave]);

  const createBattle = async (event) => {
    event.preventDefault();
    if (!creationEligibility.isEligible) {
      setError(`Complete at least ${QUIZ_ELIGIBILITY_THRESHOLD}% of this subject's scheduled tasks before creating its battle.`);
      return;
    }
    if (hasInsufficientCredits(AI_FEATURES.QUIZ)) {
      setError(getAiRequestErrorMessage({ code: "AI_USER_QUOTA_EXHAUSTED" }));
      return;
    }
    setBusyAction("create");
    setError("");
    try {
      const payload = await api.createQuizBattle({
        subjectName: createSubject,
        topic: createTopic,
        difficulty: createDifficulty,
      }, {
        academicProfileId: academicProfileDataId,
        headers: { "Idempotency-Key": createAiIdempotencyKey() },
        timeoutMs: 240_000,
      });
      syncServerClock(payload);
      if (!mountedRef.current) return;
      setSelectedBattle(payload.battle);
      selectedBattleRef.current = payload.battle;
      hydrateAnswers(payload.battle);
      setShowCreate(false);
      setCreateTopic("");
      routeChangeRef.current?.(payload.battle?.id);
      await refreshList({ silent: true });
      toast.success("Quiz Battle created. Share the private code with one friend.");
    } catch (requestError) {
      setError(getAiRequestErrorMessage(requestError, "Could not create the Quiz Battle."));
    } finally {
      setBusyAction("");
    }
  };

  const previewInvite = async (event) => {
    event?.preventDefault();
    const code = normalizeQuizBattleInviteCode(joinCode);
    setJoinCode(code);
    if (code.length !== 10) {
      setError("Enter the complete 10-character invite code.");
      return;
    }
    setBusyAction("preview");
    setError("");
    setInvitePreview(null);
    const requestToken = ++previewRequestRef.current;
    try {
      const payload = await api.previewQuizBattleInvite(code, { academicProfileId: academicProfileDataId });
      syncServerClock(payload);
      if (requestToken !== previewRequestRef.current || !mountedRef.current) return;
      setInvitePreview(payload.invite ? { ...payload.invite, inviteCode: code } : null);
    } catch (requestError) {
      setInvitePreview(null);
      setError(requestError instanceof Error ? requestError.message : "Invite not found.");
    } finally {
      setBusyAction("");
    }
  };

  const acceptInvite = async () => {
    setBusyAction("accept");
    setError("");
    try {
      const acceptedCode = invitePreview?.inviteCode || joinCode;
      const payload = await api.acceptQuizBattleInvite(acceptedCode, { academicProfileId: academicProfileDataId });
      syncServerClock(payload);
      if (!mountedRef.current) return;
      setSelectedBattle(payload.battle);
      selectedBattleRef.current = payload.battle;
      hydrateAnswers(payload.battle);
      setInvitePreview(null);
      setJoinCode("");
      setShowJoin(false);
      onInviteConsumed?.(payload.battle?.id);
      await refreshList({ silent: true });
      toast.success("Battle joined. Start whenever you are ready.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not join this battle.");
    } finally {
      setBusyAction("");
    }
  };

  const cancelBattle = async () => {
    if (!window.confirm("Cancel this pending battle? Generated quiz credits are not refunded.")) return;
    setBusyAction("cancel");
    try {
      const payload = await api.cancelQuizBattle(selectedBattle.id, { academicProfileId: academicProfileDataId });
      syncServerClock(payload);
      setSelectedBattle(payload.battle);
      selectedBattleRef.current = payload.battle;
      hydrateAnswers(payload.battle);
      await refreshList({ silent: true });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not cancel this battle.");
    } finally {
      setBusyAction("");
    }
  };

  const startBattle = async () => {
    if (!window.confirm("Start your one-time 10-minute attempt now? The timer cannot be paused.")) return;
    setBusyAction("start");
    setError("");
    try {
      const payload = await api.startQuizBattle(selectedBattle.id, { academicProfileId: academicProfileDataId });
      syncServerClock(payload);
      setSelectedBattle(payload.battle);
      selectedBattleRef.current = payload.battle;
      hydrateAnswers(payload.battle);
      setClockNow(Date.now());
      await refreshList({ silent: true });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not start this battle.");
    } finally {
      setBusyAction("");
    }
  };

  const selectAnswer = (questionId, optionId) => {
    if (busyAction === "submit" || remainingSeconds <= 0) return;
    const nextAnswers = { ...latestAnswersRef.current, [questionId]: optionId };
    const version = saveVersionRef.current + 1;
    saveVersionRef.current = version;
    answersDirtyRef.current = true;
    latestAnswersRef.current = nextAnswers;
    setAnswers(nextAnswers);
    setSaveState("Saving");
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void enqueueAnswerSave(selectedBattle.id, nextAnswers, version);
    }, 100);
  };

  const submitBattle = async () => {
    const unanswered = (attempt?.questions?.length || 0) - Object.keys(answers).length;
    const message = unanswered > 0
      ? `Submit with ${unanswered} unanswered question${unanswered === 1 ? "" : "s"}? You cannot change answers afterward.`
      : "Submit and lock your answers? You cannot change them afterward.";
    if (!window.confirm(message)) return;
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const submissionAnswers = { ...latestAnswersRef.current };
    setBusyAction("submit");
    setError("");
    try {
      const payload = await api.submitQuizBattle(
        selectedBattle.id,
        submissionAnswers,
        { academicProfileId: academicProfileDataId },
      );
      syncServerClock(payload);
      setSelectedBattle(payload.battle);
      selectedBattleRef.current = payload.battle;
      hydrateAnswers(payload.battle);
      await refreshList({ silent: true });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not submit this battle.");
      await openBattle(selectedBattle.id, { silent: true });
    } finally {
      setBusyAction("");
    }
  };

  const copyInvite = async () => {
    const code = selectedBattle?.inviteCode;
    if (!code) return;
    const url = `${window.location.origin}/quiz?tab=battles#battle-invite=${encodeURIComponent(code)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Private battle link copied.");
    } catch {
      toast.error("Could not copy automatically. Copy the code shown on screen.");
    }
  };

  const closeBattle = () => {
    const returnBattleId = returnBattleIdRef.current;
    void flushPendingSave();
    setSelectedBattle(null);
    selectedBattleRef.current = null;
    hydrateAnswers(null);
    routeChangeRef.current?.("");
    window.requestAnimationFrame(() => {
      const selector = returnBattleId
        ? `[data-battle-id="${returnBattleId}"]`
        : ".battle-dashboard-actions button";
      document.querySelector(selector)?.focus();
    });
  };

  const renderResult = () => {
    const result = selectedBattle.result;
    const rewards = rewardLines(selectedBattle.reward);
    return (
      <div className="battle-result-stack">
        <div className="battle-result-hero">
          <Trophy aria-hidden="true" size={30} />
          <div>
            <span className="section-tag">Results released</span>
            <h3>{outcomeTitle(selectedBattle)}</h3>
            {result?.kind === "forfeit" && (
              <p>No win bonus is awarded when only one learner submits.</p>
            )}
          </div>
        </div>

        <div className="battle-scoreboard" aria-label="Battle scores">
          {(result?.participants || []).map((participant) => (
            <article key={participant.role}>
              <span>{participant.role === selectedBattle.role ? "You" : participant.displayName}</span>
              <strong>
                {participant.score === null ? "—" : `${participant.score}/${participant.total}`}
              </strong>
              <small>{participant.status.replaceAll("_", " ")}</small>
            </article>
          ))}
        </div>

        {selectedBattle.reward && (
          <section className="battle-reward-card" aria-label="XP reward">
            <div>
              <span className="section-tag">Study Momentum</span>
              <strong>+{selectedBattle.reward.totalXp} XP</strong>
            </div>
            {selectedBattle.reward.rewardEligible ? (
              <ul>
                {rewards.map((reward) => (
                  <li key={reward.label}>
                    <span>{reward.label}</span>
                    <strong>+{reward.xp}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Your result is recorded, but today’s three rewarded-battle cap was already reached.</p>
            )}
          </section>
        )}

        {Array.isArray(result?.review) && result.review.length > 0 && (
          <section className="battle-review-list">
            <div>
              <span className="section-tag">Answer review</span>
              <h3>Learn from the duel</h3>
            </div>
            {result.review.map((question, index) => (
              <article className="battle-review-question" key={question.id}>
                <h4>{index + 1}. {question.question}</h4>
                <div className="battle-review-options">
                  {question.options.map((option) => {
                    const correct = option.id === question.correctOptionId;
                    const selected = option.id === question.selectedOptionId;
                    return (
                      <div
                        className={[
                          "battle-review-option",
                          correct ? "is-correct" : "",
                          selected && !correct ? "is-incorrect" : "",
                        ].filter(Boolean).join(" ")}
                        key={option.id}
                      >
                        <span>{option.text}</span>
                        {correct && <CheckCircle2 aria-label="Correct answer" size={17} />}
                        {selected && !correct && <XCircle aria-label="Your answer" size={17} />}
                      </div>
                    );
                  })}
                </div>
                <p>{question.explanation}</p>
                {question.opponentCorrect !== null && (
                  <small>
                    {question.opponentCorrect ? "Your friend also recalled this." : "Your friend missed this one."}
                  </small>
                )}
              </article>
            ))}
          </section>
        )}
      </div>
    );
  };

  const renderBattleDetail = () => (
    <section className="battle-detail card">
      <div className="battle-detail-header">
        <button className="battle-back-btn" onClick={closeBattle} type="button">
          <ArrowLeft aria-hidden="true" size={17} />
          All battles
        </button>
        <span className={`battle-status-pill is-${selectedBattle.status}`}>
          {quizBattleStatusLabel(selectedBattle)}
        </span>
      </div>

      <div className="battle-title-row">
        <div>
          <span className="section-tag">{selectedBattle.subjectName}</span>
          <h2 ref={detailHeadingRef} tabIndex={-1}>{selectedBattle.topic}</h2>
          <p>
            {selectedBattle.opponent?.displayName} · {selectedBattle.difficulty} · 10 questions
          </p>
        </div>
        <Swords aria-hidden="true" size={34} />
      </div>

      {selectedBattle.status === "pending" && (
        <div className="battle-invite-ready">
          <ShieldCheck aria-hidden="true" size={28} />
          <div>
            <span className="section-tag">Private invite</span>
            <h3>{selectedBattle.inviteCode}</h3>
            <p>Only one friend can use this code. It expires {formatDeadline(selectedBattle.inviteExpiresAt)}.</p>
          </div>
          <div className="battle-inline-actions">
            <button className="primary-btn" onClick={copyInvite} type="button">
              <Copy aria-hidden="true" size={16} />
              Copy invite link
            </button>
            <button
              className="secondary-btn"
              disabled={busyAction === "cancel"}
              onClick={cancelBattle}
              type="button"
            >
              Cancel
            </button>
          </div>
          <small>Cancellation does not refund credits because the shared quiz was already generated.</small>
        </div>
      )}

      {selectedBattle.status === "active" && selectedBattle.canStart && (
        <div className="battle-ready-card">
          <Clock3 aria-hidden="true" size={28} />
          <div>
            <h3>Take it on your own time</h3>
            <p>Once started, your 10-minute timer cannot pause. The overall battle closes {formatDeadline(selectedBattle.deadlineAt)}.</p>
          </div>
          <button
            className="primary-btn"
            disabled={busyAction === "start"}
            onClick={startBattle}
            type="button"
          >
            {busyAction === "start" ? "Starting…" : "Start my attempt"}
          </button>
        </div>
      )}

      {attempt?.status === "in_progress" && (
        <div className="battle-runner">
          <div className="battle-runner-toolbar">
            <div>
              <strong>{Object.keys(answers).length}/{attempt.questions?.length || 10} answered</strong>
              <small>{saveState || "Answers autosave while the timer is active"}</small>
            </div>
            <div className={`battle-timer${remainingSeconds <= 60 ? " is-urgent" : ""}`} role="timer">
              <Clock3 aria-hidden="true" size={17} />
              {formatTimer(remainingSeconds)}
            </div>
          </div>

          <div className="battle-question-list">
            {(attempt.questions || []).map((question, questionIndex) => (
              <fieldset
                className="battle-question"
                disabled={busyAction === "submit" || busyAction === "deadline" || remainingSeconds <= 0}
                key={question.id}
              >
                <legend>{questionIndex + 1}. {question.question}</legend>
                <div className="battle-option-list">
                  {question.options.map((option) => (
                    <label
                      className={answers[question.id] === option.id ? "is-selected" : ""}
                      key={option.id}
                    >
                      <input
                        checked={answers[question.id] === option.id}
                        name={`battle-question-${question.id}`}
                        onChange={() => selectAnswer(question.id, option.id)}
                        type="radio"
                        value={option.id}
                      />
                      <span>{option.text}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>

          <div className="battle-submit-bar">
            <p>Your score is calculated on the server. At 00:00, your saved answers submit automatically; results stay sealed until release.</p>
            <button
              className="primary-btn"
              disabled={busyAction === "submit" || busyAction === "deadline" || remainingSeconds <= 0}
              onClick={submitBattle}
              type="button"
            >
              {busyAction === "submit" ? "Locking answers…" : "Submit final answers"}
            </button>
          </div>
        </div>
      )}

      {selectedBattle.status === "active" && attempt?.status === "submitted" && (
        <div className="battle-waiting-card" role="status">
          <ShieldCheck aria-hidden="true" size={30} />
          <h3>Your attempt is locked</h3>
          <p>Your score and answer key remain hidden until your friend submits or the battle closes.</p>
          <time dateTime={selectedBattle.deadlineAt}>
            Deadline: {formatDeadline(selectedBattle.deadlineAt)}
          </time>
        </div>
      )}

      {selectedBattle.status === "active" && attempt?.status === "expired" && (
        <div className="battle-waiting-card" role="status">
          <Clock3 aria-hidden="true" size={30} />
          <h3>Your attempt time ended</h3>
          <p>The battle remains sealed until your friend finishes or the overall deadline passes.</p>
          <time dateTime={selectedBattle.deadlineAt}>
            Battle deadline: {formatDeadline(selectedBattle.deadlineAt)}
          </time>
        </div>
      )}

      {(selectedBattle.status === "completed" || selectedBattle.status === "expired") && renderResult()}

      {selectedBattle.status === "cancelled" && (
        <div className="battle-waiting-card">
          <XCircle aria-hidden="true" size={30} />
          <h3>This battle was cancelled</h3>
          <p>Create a new duel whenever you are ready.</p>
        </div>
      )}
    </section>
  );

  const renderGroup = (title, description, items) => {
    if (!items.length) return null;
    return (
      <section className="battle-group">
        <div className="battle-group-heading">
          <div>
            <h3>{title}</h3>
            <p>{description}</p>
          </div>
          <span>{items.length}</span>
        </div>
        <div className="battle-card-grid">
          {items.map((battle) => (
            <article className="battle-summary-card" key={battle.id}>
              <div className="battle-card-topline">
                <span>{battle.subjectName}</span>
                <span className={`battle-status-pill is-${battle.status}`}>
                  {quizBattleStatusLabel(battle)}
                </span>
              </div>
              <h4>{battle.topic}</h4>
              <p>
                <Swords aria-hidden="true" size={15} />
                {battle.opponent?.displayName}
              </p>
              <time dateTime={battle.deadlineAt}>
                <Clock3 aria-hidden="true" size={14} />
                {formatDeadline(battle.deadlineAt)}
              </time>
              {battle.reward && (
                <span className="battle-card-xp">+{battle.reward.totalXp} XP</span>
              )}
              <button
                className={battle.canStart || battle.attemptStatus === "in_progress" ? "primary-btn" : "secondary-btn"}
                data-battle-id={battle.id}
                disabled={busyAction === `open:${battle.id}`}
                onClick={() => {
                  returnBattleIdRef.current = battle.id;
                  void openBattle(battle.id);
                }}
                type="button"
              >
                {battle.status === "completed" || battle.status === "expired"
                  ? "View results"
                  : battle.attemptStatus === "in_progress"
                    ? "Continue"
                    : battle.canStart
                      ? "Start"
                      : "Open"}
              </button>
            </article>
          ))}
        </div>
      </section>
    );
  };

  if (selectedBattle) {
    return (
      <div className="battle-panel">
        {error && <div className="battle-alert" role="alert">{error}</div>}
        {renderBattleDetail()}
      </div>
    );
  }

  return (
    <div className="battle-panel">
      <section className="battle-dashboard-hero card">
        <div>
          <span className="section-tag">Asynchronous 1v1</span>
          <h2>Challenge a friend to a topic duel</h2>
          <p>One shared AI quiz, private results, server-scored answers, and XP that counts in Study Momentum.</p>
        </div>
        <Swords aria-hidden="true" size={42} />
      </section>

      <div className="battle-dashboard-actions">
        <button
          aria-controls="quiz-battle-create-panel"
          aria-expanded={showCreate}
          className="primary-btn"
          onClick={() => {
            setShowCreate((value) => !value);
            setShowJoin(false);
          }}
          type="button"
        >
          <Plus aria-hidden="true" size={17} />
          Create battle
        </button>
        <button
          aria-controls="quiz-battle-join-panel"
          aria-expanded={showJoin}
          className="secondary-btn"
          onClick={() => {
            setShowJoin((value) => !value);
            setShowCreate(false);
          }}
          type="button"
        >
          <UserPlus aria-hidden="true" size={17} />
          Join with code
        </button>
        <button
          aria-label="Refresh battles"
          className="battle-refresh-btn"
          disabled={loading}
          onClick={() => void refreshList()}
          title="Refresh battles"
          type="button"
        >
          <RefreshCw aria-hidden="true" size={17} />
        </button>
      </div>

      {error && <div className="battle-alert" role="alert">{error}</div>}

      {showCreate && (
        <form className="battle-form card" id="quiz-battle-create-panel" onSubmit={createBattle}>
          <div>
            <span className="section-tag">Create a private duel</span>
            <h3>Generate one shared 10-question quiz</h3>
          </div>
          <div className="battle-form-grid">
            <label>
              Subject
              <input
                className="text-input"
                list="quiz-battle-subjects"
                onChange={(event) => setCreateSubject(event.target.value)}
                required
                value={createSubject}
              />
              <datalist id="quiz-battle-subjects">
                {subjects.map((subject) => (
                  <option key={subject.name} value={subject.name} />
                ))}
              </datalist>
            </label>
            <label>
              Exact topic
              <input
                className="text-input"
                maxLength={160}
                minLength={3}
                onChange={(event) => setCreateTopic(event.target.value)}
                placeholder={curriculumExamples.battleTopicPlaceholder}
                required
                value={createTopic}
              />
            </label>
            <label>
              Difficulty
              <select
                className="text-input"
                onChange={(event) => setCreateDifficulty(event.target.value)}
                value={createDifficulty}
              >
                <option value="easy">Easy</option>
                <option value="standard">Standard</option>
                <option value="hard">Hard</option>
              </select>
            </label>
            <label>
              Format
              <input className="text-input" disabled value="10 questions · 10 minutes" />
            </label>
          </div>
          <p className={creationEligibility.isEligible ? "battle-eligibility is-ready" : "battle-eligibility"}>
            {creationEligibility.isEligible
              ? `${createSubject || "Subject"} is ${creationEligibility.completionRate}% complete — battle creation unlocked.`
              : creationEligibility.totalTasks === 0
                ? `Schedule and complete at least ${QUIZ_ELIGIBILITY_THRESHOLD}% of ${createSubject || "this subject"} to create its battle.`
                : `${creationEligibility.completedTasks}/${creationEligibility.totalTasks} tasks complete. Reach ${QUIZ_ELIGIBILITY_THRESHOLD}% to unlock.`}
          </p>
          <div className="battle-form-footer">
            <div>
              <AiCreditCost feature={AI_FEATURES.QUIZ} />
              <small>Charged once to the creator. Joining, playing, and results cost 0 credits.</small>
            </div>
            <button
              className="primary-btn"
              disabled={
                busyAction === "create"
                || !creationEligibility.isEligible
                || createTopic.trim().length < 3
                || hasInsufficientCredits(AI_FEATURES.QUIZ)
              }
              type="submit"
            >
              {busyAction === "create" ? "Generating shared quiz…" : "Generate and create"}
            </button>
          </div>
        </form>
      )}

      {showJoin && (
        <section className="battle-form card" id="quiz-battle-join-panel">
          <div>
            <span className="section-tag">Private invite</span>
            <h3>Join your friend’s battle</h3>
          </div>
          <form className="battle-code-form" onSubmit={previewInvite}>
            <label>
              10-character code
              <input
                autoComplete="off"
                className="text-input battle-code-input"
                maxLength={10}
                onChange={(event) => {
                  setJoinCode(normalizeQuizBattleInviteCode(event.target.value));
                  setInvitePreview(null);
                }}
                placeholder="ABCD234EFG"
                value={joinCode}
              />
            </label>
            <button
              className="secondary-btn"
              disabled={busyAction === "preview" || joinCode.length !== 10}
              type="submit"
            >
              {busyAction === "preview" ? "Checking…" : "Check invite"}
            </button>
          </form>

          {invitePreview && (
            <article className="battle-invite-preview" aria-live="polite">
              <UserPlus aria-hidden="true" size={26} />
              <div>
                <span>{invitePreview.challenger?.displayName} challenged you</span>
                <h4>{invitePreview.topic}</h4>
                <p>{invitePreview.subjectName} · {invitePreview.difficulty} · 10 questions</p>
                <time dateTime={invitePreview.inviteExpiresAt}>
                  Invite expires {formatDeadline(invitePreview.inviteExpiresAt)}
                </time>
              </div>
              {invitePreview.ownInvite ? (
                <span className="battle-inline-note">This is your own invite.</span>
              ) : invitePreview.alreadyJoined ? (
                <button
                  className="primary-btn"
                  onClick={() => void openBattle(invitePreview.battleId)}
                  type="button"
                >
                  Open battle
                </button>
              ) : (
                <button
                  className="primary-btn"
                  disabled={busyAction === "accept"}
                  onClick={acceptInvite}
                  type="button"
                >
                  {busyAction === "accept" ? "Joining…" : "Accept challenge"}
                </button>
              )}
            </article>
          )}
        </section>
      )}

      {loading ? (
        <div className="battle-loading" role="status">Loading your battles…</div>
      ) : error ? null : battles.length === 0 ? (
        <div className="battle-empty card">
          <Swords aria-hidden="true" size={34} />
          <h3>No battles yet</h3>
          <p>Create a private duel or enter a friend’s invite code.</p>
        </div>
      ) : (
        <div className="battle-groups">
          {renderGroup("Your turn", "Start or continue your attempt.", grouped.yourTurn)}
          {renderGroup("Waiting", "Invites and locked attempts waiting on your friend.", grouped.waiting)}
          {renderGroup("Completed", "Released scores, XP, and answer reviews.", grouped.completed)}
          {grouped.inactive.length > 0 && (
            <details className="battle-inactive">
              <summary>Expired or cancelled ({grouped.inactive.length})</summary>
              {renderGroup("Past battles", "No longer active.", grouped.inactive)}
            </details>
          )}
        </div>
      )}
    </div>
  );
}
