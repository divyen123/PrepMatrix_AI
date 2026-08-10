import { openGoalReminderCenter } from "./goalReminderStore.js";
import { GOAL_REMINDER_SHORTCUT_ROUTE } from "./homeNavigationCommands.js";

const GOAL_REMINDER_SHORTCUT_HASH = "#" + GOAL_REMINDER_SHORTCUT_ROUTE.split("#")[1];

export function runDashboardGoalReminderShortcut({
  cancel = () => undefined,
  location = {},
  navigate,
  openCenter = openGoalReminderCenter,
  schedule = (callback) => callback(),
} = {}) {
  if (
    location.pathname !== "/dashboard"
    || String(location.hash || "").toLowerCase() !== GOAL_REMINDER_SHORTCUT_HASH
  ) {
    return undefined;
  }

  const frame = schedule(() => {
    openCenter();
    navigate?.({
      pathname: location.pathname,
      search: location.search || "",
      hash: "",
    }, { replace: true });
  });

  return () => cancel(frame);
}
