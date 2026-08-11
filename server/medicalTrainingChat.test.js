import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMedicalTrainingChatSystemRule,
  hasMedicalTrainingModule,
  hasUnsafeMedicalTrainingChatOutput,
  requestsPersonalMedicalTrainingAdvice,
  resolveMedicalTrainingChatSessionContext,
} from "./medicalTrainingChat.js";

const first = {
  artifact: "medical-training",
  mode: "education-only",
  notebookId: "507f1f77bcf86cd799439011",
  moduleId: "medical-module-1",
};

const medicalProfile = {
  academicLevel: "Medical / Health Sciences",
  academicTrack: "Medical & Health Sciences",
  degree: "MBBS",
  department: "Medicine",
};

test("keeps a stored medical context and rejects context mixing", () => {
  assert.deepEqual(resolveMedicalTrainingChatSessionContext({ storedContext: first }), {
    context: first,
    error: "",
  });
  assert.match(resolveMedicalTrainingChatSessionContext({
    requestedContext: first,
    storedContext: null,
    hasSession: true,
  }).error, /start a new/i);
  assert.match(resolveMedicalTrainingChatSessionContext({
    requestedContext: { ...first, moduleId: "medical-module-2" },
    storedContext: first,
    hasSession: true,
  }).error, /different Medical training module/i);
});

test("detects personal-care requests and unsafe outputs without blocking conceptual work", () => {
  assert.equal(requestsPersonalMedicalTrainingAdvice("Compare two fictional gas-exchange mechanisms."), false);
  assert.equal(requestsPersonalMedicalTrainingAdvice("I have chest pain; diagnose me."), true);
  assert.equal(requestsPersonalMedicalTrainingAdvice("Patient name: Example Person; explain this record."), true);
  assert.equal(hasUnsafeMedicalTrainingChatOutput("Compare the fictional evidence for two hypotheses."), false);
  assert.equal(hasUnsafeMedicalTrainingChatOutput("Aspirin inhibits platelet cyclooxygenase in this conceptual example."), false);
  assert.equal(hasUnsafeMedicalTrainingChatOutput("This is a conceptual hypothesis, not a diagnosis."), false);
  assert.equal(hasUnsafeMedicalTrainingChatOutput("Do not start aspirin from an educational simulation."), false);
  assert.equal(hasUnsafeMedicalTrainingChatOutput("Start with the mechanism, then compare the fictional evidence."), false);
  assert.equal(hasUnsafeMedicalTrainingChatOutput("Increase difficulty gradually as conceptual fluency improves."), false);
  assert.equal(hasUnsafeMedicalTrainingChatOutput("Increase the number of practice examples."), false);
  assert.equal(hasUnsafeMedicalTrainingChatOutput("Continue reviewing the mechanism."), false);
  assert.equal(hasUnsafeMedicalTrainingChatOutput("The patient should take 50 mg daily."), true);
  assert.equal(hasUnsafeMedicalTrainingChatOutput("Start aspirin immediately and monitor the response."), true);
  assert.equal(hasUnsafeMedicalTrainingChatOutput("Start ceftriaxone immediately."), true);
  assert.equal(hasUnsafeMedicalTrainingChatOutput("Begin IV fluids now."), true);
  assert.equal(hasUnsafeMedicalTrainingChatOutput("Aspirin 50 mg orally once daily."), true);
  assert.equal(hasUnsafeMedicalTrainingChatOutput("Aspirin is the preferred first-line option."), true);
  assert.equal(hasUnsafeMedicalTrainingChatOutput("The drug of choice is warfarin."), true);
  assert.equal(hasUnsafeMedicalTrainingChatOutput("Choose heparin for this fictional case."), true);
  assert.equal(hasUnsafeMedicalTrainingChatOutput("Do not start aspirin; start heparin."), true);
  assert.equal(hasUnsafeMedicalTrainingChatOutput("Never give aspirin, but administer warfarin."), true);
  assert.equal(hasUnsafeMedicalTrainingChatOutput("Aspirin inhibits platelet function; no medicine is selected."), false);
  assert.equal(hasUnsafeMedicalTrainingChatOutput("Do not choose heparin in a fictional academic exercise."), false);
  assert.equal(hasUnsafeMedicalTrainingChatOutput("Recommended treatment: aspirin."), true);
  assert.equal(hasUnsafeMedicalTrainingChatOutput("Diagnosis: myocardial infarction."), true);
  assert.equal(hasUnsafeMedicalTrainingChatOutput("Treatment plan: begin aspirin."), true);
  assert.equal(hasUnsafeMedicalTrainingChatOutput("**Diagnosis:** myocardial infarction."), true);
  assert.equal(hasUnsafeMedicalTrainingChatOutput("### Final diagnosis\nMyocardial infarction."), true);
  assert.equal(hasUnsafeMedicalTrainingChatOutput("**Treatment plan:** administer oxygen."), true);
  assert.equal(hasUnsafeMedicalTrainingChatOutput("Patient name: Example Person; MRN: 12345."), true);
  assert.equal(hasUnsafeMedicalTrainingChatOutput("Patient name is Example Person"), true);
  assert.equal(hasUnsafeMedicalTrainingChatOutput("MRN ABC123"), true);
  assert.equal(hasUnsafeMedicalTrainingChatOutput("Date of birth is 12 May 2000"), true);
  assert.equal(hasUnsafeMedicalTrainingChatOutput("Contact student@example.com about this case."), true);
  assert.equal(hasUnsafeMedicalTrainingChatOutput("Phone +91 98408 01856"), true);
  assert.equal(hasUnsafeMedicalTrainingChatOutput("Do not include a patient name, MRN, phone, or date of birth."), false);
  assert.equal(hasUnsafeMedicalTrainingChatOutput("You have pneumonia."), true);
  assert.equal(requestsPersonalMedicalTrainingAdvice("student@example.com"), true);
  assert.equal(requestsPersonalMedicalTrainingAdvice("+91 98408 01856"), true);
});

test("builds a discipline-scoped hard safety instruction", () => {
  const rule = buildMedicalTrainingChatSystemRule({
    disciplineLabel: "Nursing",
    disciplineMode: "nursing",
  });
  assert.match(rule, /fictional, de-identified/i);
  assert.match(rule, /Nursing \(nursing\)/u);
  assert.match(rule, /never assume physician scope/i);
  assert.match(rule, /Never evaluate a real person/u);
});

test("accepts only a module saved in the owned Medical training notebook", () => {
  const currentNotebook = {
    id: first.notebookId,
    subjectName: "Physiology",
    medicalTraining: {
      topicAnalysis: {
        trainingTitle: "Physiology reasoning",
        modules: [{ id: first.moduleId, title: "Fluid balance" }],
      },
    },
  };
  assert.equal(hasMedicalTrainingModule(currentNotebook, first.moduleId, medicalProfile), true);
  assert.equal(hasMedicalTrainingModule(currentNotebook, "invented-module", medicalProfile), false);

  const legacyNotebook = {
    id: first.notebookId,
    subjectName: "Clinical concepts",
    careerPreparation: {
      topicAnalysis: {
        targetRole: "Legacy medical preparation",
        topics: [{ id: "legacy-topic", title: "Tissue perfusion" }],
      },
    },
  };
  assert.equal(hasMedicalTrainingModule(legacyNotebook, "legacy-topic", medicalProfile), true);
});
