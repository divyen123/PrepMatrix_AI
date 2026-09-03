import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./StartLearningPage.jsx", import.meta.url), "utf8");
const stylesheet = readFileSync(new URL("./StartLearningPage.css", import.meta.url), "utf8");

test("keeps notebook and placement preparation in separate workspace views", () => {
  assert.ok(pageSource.includes('className="learning-intake-choice-card is-notebook"'));
  assert.ok(pageSource.includes('className="learning-intake-choice-card is-placement"'));
  assert.ok(pageSource.includes('intakeMode === "notebook" ? ('));
  assert.ok(pageSource.includes(') : intakeMode === "placement" ? ('));
  assert.ok(pageSource.includes('activeArtifactKind === "notebook" && ('));
  assert.ok(pageSource.includes('activeArtifactKind === "placement" && ('));
  assert.ok(pageSource.includes("Notebook history"));
  assert.ok(pageSource.includes("Placement history"));
  assert.ok(pageSource.includes("savedPlacementNotes.map((note)"));
  assert.ok(
    pageSource.includes("onClick={() => openSavedPlacementNote(note)}"),
    "saved placement cards should open the Placement workspace directly",
  );

  [
    "learning-intake-tabs",
    "learning-subpage-tabs",
    "Open placement and internship preparation",
    "Placement prep saved",
    "Save with notebook",
    "Saved in notebook",
    'className="card learning-career-panel"',
  ].forEach((legacyText) => {
    assert.equal(pageSource.includes(legacyText), false, `unexpected legacy UI: ${legacyText}`);
  });
});

test("supports either a saved notebook or independent typed placement context", () => {
  const placementStart = pageSource.indexOf('intakeMode === "placement" ? (');
  const placementEnd = pageSource.indexOf(') : null}', placementStart);
  const placementSource = pageSource.slice(placementStart, placementEnd);

  assert.ok(placementStart >= 0, "expected the placement intake");
  assert.ok(placementSource.includes("Preparation source"));
  assert.ok(placementSource.includes("Type context"));
  assert.ok(placementSource.includes("Saved notebook"));
  assert.ok(placementSource.includes('name="placement-source-mode"'));
  assert.ok(placementSource.includes('type="radio"'));
  assert.ok(placementSource.includes("usesCustomPlacementSource ? ("));
  assert.ok(placementSource.includes("notebookHistory.map((notebook)"));
  assert.ok(placementSource.includes('className="learning-placement-context"'));
  assert.ok(placementSource.includes("setCareerContext(event.target.value)"));
  assert.ok(placementSource.includes("A notebook is not required."));
  assert.ok(pageSource.includes('useState(CUSTOM_PLACEMENT_SOURCE_VALUE)'));
  assert.ok(pageSource.includes('"/api/learning-notebooks/career-analyze"'));
  assert.ok(pageSource.includes('`/api/learning-notebooks/${encodeURIComponent(request.notebookId)}/career-analyze`'));
  assert.ok(pageSource.includes('request.sourceMode === "notebook"'));
  assert.ok(pageSource.includes('type: "notebook"'));
  assert.ok(pageSource.includes('type: "custom"'));
  assert.ok(pageSource.includes("context: request.context"));
  assert.ok(pageSource.includes('setCareerError("Describe the topic or context you want to prepare for.")'));
  assert.ok(pageSource.includes('setCareerError("Choose an available notebook or use your own context.")'));
  assert.ok(pageSource.includes("placementHistorySourceLabel(note)"));
  assert.ok(pageSource.includes("From notebook:"));
  assert.ok(pageSource.includes("Context:"));
  assert.ok(pageSource.includes('"/api/learning-notebooks?includePlacementWorkspace=true"'));
  assert.ok(pageSource.includes("A placement context you type is saved with its"));
  assert.ok(pageSource.includes("isPlacementWorkspaceNotebook"));
  assert.ok(pageSource.includes(") : !activeNotebook || isPlacementWorkspaceNotebook(activeNotebook) ? ("));
  assert.ok(pageSource.includes("isPlacementWorkspaceNotebook(activeNotebook) ? [] : learningNodes(activeNotebook)"));
  assert.ok(stylesheet.includes(".learning-field .learning-placement-context"));
  assert.ok(stylesheet.includes(".learning-placement-source-options"));
});

