import { ChevronRight } from "lucide-react";
import { useId, useState } from "react";

export default function PlacementPrepDisclosure({ children, label }) {
  const [isOpen, setIsOpen] = useState(false);
  const disclosureId = useId();
  const panelId = `placement-prep-panel-${disclosureId.replace(/:/gu, "")}`;

  return (
    <div className={`learning-career-item-details${isOpen ? " is-open" : ""}`}>
      <button
        aria-controls={panelId}
        aria-expanded={isOpen}
        className="learning-career-item-trigger"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <ChevronRight
          aria-hidden="true"
          className="learning-career-item-chevron"
          size={17}
        />
        <span>{label}</span>
      </button>
      <div
        aria-hidden={!isOpen}
        className="learning-career-item-panel"
        id={panelId}
        inert={!isOpen}
      >
        <div className="learning-career-item-content">{children}</div>
      </div>
    </div>
  );
}
