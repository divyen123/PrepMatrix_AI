import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import api from "../utils/apiClient";

function emptyHistory(profileId) {
  return {
    profileId,
    attempts: [],
    enabled: false,
    isHistoryLoading: false,
    historyError: "",
    revision: -1,
    mutationRevision: 0,
  };
}

export default function useSoloQuizHistory({ academicProfileDataId = "", enabled = false } = {}) {
  const [snapshot, setSnapshot] = useState(() => emptyHistory(academicProfileDataId));
  const [revision, setRevision] = useState(0);
  const latestRef = useRef(snapshot);

  // Switch profiles before rendering any rows from the previous workspace.
  let current = snapshot;
  if (snapshot.profileId !== academicProfileDataId) {
    current = emptyHistory(academicProfileDataId);
    setSnapshot(current);
  }

  useLayoutEffect(() => {
    latestRef.current = current;
  }, [current]);

  const updateHistory = useCallback((transform) => {
    const existing = latestRef.current;
    if (existing.profileId !== academicProfileDataId) return;
    const next = transform(existing);
    latestRef.current = next;
    setSnapshot(next);
  }, [academicProfileDataId]);

  const setAttempts = useCallback((nextAttempts) => {
    updateHistory((existing) => {
      const attempts = typeof nextAttempts === "function"
        ? nextAttempts(existing.attempts)
        : nextAttempts;
      return {
        ...existing,
        attempts: Array.isArray(attempts) ? attempts : [],
        mutationRevision: existing.mutationRevision + 1,
      };
    });
  }, [updateHistory]);

  const reloadHistory = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    updateHistory((existing) => ({
      ...existing,
      enabled,
      revision,
      isHistoryLoading: enabled,
      historyError: "",
    }));
    if (!enabled) return () => { active = false; };

    const requestMutationRevision = latestRef.current.mutationRevision;
    const loadHistory = async () => {
      try {
        const payload = await api.getQuizzes({ academicProfileId: academicProfileDataId });
        if (!active) return;
        updateHistory((existing) => ({
          ...existing,
          // A delayed refresh must not undo a deletion, clear, or newly saved quiz.
          attempts: existing.mutationRevision === requestMutationRevision
            ? Array.isArray(payload?.attempts) ? payload.attempts : []
            : existing.attempts,
          isHistoryLoading: false,
        }));
      } catch (error) {
        if (!active) return;
        updateHistory((existing) => ({
          ...existing,
          isHistoryLoading: false,
          historyError: error instanceof Error ? error.message : "Could not load quiz history.",
        }));
      }
    };
    void loadHistory();
    return () => { active = false; };
  }, [academicProfileDataId, enabled, revision, updateHistory]);

  const requestPending = !current.enabled || current.revision !== revision;
  return {
    attempts: current.attempts,
    setAttempts,
    isHistoryLoading: enabled && (requestPending || current.isHistoryLoading),
    historyError: enabled && !requestPending ? current.historyError : "",
    reloadHistory,
  };
}
