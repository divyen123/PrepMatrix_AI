import { useCallback, useMemo, useRef, useState } from "react";
import { BackgroundTaskContext } from "../utils/backgroundTaskContext";

function clean(value) {
  return String(value ?? "").trim();
}

function taskRunId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function taskErrorMessage(error) {
  return error instanceof Error && error.message
    ? error.message
    : "This background task could not be completed.";
}

export function BackgroundTaskProvider({ children }) {
  const [tasks, setTasks] = useState({});
  const promisesRef = useRef(new Map());

  const runTask = useCallback((definition = {}) => {
    const key = clean(definition.key);
    if (!key) throw new Error("A background task key is required.");
    if (typeof definition.execute !== "function") {
      throw new Error("A background task executor is required.");
    }

    const existing = promisesRef.current.get(key);
    if (existing) return existing;

    const runId = taskRunId();
    const startedAt = Date.now();
    const task = {
      academicProfileId: clean(definition.academicProfileId),
      feature: clean(definition.feature),
      key,
      label: clean(definition.label) || "Background task",
      meta: definition.meta && typeof definition.meta === "object" ? definition.meta : {},
      route: clean(definition.route),
      runId,
      startedAt,
      status: "running",
      updatedAt: startedAt,
    };

    setTasks((current) => ({ ...current, [key]: task }));

    const promise = Promise.resolve()
      .then(() => definition.execute())
      .then((result) => {
        setTasks((current) => {
          if (current[key]?.runId !== runId) return current;
          return {
            ...current,
            [key]: {
              ...current[key],
              completedAt: Date.now(),
              result,
              status: "completed",
              updatedAt: Date.now(),
            },
          };
        });
        return result;
      })
      .catch((error) => {
        setTasks((current) => {
          if (current[key]?.runId !== runId) return current;
          return {
            ...current,
            [key]: {
              ...current[key],
              error: taskErrorMessage(error),
              failedAt: Date.now(),
              status: "failed",
              updatedAt: Date.now(),
            },
          };
        });
        throw error;
      })
      .finally(() => {
        if (promisesRef.current.get(key) === promise) {
          promisesRef.current.delete(key);
        }
      });

    promisesRef.current.set(key, promise);
    return promise;
  }, []);

  const acknowledgeTask = useCallback((key, runId = "") => {
    const normalizedKey = clean(key);
    if (!normalizedKey) return;
    setTasks((current) => {
      const task = current[normalizedKey];
      if (!task || (runId && task.runId !== runId) || task.status === "running") return current;
      const next = { ...current };
      delete next[normalizedKey];
      return next;
    });
  }, []);

  const clearProfileTasks = useCallback((academicProfileId) => {
    const normalizedProfile = clean(academicProfileId);
    if (!normalizedProfile) return;
    setTasks((current) => Object.fromEntries(
      Object.entries(current).filter(([, task]) => task.academicProfileId !== normalizedProfile),
    ));
  }, []);

  const value = useMemo(() => ({
    acknowledgeTask,
    clearProfileTasks,
    runTask,
    tasks,
  }), [acknowledgeTask, clearProfileTasks, runTask, tasks]);

  return (
    <BackgroundTaskContext.Provider value={value}>
      {children}
    </BackgroundTaskContext.Provider>
  );
}
