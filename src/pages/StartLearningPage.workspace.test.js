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
  assert.doesNotMatch(
    placementSource,
    /Type any topic, project, job description, or interview context\. A notebook is not required\./u,
  );
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
  assert.ok(pageSource.includes("isLearningWorkspaceNotebook"));
  assert.ok(pageSource.includes(") : !activeNotebook || isLearningWorkspaceNotebook(activeNotebook) ? ("));
  assert.ok(pageSource.includes("isLearningWorkspaceNotebook(activeNotebook) ? [] : learningNodes(activeNotebook)"));
  assert.ok(stylesheet.includes(".learning-field .learning-placement-context"));
  assert.ok(stylesheet.includes(".learning-placement-source-options"));
});

test("keeps the placement source, role, topics, and quick-add controls in their requested layout", () => {
  const placementStart = pageSource.indexOf('intakeMode === "placement" ? (');
  const placementEnd = pageSource.indexOf(") : null}", placementStart);
  const placementSource = pageSource.slice(placementStart, placementEnd);

  assert.ok(placementStart >= 0 && placementEnd > placementStart, "expected the placement intake");
  assert.match(
    placementSource,
    /className="learning-placement-source-role-row"[\s\S]*?<fieldset className="learning-placement-source">[\s\S]*?<legend>Preparation source<\/legend>[\s\S]*?<\/fieldset>[\s\S]*?className="learning-field learning-placement-role"[\s\S]*?<span>Target role<\/span>/u,
  );
  assert.match(
    placementSource,
    /className="learning-field learning-placement-topics"[\s\S]*?<span>Topics to analyze<\/span>[\s\S]*?<textarea/u,
  );
  assert.match(
    stylesheet,
    /\.learning-placement-source-role-row\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*max-content minmax\(220px, 1fr\);/u,
  );
  assert.match(
    stylesheet,
    /\.learning-placement-topics\s*\{[\s\S]*?width:\s*100%;/u,
  );
  assert.match(
    stylesheet,
    /\.learning-placement-suggestions > div\s*\{[\s\S]*?display:\s*flex;[\s\S]*?flex-wrap:\s*nowrap;/u,
  );
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
  assert.ok(pageSource.includes("CUSTOM_MEDICAL_SOURCE_VALUE"));
  assert.ok(pageSource.includes("usesCustomMedicalSource"));
  assert.ok(pageSource.includes('sourceMode={usesCustomMedicalSource ? "custom" : "notebook"}'));
  assert.ok(pageSource.includes('onSourceModeChange={selectMedicalTrainingSource}'));
  assert.ok(pageSource.includes('"/api/learning-notebooks/medical-training-analyze"'));
  assert.ok(pageSource.includes('`/api/learning-notebooks/${encodeURIComponent(request.notebookId)}/medical-training-analyze`'));
  assert.ok(pageSource.includes('setMedicalError("Describe the fictional educational context you want to train with.")'));
  assert.ok(pageSource.includes("isLearningWorkspaceNotebook"));

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

test("centers the available workspace cards and omits history from the chooser", () => {
  assert.ok(stylesheet.includes(".learning-intake-choice-grid {"));
  assert.ok(stylesheet.includes("grid-template-columns: repeat(auto-fit, minmax(280px, 430px));"));
  assert.ok(stylesheet.includes("justify-content: center;"));
  assert.ok(stylesheet.includes(".learning-workspace.is-intake.is-choice-home .learning-source-rail {"));
  assert.ok(stylesheet.includes("width: min(100%, 1320px);"));
  assert.ok(stylesheet.includes(".learning-intake-choice.is-count-2 {"));
  assert.ok(stylesheet.includes("max-width: 874px;"));
  assert.ok(stylesheet.includes("margin-block-start: clamp(48px, 4vw, 60px);"));
  assert.match(
    stylesheet,
    /\.learning-intake-choice\.is-count-3\s*\{[\s\S]*?max-width:\s*874px;/u,
  );
  assert.match(
    stylesheet,
    /\.learning-intake-choice\.is-count-3 \.learning-intake-choice-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(280px, 430px\)\);/u,
  );
  assert.match(
    stylesheet,
    /\.learning-intake-choice\.is-count-3 \.learning-intake-choice-card:nth-child\(3\)\s*\{[\s\S]*?grid-column:\s*1 \/ -1;[\s\S]*?justify-self:\s*center;[\s\S]*?max-width:\s*430px;/u,
  );
  assert.ok(stylesheet.includes(".learning-intake-choice-card.is-medical"));
  assert.ok(stylesheet.includes(".learning-workspace.is-medical"));
  assert.ok(stylesheet.includes(".learning-workspace.is-medical .learning-medical-workspace"));
  assert.ok(pageSource.includes('is-${workspaceView}${intakeMode === null ? " is-choice-home" : ""}'));
  assert.ok(pageSource.includes("const workspaceChoiceCount = 1"));
  assert.ok(pageSource.includes('learning-intake-choice is-count-${workspaceChoiceCount}'));
  assert.ok(pageSource.includes("{activeArtifactKind && ("));
  assert.equal(pageSource.includes("learning-saved-kind-grid"), false);
  assert.equal(pageSource.includes('"Learning history"'), false);
  assert.equal(pageSource.includes("What do you want to prepare?"), false);

  const mobileStyles = stylesheet.slice(stylesheet.indexOf("@media (max-width: 700px)"));
  assert.ok(mobileStyles.includes(".learning-intake-choice-grid {"));
  assert.ok(mobileStyles.includes("grid-template-columns: 1fr;"));
  assert.match(
    mobileStyles,
    /\.learning-intake-choice\.is-count-3 \.learning-intake-choice-card:nth-child\(3\)\s*\{[\s\S]*?grid-column:\s*auto;[\s\S]*?justify-self:\s*stretch;/u,
  );
});

test("keeps enabled Start Learning workspace cards color-toned outside hover", () => {
  assert.match(
    stylesheet,
    /body \.learning-page \.learning-intake-choice-card:not\(:disabled\),\s*body \.learning-page \.learning-intake-choice-card:focus-visible\s*\{[\s\S]*?rgba\(var\(--choice-rgb\), 0\.22\)[\s\S]*?rgba\(var\(--choice-rgb\), 0\.06\)[\s\S]*?border-color: rgba\(var\(--choice-rgb\), 0\.45\) !important;/u,
  );
  assert.match(
    stylesheet,
    /body \.learning-page \.learning-intake-choice-card\s*\{[\s\S]*?rgba\(var\(--choice-rgb\), 0\.16\)[\s\S]*?border: 1px solid rgba\(var\(--choice-rgb\), 0\.3\) !important;/u,
  );
});

test("keeps notebook uploads and prompts together with plural chapter and topic fields", () => {
  const intakeStart = pageSource.indexOf('{intakeMode === "notebook" ? (');
  const intakeEnd = pageSource.indexOf("{!analyzing && analysisError", intakeStart);
  const intakeSource = pageSource.slice(intakeStart, intakeEnd);

  assert.ok(intakeStart >= 0 && intakeEnd > intakeStart, "expected the notebook intake");
  assert.match(
    intakeSource,
    /className="learning-notebook-source-row"[\s\S]*?className="learning-notebook-upload-column"[\s\S]*?className="learning-dropzone"[\s\S]*?className="learning-notebook-source-divider"[\s\S]*?className="learning-notebook-prompt-column"[\s\S]*?className="learning-field learning-prompt-field"/u,
  );
  assert.doesNotMatch(
    intakeSource,
    /Use a prompt by itself, or combine it with a subject, chapter, topic, or upload\./u,
  );
  assert.doesNotMatch(intakeSource, /learning-scope-builder|Notebook scope/u);
  assert.match(
    intakeSource,
    /className="learning-notebook-detail-fields"[\s\S]*?<span>Chapter\(s\)<\/span>[\s\S]*?setManualChapters[\s\S]*?<span>Topic\(s\)<\/span>[\s\S]*?setManualTopics/u,
  );
  assert.match(
    stylesheet,
    /\.learning-notebook-source-row\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*minmax\(0, 30fr\) 1px minmax\(0, 70fr\);/u,
  );
  assert.match(
    stylesheet,
    /\.learning-notebook-upload-column\s*\{[\s\S]*?align-items:\s*center;[\s\S]*?justify-content:\s*center;/u,
  );
  assert.match(
    stylesheet,
    /\.learning-notebook-upload-column \.learning-dropzone\s*\{[\s\S]*?flex:\s*0 0 var\(--learning-notebook-source-control-height\);[\s\S]*?height:\s*var\(--learning-notebook-source-control-height\);/u,
  );
  assert.match(
    stylesheet,
    /\.learning-prompt-field textarea\s*\{[\s\S]*?height:\s*var\(--learning-notebook-source-control-height\);/u,
  );
  assert.match(
    stylesheet,
    /\.learning-notebook-source-divider\s*\{[\s\S]*?width:\s*1px;[\s\S]*?background:\s*var\(--border\);/u,
  );
  assert.match(
    stylesheet,
    /\.learning-notebook-detail-fields\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/u,
  );
  assert.match(pageSource, /const topicNames = parseChapterNames\(manualTopics\);/u);
  assert.match(pageSource, /topics: topicNames,/u);
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

test("places Subject Mastery beside Back in Notebook preparation", () => {
  assert.equal(
    pageSource.match(/className="learning-mastery-trigger"/gu)?.length,
    1,
    "Subject Mastery should appear only in Notebook preparation",
  );
  assert.match(
    pageSource,
    /className="learning-intake-flow-actions"[\s\S]*?intakeMode === "notebook"[\s\S]*?className="learning-mastery-trigger"[\s\S]*?className="learning-intake-return-button"/u,
  );
  assert.doesNotMatch(pageSource, /AI learning workspace|className="card learning-hero"/u);
  assert.doesNotMatch(stylesheet, /\.learning-hero(?:[\s:{])/u);
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
