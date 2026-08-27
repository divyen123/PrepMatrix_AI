import { useEffect } from "react";
import { toast } from "react-toastify";
import {
  APP_USAGE_LIMIT_REACHED_EVENT,
  addAppUsageSeconds,
  resolveAppUsageIdentity,
} from "../utils/appUsage";
import {
  APP_USAGE_FLUSH_REQUEST_EVENT,
  APP_USAGE_SYNC_INTERVAL_MS,
  syncAppUsageRecord,
} from "../utils/appUsageSync";

const USAGE_FLUSH_INTERVAL_MS = 15_000;
const MAX_COLLECTED_INTERVAL_MS = 30_000;

function pageIsActivelyUsed() {
  if (typeof document === "undefined") return false;
  const visible = document.visibilityState !== "hidden";
  const focused = typeof document.hasFocus !== "function" || document.hasFocus();
  return visible && focused;
}

function formatLimitDuration(minutes) {
  const safeMinutes = Math.max(0, Math.round(Number(minutes) || 0));
  if (safeMinutes < 60) return `${safeMinutes} minutes`;
  const hours = Math.floor(safeMinutes / 60);
  const remainingMinutes = safeMinutes % 60;
  const hoursLabel = `${hours} ${hours === 1 ? "hour" : "hours"}`;
  return remainingMinutes ? `${hoursLabel} ${remainingMinutes} minutes` : hoursLabel;
}

export default function useAppUsageTracker(userProfile, enabled = true) {
  const identity = resolveAppUsageIdentity(userProfile);

  useEffect(() => {
    if (!enabled || !identity || typeof window === "undefined" || typeof document === "undefined") {
      return undefined;
    }

    let activeSince = null;
    let pendingMilliseconds = 0;
    let disposed = false;
    let lastSyncStartedAt = 0;
    let syncPromise = null;
    let syncQueued = false;

    const handleLimitReached = (event) => {
      if (event?.detail?.identity !== identity) return;
      toast.info(
        `You've reached your ${formatLimitDuration(event.detail.dailyLimitMinutes)} daily PrepMatrix usage reminder.`,
      );
    };

    const collect = (now = Date.now()) => {
      if (activeSince === null) return;
      const elapsed = Math.max(0, now - activeSince);
      pendingMilliseconds += Math.min(elapsed, MAX_COLLECTED_INTERVAL_MS);
      activeSince = now;
    };

    const syncUsage = ({ force = false, keepalive = false } = {}) => {
      if (disposed) return Promise.resolve();
      if (syncPromise) {
        if (keepalive) {
          return syncAppUsageRecord(identity, { keepalive: true }).catch(() => undefined);
        }
        if (force) syncQueued = true;
        return syncPromise;
      }
      const now = Date.now();
      if (!force && now - lastSyncStartedAt < APP_USAGE_SYNC_INTERVAL_MS) {
        return Promise.resolve();
      }

      lastSyncStartedAt = now;
      syncPromise = syncAppUsageRecord(identity, { keepalive })
        .catch(() => undefined)
        .finally(() => {
          syncPromise = null;
          if (syncQueued && !disposed) {
            syncQueued = false;
            void syncUsage({ force: true });
          }
        });
      return syncPromise;
    };

    const persist = (now = Date.now()) => {
      collect(now);
      const wholeSeconds = Math.floor(pendingMilliseconds / 1000);
      if (wholeSeconds <= 0) return;
      pendingMilliseconds -= wholeSeconds * 1000;
      addAppUsageSeconds(identity, wholeSeconds, { now: new Date(now) });
      void syncUsage();
    };

    const start = () => {
      if (activeSince === null && pageIsActivelyUsed()) activeSince = Date.now();
    };

    const stop = () => {
      if (activeSince === null) return;
      persist(Date.now());
      activeSince = null;
    };

    const syncActivityState = () => {
      if (pageIsActivelyUsed()) {
        start();
        void syncUsage();
      }
      else {
        stop();
        void syncUsage({ force: true });
      }
    };

    const handleBlur = () => {
      stop();
      void syncUsage({ force: true });
    };

    const handleOnline = () => {
      void syncUsage({ force: true });
    };

    const handlePageHide = () => {
      stop();
      void syncUsage({ force: true, keepalive: true });
    };

    const handleFlushRequest = (event) => {
      stop();
      const flushPromise = syncUsage({ force: true, keepalive: true });
      event?.detail?.waitUntil?.(flushPromise);
    };

    void syncUsage({ force: true });
    syncActivityState();
    const timer = window.setInterval(() => {
      if (pageIsActivelyUsed()) {
        start();
        persist(Date.now());
      } else {
        stop();
      }
    }, USAGE_FLUSH_INTERVAL_MS);

    document.addEventListener("visibilitychange", syncActivityState);
    window.addEventListener("focus", syncActivityState);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("online", handleOnline);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener(APP_USAGE_FLUSH_REQUEST_EVENT, handleFlushRequest);

    window.addEventListener(APP_USAGE_LIMIT_REACHED_EVENT, handleLimitReached);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", syncActivityState);
      window.removeEventListener("focus", syncActivityState);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener(APP_USAGE_FLUSH_REQUEST_EVENT, handleFlushRequest);
      window.removeEventListener(APP_USAGE_LIMIT_REACHED_EVENT, handleLimitReached);
      stop();
    };
  }, [enabled, identity]);
}