test("uses an independent Medical training workspace and persistence contract", () => {
  assert.ok(pageSource.includes('className="learning-intake-choice-card is-medical"'));
  assert.ok(pageSource.includes('intakeMode === "medical" ? ('));
  assert.ok(pageSource.includes('activeArtifactKind === "medical" && ('));
  assert.ok(pageSource.includes("Medical training history"));
  assert.ok(pageSource.includes("savedMedicalTrainingNotes.map((note)"));
  assert.ok(pageSource.includes("/medical-training-analyze"));
  assert.ok(pageSource.includes("mergeMedicalTrainingDraft"));
  assert.ok(pageSource.includes('<MedicalTrainingLab'));
  assert.ok(pageSource.includes('<MedicalTrainingLabIntake'));
  assert.ok(pageSource.includes('workspaceView === "medical"'));
  assert.ok(pageSource.includes('artifact: "medical-training"'));
  assert.ok(pageSource.includes("medicalTraining:"));
  assert.ok(pageSource.includes('["My reasoning", answer].join("\\n")'));
  assert.ok(pageSource.includes("finish saving to history before opening its study coach"));

  const medicalListStart = pageSource.indexOf("savedMedicalTrainingNotes.map((note)");
  const medicalListEnd = pageSource.indexOf("</section>", medicalListStart);
  const medicalListSource = pageSource.slice(medicalListStart, medicalListEnd);
  assert.ok(medicalListStart >= 0, "expected a saved Medical training list");
  assert.equal(medicalListSource.includes("deleteNotebook"), false);
  assert.ok(medicalListSource.includes("learning-notebook-delete"));
  assert.ok(medicalListSource.includes('deletePreparationHistoryItem(note, "medical")'));
});

test("keeps legacy placement guides visible and gives every history row a confirmed delete", () => {
  const placementListStart = pageSource.indexOf("savedPlacementNotes.map((note)");
  const placementListEnd = pageSource.indexOf("</section>", placementListStart);
  const placementListSource = pageSource.slice(placementListStart, placementListEnd);

  assert.ok(placementListStart >= 0, "expected a saved placement-note list");
  assert.equal(placementListSource.includes("deleteNotebook"), false);
  assert.ok(placementListSource.includes("Trash2"));
  assert.ok(placementListSource.includes("learning-notebook-delete"));
  assert.ok(placementListSource.includes('deletePreparationHistoryItem(note, "placement")'));
  assert.ok(placementListSource.includes("Confirm deleting"));
  assert.ok(
    pageSource.includes(
      "getSavedPlacementNotes(activeNotebook ? [activeNotebook] : []).length > 0",
    ),
  );
});

test("styles the workspace chooser and saved-work selectors responsively", () => {
  assert.ok(stylesheet.includes(".learning-intake-choice-grid {"));
  assert.ok(stylesheet.includes("grid-template-columns: repeat(2, minmax(0, 1fr));"));
  assert.ok(stylesheet.includes(".learning-saved-kind-grid {"));
  assert.ok(stylesheet.includes(".learning-notebook-row.is-placement,"));
  assert.ok(stylesheet.includes(".learning-intake-choice-card.is-medical"));
  assert.ok(stylesheet.includes(".learning-workspace.is-medical"));
  assert.ok(stylesheet.includes(".learning-workspace.is-medical .learning-medical-workspace"));

  const mobileStyles = stylesheet.slice(stylesheet.indexOf("@media (max-width: 700px)"));
  assert.ok(mobileStyles.includes(".learning-intake-choice-grid {"));
  assert.ok(mobileStyles.includes("grid-template-columns: 1fr;"));
});

test("opens generated notebooks on a real topic and keeps focused sessions topic-scoped", () => {
  assert.ok(
    pageSource.includes(
      "const firstTopic = normalized.chapters.find((chapter) => chapter.topics.length)?.topics[0];",
    ),
  );
  assert.ok(pageSource.includes('item.id === nodeId && item.type === "topic"'));
  assert.ok(pageSource.includes('selectedNode?.type === "topic"'));

  const startSessionStart = pageSource.indexOf("const startStudySession =");
  const startSessionEnd = pageSource.indexOf("const pauseStudySession =", startSessionStart);
  const startSessionSource = pageSource.slice(startSessionStart, startSessionEnd);
  assert.ok(startSessionStart >= 0 && startSessionEnd > startSessionStart);
  assert.equal(startSessionSource.includes("setCompleted"), false);
  assert.equal(startSessionSource.includes("setLearningPlannerNodeCompletion"), false);
});

