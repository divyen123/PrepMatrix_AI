import { useState } from "react";
import {
  Activity,
  BrainCircuit,
  CalendarPlus,
  Check,
  ChevronDown,
  ClipboardCheck,
  Eye,
  HeartPulse,
  Lightbulb,
  LoaderCircle,
  MessageSquareText,
  Pin,
  Plus,
  Save,
  ShieldAlert,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";
import { MEDICAL_REASONING_PATH } from "../utils/medicalTrainingClient.js";
import "./MedicalTrainingLab.css";

function list(value) {
  return Array.isArray(value) ? value : [];
}

function clean(value, maximum = 4000) {
  return String(value ?? "").replace(/\s+/gu, " ").trim().slice(0, maximum);
}

function ReasoningExercise({
  actionTarget,
  canAskAI,
  guidance,
  hint,
  label,
  onAddToPlanner,
  onAskAI,
  onSaveItem,
  saving,
}) {
  const [answer, setAnswer] = useState("");
  const [hintVisible, setHintVisible] = useState(false);
  const [referenceVisible, setReferenceVisible] = useState(false);
  const inputId = `${actionTarget.id}-learner-reasoning`;

  return (
    <article className="medical-exercise">
      <div className="medical-exercise__prompt">
        <BrainCircuit aria-hidden="true" size={17} />
        <strong>{label}</strong>
      </div>
      <label htmlFor={inputId}>Your reasoning</label>
      <textarea
        id={inputId}
        onChange={(event) => setAnswer(event.target.value)}
        placeholder="Write what you notice, the mechanism you think applies, other options, and any safety limits..."
        rows={4}
        value={answer}
      />
      <small>
        Your response stays in this browser view unless you choose Save my reasoning.
        It is never auto-graded.
      </small>
      <div className="medical-exercise__controls">
        <button aria-expanded={hintVisible} onClick={() => setHintVisible((current) => !current)} type="button">
          <Lightbulb size={14} /> {hintVisible ? "Hide hint" : "Hint"}
        </button>
        <button
          aria-expanded={referenceVisible}
          disabled={!answer.trim()}
          onClick={() => setReferenceVisible((current) => !current)}
          type="button"
        >
          <Eye size={14} /> {referenceVisible ? "Hide reference" : "Reveal reference reasoning"}
        </button>
      </div>
      {hintVisible && (
        <p className="medical-exercise__hint">
          <Lightbulb aria-hidden="true" size={14} />
          {hint || "Start with the given findings. Separate facts from assumptions, then connect one mechanism before comparing other options."}
        </p>
      )}
      {referenceVisible && (
        <div className="medical-exercise__reference">
          <strong>Reference reasoning</strong>
          {String(guidance || actionTarget.explanation).split(/\n{2,}/).map((paragraph, index) => (
            <p key={`${actionTarget.id}-reference-${index}`}>{paragraph}</p>
          ))}
          <div className="medical-exercise__actions">
            <button
              disabled={saving || !answer.trim()}
              onClick={() => onSaveItem(actionTarget, {
                answer: answer.trim(),
                prompt: label,
                reference: guidance || actionTarget.explanation,
              })}
              type="button"
            >
              <Save size={14} /> {saving ? "Saving..." : "Save my reasoning"}
            </button>
            <button
              disabled={!canAskAI}
              onClick={() => onAskAI(actionTarget)}
              title={canAskAI ? "Ask the Medical training study coach" : "Wait for this training to finish saving to history"}
              type="button"
            >
              <MessageSquareText size={14} /> {canAskAI ? "Ask study coach" : "Adding to history..."}
            </button>
            <button onClick={() => onAddToPlanner(actionTarget)} type="button">
              <CalendarPlus size={14} /> Add to planner
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

function ReferencePanel({ module }) {
  const [open, setOpen] = useState(false);
  const hasReference = module.conceptOverview
    || list(module.differentials).length
    || list(module.investigations).length
    || list(module.managementPrinciples).length
    || list(module.redFlags).length;
  if (!hasReference) return null;

  return (
    <section className={`medical-reference${open ? " is-open" : ""}`}>
      <button aria-expanded={open} onClick={() => setOpen((current) => !current)} type="button">
        <ClipboardCheck size={16} />
        <span>{open ? "Hide concept reference" : "Explore concept reference"}</span>
        <ChevronDown aria-hidden="true" size={16} />
      </button>
      <div className="medical-reference__body" inert={!open || undefined}>
        <div>
          {module.conceptOverview && (
            <section>
              <h5>Concept overview</h5>
              <p>{module.conceptOverview}</p>
            </section>
          )}
          {list(module.differentials).length > 0 && (
            <section>
              <h5>Reasoning options</h5>
              <div className="medical-options-grid">
                {module.differentials.map((option) => (
                  <article key={option.name}>
                    <strong>{option.name}</strong>
                    <p>{option.rationale}</p>
                    {list(option.distinguishingClues).length > 0 && (
                      <ul>{option.distinguishingClues.map((clue) => <li key={clue}>{clue}</li>)}</ul>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}
          {list(module.investigations).length > 0 && (
            <section>
              <h5>Assessment actions and evidence</h5>
              <div className="medical-investigation-list">
                {module.investigations.map((item) => (
                  <article key={item.name}>
                    <strong>{item.name}</strong>
                    <span>{item.rationale}</span>
                    {item.expectedPattern && <small>Expected learning pattern: {item.expectedPattern}</small>}
                  </article>
                ))}
              </div>
            </section>
          )}
          <div className="medical-principles-grid">
            {list(module.managementPrinciples).length > 0 && (
              <section>
                <h5>Care and management principles</h5>
                <ul>{module.managementPrinciples.map((item) => <li key={item}>{item}</li>)}</ul>
              </section>
            )}
            {list(module.redFlags).length > 0 && (
              <section className="is-safety">
                <h5><ShieldAlert size={15} /> Safety flags</h5>
                <ul>{module.redFlags.map((item) => <li key={item}>{item}</li>)}</ul>
              </section>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function MedicalModule({
  canAskAI,
  getActionTarget,
  isItemSaving,
  module,
  moduleIndex,
  onAddToPlanner,
  onAskAI,
  onSaveItem,
}) {
  return (
    <article className="medical-module">
      <header>
        <span>{String(moduleIndex + 1).padStart(2, "0")}</span>
        <div>
          <h4>{module.title}</h4>
          {module.whyItMatters && <p>{module.whyItMatters}</p>}
        </div>
      </header>

      {module.fictionalCase?.summary && (
        <section className="medical-scenario">
          <span><Stethoscope size={17} /></span>
          <div>
            <h5>Fictional educational scenario</h5>
            <p>{module.fictionalCase.summary}</p>
            {module.fictionalCase.learningObjective && (
              <small>Learning objective: {module.fictionalCase.learningObjective}</small>
            )}
          </div>
        </section>
      )}

      {list(module.reasoningSteps).length > 0 && (
        <section className="medical-module__reasoning">
          <h5>Reason through the scenario</h5>
          {module.reasoningSteps.map((step, index) => {
            const target = getActionTarget(module, step, "reasoning", index);
            return (
              <ReasoningExercise
                actionTarget={target}
                canAskAI={canAskAI}
                guidance={step.explanation}
                hint={MEDICAL_REASONING_PATH[index % MEDICAL_REASONING_PATH.length]?.hint}
                key={step.id}
                label={step.prompt}
                onAddToPlanner={onAddToPlanner}
                onAskAI={(action) => onAskAI(action, module)}
                onSaveItem={onSaveItem}
                saving={isItemSaving(target)}
              />
            );
          })}
        </section>
      )}

      <ReferencePanel module={module} />

      {list(module.vivaChecks).length > 0 && (
        <section className="medical-module__checks">
          <h5>Conceptual viva checks</h5>
          {module.vivaChecks.map((check, index) => {
            const target = getActionTarget(module, check, "viva", index);
            return (
              <ReasoningExercise
                actionTarget={target}
                canAskAI={canAskAI}
                guidance={check.guidance}
                key={check.id}
                label={check.question}
                onAddToPlanner={onAddToPlanner}
                onAskAI={(action) => onAskAI(action, module)}
                onSaveItem={onSaveItem}
                saving={isItemSaving(target)}
              />
            );
          })}
        </section>
      )}

      {list(module.practiceSteps).length > 0 && (
        <section className="medical-module__practice">
          <h5>Practice next</h5>
          {module.practiceSteps.map((step, index) => {
            const target = getActionTarget(module, step, "practice", index);
            return (
              <ReasoningExercise
                actionTarget={target}
                canAskAI={canAskAI}
                guidance={step?.guidance ?? step?.explanation}
                key={step?.id || target.id}
                label={clean(step?.title ?? step?.prompt ?? step, 500)}
                onAddToPlanner={onAddToPlanner}
                onAskAI={(action) => onAskAI(action, module)}
                onSaveItem={onSaveItem}
                saving={isItemSaving(target)}
              />
            );
          })}
        </section>
      )}
    </article>
  );
}

function MedicalTrainingLab({
  analysis,
  analyzing,
  focus,
  getActionTarget,
  isDraft,
  isItemSaving,
  onAddToPlanner,
  onAskAI,
  onQuickAdd,
  onTogglePin,
  onSaveItem,
  pinned,
  saving,
  suggestedTopics,
  topicCount,
}) {
  const [activeStepId, setActiveStepId] = useState(MEDICAL_REASONING_PATH[0].id);
  const activeStep = MEDICAL_REASONING_PATH.find((step) => step.id === activeStepId)
    || MEDICAL_REASONING_PATH[0];

  return (
    <section className="medical-lab" aria-label="Medical training workspace">
      <section className="card medical-lab-hero">
        <div>
          <span className="section-tag"><Stethoscope size={14} /> Medical training</span>
          <h2>Build disciplined health-science reasoning</h2>
          <p>
            Explore fictional scenarios, make assumptions visible, compare reasoning options,
            and check uncertainty before revealing a reference explanation.
          </p>
        </div>
        <div className="medical-lab-hero__metrics" aria-label="Medical training summary">
          <span><strong>{suggestedTopics.length}</strong> reasoning areas</span>
          <span><strong>{topicCount}</strong> selected</span>
          <span><strong>{list(analysis?.modules).length}</strong> modules</span>
        </div>
      </section>

      <section className="card medical-lab-path" aria-labelledby="medical-path-title">
        <div className="medical-lab-path__heading">
          <span><BrainCircuit aria-hidden="true" size={20} /></span>
          <div>
            <h3 id="medical-path-title">Conceptual reasoning pathway</h3>
            <p>Use the same disciplined sequence across medical and allied-health disciplines.</p>
          </div>
        </div>
        <ol>
          {MEDICAL_REASONING_PATH.map((step, index) => (
            <li key={step.id}>
              <button
                aria-pressed={activeStepId === step.id}
                className={activeStepId === step.id ? "is-active" : ""}
                onClick={() => setActiveStepId(step.id)}
                type="button"
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{step.label}</strong>
              </button>
            </li>
          ))}
        </ol>
        <div className="medical-lab-path__active" aria-live="polite">
          <Activity aria-hidden="true" size={17} />
          <span><strong>{activeStep.label}:</strong> {activeStep.hint}</span>
        </div>
      </section>

      <section className="card medical-lab-library" aria-label="Health-science reasoning starters">
        <div className="medical-lab-section-heading">
          <span><HeartPulse aria-hidden="true" size={19} /></span>
          <div>
            <h3>Reasoning starters</h3>
            <p>Add a conceptual lens, then adapt it to your learning source and discipline.</p>
          </div>
        </div>
        <div className="medical-lab-topic-grid">
          {suggestedTopics.map((topic) => (
            <button key={topic.id || topic.title} onClick={() => onQuickAdd(topic.title)} type="button">
              <span><Plus size={13} /></span>
              <strong>{topic.title}</strong>
              <small>{topic.summary}</small>
            </button>
          ))}
        </div>
      </section>

      <aside className="medical-lab-boundary" role="note">
        <ShieldCheck aria-hidden="true" size={20} />
        <div>
          <strong>Educational boundary</strong>
          <p>
            Use fictional or de-identified scenarios. Generated material is for conceptual study,
            not real-person assessment, diagnosis, dosing, treatment, or emergency decisions.
            Verify care decisions with qualified supervision and current local guidance.
          </p>
        </div>
      </aside>

      {analysis && list(analysis.modules).length > 0 && (
        <section className="card medical-lab-results" aria-live="polite">
          <div className="medical-lab-results__heading">
            <div>
              <span className="section-tag"><ClipboardCheck size={13} /> Reasoning guide</span>
              <h3>{analysis.trainingTitle || focus || "Health-science conceptual reasoning"}</h3>
              <p>{analysis.overview}</p>
              {analysis.educationalNotice && <small>{analysis.educationalNotice}</small>}
            </div>
            <div className="medical-lab-results__actions">
              <button
                aria-label={pinned ? "Unpin medical training" : "Pin medical training"}
                aria-pressed={pinned === true}
                className="medical-lab-save"
                disabled={saving || analyzing}
                onClick={onTogglePin}
                type="button"
              >
                {saving
                  ? <LoaderCircle className="spinner" size={16} />
                  : <Pin fill={pinned ? "currentColor" : "none"} size={16} />}
                <span>{saving ? "Updating..." : pinned ? "Unpin" : "Pin"}</span>
              </button>
            </div>
          </div>

          <div className="medical-lab-module-list">
            {analysis.modules.map((module, index) => (
              <MedicalModule
                canAskAI={!isDraft}
                getActionTarget={getActionTarget}
                isItemSaving={isItemSaving}
                key={module.id || module.title}
                module={module}
                moduleIndex={index}
                onAddToPlanner={onAddToPlanner}
                onAskAI={onAskAI}
                onSaveItem={onSaveItem}
              />
            ))}
          </div>

          {list(analysis.trainingPlan).length > 0 && (
            <div className="medical-lab-plan">
              <h3>Your training sequence</h3>
              {analysis.trainingPlan.map((phase, index) => (
                <article key={phase.id || phase.title}>
                  <span>{index + 1}</span>
                  <div>
                    <h4>{clean(phase.title, 180)}</h4>
                    <p>{clean(phase.description, 1200)}</p>
                    <ul>{list(phase.actions).map((action) => <li key={clean(action, 500)}>{clean(action, 500)}</li>)}</ul>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </section>
  );
}

export default MedicalTrainingLab;
