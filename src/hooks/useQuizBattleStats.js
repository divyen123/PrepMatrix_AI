import { useCallback, useEffect, useState } from "react";
import api from "../utils/apiClient";
import {
  EMPTY_QUIZ_BATTLE_STATS,
  normalizeQuizBattleStats,
} from "../utils/quizBattleUi";

export default function useQuizBattleStats({ enabled = true } = {}) {
  const [stats, setStats] = useState(EMPTY_QUIZ_BATTLE_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    if (!enabled) {
      setStats(EMPTY_QUIZ_BATTLE_STATS);
      setLoading(false);
      setError("");
      return () => {
        active = false;
      };
    }
    setLoading(true);
    setError("");
    api.getQuizBattleStats()
      .then((payload) => {
        if (active) setStats(normalizeQuizBattleStats(payload?.stats));
      })
      .catch((requestError) => {
        if (!active) return;
        setError(requestError instanceof Error
          ? requestError.message
          : "Battle XP is temporarily unavailable.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [enabled, revision]);

  return { stats, loading, error, reload };
}
