import {
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Coins, RefreshCcw, X } from "lucide-react";
import api, {
  AI_AUTH_CLEARED_EVENT,
  AI_AUTH_READY_EVENT,
  AI_QUOTA_UPDATED_EVENT,
} from "../utils/apiClient";
import { AiQuotaContext } from "../utils/aiQuota";

const AI_FEATURES = Object.freeze({
  CHAT: "chat",
  QUIZ: "quiz",
  CAREER_ANALYSIS: "career_analysis",
  LEARNING_NOTEBOOK: "learning_notebook",
  SECURE_EXAM: "secure_exam",
  QUESTION_PAPER: "question_paper",
});

const DEFAULT_COSTS = Object.freeze({
  [AI_FEATURES.CHAT]: 1,
  [AI_FEATURES.QUIZ]: 3,
  [AI_FEATURES.CAREER_ANALYSIS]: 5,
  [AI_FEATURES.LEARNING_NOTEBOOK]: 12,
  [AI_FEATURES.SECURE_EXAM]: 15,
  [AI_FEATURES.QUESTION_PAPER]: 15,
});

const FEATURE_ALIASES = Object.freeze({
  chat: AI_FEATURES.CHAT,
  study_chat: AI_FEATURES.CHAT,
  studyChat: AI_FEATURES.CHAT,
  voice: AI_FEATURES.CHAT,
  quiz: AI_FEATURES.QUIZ,
  quiz_generation: AI_FEATURES.QUIZ,
  quizGeneration: AI_FEATURES.QUIZ,
  career: AI_FEATURES.CAREER_ANALYSIS,
  career_analysis: AI_FEATURES.CAREER_ANALYSIS,
  careerAnalysis: AI_FEATURES.CAREER_ANALYSIS,
  notebook: AI_FEATURES.LEARNING_NOTEBOOK,
  learning_notebook: AI_FEATURES.LEARNING_NOTEBOOK,
  learningNotebook: AI_FEATURES.LEARNING_NOTEBOOK,
  secure_exam: AI_FEATURES.SECURE_EXAM,
  secureExam: AI_FEATURES.SECURE_EXAM,
  secureExamPreparation: AI_FEATURES.SECURE_EXAM,
  question_paper: AI_FEATURES.QUESTION_PAPER,
  questionPaper: AI_FEATURES.QUESTION_PAPER,
  questionPaperGeneration: AI_FEATURES.QUESTION_PAPER,
});

const FEATURE_LABELS = Object.freeze({
  [AI_FEATURES.CHAT]: "Study chat or voice question",
  [AI_FEATURES.QUIZ]: "Quiz generation",
  [AI_FEATURES.CAREER_ANALYSIS]: "Career-topic analysis",
  [AI_FEATURES.LEARNING_NOTEBOOK]: "Learning notebook",
  [AI_FEATURES.SECURE_EXAM]: "Secure exam preparation",
  [AI_FEATURES.QUESTION_PAPER]: "Question paper",
});


function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function canonicalFeature(feature) {
  return FEATURE_ALIASES[feature] || feature;
}

function normalizeCosts(value, previous = {}) {
  const source = value && typeof value === "object" ? value : {};
  const next = { ...DEFAULT_COSTS, ...previous };

  Object.entries(source).forEach(([feature, rawCost]) => {
    const canonical = canonicalFeature(feature);
    const cost = finiteNumber(
      rawCost && typeof rawCost === "object"
        ? rawCost.cost ?? rawCost.credits
        : rawCost,
    );
    if (Object.values(AI_FEATURES).includes(canonical) && cost !== null && cost >= 0) {
      next[canonical] = cost;
    }
  });

  return next;
}

