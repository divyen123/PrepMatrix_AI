import {
  BrainCircuit,
  HeartPulse,
  LoaderCircle,
  Plus,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";
import { AiCreditCost } from "./AiQuotaProvider";
import { AI_FEATURES } from "../utils/aiQuota";

function MedicalTrainingLabIntake({
  analyzing,
  canAnalyze,
  error,
  focus,
  notebooks,
  notebooksLoading,
  onAnalyze,
  onFocusChange,
  onNotebookChange,
  onQuickAdd,
  onTopicsChange,
  saving,
  selectedNotebookId,
  suggestedTopics,
  topicCount,
  topics,
}) {
  const inputsDisabled = analyzing || saving;

  return (
    <div className="medical-lab-intake">
      <div className="medical-lab-intake__heading">
        <div>
          <span className="section-tag"><HeartPulse size={13} /> Health-science reasoning lab</span>
          <h3>Build a medical training session</h3>
          <p>
            Choose a learning source, then add concepts or a fictional educational scenario to
            reason through.
          </p>
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

      <label className="learning-field">
        <span>Learning source</span>
        <select
          disabled={inputsDisabled || notebooksLoading || !notebooks.length}
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
        <small>
          This chooses the owned notebook where you can save the training. Its uploaded contents are
          not sent with this Medical training request.
        </small>
      </label>

      {!notebooksLoading && !notebooks.length && (
        <p className="learning-placement-notebook-note">
          Build and save a health-science notebook first so you have an owned place to save training.
        </p>
      )}

      <div className="medical-lab-fields">
        <label className="learning-field">
          <span>Training focus</span>
          <input
            disabled={inputsDisabled}
            onChange={(event) => onFocusChange(event.target.value)}
            placeholder="e.g. Cardiorespiratory physiology and evidence interpretation"
            value={focus}
          />
          <small>Use a discipline, system, mechanism, or reasoning skill, not a job role.</small>
        </label>
        <label className="learning-field">
          <span>Concepts or fictional educational scenarios</span>
          <textarea
            disabled={inputsDisabled}
            onChange={(event) => onTopicsChange(event.target.value)}
            placeholder={"Mechanisms of shock\nInterpreting an arterial blood gas\nFictional acute breathlessness scenario"}
            rows={7}
            value={topics}
          />
          <small>Separate items with commas or new lines. Add up to 12.</small>
        </label>
      </div>

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

      <p className="medical-lab-disclaimer">
        <Stethoscope aria-hidden="true" size={15} />
        Educational conceptual practice only. This workspace does not assess, diagnose, prescribe,
        or replace qualified supervision and current local guidance.
      </p>

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
