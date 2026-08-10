import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Award,
  Check,
  ChevronRight,
  Clock3,
  Coins,
  Gamepad2,
  Medal,
  RotateCcw,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Trophy,
  Wifi,
  WifiOff,
} from "lucide-react";
import api from "../utils/apiClient";
import { isYoungKidsParentGuidedRoute } from "../utils/learnerRouting";
import {
  KIDS_AGE_BANDS,
  KIDS_GAME_TYPES,
  KIDS_SUBJECTS,
  SUBJECTS_BY_AGE_BAND,
  applyKidsAttempt,
  buildLocalBossPack,
  buildLocalDailyMission,
  buildLocalRetryPack,
  calculateKidsDailyStreak,
  createDefaultKidsProgress,
  createDefaultParentSettings,
  evaluateLocalKidsAttempt,
  formatSessionRemaining,
  getFallbackKidsPacks,
  getKidsAgeBand,
  getKidsCopy,
  getKidsStorageKey,
  getLocalized,
  loadKidsLocalState,
  mergeKidsProgress,
  normalizeKidsPack,
  reconcileKidsPacks,
  saveKidsLocalState,
} from "../utils/kidsLearning";
import KidsAdventureMap from "../components/kids/KidsAdventureMap";
import KidsGameRunner from "../components/kids/KidsGameRunner";
import KidsParentCorner from "../components/kids/KidsParentCorner";
import KidsPetTutor from "../components/kids/KidsPetTutor";
import KidsRouteBoundary from "../components/kids/KidsRouteBoundary";
import "./KidsLearningPage.css";

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function initialSessionState(storage, key) {
  const today = localDateKey();
  try {
    const saved = JSON.parse(storage?.getItem(key) || "null");
    if (saved?.date === today && Number.isFinite(Number(saved.startedAt))) {
      return {
        startedAt: Number(saved.startedAt),
        dailyBaselineSeconds: Number.isFinite(Number(saved.dailyBaselineSeconds))
          ? Math.max(0, Number(saved.dailyBaselineSeconds))
          : null,
      };
    }
  } catch {
    // A fresh session below is safer than failing the page for corrupted session data.
  }
  const startedAt = Date.now();
  try {
    storage?.setItem(key, JSON.stringify({ date: today, startedAt }));
  } catch {
    // Session timing still works in memory when browser storage is unavailable.
  }
  return { startedAt, dailyBaselineSeconds: null };
}

function loadPendingAttempts(storage, key) {
  try {
    const value = JSON.parse(storage?.getItem(key) || "[]");
    return Array.isArray(value)
      ? value.filter((attempt) => attempt?.packId && attempt?.clientAttemptId).slice(0, 50)
      : [];
  } catch {
    return [];
  }
}

function savePendingAttempts(storage, key, attempts) {
  try {
    storage?.setItem(key, JSON.stringify((Array.isArray(attempts) ? attempts : []).slice(0, 50)));
  } catch {
    // A blocked or full browser store should never interrupt a child activity.
  }
}

function normalizeServerSettings(value, localSettings) {
  if (!value || typeof value !== "object") return localSettings;
  return {
    ...localSettings,
    ...value,
    parentPinConfigured: Boolean(value.parentPinConfigured),
    timeLimitMinutes: Math.max(10, Math.min(60, Number(value.dailyPlayLimitMinutes ?? value.timeLimitMinutes) || localSettings.timeLimitMinutes)),
    audioEnabled: value.audioEnabled === undefined ? localSettings.audioEnabled : Boolean(value.audioEnabled),
    timerVisible: value.timerVisible === undefined ? localSettings.timerVisible : Boolean(value.timerVisible),
    language: value.language === "hi" ? "hi" : "en",
  };
}

function createServerRetryPack(progress, gradeBand) {
  const entries = Array.isArray(progress?.retryQueue) ? progress.retryQueue : [];
  const playable = entries.filter((entry) => {
    const retryItem = entry?.item || entry;
    return retryItem?.prompt && entry?.packId;
  });
  if (!playable.length) return null;
  const first = playable[0];
  const firstPackId = first.packId;
  const samePack = playable.filter((entry) => entry.packId === firstPackId).slice(0, 5);
  return normalizeKidsPack({
    id: firstPackId,
    gradeBand: first.gradeBand || gradeBand,
    subject: first.subject || "English",
    gameType: first.gameType || "mcq",
    title: "Brave Retry Trail",
    titleHi: "बहादुर दोबारा प्रयास",
    description: "A fresh chance to practise questions that felt tricky.",
    descriptionHi: "कठिन लगे सवालों का फिर अभ्यास करने का मौका।",
    topic: first.topic || "Retry practice",
    estimatedMinutes: Math.min(10, Math.max(2, samePack.length * 2)),
    items: samePack.map((entry) => ({ ...(entry.item || entry) })),
    source: "server",
  });
}