function normalizeQuota(value, previous = null) {
  const envelope = value && typeof value === "object" ? value : {};
  const source = envelope.quota && typeof envelope.quota === "object"
    ? envelope.quota
    : envelope;
  const limit = finiteNumber(source.limit) ?? previous?.limit ?? null;
  const reserved = finiteNumber(source.reserved) ?? previous?.reserved ?? 0;
  const remaining = finiteNumber(source.remaining) ?? previous?.remaining ?? null;
  let used = finiteNumber(source.used);

  if (used === null) {
    used = limit !== null && remaining !== null
      ? Math.max(0, limit - remaining - Math.max(0, reserved))
      : previous?.used ?? null;
  }

  const sourceCosts = source.costs
    || source.featureCosts
    || source.costMap
    || source.features
    || envelope.costs
    || envelope.featureCosts;

  if (limit === null && remaining === null && !sourceCosts && !previous) {
    return null;
  }

  return {
    limit,
    used,
    reserved,
    remaining,
    periodStart: source.periodStart || previous?.periodStart || null,
    resetAt: source.resetAt || previous?.resetAt || null,
    costs: normalizeCosts(sourceCosts, previous?.costs),
  };
}

function formatResetDate(value) {
  if (!value) return "the next UTC month";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "the next UTC month";
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date);
}


