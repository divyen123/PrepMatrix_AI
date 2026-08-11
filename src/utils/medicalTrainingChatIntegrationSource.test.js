import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const chatbotSource = readFileSync(new URL("../components/Chatbot.jsx", import.meta.url), "utf8");
const startLearningSource = readFileSync(new URL("../pages/StartLearningPage.jsx", import.meta.url), "utf8");
const serverSource = readFileSync(new URL("../../server/index.js", import.meta.url), "utf8");

test("launches Medical training AI in a fresh audited context", () => {
  assert.ok(startLearningSource.includes('artifact: "medical-training"'));
  assert.ok(startLearningSource.includes('mode: "education-only"'));
  assert.ok(startLearningSource.includes("createNewChat: true"));
  assert.ok(chatbotSource.includes("normalizeChatAssistantContext(event.detail?.context)"));
  assert.ok(chatbotSource.includes("assistantContext,"));
  assert.ok(chatbotSource.includes("Medical training chat does not accept files or patient records."));
  assert.ok(chatbotSource.includes("!childMode && !assistantContext"));
});

test("validates Medical chat safety before quota/provider work and persists its context", () => {
  const profileGate = serverSource.indexOf("getLearningMedicalTrainingEligibility(req.user)");
  const ownershipGate = serverSource.indexOf("MEDICAL_TRAINING_CHAT_NOTEBOOK_NOT_FOUND");
  const moduleGate = serverSource.indexOf("MEDICAL_TRAINING_CHAT_MODULE_NOT_FOUND");
  const quotaLookup = serverSource.indexOf("const requestId = aiQuotaRequestId(req)", profileGate);

  assert.ok(profileGate >= 0);
  assert.ok(ownershipGate > profileGate);
  assert.ok(moduleGate > ownershipGate);
  assert.ok(quotaLookup > moduleGate, "medical module authorization should complete before quota lookup");
  assert.ok(serverSource.includes("hasMedicalTrainingModule(ownedNotebook, assistantContext.moduleId, req.user)"));
  assert.ok(serverSource.includes("buildMedicalTrainingChatSystemRule(medicalTrainingEligibility)"));
  assert.ok(serverSource.includes("hasUnsafeMedicalTrainingChatOutput(outputText)"));
  assert.ok(serverSource.includes('source: "medical_training", assistantContext'));
  assert.ok(serverSource.includes("chatReplayContextMatches"));
  assert.ok(serverSource.includes("Current verified learner context:"));
  assert.match(
    serverSource,
    /\.\.\.\(assistantContext\s*\?\s*\[\]\s*:\s*\[[\s\S]*?"Total tasks:/u,
    "medical context should omit the ordinary planner task labels",
  );
});
