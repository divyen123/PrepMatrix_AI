import { useEffect } from "react";
import { toast } from "react-toastify";
import {
  APP_USAGE_LIMIT_REACHED_EVENT,
  addAppUsageSeconds,
  resolveAppUsageIdentity,
} from "../utils/appUsage";

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

    const persist = (now = Date.now()) => {
      collect(now);
      const wholeSeconds = Math.floor(pendingMilliseconds / 1000);
      if (wholeSeconds <= 0) return;
      pendingMilliseconds -= wholeSeconds * 1000;
      addAppUsageSeconds(identity, wholeSeconds, { now: new Date(now) });
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
      if (pageIsActivelyUsed()) start();
      else stop();
    };

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
    window.addEventListener("blur", stop);
    window.addEventListener("pagehide", stop);

    window.addEventListener(APP_USAGE_LIMIT_REACHED_EVENT, handleLimitReached);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", syncActivityState);
      window.removeEventListener("focus", syncActivityState);
      window.removeEventListener("blur", stop);
      window.removeEventListener("pagehide", stop);
      window.removeEventListener(APP_USAGE_LIMIT_REACHED_EVENT, handleLimitReached);
      stop();
    };
  }, [enabled, identity]);
}
