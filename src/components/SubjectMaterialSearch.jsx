import { useEffect, useId, useRef, useState } from "react";
import { Building2, ChevronDown, List, Search } from "lucide-react";
import { buildMaterialSearchUrl, getMaterialSearchOptions } from "../utils/materialSearch.js";

export function MaterialSearchPanel({ kind, options, subjectName, institutionName, isOpen, id }) {
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
  };

  return (
    <form
      aria-label={`Search ${kind} materials`}
      className="resource-search-panel"
      hidden={!isOpen}
      id={id}
      onSubmit={search}
    >
      <div className="resource-search-panel__heading">
        <span className="resource-search-panel__label" id={`${id}-label`}>
          {options.length > 1 ? `Choose a ${kind}` : `${kind === "chapter" ? "Chapter" : "Topic"} name`}
        </span>
        {options.length > 0 ? <span className="resource-search-panel__hint">{options.length} saved</span> : null}
      </div>
      <div className="resource-search-panel__entry">
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
      {!hasInstitution ? (
        <p className="resource-search-panel__note">Add your institution in your academic profile to include it in searches.</p>
      ) : null}
    </form>
  );
}

export default function SubjectMaterialSearch({ subject, institutionName = "" }) {
  const [activeMode, setActiveMode] = useState("");
  const id = useId();
  const options = getMaterialSearchOptions(subject);
  const institution = institutionName.trim();
  const institutionLabel = <><Building2 aria-hidden="true" size={16} />Institution materials</>;

  return (
    <section
      aria-label="Find subject materials"
      className="resource-material-search"
      onKeyDown={(event) => {
        if (event.key === "Escape" && activeMode) {
          event.preventDefault();
          document.getElementById(`${id}-${activeMode}-trigger`)?.focus();
          setActiveMode("");
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
            aria-controls={`${id}-${kind}`}
            aria-expanded={activeMode === kind}
            className="resource-search-trigger"
            id={`${id}-${kind}-trigger`}
            key={kind}
            onClick={() => setActiveMode((current) => current === kind ? "" : kind)}
            type="button"
          >
            <List aria-hidden="true" size={16} />Search {kind}
            <ChevronDown aria-hidden="true" className="resource-search-trigger__chevron" size={14} />
          </button>
        ))}
      </div>
      {["chapter", "topic"].map((kind) => (
        <MaterialSearchPanel
          id={`${id}-${kind}`}
          institutionName={institution}
          isOpen={activeMode === kind}
          key={kind}
          kind={kind}
          options={kind === "chapter" ? options.chapters : options.topics}
          subjectName={subject.name}
        />
      ))}
    </section>
  );
}
