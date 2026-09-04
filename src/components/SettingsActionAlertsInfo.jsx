import { Info } from "lucide-react";

const TOOLTIP_ID = "settings-action-alerts-tooltip";

export const ACTION_ALERTS_INFO_MESSAGE =
  "Connected securely. Only actionable alerts are sent: incomplete planner work, due goals, restored AI credits, and learning topics left unstarted.";

export default function SettingsActionAlertsInfo() {
  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      event.currentTarget.blur();
    }
  };

  return (
    <span className="settings-action-alerts-info">
      <button
        aria-describedby={TOOLTIP_ID}
        aria-label="About action alerts"
        className="settings-action-alerts-info-trigger"
        onKeyDown={handleKeyDown}
        type="button"
      >
        <Info aria-hidden="true" size={14} strokeWidth={2.3} />
      </button>

      <span className="settings-action-alerts-tooltip" id={TOOLTIP_ID} role="tooltip">
        {ACTION_ALERTS_INFO_MESSAGE}
      </span>
    </span>
  );
}
