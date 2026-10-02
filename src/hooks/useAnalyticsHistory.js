import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api from "../utils/apiClient";
import { getPreviousPlannerAnalytics } from "../utils/plannerHistory.js";
import { getPlannerMetrics } from "../utils/plannerMetrics.js";

function initialView(profileId) {
  return { profileId, historical: false, snapshot: null, momentum: null, phase: "idle", targetHistorical: false, error: "" };
}

function savedStudyMomentum(snapshot) {
  const totalXp = getPlannerMetrics(snapshot.schedule, snapshot.completed).completedTasks * 10;
  const summary = {
    totalXp,
    level: Math.floor(totalXp / 100) + 1,
    levelProgress: totalXp % 100,
    breakdown: { study: totalXp, exam: 0, quiz: 0, battle: 0, coding: 0 },
  };
  return { schedule: summary, global: summary, history: [], snapshotIncomplete: true };
}

export default function useAnalyticsHistory(academicProfileDataId, plannerHistory) {
  const previous = useMemo(() => getPreviousPlannerAnalytics(plannerHistory), [plannerHistory]);
  const [state, setState] = useState(() => initialView(academicProfileDataId));
  const requestRef = useRef(0);
  const busyRef = useRef(false);
  const timersRef = useRef(new Map());
  const previousId = previous?.id || "";

  useEffect(() => {
    requestRef.current += 1;
    busyRef.current = false;
    setState(initialView(academicProfileDataId));
    const timers = timersRef.current;
    return () => {
      requestRef.current += 1;
      busyRef.current = false;
      for (const [timer, resolve] of timers) {
        window.clearTimeout(timer);
        resolve();
      }
      timers.clear();
    };
  }, [academicProfileDataId, previousId]);

  const view = state.profileId === academicProfileDataId
    && (!state.historical || state.snapshot?.id === previousId)
    ? state : initialView(academicProfileDataId);

  const switchView = useCallback(async (historical) => {
    if (busyRef.current || (historical && !previous)) return;
    busyRef.current = true;
    const requestId = ++requestRef.current;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const pause = (duration) => new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        timersRef.current.delete(timer);
        resolve();
      }, duration);
      timersRef.current.set(timer, resolve);
    });
    setState((current) => ({ ...current, targetHistorical: historical, phase: "leaving", error: "" }));
    await pause(reducedMotion ? 0 : 160);
    if (requestId !== requestRef.current) return;
    setState((current) => ({ ...current, phase: "loading" }));
    const [result] = await Promise.allSettled([
      historical
        ? api.get(`/api/momentum?historyId=${encodeURIComponent(previous.id)}`, {
          academicProfileId: academicProfileDataId,
          timeoutMs: 15000,
        })
        : api.get("/api/momentum", { academicProfileId: academicProfileDataId, timeoutMs: 15000 }),
      pause(reducedMotion ? 100 : 380),
    ]);
    if (requestId !== requestRef.current) return;
    const payload = result.status === "fulfilled" ? result.value?.momentum : null;
    const error = !payload
      ? historical ? "Assessment and global XP could not be loaded. Showing saved study-task XP." : "Current XP could not be refreshed. Showing the last loaded totals."
      : "";
    setState({
      profileId: academicProfileDataId,
      historical,
      snapshot: historical ? previous : null,
      momentum: historical ? payload || savedStudyMomentum(previous) : payload,
      loadedAt: Date.now(),
      phase: "idle",
      targetHistorical: historical,
      error,
    });
    busyRef.current = false;
  }, [academicProfileDataId, previous]);

  return { ...view, previous, switchView, busy: view.phase !== "idle" };
}
