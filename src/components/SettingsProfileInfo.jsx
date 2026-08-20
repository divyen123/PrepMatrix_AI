import { Info } from "lucide-react";
import { Link } from "react-router-dom";

export default function SettingsProfileInfo() {
  return (
    <div className="settings-profile-info">
      <Link
        aria-label="Open user information page"
        className="settings-profile-info-trigger"
        title="Open user information"
        to="/settings/profile"
      >
        <Info aria-hidden="true" size={15} strokeWidth={2.25} />
      </Link>
    </div>
  );
}