test("keeps long-running learning generation in the profile-scoped background task owner", () => {
  assert.ok(pageSource.includes("useBackgroundTasks()"));
  assert.ok(pageSource.includes("getBackgroundTaskKey("));

  [
    'feature: LEARNING_BACKGROUND_FEATURES.notebook',
    'feature: LEARNING_BACKGROUND_FEATURES.career',
    'feature: LEARNING_BACKGROUND_FEATURES.medical',
  ].forEach((feature) => assert.ok(pageSource.includes(feature), `missing ${feature}`));

  assert.equal(
    pageSource.match(/route: "\/learn"/gu)?.length,
    3,
    "every learning generator should report activity on the Start Learning route",
  );
  assert.ok(pageSource.includes("presentNotebookAnalysis(task.result)"));
  assert.ok(pageSource.includes("presentCareerAnalysis(task.result, request)"));
  assert.ok(pageSource.includes("presentMedicalAnalysis(task.result, request)"));
  assert.ok(pageSource.includes("acknowledgeTask(task.key, task.runId)"));
});

test("places the centered Practice more topic panels at the end of Placement Preparation", () => {
  const resultsIndex = pageSource.indexOf('className="card learning-career-results"');
  const practiceMoreIndex = pageSource.indexOf('className="learning-career-practice-more"');
  const practiceTitleIndex = pageSource.indexOf('id="learning-career-practice-more-title">Practice more</h2>');
  const roleTopicsIndex = pageSource.indexOf("<h3>Important role topics</h3>");
  const codingTopicsIndex = pageSource.indexOf("<h3>Frequently tested coding</h3>");

  assert.ok(resultsIndex >= 0);
  assert.ok(practiceMoreIndex > resultsIndex);
  assert.ok(practiceTitleIndex > practiceMoreIndex);
  assert.ok(roleTopicsIndex > practiceTitleIndex);
  assert.ok(codingTopicsIndex > practiceTitleIndex);
});

