import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../utils/apiClient";
import { getLearningInsights } from "../utils/learningMastery";

function errorMessage(error) {
  if (error instanceof Error && error.message) return error.message;
  return "Saved learning progress could not be loaded.";
}

export default function useLearningInsights() {
  const [notebooks, setNotebooks] = useState([]);
  const [loadedAt, setLoadedAt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadVersion, setReloadVersion] = useState(0);

  const reload = useCallback(() => {
    setReloadVersion((current) => current + 1);
  }, []);

  useEffect(() => {
    let isCurrent = true;
    setLoading(true);
    setError("");

    api.get("/api/learning-notebooks", { timeoutMs: 30000 })
      .then((payload) => {
        if (!isCurrent) return;
        setNotebooks(Array.isArray(payload?.notebooks) ? payload.notebooks : []);
        setLoadedAt(Date.now());
      })
      .catch((requestError) => {
        if (!isCurrent) return;
        setNotebooks([]);
        setError(errorMessage(requestError));
      })
      .finally(() => {
        if (isCurrent) setLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [reloadVersion]);

  const insights = useMemo(
    () => getLearningInsights(notebooks, {
      now: new Date(loadedAt).toISOString(),
    }),
    [loadedAt, notebooks],
  );

  return {
    error,
    insights,
    loading,
    reload,
  };
}
