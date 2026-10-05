import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getLearningNodeStatus,
  hasLearningNodeAchievement,
} from "../utils/learningMastery.js";

const pageSource = readFileSync(new URL("./StartLearningPage.jsx", import.meta.url), "utf8");
const stylesheet = readFileSync(new URL("./StartLearningPage.css", import.meta.url), "utf8");
const librarySource = readFileSync(new URL("../components/NotebookLibrary.jsx", import.meta.url), "utf8");
const contentSource = readFileSync(new URL("../components/NotebookContent.jsx", import.meta.url), "utf8");
const dialogSource = readFileSync(new URL("../components/NotebookCreateDialog.jsx", import.meta.url), "utf8");

test("keeps notebook and placement preparation in separate workspace views", () => {
  assert.ok(pageSource.includes('className="learning-intake-choice-card is-notebook"'));
  assert.ok(pageSource.includes('className="learning-intake-choice-card is-placement"'));
  assert.ok(pageSource.includes('intakeMode === "notebook" && workspaceView === "intake" ? ('));
  assert.ok(pageSource.includes("<NotebookLibrary"));
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

test("prefills placement topics from a selected notebook and supports Tab role completion", () => {
  assert.ok(pageSource.includes("getNotebookPlacementTopics(normalized).join(\"\\n\")"));
  assert.ok(pageSource.includes("getNotebookPlacementRoleSuggestion("));
  assert.ok(pageSource.includes("canCompletePlacementRole(careerRole, careerRoleSuggestion)"));
  assert.ok(pageSource.includes('event.key !== "Tab"'));
  assert.ok(pageSource.includes("event.preventDefault()"));
  assert.ok(pageSource.includes("setCareerRole(careerRoleSuggestion)"));
  assert.ok(pageSource.includes(": `Suggested: ${careerRoleSuggestion}`"));
  assert.ok(pageSource.includes("onChange={(event) => setCareerTopics(event.target.value)}"));
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

test("opens notebook preparation as a library and creates notebooks in a compact combined-scope dialog", () => {
  const intakeStart = pageSource.indexOf('<NotebookCreateDialog open={newNotebookOpen}');
  const intakeEnd = pageSource.indexOf("</NotebookCreateDialog>", intakeStart);
  const intakeSource = pageSource.slice(intakeStart, intakeEnd);
  assert.ok(intakeStart >= 0 && intakeEnd > intakeStart);
  assert.equal((intakeSource.match(/<textarea/gu) || []).length, 1);
  assert.match(intakeSource, /id="learning-notebook-scope"/u);
  assert.match(intakeSource, /Topics or chapters/u);
  assert.match(intakeSource, /Optional reference files/u);
  assert.match(intakeSource, /handleFiles\(event\.dataTransfer\.files\)/u);
  assert.doesNotMatch(intakeSource, /learning-requirements|manualChapters|manualTopics/u);
  assert.ok(intakeSource.indexOf('htmlFor="learning-subject-input"') < intakeSource.indexOf('id="learning-notebook-scope"'));
  assert.match(dialogSource, /role="dialog"/u);
  assert.match(dialogSource, /AnimatePresence/u);
  assert.match(dialogSource, /initial=\{[\s\S]*?exit=\{/u);
  assert.match(pageSource, /completionForNotebook=\{getNotebookCompletionSummary\}/u);
  assert.match(librarySource, /No generated notebooks exist\./u);
  assert.match(librarySource, /New notebook/u);
  assert.match(librarySource, /hasNotebooks &&/u);
  const requestStart = pageSource.indexOf("const runNotebookAnalysis =");
  const requestEnd = pageSource.indexOf("const analyzeNotebook =", requestStart);
  assert.doesNotMatch(pageSource.slice(requestStart, requestEnd), /chapterNames|requestedOutline/u);
  assert.match(pageSource.slice(requestStart, requestEnd), /learningPrompt: requestedPrompt/u);
  assert.match(pageSource.slice(requestStart, requestEnd), /topicNames/u);
});

test("preserves edited and cleared scope per subject and keeps its menu opaque", () => {
  assert.match(pageSource, /Object.hasOwn\(scopeDrafts, scopeKey\)/u);
  assert.match(pageSource, /getNotebookScopeSuggestion\(subjects, subjectName\)/u);
  assert.match(stylesheet, /\.learning-subject-options\s*\{[\s\S]*?background:\s*linear-gradient\(var\(--surface-strong\), var\(--surface-strong\)\), var\(--bg\);[\s\S]*?backdrop-filter:\s*none;/u);
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

test("keeps the placement guide header focused on its pin action and content cards static", () => {
  const placementHeaderStart = pageSource.indexOf('className="learning-career-intro"');
  const placementHeaderEnd = pageSource.indexOf("</header>", placementHeaderStart);
  const placementHeaderSource = pageSource.slice(placementHeaderStart, placementHeaderEnd);
  const resultsActionsStart = pageSource.indexOf('className="learning-career-results-actions"');
  const resultsActionsEnd = pageSource.indexOf("</div>", resultsActionsStart);
  const resultsActionsSource = pageSource.slice(resultsActionsStart, resultsActionsEnd);

  assert.ok(placementHeaderStart >= 0 && placementHeaderEnd > placementHeaderStart);
  assert.ok(placementHeaderSource.includes("Prepare for the questions that matter"));
  assert.equal(placementHeaderSource.includes("Career preparation"), false);
  assert.equal(placementHeaderSource.includes("Start with role fundamentals"), false);
  assert.ok(resultsActionsStart >= 0 && resultsActionsEnd > resultsActionsStart);
  assert.ok(resultsActionsSource.includes('className="learning-career-save"'));
  assert.ok(resultsActionsSource.includes("toggleCareerHistoryPin"));
  assert.ok(resultsActionsSource.includes("Pin"));
  assert.ok(resultsActionsSource.includes("Back to Start Learning"));
  assert.equal(resultsActionsSource.includes("learning-career-draft-status"), false);
  assert.equal(resultsActionsSource.includes("learning-count"), false);
  const cardStylesStart = stylesheet.indexOf("body .learning-page .learning-career-workspace :is(.learning-career-results.card");
  const cardStylesEnd = stylesheet.indexOf(".learning-panel-heading > .learning-career-results-actions", cardStylesStart);
  const cardStyles = stylesheet.slice(cardStylesStart, cardStylesEnd);
  assert.ok(cardStylesStart >= 0 && cardStylesEnd > cardStylesStart);
  assert.match(cardStyles, /box-shadow:\s*none\s*!important;/u);
  assert.match(cardStyles, /transform:\s*none\s*!important;/u);
  assert.match(cardStyles, /:hover::before\s*\{\s*display:\s*none\s*!important;/u);
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
  assert.match(
    pageSource,
    /className="learning-mastery-trigger"[\s\S]*?<Target aria-hidden="true" size=\{15\} \/>/u,
  );
  assert.match(
    stylesheet,
    /body \.learning-page \.learning-mastery-trigger\s*\{[\s\S]*?width:\s*34px !important;[\s\S]*?height:\s*34px !important;[\s\S]*?color:\s*var\(--text-muted\) !important;[\s\S]*?background:\s*var\(--surface-muted\) !important;[\s\S]*?border:\s*1px solid var\(--border\) !important;/u,
  );
  assert.doesNotMatch(pageSource, /AI learning workspace|className="card learning-hero"/u);
  assert.doesNotMatch(stylesheet, /\.learning-hero(?:[\s:{])/u);
});

test("shows the simplified notebook views and section actions", () => {
  assert.doesNotMatch(pageSource, /Study studio|LearningStudyStudio|Misconception radar|AI Coach/u);
  assert.match(pageSource, /\["notes", "Notebook content"/u);
  assert.doesNotMatch(pageSource, /\["outline",|learningTabPanelProps\(activeTab, "outline"|Topic outline/u);
  assert.match(pageSource, /\["map", "Mastery map"/u);
  assert.match(pageSource, /\["recall", "Recall session"/u);
  assert.match(pageSource, /<NotebookContent[\s\S]*?onComplete=\{setTopicCompletion\}/u);
  assert.match(contentSource, /Mark completed/u);
  assert.match(contentSource, /Add to planner/u);
  assert.match(contentSource, /Save to Notes/u);
  assert.match(contentSource, /Explained examples/u);
  assert.match(contentSource, /Key points/u);
});

test("mastery-map chapter and notebook coverage follows all actual topics", () => {
  const helperStart = pageSource.indexOf("function buildNotebookMapProgress(");
  const helperEnd = pageSource.indexOf("function careerProfileAllows(", helperStart);
  const buildProgress = new Function(
    "getLearningNodeStatus",
    "hasLearningNodeAchievement",
    `${pageSource.slice(helperStart, helperEnd)}; return buildNotebookMapProgress;`,
  )(getLearningNodeStatus, hasLearningNodeAchievement);
  const now = "2026-10-04T12:00:00.000Z";
  const notebook = {
    chapters: [
      { id: "first-chapter", topics: [{ id: "first" }, { id: "second" }, { id: "third" }] },
      { id: "last-chapter", topics: [{ id: "last" }] },
    ],
  };
  const nodes = {
    "first-chapter": { status: "mastered", masteredAt: now, learnedAt: now },
    first: { status: "mastered", masteryScore: 88, masteredAt: now, learnedAt: now },
    second: { status: "learned", masteryScore: 92, learnedAt: now },
    third: { status: "learned", masteryScore: 70, learnedAt: now },
    last: { status: "learning", masteryScore: 0 },
  };
  let progress = buildProgress(notebook, { nodes }, now);
  assert.equal(progress.root.masteryScore, 75);
  assert.equal(progress.root.status, "learning");
  assert.equal(progress["first-chapter"].masteryScore, 100);
  assert.equal(progress["first-chapter"].status, "learned");
  assert.equal(progress["first-chapter"].masteredAt, "");
  assert.equal(progress.first.masteryScore, 88, "aggregate coverage must preserve topic evidence");

  nodes.last = { status: "learned", masteryScore: 70, learnedAt: now };
  progress = buildProgress(notebook, { nodes }, now);
  assert.equal(progress.root.masteryScore, 100);
  assert.equal(progress.root.status, "learned");
  assert.equal(progress["last-chapter"].masteryScore, 100);

  Object.keys(nodes).forEach((id) => {
    nodes[id] = { ...nodes[id], status: "mastered", masteredAt: now };
  });
  progress = buildProgress(notebook, { nodes }, now);
  assert.equal(progress.root.status, "mastered");
  assert.equal(progress.root.masteryScore, 100);
});

test("notebook content completion saves the latest notebook through the canonical topic setter", () => {
  const handlerStart = pageSource.indexOf("const setTopicCompletion =");
  const handlerEnd = pageSource.indexOf("const closePlannerDialog =", handlerStart);
  assert.ok(handlerStart >= 0 && handlerEnd > handlerStart);
  const handlerSource = pageSource.slice(handlerStart, handlerEnd);
  assert.match(handlerSource, /updateNotebook\(\(current\) => setNotebookTopicCompleted\(current, topic\.id, complete\)\)/u);
  assert.match(pageSource, /completionByTopic=\{getNotebookCompletionSummary\(activeNotebook\)\.completionByTopic\}/u);
  assert.doesNotMatch(pageSource, /toggleRevisedNoteCompletion/u);
});

test("returns opened notebooks to their library and placement guides to Start Learning", () => {
  const notebookHeaderStart = pageSource.indexOf('className="card learning-notebook-header"');
  const notebookHeaderEnd = pageSource.indexOf("</section>", notebookHeaderStart);
  const notebookHeaderSource = pageSource.slice(notebookHeaderStart, notebookHeaderEnd);
  const resultsActionsStart = pageSource.indexOf('className="learning-career-results-actions"');
  const resultsActionsEnd = pageSource.indexOf("</div>", resultsActionsStart);
  const resultsActionsSource = pageSource.slice(resultsActionsStart, resultsActionsEnd);

  assert.ok(notebookHeaderStart >= 0, "expected the opened notebook header card");
  assert.ok(resultsActionsStart >= 0, "expected the opened placement results actions");
  assert.ok(notebookHeaderSource.includes('className="learning-workspace-return-button is-inside-card"'));
  assert.ok(notebookHeaderSource.includes("Back to notebooks"));
  assert.ok(resultsActionsSource.includes('className="learning-workspace-return-button"'));
  assert.ok(resultsActionsSource.includes("Back to Start Learning"));
});

test("keeps notebook tab panels mounted and transitions only the active view", () => {
  const panelsStart = pageSource.indexOf('<div className="learning-tab-panels">');
  const panelsEnd = pageSource.indexOf(
    "{activeNotebook && medicalVisible && (",
    panelsStart,
  );
  const panelsSource = pageSource.slice(panelsStart, panelsEnd);

  assert.ok(panelsStart >= 0 && panelsEnd > panelsStart, "expected a persistent tab-panel region");
  ["notes", "map", "recall"].forEach((tabId) => {
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

test("uses canonical completion state for the green mastery-map action", () => {
  const actionStart = pageSource.indexOf('className="learning-map-smart-actions"');
  const actionEnd = pageSource.indexOf("</div>", pageSource.indexOf("Mark completed", actionStart));
  const actionSource = pageSource.slice(actionStart, actionEnd);
  const completedSelector = 'body .learning-map-smart-actions .learning-completion-action.is-complete[aria-pressed="true"]';
  const completedStylesStart = stylesheet.indexOf(`${completedSelector} {`);
  const completedStylesEnd = stylesheet.indexOf("}", completedStylesStart);
  const completedStyles = stylesheet.slice(completedStylesStart, completedStylesEnd);
  const defaultActionsStart = stylesheet.indexOf("body .learning-map-smart-actions > button,");
  const defaultActionsStyles = stylesheet.slice(defaultActionsStart, completedStylesStart);

  assert.ok(actionStart >= 0 && actionEnd > actionStart);
  assert.match(actionSource, /aria-pressed=\{getNotebookCompletionSummary\(activeNotebook\)\.completionByTopic\[selectedNode\.id\] === true\}/u);
  assert.match(actionSource, /setTopicCompletion\(selectedNode,/u);
  assert.match(actionSource, /"Completed" : "Mark completed"/u);
  assert.ok(completedStylesStart >= 0 && completedStylesEnd > completedStylesStart);
  assert.match(completedStyles, /#22c55e/u);
  assert.doesNotMatch(defaultActionsStyles, /#22c55e/u);
});