test("keeps the placement guide header focused on its pin action and hides its idle glow", () => {
  const placementHeaderStart = pageSource.indexOf('className="card learning-career-intro"');
  const placementHeaderEnd = pageSource.indexOf("</section>", placementHeaderStart);
  const placementHeaderSource = pageSource.slice(placementHeaderStart, placementHeaderEnd);
  const resultsActionsStart = pageSource.indexOf('className="learning-career-results-actions"');
  const resultsActionsEnd = pageSource.indexOf("</div>", resultsActionsStart);
  const resultsActionsSource = pageSource.slice(resultsActionsStart, resultsActionsEnd);

  assert.ok(placementHeaderStart >= 0 && placementHeaderEnd > placementHeaderStart);
  assert.equal(placementHeaderSource.includes("Start with role fundamentals"), false);
  assert.ok(resultsActionsStart >= 0 && resultsActionsEnd > resultsActionsStart);
  assert.ok(resultsActionsSource.includes('className="learning-career-save"'));
  assert.ok(resultsActionsSource.includes("toggleCareerHistoryPin"));
  assert.ok(resultsActionsSource.includes("Pin"));
  assert.equal(resultsActionsSource.includes("learning-career-draft-status"), false);
  assert.equal(resultsActionsSource.includes("learning-count"), false);
  assert.match(
    stylesheet,
    /\.learning-career-results\.card::before\s*\{[\s\S]*?opacity:\s*0\s*!important;[\s\S]*?translateX\(-100%\)/u,
  );
  assert.match(
    stylesheet,
    /\.learning-career-results\.card:hover::before\s*\{[\s\S]*?opacity:\s*0\.38\s*!important;[\s\S]*?translateX\(0\)/u,
  );
});

test("automatically adds generated guides to history and supports pinning and global clearing", () => {
  assert.equal(
    pageSource.match(/patchLearningNotebookSnapshot\(snapshot, academicProfileDataId\)/gu)?.length,
    4,
  );
  assert.ok(pageSource.includes("mergePlacementDraft(baseNotebook, draft"));
  assert.ok(pageSource.includes("mergeMedicalTrainingDraft(baseNotebook, draft"));
  assert.ok(pageSource.includes("toggleActiveNotebookPin"));
  assert.ok(pageSource.includes("toggleMedicalHistoryPin"));
  assert.ok(pageSource.includes("clearCurrentHistory"));
  assert.ok(pageSource.includes("Confirm clearing"));
  assert.equal(pageSource.includes('aria-label="Save notebook"'), false);
  assert.equal(pageSource.includes("Save preparation"), false);
});

test("keeps Subject Mastery out of opened notebook and placement toolbars", () => {
  assert.equal(
    pageSource.match(/className="learning-mastery-trigger"/gu)?.length,
    1,
    "Subject Mastery should remain only in the home and input hero",
  );
  assert.match(
    pageSource,
    /className="learning-workspace-compact-controls"[\s\S]*?className="learning-workspace-return-button"/u,
  );
});

test("keeps the Start Learning return control inside opened notebook and placement cards", () => {
  const notebookHeaderStart = pageSource.indexOf('className="card learning-notebook-header"');
  const notebookHeaderEnd = pageSource.indexOf("</section>", notebookHeaderStart);
  const notebookHeaderSource = pageSource.slice(notebookHeaderStart, notebookHeaderEnd);
  const placementHeaderStart = pageSource.indexOf('className="card learning-career-intro"');
  const placementHeaderEnd = pageSource.indexOf("</section>", placementHeaderStart);
  const placementHeaderSource = pageSource.slice(placementHeaderStart, placementHeaderEnd);

  assert.ok(notebookHeaderStart >= 0, "expected the opened notebook header card");
  assert.ok(placementHeaderStart >= 0, "expected the opened placement header card");
  assert.ok(notebookHeaderSource.includes('className="learning-workspace-return-button is-inside-card"'));
  assert.ok(placementHeaderSource.includes('className="learning-workspace-return-button is-inside-card"'));
  assert.ok(stylesheet.includes('"copy back"'));
  assert.ok(stylesheet.includes('"back"\n      "copy"'));
});

test("keeps notebook tab panels mounted and transitions only the active view", () => {
  const panelsStart = pageSource.indexOf('<div className="learning-tab-panels">');
  const panelsEnd = pageSource.indexOf(
    "{activeNotebook && medicalVisible && (",
    panelsStart,
  );
  const panelsSource = pageSource.slice(panelsStart, panelsEnd);

  assert.ok(panelsStart >= 0 && panelsEnd > panelsStart, "expected a persistent tab-panel region");
  ["studio", "notes", "outline", "map"].forEach((tabId) => {
    assert.ok(
      panelsSource.includes(`learningTabPanelProps(activeTab, "${tabId}",`),
      `expected the ${tabId} panel to remain mounted`,
    );
    assert.equal(
      panelsSource.includes(`{activeTab === "${tabId}" && (`),
      false,
      `${tabId} should not be conditionally mounted`,
    );
  });

  assert.ok(pageSource.includes('"aria-hidden": !isActive'));
  assert.ok(pageSource.includes("inert: !isActive"));
  assert.ok(pageSource.includes("aria-controls={`learning-${tabId}-panel`}"));
  assert.match(stylesheet, /\.learning-tab-panel\s*\{[\s\S]*?opacity:\s*0;[\s\S]*?transform:\s*translate3d\(0, 7px, 0\);[\s\S]*?visibility:\s*hidden;[\s\S]*?transition:/u);
  assert.match(stylesheet, /\.learning-tab-panel\.is-active\s*\{[\s\S]*?opacity:\s*1;[\s\S]*?visibility:\s*visible;/u);

  const reducedMotionStart = stylesheet.indexOf("@media (prefers-reduced-motion: reduce)");
  const reducedMotionEnd = stylesheet.indexOf("/* Start Learning view states */", reducedMotionStart);
  const reducedMotionStyles = stylesheet.slice(reducedMotionStart, reducedMotionEnd);
  assert.ok(reducedMotionStart >= 0 && reducedMotionEnd > reducedMotionStart);
  assert.match(reducedMotionStyles, /transition-duration:\s*0\.01ms\s*!important;/u);
  assert.match(reducedMotionStyles, /\.learning-tab-panel\s*\{\s*transform:\s*none\s*!important;/u);
});

test("uses the completion state to tint only the completed mastery-map action green", () => {
  const actionStart = pageSource.indexOf("const renderCompletionAction =");
  const actionEnd = pageSource.indexOf("const addToPlanner =", actionStart);
  const actionSource = pageSource.slice(actionStart, actionEnd);
  const completedSelector = 'body .learning-map-smart-actions .learning-completion-action.is-complete[aria-pressed="true"]';
  const completedStylesStart = stylesheet.indexOf(`${completedSelector} {`);
  const completedStylesEnd = stylesheet.indexOf("}", completedStylesStart);
  const completedStyles = stylesheet.slice(completedStylesStart, completedStylesEnd);
  const defaultActionsStart = stylesheet.indexOf("body .learning-map-smart-actions > button,");
  const defaultActionsStyles = stylesheet.slice(defaultActionsStart, completedStylesStart);

  assert.ok(actionStart >= 0 && actionEnd > actionStart);
  assert.ok(actionSource.includes('state.isCompleted ? "Completed" : "Mark as completed"'));
  assert.ok(actionSource.includes("aria-pressed={state.isScheduled ? state.isCompleted : undefined}"));
  assert.ok(actionSource.includes('state.isCompleted ? " is-complete" : ""'));
  assert.ok(completedStylesStart >= 0 && completedStylesEnd > completedStylesStart);
  assert.match(completedStyles, /#22c55e/u);
  assert.doesNotMatch(defaultActionsStyles, /#22c55e/u);
});
