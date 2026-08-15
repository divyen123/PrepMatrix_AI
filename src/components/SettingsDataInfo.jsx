import { Info } from "lucide-react";

const TOOLTIP_ID = "settings-data-backup-tooltip";

export default function SettingsDataInfo() {
  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      event.currentTarget.blur();
    }
  };

  return (
    <span className="settings-data-info">
      <button
        aria-describedby={TOOLTIP_ID}
        aria-label="About workspace backup and data controls"
        className="settings-data-info-trigger"
        onKeyDown={handleKeyDown}
        type="button"
      >
        <Info aria-hidden="true" size={19} strokeWidth={2.25} />
      </button>

      <span className="settings-data-info-tooltip" id={TOOLTIP_ID} role="tooltip">
        <strong>Workspace backup</strong>
        <span><b>Export</b> downloads supported study data as a JSON file.</span>
        <span><b>Import</b> restores supported workspace data from a PrepMatrix backup.</span>
        <small>Your login details and registered academic profile are not changed.</small>
      </span>
    </span>
  );
}