function rewardFromPayload(payload, fallbackProgress) {
  const rewards = payload?.rewards || {};
  return {
    stars: Number(rewards.stars ?? rewards.starsEarned ?? fallbackProgress?.lastReward?.stars) || 0,
    coins: Number(rewards.coins ?? rewards.coinsEarned ?? fallbackProgress?.lastReward?.coins) || 0,
    badgeAwarded: rewards.badgeAwarded || fallbackProgress?.lastReward?.badgeAwarded || "",
  };
}

function formatReviewAnswer(value, gameType) {
  if (gameType === "count-tap") {
    if (Array.isArray(value)) return `${value.length} tapped`;
    if (value && typeof value === "object" && Number.isFinite(Number(value.targetCount))) {
      return `Tap ${Number(value.targetCount)} objects`;
    }
  }
  if (Array.isArray(value)) return value.map(String).join(" → ");
  if (value && typeof value === "object") {
    return Object.entries(value).map(([key, answer]) => `${key} → ${answer}`).join(" · ");
  }
  return String(value ?? "").trim() || "No answer";
}

export function KidsLearningHeroToolbar({
  syncStatus,
  copy,
  onOpenParentCorner,
}) {
  const statusLabel = syncStatus === "synced"
    ? copy.synced
    : syncStatus === "offline"
      ? copy.offline
      : copy.loading;

  return (
    <div className="kids-hero-toolbar">
      <span className={`kids-sync-status is-${syncStatus}`}>
        {syncStatus === "loading"
          ? <RotateCcw aria-hidden="true" className="kids-spin" size={15} />
          : syncStatus === "synced"
            ? <Wifi aria-hidden="true" size={15} />
            : <WifiOff aria-hidden="true" size={15} />}
        {statusLabel}
      </span>
      <button
        aria-label={copy.parentCorner}
        className="kids-parent-button"
        onClick={onOpenParentCorner}
        type="button"
      >
        <ShieldCheck aria-hidden="true" size={16} />
        <span>{copy.parentCorner}</span>
      </button>
    </div>
  );
}