export function AiQuotaProvider({ children }) {
  const [quota, setQuota] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestSequenceRef = useRef(0);

  const clear = useCallback(() => {
    requestSequenceRef.current += 1;
    setQuota(null);
    setLoading(false);
    setError("");
  }, []);

  const refresh = useCallback(async () => {
    if (!localStorage.getItem("prepmatrix_auth_token")) {
      clear();
      return null;
    }

    const requestId = ++requestSequenceRef.current;
    setLoading(true);
    try {
      const payload = await api.getAiQuota();
      if (requestId !== requestSequenceRef.current) return null;
      setQuota((current) => normalizeQuota(payload, current));
      setError("");
      return payload;
    } catch (requestError) {
      if (requestId !== requestSequenceRef.current) return null;
      if (requestError?.status === 401) {
        setQuota(null);
      } else {
        setError(requestError instanceof Error ? requestError.message : "AI credits could not be refreshed.");
      }
      return null;
    } finally {
      if (requestId === requestSequenceRef.current) setLoading(false);
    }
  }, [clear]);

  useEffect(() => {
    const handleQuotaUpdate = (event) => {
      if (!localStorage.getItem("prepmatrix_auth_token")) return;
      setQuota((current) => normalizeQuota(event.detail, current));
      setError("");
      if (event.detail?.partial) refresh();
    };
    const handleAuthReady = () => {
      clear();
      refresh();
    };

    window.addEventListener(AI_QUOTA_UPDATED_EVENT, handleQuotaUpdate);
    window.addEventListener(AI_AUTH_READY_EVENT, handleAuthReady);
    window.addEventListener(AI_AUTH_CLEARED_EVENT, clear);

    if (localStorage.getItem("prepmatrix_auth_token")) {
      refresh();
    }

    return () => {
      window.removeEventListener(AI_QUOTA_UPDATED_EVENT, handleQuotaUpdate);
      window.removeEventListener(AI_AUTH_READY_EVENT, handleAuthReady);
      window.removeEventListener(AI_AUTH_CLEARED_EVENT, clear);
    };
  }, [clear, refresh]);
  useEffect(() => {
    const resetTimestamp = new Date(quota?.resetAt || "").getTime();
    if (!Number.isFinite(resetTimestamp)) return undefined;

    let active = true;
    let timeoutId;
    const maxTimerDelay = 2_147_000_000;
    const schedule = () => {
      if (!active) return;
      const remaining = resetTimestamp - Date.now() + 1000;
      if (remaining > 0) {
        timeoutId = window.setTimeout(schedule, Math.min(remaining, maxTimerDelay));
        return;
      }
      Promise.resolve(refresh()).finally(() => {
        if (active) timeoutId = window.setTimeout(schedule, 60_000);
      });
    };

    schedule();
    return () => {
      active = false;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [quota?.resetAt, refresh]);


  const value = useMemo(() => {
    const getCost = (feature) => quota?.costs?.[canonicalFeature(feature)]
      ?? DEFAULT_COSTS[canonicalFeature(feature)]
      ?? 0;
    const isKnown = Number.isFinite(quota?.remaining);
    const hasInsufficientCredits = (feature) => (
      isKnown && quota.remaining < getCost(feature)
    );

    return {
      quota,
      loading,
      error,
      isKnown,
      getCost,
      hasInsufficientCredits,
      refresh,
      clear,
    };
  }, [clear, error, loading, quota, refresh]);

  return <AiQuotaContext.Provider value={value}>{children}</AiQuotaContext.Provider>;
}

function useAiQuota() {
  const value = useContext(AiQuotaContext);
  if (!value) throw new Error("useAiQuota must be used within AiQuotaProvider.");
  return value;
}

export function AiCreditCost({ feature, className = "" }) {
  const { getCost } = useAiQuota();
  const cost = getCost(feature);
  return (
    <span className={`ai-credit-cost ${className}`.trim()}>
      <Coins aria-hidden="true" size={13} />
      {cost} AI credit{cost === 1 ? "" : "s"}
    </span>
  );
}

export function AiCreditIndicator() {
  const { quota, loading, error, isKnown, refresh } = useAiQuota();
  const detailsId = useId();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!wrapperRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="ai-credit-indicator" ref={wrapperRef}>
      <button
        aria-expanded={open}
        aria-controls={detailsId}
        aria-haspopup="dialog"
        aria-label={isKnown ? `AI Credits ${quota.remaining}` : "AI Credits balance unavailable"}
        className={`ai-credit-trigger${isKnown && quota.remaining === 0 ? " is-empty" : ""}`}
        onClick={() => setOpen((current) => !current)}
        title="View monthly AI credits"
        type="button"
      >
        <Coins aria-hidden="true" size={17} />
        <span className="ai-credit-trigger-copy" aria-hidden="true">
          <span className="ai-credit-trigger-label">AI Credits</span>
        <strong>{isKnown ? quota.remaining : "—"}</strong>
        </span>
      </button>

      {open && (
        <section aria-label="Monthly AI credits" className="ai-credit-popover" id={detailsId} role="dialog">
          <div className="ai-credit-popover-head">
            <div>
              <span>Monthly allowance</span>
              <strong>{isKnown ? `${quota.remaining} credits left` : "Balance unavailable"}</strong>
            </div>
            <button aria-label="Close AI credits" onClick={() => setOpen(false)} type="button">
              <X aria-hidden="true" size={16} />
            </button>
          </div>

          {isKnown && (
            <>
              <div className="ai-credit-meter" aria-label={`${quota.remaining} of ${quota.limit} AI credits remaining`}>
                <span style={{ width: `${Math.max(0, Math.min(100, (quota.remaining / Math.max(1, quota.limit)) * 100))}%` }} />
              </div>
              <div className="ai-credit-summary">
                <span><b>{quota.used ?? quota.limit - quota.remaining}</b> used</span>
                <span><b>{quota.reserved || 0}</b> processing</span>
                <span><b>{quota.limit}</b> total</span>
              </div>
              <p className="ai-credit-reset">Resets {formatResetDate(quota.resetAt)}</p>
            </>
          )}

          {error && <p className="ai-credit-error">{error} The last confirmed balance is still shown.</p>}

          <div className="ai-credit-cost-list">
            <span>Cost per action</span>
            {Object.values(AI_FEATURES).map((feature) => (
              <div key={feature}>
                <span>{FEATURE_LABELS[feature]}</span>
                <b>{quota?.costs?.[feature] ?? DEFAULT_COSTS[feature]}</b>
              </div>
            ))}
          </div>

          {(!isKnown || error) && (
            <button className="ai-credit-refresh" disabled={loading} onClick={refresh} type="button">
              <RefreshCcw aria-hidden="true" className={loading ? "spinner" : ""} size={14} />
              {loading ? "Refreshing…" : "Refresh balance"}
            </button>
          )}
        </section>
      )}
    </div>
  );
}
