import { createContext, useContext } from "react";

export const BackgroundTaskContext = createContext(null);

export function useBackgroundTasks() {
  const value = useContext(BackgroundTaskContext);
  if (!value) throw new Error("useBackgroundTasks must be used inside BackgroundTaskProvider.");
  return value;
}
