import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Building2, ChevronDown, List, Search, X } from "lucide-react";
import { buildMaterialSearchUrl, getMaterialSearchOptions } from "../utils/materialSearch.js";
import { getMaterialSearchPopoverPosition } from "../utils/materialSearchPopover.js";

export function MaterialSearchPanel({ kind, options, subjectName, institutionName, isOpen, hidden = !isOpen, id, onSearch }) {
  const [selectedOption, setSelectedOption] = useState("");
  const [customTerm, setCustomTerm] = useState("");
  const [includeInstitution, setIncludeInstitution] = useState(false);
  const fieldRef = useRef(null);
  const term = options.length === 0
    ? customTerm.trim()
    : options.length === 1 ? options[0] : options.includes(selectedOption) ? selectedOption : "";
  const hasInstitution = Boolean(institutionName);

  useEffect(() => {
    if (isOpen) fieldRef.current?.focus({ preventScroll: true });
  }, [isOpen]);

  const search = (event) => {
    event.preventDefault();
    if (!term) return;
    window.open(buildMaterialSearchUrl({
      subjectName,
      searchTerm: term,
      institutionName,
      includeInstitution: hasInstitution && includeInstitution,
    }), "_blank", "noopener,noreferrer");
    onSearch?.();
  };

  return (
    <form
      aria-label={`Search ${kind} materials`}
      className="resource-search-panel"
      hidden={hidden}
      id={id}
      onSubmit={search}
    >
      <div className="resource-search-panel__heading">
        <span className="resource-search-panel__label" id={`${id}-label`}>
          {options.length > 1 ? `Choose a ${kind}` : `${kind === "chapter" ? "Chapter" : "Topic"} name`}
        </span>
        {options.length > 0 ? <span className="resource-search-panel__hint">{options.length} saved</span> : null}
      </div>
      <div className="resource-search-panel__field">
        {options.length > 1 ? (
          <div aria-labelledby={`${id}-label`} className="resource-search-options" role="radiogroup">
            {options.map((option, index) => (
              <label className="resource-search-option" key={option}>
                <input
                  checked={selectedOption === option}
                  name={`${id}-choice`}
                  onChange={() => setSelectedOption(option)}
                  ref={index === 0 ? fieldRef : undefined}
                  type="radio"
                  value={option}
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
        ) : (
          <input
            aria-labelledby={`${id}-label`}
            autoComplete="off"
            className="resource-search-input"
            maxLength={160}
            onChange={(event) => setCustomTerm(event.target.value)}
            placeholder={`Enter a ${kind} name`}
            readOnly={options.length === 1}
            ref={fieldRef}
            type="text"
            value={options.length === 1 ? options[0] : customTerm}
          />
        )}
      </div>
      {!hasInstitution ? (
        <p className="resource-search-panel__note">Add your institution in your academic profile to include it in searches.</p>
      ) : null}
      <div className="resource-search-panel__footer">
        <label className="resource-institution-toggle">
          <input
            checked={hasInstitution && includeInstitution}
            disabled={!hasInstitution}
            onChange={(event) => setIncludeInstitution(event.target.checked)}
            role="switch"
            type="checkbox"
          />
          <span aria-hidden="true" className="resource-institution-toggle__track" />
          <span>Include institution{hasInstitution ? <small>{institutionName}</small> : null}</span>
        </label>
        <button
          aria-label={`Search ${kind} materials in a new tab`}
          className="resource-search-submit"
          disabled={!term}
          title={`Search ${kind} materials`}
          type="submit"
        >
          <Search aria-hidden="true" size={18} />
        </button>
      </div>
    </form>
  );
}

export default function SubjectMaterialSearch({ subject, institutionName = "", trailingAction = null }) {
  const [activeMode, setActiveMode] = useState("");
  const [popupOpen, setPopupOpen] = useState(false);
  const popupRef = useRef(null);
  const triggerRefs = useRef({});
  const sourceRef = useRef(null);
  const id = useId();
  const options = getMaterialSearchOptions(subject);
  const institution = institutionName.trim();
  const institutionLabel = <><Building2 aria-hidden="true" size={16} />Institution materials</>;

  const closePopup = (restoreFocus = false) => {
    setPopupOpen(false);
    if (restoreFocus) sourceRef.current?.focus({ preventScroll: true });
  };

  useLayoutEffect(() => {
    const popup = popupRef.current;
    if (!popupOpen) {
      if (popup.matches(":popover-open")) popup.hidePopover();
      return undefined;
    }

    if (!popup.matches(":popover-open")) popup.showPopover();

    const positionPopup = () => {
      const anchor = triggerRefs.current[activeMode];
      if (!anchor) return;
      const viewport = window.visualViewport;
      const rect = popup.getBoundingClientRect();
      // The desktop app scales its body with CSS zoom. Keep viewport coordinates aligned.
      const scale = popup.offsetWidth ? rect.width / popup.offsetWidth : 1;
      const position = getMaterialSearchPopoverPosition({
        anchorRect: anchor.getBoundingClientRect(),
        width: rect.width,
        height: rect.height,
        viewportWidth: viewport?.width || window.innerWidth,
        viewportHeight: viewport?.height || window.innerHeight,
        viewportLeft: viewport?.offsetLeft || 0,
        viewportTop: viewport?.offsetTop || 0,
      });
      popup.style.left = `${position.left / (scale || 1)}px`;
      popup.style.top = `${position.top / (scale || 1)}px`;
      popup.dataset.placement = position.placement;
    };
    const dismissOutside = (event) => {
      if (popup.contains(event.target)) return;
      if (Object.values(triggerRefs.current).some((trigger) => trigger?.contains(event.target))) return;
      setPopupOpen(false);
    };

    positionPopup();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(positionPopup) : null;
    observer?.observe(popup);
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("focusin", dismissOutside);
    document.addEventListener("scroll", positionPopup, true);
    window.addEventListener("resize", positionPopup);
    window.visualViewport?.addEventListener("resize", positionPopup);
    window.visualViewport?.addEventListener("scroll", positionPopup);
    return () => {
      observer?.disconnect();
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("focusin", dismissOutside);
      document.removeEventListener("scroll", positionPopup, true);
      window.removeEventListener("resize", positionPopup);
      window.visualViewport?.removeEventListener("resize", positionPopup);
      window.visualViewport?.removeEventListener("scroll", positionPopup);
    };
  }, [activeMode, popupOpen]);

  return (
    <section
      aria-label="Find subject materials"
      className="resource-material-search"
      onKeyDown={(event) => {
        if (event.key === "Escape" && popupOpen) {
          event.preventDefault();
          event.stopPropagation();
          closePopup(true);
        }
      }}
    >
      <div className="resource-material-search__actions">
        {institution ? (
          <a
            className="resource-search-trigger"
            href={buildMaterialSearchUrl({ subjectName: subject.name, institutionName: institution, includeInstitution: true })}
            rel="noopener noreferrer"
            target="_blank"
            title={`Find ${subject.name} materials from ${institution}`}
          >{institutionLabel}</a>
        ) : (
          <button className="resource-search-trigger" disabled title="Add your institution in your academic profile" type="button">
            {institutionLabel}
          </button>
        )}
        {["chapter", "topic"].map((kind) => (
          <button
            aria-controls={`${id}-popup`}
            aria-expanded={popupOpen && activeMode === kind}
            aria-haspopup="dialog"
            className="resource-search-trigger"
            id={`${id}-${kind}-trigger`}
            key={kind}
            onClick={(event) => {
              sourceRef.current = event.currentTarget;
              setActiveMode(kind);
              setPopupOpen((current) => activeMode === kind ? !current : true);
            }}
            ref={(node) => { triggerRefs.current[kind] = node; }}
            type="button"
          >
            <List aria-hidden="true" size={16} />Search {kind}
            <ChevronDown aria-hidden="true" className="resource-search-trigger__chevron" size={14} />
          </button>
        ))}
        {trailingAction}
      </div>
      <div
        aria-hidden={!popupOpen}
        aria-labelledby={`${id}-popup-title`}
        className="resource-search-popover"
        id={`${id}-popup`}
        inert={!popupOpen}
        onToggle={(event) => setPopupOpen(event.currentTarget.matches(":popover-open"))}
        popover="manual"
        ref={popupRef}
        role="dialog"
      >
        <div className="resource-search-popover__header">
          <strong id={`${id}-popup-title`}>Search {activeMode || "materials"}</strong>
          <button
            aria-label="Close material search"
            className="resource-search-popover__close"
            onClick={() => closePopup(true)}
            type="button"
          ><X aria-hidden="true" size={14} /></button>
        </div>
        {["chapter", "topic"].map((kind) => (
          <MaterialSearchPanel
            hidden={activeMode !== kind}
            id={`${id}-${kind}`}
            institutionName={institution}
            isOpen={popupOpen && activeMode === kind}
            key={kind}
            kind={kind}
            onSearch={() => closePopup(true)}
            options={kind === "chapter" ? options.chapters : options.topics}
            subjectName={subject.name}
          />
        ))}
      </div>
    </section>
  );
}
