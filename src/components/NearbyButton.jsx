import { MapPin } from "lucide-react";
import { NavLink } from "react-router-dom";
import "./NearbyButton.css";

export default function NearbyButton({ onNavigate }) {
  return (
    <NavLink
      to="/nearby"
      onClick={onNavigate}
      className={({ isActive }) => `exam-widget-btn nearby-entry-button${isActive ? " active" : ""}`}
      title="Find nearby study spots and revision circles"
    >
      <MapPin size={15} aria-hidden="true" />
      <span>Nearby</span>
    </NavLink>
  );
}
