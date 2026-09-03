import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMedicalTrainingActionTarget,
  buildMedicalTrainingChatPrompt,
  createMedicalTrainingDraft,
  deleteMedicalTrainingHistoryEntry,
  getMedicalTrainingHistory,
  isMedicalTrainingProfile,
  mergeMedicalTrainingDraft,
  setMedicalTrainingHistoryPinned,
} from "./medicalTrainingClient.js";

const analysis = {
  trainingTitle: "Cardiorespiratory reasoning",
  overview: "Connect mechanisms to fictional findings.",
  modules: [{
    id: "module-1",
    title: "Oxygen delivery",
    conceptOverview: "Explore delivery and demand.",
    whyItMatters: "Builds mechanism-first reasoning.",
    fictionalCase: { summary: "A fictional scenario.", learningObjective: "Compare priorities." },
    reasoningSteps: [{ id: "reason-1", prompt: "Which finding matters first?", explanation: "Start with safety." }],
    vivaChecks: [{ id: "viva-1", question: "What evidence changes your view?", guidance: "Compare options." }],
    practiceSteps: ["Map each finding to a mechanism."],
  }],
};

test("uses authoritative medical eligibility and normalization", () => {
  assert.equal(isMedicalTrainingProfile({ academicLevel: "College", degree: "BSc Nursing" }), true);
  assert.equal(isMedicalTrainingProfile({ academicLevel: "Senior Secondary", grade: "Class 12" }), false);
  const draft = createMedicalTrainingDraft(
    { notebook: { id: "notebook-1" }, medicalTraining: analysis },
    { notebookId: "notebook-1", requestedTopics: ["Oxygen delivery"], trainingFocus: analysis.trainingTitle },
  );
  const notebook = mergeMedicalTrainingDraft({ id: "notebook-1" }, draft);
  assert.equal(notebook.medicalTraining.topicAnalysis.modules[0].title, "Oxygen delivery");
});

test("isolates medical action IDs and safety context", () => {
  const module = analysis.modules[0];
  const target = buildMedicalTrainingActionTarget({
    focus: analysis.trainingTitle,
    item: module.vivaChecks[0],
    kind: "viva",
    module,
    notebook: { id: "notebook-1", subjectName: "Physiology" },
  });
  const prompt = buildMedicalTrainingChatPrompt({ focus: analysis.trainingTitle, module, target });
  assert.match(target.id, /^medical-training:/u);
  assert.equal(target.metadata.artifact, "medical-training");
  assert.match(target.explanation, /fictional or de-identified/iu);
  assert.match(prompt, /Never provide patient-specific diagnosis/iu);
});

test("stores, pins, and deletes individual medical training generations", () => {
  const first = createMedicalTrainingDraft(
    { notebook: { id: "notebook-1" }, medicalTraining: analysis },
    { notebookId: "notebook-1", generatedAt: "2026-08-08T10:00:00.000Z" },
  );
  const secondAnalysis = { ...analysis, trainingTitle: "Emergency reasoning" };
  const second = createMedicalTrainingDraft(
    { notebook: { id: "notebook-1" }, medicalTraining: secondAnalysis },
    { notebookId: "notebook-1", generatedAt: "2026-08-09T10:00:00.000Z" },
  );
  const withBoth = mergeMedicalTrainingDraft(
    mergeMedicalTrainingDraft({ id: "notebook-1" }, first),
    second,
  );

  assert.equal(getMedicalTrainingHistory(withBoth).length, 2);
  const pinned = setMedicalTrainingHistoryPinned(withBoth, first.id, true);
  assert.equal(getMedicalTrainingHistory(pinned)[0].id, first.id);
  assert.equal(getMedicalTrainingHistory(pinned)[0].pinned, true);
  const deleted = deleteMedicalTrainingHistoryEntry(pinned, first.id);
  assert.deepEqual(getMedicalTrainingHistory(deleted).map((entry) => entry.id), [second.id]);
});
