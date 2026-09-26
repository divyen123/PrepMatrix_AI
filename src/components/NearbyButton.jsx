import { MapPin } from "lucide-react";
import { NavLink } from "react-router-dom";
import "./NearbyButton.css";

export default function NearbyButton({ onNavigate }) {
  return (
    <NavLink
      to="/nearby"
      onClick={onNavigate}
      className={({ isActive }) => `nearby-entry-button${isActive ? " active" : ""}`}
      title="Find nearby tuitions, study spaces and chapter help"
    >
      <MapPin size={15} aria-hidden="true" />
      <span>Nearby</span>
    </NavLink>
  );
}