function KidsLearningPageContent({
  userProfile = {},
  academicLevel = "",
  academicTrack = "",
  subjects = [],
  parentAccess = {},
  onParentAccessChange,
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const storageKey = useMemo(() => getKidsStorageKey(userProfile), [userProfile]);
  const savedStateRef = useRef(null);
  if (savedStateRef.current === null && typeof window !== "undefined") {
    savedStateRef.current = loadKidsLocalState(window.localStorage, storageKey) || false;
  }
  const savedState = savedStateRef.current || null;
  const inferredAgeBand = getKidsAgeBand(userProfile?.grade || academicLevel);
  const selectedAgeBand = inferredAgeBand;
  const [today, setToday] = useState(localDateKey);
  const [selectedSubject, setSelectedSubject] = useState(
    SUBJECTS_BY_AGE_BAND[inferredAgeBand]?.[0] || "English",
  );
  const [progress, setProgress] = useState(savedState?.progress || createDefaultKidsProgress());
  const [settings, setSettings] = useState(savedState?.settings || createDefaultParentSettings());
  const [packs, setPacks] = useState(() => getFallbackKidsPacks(selectedAgeBand, selectedSubject, today).map((pack) => ({ ...pack, source: "local" })));
  const [dailyMission, setDailyMission] = useState(() => buildLocalDailyMission(selectedAgeBand, progress, today));
  const [activePack, setActivePack] = useState(null);
  const [activeMode, setActiveMode] = useState("game");
  const [result, setResult] = useState(null);
  const [parentCornerOpen, setParentCornerOpen] = useState(false);
  const [registrationPinSetupPending, setRegistrationPinSetupPending] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.sessionStorage.getItem("prepmatrix_kids_pin_setup_pending") === "true";
    } catch {
      return false;
    }
  });
  const [syncStatus, setSyncStatus] = useState("loading");
  const [packsLoading, setPacksLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [profileRefreshKey, setProfileRefreshKey] = useState(0);
  const pendingStorageKey = storageKey + ":pending-attempts";
  const [pendingAttempts, setPendingAttempts] = useState(() => (
    typeof window === "undefined" ? [] : loadPendingAttempts(window.localStorage, pendingStorageKey)
  ));
  const pendingAttemptsRef = useRef(pendingAttempts);
  const flushingPendingRef = useRef(false);
  const sessionStorageKey = `${storageKey}:session`;
  const initialSessionStateRef = useRef(null);
  if (initialSessionStateRef.current === null) {
    initialSessionStateRef.current = initialSessionState(
      typeof window !== "undefined" ? window.sessionStorage : null,
      sessionStorageKey,
    );
  }
  const sessionStartedAtRef = useRef(initialSessionStateRef.current.startedAt);
  const dailyUsedBeforeSessionRef = useRef(initialSessionStateRef.current.dailyBaselineSeconds || 0);
  const dailyUsageLoadedRef = useRef(initialSessionStateRef.current.dailyBaselineSeconds !== null);
  const [remainingSeconds, setRemainingSeconds] = useState(settings.timeLimitMinutes * 60);
  const copy = getKidsCopy(settings.language);
  const dailyComplete = (progress.completedDailyMissions || []).includes(today);
  const linkedSubjectNames = useMemo(() => new Set(
    (Array.isArray(subjects) ? subjects : []).map((subject) => String(subject?.name || subject).trim().toLocaleLowerCase()),
  ), [subjects]);

  useEffect(() => {
    if (registrationPinSetupPending || parentAccess?.setupRequired === true || location.state?.parentAccess) {
      setParentCornerOpen(true);
    }
    if (parentAccess?.setupRequired === false && registrationPinSetupPending) {
      try {
        window.sessionStorage.removeItem("prepmatrix_kids_pin_setup_pending");
      } catch {
        // The server state remains authoritative if storage is unavailable.
      }
      setRegistrationPinSetupPending(false);
    }
  }, [location.state, parentAccess?.setupRequired, registrationPinSetupPending]);

  useEffect(() => {
    const allowedSubjects = SUBJECTS_BY_AGE_BAND[selectedAgeBand] || SUBJECTS_BY_AGE_BAND["class1-2"];
    if (!allowedSubjects.includes(selectedSubject)) setSelectedSubject(allowedSubjects[0] || "English");
  }, [selectedAgeBand, selectedSubject]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    saveKidsLocalState(window.localStorage, storageKey, {
      progress,
      settings,
      selectedAgeBand,
    });
  }, [progress, selectedAgeBand, settings, storageKey]);

  useEffect(() => {
    pendingAttemptsRef.current = pendingAttempts;
    if (typeof window !== "undefined") {
      savePendingAttempts(window.localStorage, pendingStorageKey, pendingAttempts);
    }
  }, [pendingAttempts, pendingStorageKey]);

  useEffect(() => {
    let cancelled = false;
    setSyncStatus("loading");
    const query = new URLSearchParams({ gradeBand: selectedAgeBand, localDate: today });
    api.get(`/api/kids/profile?${query.toString()}`)
      .then((payload) => {
        if (cancelled) return;
        if (payload?.progress) {
          if (!dailyUsageLoadedRef.current) {
            dailyUsedBeforeSessionRef.current = Math.max(
              0,
              Math.round(Number(payload.progress?.playTime?.minutesToday) || 0) * 60,
            );
            dailyUsageLoadedRef.current = true;
            try {
              window.sessionStorage.setItem(sessionStorageKey, JSON.stringify({
                date: today,
                startedAt: sessionStartedAtRef.current,
                dailyBaselineSeconds: dailyUsedBeforeSessionRef.current,
              }));
            } catch {
              // The fixed baseline still remains available in memory.
            }
          }
          setProgress((current) => mergeKidsProgress(current, payload.progress));
        }
        if (payload?.settings) setSettings((current) => normalizeServerSettings(payload.settings, current));
        if (payload?.parentAccess) {
          onParentAccessChange?.(payload.parentAccess);
          if (payload.parentAccess.setupRequired) setParentCornerOpen(true);
        }
        const prefersHindiContent = payload?.settings?.language === "hi" || settings.language === "hi";
        if (!prefersHindiContent && payload?.dailyMission?.items?.length >= 5) {
          setDailyMission({ ...normalizeKidsPack(payload.dailyMission), source: "server" });
        }
        setSyncStatus("synced");
      })
      .catch(() => {
        if (!cancelled) setSyncStatus("offline");
      });
    return () => {
      cancelled = true;
    };
  }, [
    onParentAccessChange,
    profileRefreshKey,
    selectedAgeBand,
    sessionStorageKey,
    settings.language,
    today,
  ]);

  useEffect(() => {
    let cancelled = false;
    const localPacks = getFallbackKidsPacks(selectedAgeBand, selectedSubject, today).map((pack) => ({ ...pack, source: "local" }));
    setPacks(localPacks);
    if (settings.language === "hi") {
      setPacksLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setPacksLoading(true);
    const query = new URLSearchParams({ gradeBand: selectedAgeBand, subject: selectedSubject });
    api.get(`/api/kids/packs?${query.toString()}`)
      .then((payload) => {
        if (cancelled) return;
        const serverPacks = Array.isArray(payload?.packs)
          ? payload.packs.map((pack, index) => ({ ...normalizeKidsPack(pack, index), source: "server" })).filter((pack) => pack.items.length)
          : [];
        if (serverPacks.length) {
          setPacks(reconcileKidsPacks(localPacks, serverPacks));
          setSyncStatus("synced");
        }
      })
      .catch(() => {
        if (!cancelled) setSyncStatus((current) => current === "synced" ? current : "offline");
      })
      .finally(() => {
        if (!cancelled) setPacksLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedAgeBand, selectedSubject, settings.language, today]);

  useEffect(() => {
    let cancelled = false;
    const localMission = buildLocalDailyMission(selectedAgeBand, progress, today);
    setDailyMission(localMission);
    if (settings.language === "hi") {
      return () => {
        cancelled = true;
      };
    }
    const query = new URLSearchParams({ gradeBand: selectedAgeBand, localDate: today });
    api.get(`/api/kids/daily-mission?${query.toString()}`)
      .then((payload) => {
        if (cancelled || payload?.mission?.items?.length < 5) return;
        setDailyMission({ ...normalizeKidsPack(payload.mission), source: "server" });
      })
      .catch(() => {
        // The bundled adaptive mission remains ready offline.
      });
    return () => {
      cancelled = true;
    };
  }, [progress, selectedAgeBand, settings.language, today]);

  useEffect(() => {
    const updateRemaining = () => {
      const elapsedSeconds = Math.max(0, Math.floor((Date.now() - sessionStartedAtRef.current) / 1000));
      const dailyBudgetSeconds = settings.timeLimitMinutes * 60 - dailyUsedBeforeSessionRef.current;
      setRemainingSeconds(Math.max(0, dailyBudgetSeconds - elapsedSeconds));
    };
    updateRemaining();
    const interval = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(interval);
  }, [settings.timeLimitMinutes]);

  useEffect(() => {
    const now = new Date();
    const nextDay = new Date(now);
    nextDay.setHours(24, 0, 0, 0);
    const timeout = window.setTimeout(() => {
      const nextDateKey = localDateKey();
      const startedAt = Date.now();
      sessionStartedAtRef.current = startedAt;
      dailyUsedBeforeSessionRef.current = 0;
      dailyUsageLoadedRef.current = false;
      setToday(nextDateKey);
      setRemainingSeconds(settings.timeLimitMinutes * 60);
      try {
        window.sessionStorage.setItem(sessionStorageKey, JSON.stringify({
          date: nextDateKey,
          startedAt,
          dailyBaselineSeconds: null,
        }));
      } catch {
        // The new local-day session still works in memory.
      }
    }, Math.max(1_000, nextDay.getTime() - now.getTime() + 100));
    return () => window.clearTimeout(timeout);
  }, [sessionStorageKey, settings.timeLimitMinutes, today]);

  const flushPendingAttempts = useCallback(async () => {
    if (flushingPendingRef.current || !pendingAttemptsRef.current.length) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    flushingPendingRef.current = true;
    const completedIds = new Set();
    let connectionFailed = false;
    try {
      for (const pendingAttempt of [...pendingAttemptsRef.current]) {
        try {
          const payload = await api.post("/api/kids/attempts", pendingAttempt);
          completedIds.add(pendingAttempt.clientAttemptId);
          if (payload?.progress) {
            setProgress((current) => {
              const merged = mergeKidsProgress(current, payload.progress);
              if (pendingAttempt.mode !== "daily" || !pendingAttempt.localDate) return merged;
              const completedDailyMissions = [...new Set([
                ...(merged.completedDailyMissions || []),
                pendingAttempt.localDate,
              ])];
              const dailyStreak = calculateKidsDailyStreak(completedDailyMissions, localDateKey());
              return {
                ...merged,
                completedDailyMissions,
                dailyStreak,
                streak: dailyStreak,
                lastDailyDate: [...completedDailyMissions].sort().at(-1) || "",
              };
            });
          }
        } catch (error) {
          if (Number(error?.status) >= 400 && Number(error?.status) < 500) {
            completedIds.add(pendingAttempt.clientAttemptId);
            continue;
          }
          connectionFailed = true;
          break;
        }
      }
      if (completedIds.size) {
        setPendingAttempts((current) => {
          const next = current.filter((attempt) => !completedIds.has(attempt.clientAttemptId));
          pendingAttemptsRef.current = next;
          return next;
        });
      }
      setSyncStatus(connectionFailed ? "offline" : "synced");
    } finally {
      flushingPendingRef.current = false;
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setProfileRefreshKey((value) => value + 1);
      flushPendingAttempts();
    };
    window.addEventListener("online", handleOnline);
    const interval = window.setInterval(flushPendingAttempts, 30_000);
    flushPendingAttempts();
    return () => {
      window.removeEventListener("online", handleOnline);
      window.clearInterval(interval);
    };
  }, [flushPendingAttempts]);

  const resetSession = useCallback(() => {
    const startedAt = Date.now();
    sessionStartedAtRef.current = startedAt;
    setRemainingSeconds(Math.max(0, settings.timeLimitMinutes * 60 - dailyUsedBeforeSessionRef.current));
    setActivePack(null);
    setResult(null);
    try {
      window.sessionStorage.setItem(sessionStorageKey, JSON.stringify({
        date: localDateKey(),
        startedAt,
        dailyBaselineSeconds: dailyUsedBeforeSessionRef.current,
      }));
    } catch {
      // In-memory timing remains active.
    }
  }, [sessionStorageKey, settings.timeLimitMinutes]);

  const startPack = (pack, mode = "game") => {
    if (!pack || remainingSeconds <= 0) return;
    setResult(null);
    setActiveMode(mode);
    setActivePack(pack);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const completePack = async ({ responses, durationSeconds }) => {
    if (!activePack || submitting) return;
    setSubmitting(true);
    const responseList = activePack.items.map((entry) => ({ itemId: entry.id, response: responses[entry.id] }));
    const modeOptions = {
      isDailyMission: activeMode === "daily",
      isBossRound: activeMode === "boss",
      isRetry: activeMode === "retry",
      today,
    };

    if (activePack.source !== "server") {
      const completedPack = activePack;
      try {
        const evaluation = evaluateLocalKidsAttempt(completedPack, responses);
        const localProgress = applyKidsAttempt(progress, evaluation, modeOptions);
        setProgress((current) => applyKidsAttempt(current, evaluation, modeOptions));
        setResult({
          pack: completedPack,
          correct: evaluation.correct,
          total: evaluation.total,
          percentage: evaluation.percentage,
          rewards: localProgress.lastReward,
          review: evaluation.evaluations.map((itemResult) => {
            const item = completedPack.items.find((entry) => entry.id === itemResult.itemId) || {};
            return {
              ...itemResult,
              prompt: settings.language === "hi" ? item.promptHi || item.prompt : item.prompt,
              correctResponse: item.answer,
              explanation: item.explanation,
            };
          }),
          offline: true,
        });
      } catch (error) {
        console.error("Kids local adventure completion recovered safely.", error);
        setResult({
          pack: completedPack,
          correct: null,
          total: completedPack.items.length,
          percentage: null,
          rewards: { stars: 0, coins: 0, badgeAwarded: "" },
          error: true,
        });
      } finally {
        setActivePack(null);
        setSubmitting(false);
      }
      return;
    }

    const attemptPayload = {
        packId: activePack.id,
        responses: responseList,
        durationSeconds,
        clientAttemptId: globalThis.crypto?.randomUUID?.() || `${activePack.id}-${Date.now()}`,
        mode: activeMode,
        localDate: today,
    };

    try {
      const payload = await api.post("/api/kids/attempts", attemptPayload);
      const evaluation = payload?.evaluation || {};
      let nextProgress = progress;
      setProgress((current) => {
        let updatedProgress = payload?.progress
          ? mergeKidsProgress(current, payload.progress)
          : applyKidsAttempt(current, {
            id: payload?.attempt?.id,
            packId: activePack.id,
            subject: activePack.subject,
            correct: evaluation.correctCount,
            total: evaluation.totalItems,
            evaluations: evaluation.itemResults?.map((entry) => ({ itemId: entry.itemId, correct: entry.correct })) || [],
          }, modeOptions);
        if (activeMode === "daily") {
          const completedDailyMissions = [...new Set([
            ...(updatedProgress.completedDailyMissions || []),
            today,
          ])];
          const dailyStreak = calculateKidsDailyStreak(completedDailyMissions, today);
          updatedProgress = {
            ...updatedProgress,
            completedDailyMissions,
            dailyStreak,
            streak: dailyStreak,
            lastDailyDate: today,
          };
        }
        nextProgress = updatedProgress;
        return updatedProgress;
      });
      setResult({
        pack: activePack,
        correct: Number(evaluation.correctCount) || 0,
        total: Number(evaluation.totalItems) || activePack.items.length,
        percentage: Number(evaluation.scorePercent) || 0,
        rewards: rewardFromPayload(payload, nextProgress),
        review: (evaluation.itemResults || []).map((itemResult) => {
          const item = activePack.items.find((entry) => entry.id === itemResult.itemId) || {};
          return {
            ...itemResult,
            prompt: settings.language === "hi" ? item.promptHi || item.prompt : item.prompt,
          };
        }),
        offline: false,
      });
      setSyncStatus("synced");
    } catch (error) {
      setSyncStatus("offline");
      const canRetryWhenOnline = !Number(error?.status) || Number(error?.status) >= 500;
      if (canRetryWhenOnline) {
        setPendingAttempts((current) => {
          if (current.some((attempt) => attempt.clientAttemptId === attemptPayload.clientAttemptId)) return current;
          const next = [...current, attemptPayload].slice(-50);
          pendingAttemptsRef.current = next;
          return next;
        });
        if (activeMode === "daily") {
          setProgress((current) => {
            const completedDailyMissions = [...new Set([...(current.completedDailyMissions || []), today])];
            const dailyStreak = calculateKidsDailyStreak(completedDailyMissions, today);
            return {
              ...current,
              completedDailyMissions,
              dailyStreak,
              streak: dailyStreak,
              lastDailyDate: today,
            };
          });
        }
      }
      setResult({
        pack: activePack,
        correct: null,
        total: activePack.items.length,
        percentage: null,
        rewards: { stars: 0, coins: 0, badgeAwarded: "" },
        pending: canRetryWhenOnline,
        error: !canRetryWhenOnline,
      });
    } finally {
      setActivePack(null);
      setSubmitting(false);
    }
  };

  const parentSettingsBody = (value, extras = {}) => ({
    dailyPlayLimitMinutes: value.timeLimitMinutes,
    audioEnabled: Boolean(value.audioEnabled),
    timerVisible: Boolean(value.timerVisible),
    language: value.language === "hi" ? "hi" : "en",
    ...extras,
  });

  const authorizeParentPin = async (pin, { create = false } = {}) => {
    if (create) {
      try {
        const payload = await api.put("/api/kids/parent-settings", parentSettingsBody(settings, { parentPin: pin }));
        const normalized = normalizeServerSettings(payload?.settings, settings);
        setSettings(normalized);
        setSyncStatus("synced");
        return { ok: true, settings: normalized, parentAccess: payload?.parentAccess };
      } catch (error) {
        if (!Number(error?.status) || Number(error?.status) >= 500) setSyncStatus("offline");
        return { ok: false, message: error?.message || "The parent PIN could not be saved." };
      }
    }

    if (!settings.parentPinConfigured) {
      return { ok: false, message: "Set the parent PIN before unlocking Parent Corner." };
    }

    try {
      const payload = await api.post("/api/kids/parent-settings/verify-pin", { pin });
      setSyncStatus("synced");
      return { ok: true, settings, parentAccess: payload?.parentAccess };
    } catch (error) {
      if (!Number(error?.status) || Number(error?.status) >= 500) setSyncStatus("offline");
      return { ok: false, message: error?.message || "The parent PIN could not be verified." };
    }
  };

  const saveParentSettings = async (nextSettings, options = {}) => {
    const normalized = {
      ...settings,
      ...nextSettings,
      timeLimitMinutes: Math.max(10, Math.min(60, Number(nextSettings.timeLimitMinutes) || 20)),
      language: nextSettings.language === "hi" ? "hi" : "en",
    };
    setSettings(normalized);
    const requestBody = parentSettingsBody(normalized, {
      ...(options.currentParentPin ? { currentParentPin: options.currentParentPin } : {}),
    });
    try {
      const payload = await api.put("/api/kids/parent-settings", requestBody);
      const savedSettings = normalizeServerSettings(payload?.settings, normalized);
      setSettings(savedSettings);
      setSyncStatus("synced");
      if (payload?.parentAccess) onParentAccessChange?.(payload.parentAccess);
      return { ok: true, settings: savedSettings, parentAccess: payload?.parentAccess };
    } catch (error) {
      if (!Number(error?.status) || Number(error?.status) >= 500) setSyncStatus("offline");
      return { ok: false, message: error.message };
    }
  };

  const handleParentAuthorized = (outcome) => {
    if (outcome?.parentAccess) onParentAccessChange?.(outcome.parentAccess);
    if (outcome?.parentAccess?.setupRequired === false) {
      setRegistrationPinSetupPending(false);
    }
    const returnTo = location.state?.returnTo;
    if (isYoungKidsParentGuidedRoute(returnTo)) {
      navigate(returnTo, { replace: true, state: null });
    }
  };

  const lockParentAccess = async () => {
    try {
      const payload = await api.post("/api/kids/parent-access/lock", {});
      onParentAccessChange?.(payload?.parentAccess || { unlocked: false });
    } catch {
      onParentAccessChange?.({ unlocked: false });
    }
  };

  const retryPack = useMemo(() => (
    buildLocalRetryPack(selectedAgeBand, progress) || createServerRetryPack(progress, selectedAgeBand)
  ), [progress, selectedAgeBand]);
  const bossPack = useMemo(
    () => buildLocalBossPack(selectedAgeBand, selectedSubject, today),
    [selectedAgeBand, selectedSubject, today],
  );
  const selectedSubjectInfo = KIDS_SUBJECTS[selectedSubject] || KIDS_SUBJECTS.English;
  const selectedAgeInfo = KIDS_AGE_BANDS.find(({ id }) => id === selectedAgeBand) || KIDS_AGE_BANDS[1];
  const registeredClassLabel = String(
    userProfile?.grade
      || userProfile?.classLevel
      || userProfile?.classStandard
      || academicLevel
      || selectedAgeInfo.label,
  ).trim();
  const firstName = String(userProfile?.username || userProfile?.name || "Explorer").trim().split(/\s+/)[0];
  const timeUp = remainingSeconds <= 0;

  if (activePack && !timeUp) {
    return (
      <section className="kids-learning-page is-playing">
        {settings.timerVisible && (
          <div className={`kids-floating-timer${remainingSeconds <= 120 ? " is-low" : ""}`}>
            <Clock3 aria-hidden="true" size={17} />
            <strong>{formatSessionRemaining(remainingSeconds)}</strong>
          </div>
        )}
        <KidsGameRunner
          audioEnabled={settings.audioEnabled}
          language={settings.language}
          onComplete={completePack}
          onExit={() => setActivePack(null)}
          pack={activePack}
          submitting={submitting}
        />
      </section>
    );
  }

  return (
    <section
      className="kids-learning-page"
      data-academic-context={`${registeredClassLabel}:${academicTrack || "General"}:${linkedSubjectNames.size}`}
    >
      <div aria-hidden="true" className="kids-page-confetti"><i>✦</i><i>●</i><i>▲</i><i>★</i><i>●</i></div>

      <header className="kids-hero">
        <KidsLearningHeroToolbar
          copy={copy}
          onOpenParentCorner={() => setParentCornerOpen(true)}
          syncStatus={syncStatus}
        />

        <div className="kids-hero-content">
          <div className="kids-hero-copy">
            <span className="kids-hero-kicker"><Sparkles aria-hidden="true" size={16} /> PrepMatrix {copy.playLearn}</span>
            <h1>{copy.heroTitle}</h1>
            <p>{copy.heroCopy}</p>
            <small>👋 {settings.language === "hi" ? `तैयार हो, ${firstName}?` : `Ready, ${firstName}?`} · {registeredClassLabel}</small>
          </div>
          <KidsPetTutor
            audioEnabled={settings.audioEnabled}
            compact
            language={settings.language}
            message={settings.language === "hi" ? "आज हम कौन-सा मिशन करेंगे?" : "Which adventure shall we try today?"}
          />
        </div>

        <div className="kids-stats-ribbon">
          <article><span><Star aria-hidden="true" size={21} /></span><div><strong>{progress.stars || 0}</strong><small>{copy.stars}</small></div></article>
          <article><span><Coins aria-hidden="true" size={21} /></span><div><strong>{progress.coins || 0}</strong><small>{copy.coins}</small></div></article>
          <article><span><Trophy aria-hidden="true" size={21} /></span><div><strong>{progress.dailyStreak ?? progress.streak ?? 0}</strong><small>{copy.streak}</small></div></article>
          {settings.timerVisible && <article className={remainingSeconds <= 120 ? "is-low" : ""}><span><Clock3 aria-hidden="true" size={21} /></span><div><strong>{formatSessionRemaining(remainingSeconds)}</strong><small>{copy.sessionTime}</small></div></article>}
        </div>
      </header>

      {timeUp ? (
        <section className="kids-time-up-card">
          <span aria-hidden="true">🌙</span>
          <h2>{copy.timeUp}</h2>
          <p>{copy.timeUpCopy}</p>
          <button onClick={() => setParentCornerOpen(true)} type="button"><ShieldCheck aria-hidden="true" size={18} /> {copy.parentCorner}</button>
        </section>
      ) : (
        <main className="kids-main-grid">
          <section className={`kids-daily-card${dailyComplete ? " is-complete" : ""}`}>
            <div className="kids-daily-art" aria-hidden="true"><span>⚡</span><i>+10</i></div>
            <div>
              <span className="kids-eyebrow">{copy.dailyMission}</span>
              <h2>{getLocalized(dailyMission, settings.language, "title")}</h2>
              <p>{copy.dailyCopy}</p>
              <div className="kids-daily-meta"><span><Clock3 size={15} /> 5 min</span><span><Sparkles size={15} /> +10 {copy.coins}</span></div>
            </div>
            <button disabled={dailyComplete} onClick={() => startPack(dailyMission, "daily")} type="button">
              {dailyComplete ? <Check aria-hidden="true" size={18} /> : <Gamepad2 aria-hidden="true" size={18} />}
              {dailyComplete ? (settings.language === "hi" ? "आज पूरा हुआ" : "Done today") : copy.startMission}
            </button>
          </section>

          <KidsAdventureMap
            ageBand={selectedAgeBand}
            language={settings.language}
            onSelectSubject={setSelectedSubject}
            progress={progress}
            selectedSubject={selectedSubject}
          />

          <section className="kids-games-card" aria-labelledby="kids-games-heading" style={{ "--kids-subject-color": selectedSubjectInfo.color, "--kids-subject-soft": selectedSubjectInfo.softColor }}>
            <header>
              <div className="kids-section-heading">
                <span aria-hidden="true" className="kids-heading-icon">{selectedSubjectInfo.icon}</span>
                <div>
                  <span className="kids-eyebrow">{getLocalized(selectedSubjectInfo, settings.language, "world")}</span>
                  <h2 id="kids-games-heading">{getLocalized(selectedSubjectInfo, settings.language, "name")} {copy.games}</h2>
                </div>
              </div>
              {linkedSubjectNames.has(selectedSubjectInfo.name.toLocaleLowerCase()) && <span className="kids-linked-badge"><Check size={14} /> Linked to your subjects</span>}
            </header>

            <div className="kids-game-grid">
              {packs.map((pack) => {
                const gameInfo = KIDS_GAME_TYPES[pack.gameType] || KIDS_GAME_TYPES.mcq;
                return (
                  <article className="kids-game-card" key={pack.id}>
                    <span aria-hidden="true" className="kids-game-icon">{gameInfo.icon}</span>
                    <div className="kids-game-card-copy">
                      <small>{settings.language === "hi" ? gameInfo.labelHi : gameInfo.label} · {pack.estimatedMinutes} min</small>
                      <h3>{getLocalized(pack, settings.language, "title")}</h3>
                      <p>{getLocalized(pack, settings.language, "description")}</p>
                      <span>{pack.topic}</span>
                    </div>
                    <button onClick={() => startPack(pack)} type="button">{copy.play}<ChevronRight aria-hidden="true" size={18} /></button>
                  </article>
                );
              })}
              {packsLoading && !packs.length && <p className="kids-games-loading">{copy.loading}</p>}
            </div>

            {bossPack && (
              <article className="kids-boss-card">
                <span aria-hidden="true"><Trophy size={26} /></span>
                <div><small>{copy.bossRound}</small><h3>{selectedSubjectInfo.icon} {getLocalized(bossPack, settings.language, "title")}</h3><p>{copy.bossCopy}</p></div>
                <button onClick={() => startPack(bossPack, "boss")} type="button"><Medal aria-hidden="true" size={18} /> {copy.play}</button>
              </article>
            )}
          </section>

          <section className={`kids-retry-card${retryPack ? " has-retries" : ""}`}>
            <div aria-hidden="true" className="kids-retry-icon"><RotateCcw size={24} /></div>
            <div><span className="kids-eyebrow">{copy.retryPractice}</span><h2>{retryPack ? `${progress.retryQueue.length} ${copy.tricky}` : (settings.language === "hi" ? "अभी कोई कठिन सवाल नहीं" : "No tricky questions right now")}</h2><p>{copy.retryCopy}</p></div>
            <button disabled={!retryPack} onClick={() => startPack(retryPack, "retry")} type="button">{copy.practice}<ChevronRight aria-hidden="true" size={18} /></button>
          </section>

          {result && (
            <section aria-live="polite" className="kids-results-card" role="status">
              <div aria-hidden="true" className="kids-result-burst"><Award size={34} /></div>
              <div className="kids-result-copy">
                <span className="kids-eyebrow">{copy.resultsTitle}</span>
                <h2>{result.error ? (settings.language === "hi" ? "एक बार फिर कोशिश करें" : "Let’s try that mission again") : result.pending ? (settings.language === "hi" ? "मिशन सेव हो गया" : "Adventure saved") : `${result.percentage}% ${copy.score}`}</h2>
                <p>{result.error ? (settings.language === "hi" ? "यह मिशन सेव नहीं हुआ। कृपया इसे फिर खेलें।" : "This mission could not be saved. Please play it once more.") : result.pending ? (settings.language === "hi" ? "इंटरनेट लौटने पर स्कोर मिल जाएगा।" : "Your score will appear when the connection is back.") : copy.resultsCopy}</p>
              </div>
              {!result.pending && !result.error && <div className="kids-result-score"><strong>{result.correct}/{result.total}</strong><span>{copy.score}</span></div>}
              <div className="kids-result-rewards"><span><Star size={17} /> +{result.rewards?.stars || 0}</span><span><Coins size={17} /> +{result.rewards?.coins || 0}</span></div>
              {result.review?.length > 0 && (
                <div className="kids-result-review">
                  <h3>{settings.language === "hi" ? "मिशन की समीक्षा" : "Mission review"}</h3>
                  {result.review.map((reviewItem, index) => (
                    <article className={reviewItem.correct ? "is-correct" : "is-incorrect"} key={reviewItem.itemId || index}>
                      <div>
                        <span aria-hidden="true">{reviewItem.correct ? "✓" : "↻"}</span>
                        <strong>{reviewItem.prompt || `${copy.question} ${index + 1}`}</strong>
                      </div>
                      <p><b>{settings.language === "hi" ? "आपका उत्तर:" : "Your answer:"}</b> {formatReviewAnswer(reviewItem.response, result.pack?.gameType)}</p>
                      {!reviewItem.correct && <p><b>{settings.language === "hi" ? "सही उत्तर:" : "Correct answer:"}</b> {formatReviewAnswer(reviewItem.correctResponse, result.pack?.gameType)}</p>}
                      {reviewItem.explanation && <small>{reviewItem.explanation}</small>}
                    </article>
                  ))}
                </div>
              )}
              <button onClick={() => setResult(null)} type="button">{copy.keepPlaying}</button>
            </section>
          )}
        </main>
      )}

      <footer className="kids-safety-footer"><ShieldCheck aria-hidden="true" size={17} /> {copy.noLeaderboard}</footer>

      <KidsParentCorner
        onClose={() => setParentCornerOpen(false)}
        onAuthorized={handleParentAuthorized}
        onAuthorizePin={authorizeParentPin}
        onLock={lockParentAccess}
        onOpenSettings={() => navigate("/settings", { state: null })}
        onResetSession={resetSession}
        onSave={saveParentSettings}
        open={parentCornerOpen}
        progress={progress}
        requiredSetup={registrationPinSetupPending || parentAccess?.setupRequired === true}
        sessionAuthorized={Boolean(parentAccess?.unlocked)}
        settings={settings}
      />
    </section>
  );
}

export default function KidsLearningPage(props) {
  return (
    <KidsRouteBoundary>
      <KidsLearningPageContent {...props} />
    </KidsRouteBoundary>
  );
}
