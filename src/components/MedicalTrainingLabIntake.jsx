import {
  BookOpenCheck,
  BrainCircuit,
  FileText,
  HeartPulse,
  LoaderCircle,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { AiCreditCost } from "./AiQuotaProvider";
import { AI_FEATURES } from "../utils/aiQuota";

function MedicalTrainingLabIntake({
  analyzing,
  canAnalyze,
  context = "",
  error,
  focus,
  notebooks,
  notebooksLoading,
  onAnalyze,
  onContextChange = () => {},
  onFocusChange,
  onNotebookChange,
  onQuickAdd,
  onSourceModeChange = () => {},
  onTopicsChange,
  saving,
  selectedNotebookId,
  sourceMode = "custom",
  suggestedTopics,
  topicCount,
  topics,
}) {
  const inputsDisabled = analyzing || saving;
  const usesTypedContext = sourceMode === "custom";

  return (
    <div className="medical-lab-intake">
      <div className="medical-lab-intake__heading">
        <div>
          <span className="section-tag"><HeartPulse size={13} /> Health-science reasoning lab</span>
          <h3>Build a medical training session</h3>
        </div>
        <span className="learning-count">{topicCount}/12</span>
      </div>

      <div className="medical-lab-privacy" role="note">
        <ShieldCheck aria-hidden="true" size={18} />
        <div>
          <strong>Fictional or de-identified material only</strong>
          <span>Do not enter names, records, contact details, images, or other identifying information.</span>
        </div>
      </div>

      <div className="medical-lab-source-focus-row">
        <fieldset className="medical-lab-source">
          <legend>Learning source</legend>
          <div className="medical-lab-source-options">
            <label className={usesTypedContext ? "is-selected" : ""}>
              <input
                checked={usesTypedContext}
                disabled={inputsDisabled}
                name="medical-training-source-mode"
                onChange={() => onSourceModeChange("custom")}
                type="radio"
              />
              <FileText aria-hidden="true" size={14} />
              <span>Type context</span>
            </label>
            <label className={!usesTypedContext ? "is-selected" : ""}>
              <input
                checked={!usesTypedContext}
                disabled={inputsDisabled || notebooksLoading || !notebooks.length}
                name="medical-training-source-mode"
                onChange={() => onSourceModeChange("notebook")}
                type="radio"
              />
              <BookOpenCheck aria-hidden="true" size={14} />
              <span>Saved notebook</span>
            </label>
          </div>
        </fieldset>
        <label className="learning-field medical-lab-training-focus">
          <span>Training focus</span>
          <input
            disabled={inputsDisabled}
            onChange={(event) => onFocusChange(event.target.value)}
            placeholder="e.g. Cardiorespiratory physiology and evidence interpretation"
            value={focus}
          />
          <small>Use a discipline, system, mechanism, or reasoning skill, not a job role.</small>
        </label>
      </div>

      {usesTypedContext ? (
        <label className="learning-field">
          <span>Your context</span>
          <textarea
            className="medical-lab-context"
            disabled={inputsDisabled}
            onChange={(event) => onContextChange(event.target.value)}
            placeholder="e.g. A fictional acute care teaching case focused on respiratory physiology and safe clinical reasoning"
            rows={3}
            value={context}
          />
        </label>
      ) : (
        <label className="learning-field">
          <span>Notebook</span>
          <select
            disabled={inputsDisabled || notebooksLoading}
            onChange={(event) => onNotebookChange(event.target.value)}
            value={selectedNotebookId}
          >
            <option disabled value="">
              {notebooksLoading ? "Loading saved notebooks..." : "Choose a saved health-science notebook"}
            </option>
            {notebooks.map((notebook) => (
              <option key={notebook.id} value={notebook.id}>{notebook.title}</option>
            ))}
          </select>
          <small>The selected notebook is used as the learning context.</small>
        </label>
      )}

      <label className="learning-field medical-lab-topics">
        <span>Concepts or fictional educational scenarios</span>
        <textarea
          disabled={inputsDisabled}
          onChange={(event) => onTopicsChange(event.target.value)}
          placeholder={"Mechanisms of shock\nInterpreting an arterial blood gas\nFictional acute breathlessness scenario"}
          rows={6}
          value={topics}
        />
        <small>Separate items with commas or new lines. Add up to 12.</small>
      </label>

      <div className="medical-lab-quick-add" aria-label="Suggested health-science reasoning topics">
        <span>Reasoning starters</span>
        <div>
          {suggestedTopics.map((topic) => (
            <button
              disabled={inputsDisabled}
              key={topic.id || topic.title}
              onClick={() => onQuickAdd(topic.title)}
              type="button"
            >
              <Plus size={13} /> {topic.title}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="learning-inline-error" role="alert">{error}</p>}
      <button
        className="medical-lab-analyze"
        disabled={!canAnalyze}
        onClick={onAnalyze}
        type="button"
      >
        {analyzing ? <LoaderCircle className="spinner" size={17} /> : <BrainCircuit size={17} />}
        {analyzing ? "Building reasoning session..." : "Build medical training"}
        <AiCreditCost feature={AI_FEATURES.CAREER_ANALYSIS} />
      </button>
    </div>
  );
}

export default MedicalTrainingLabIntake;
